import { AsyncLocalStorage } from "node:async_hooks";
import { isIP } from "node:net";
import { i18nMessage } from "../../common/i18n/http-i18n";
import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { reportToSentry } from "../../instrument";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { maskEmail } from "../../common/logging/mask-email";

/**
 * Supabase Auth bridge.
 *
 * Üç ayrı login flow'umuz (tenant / admin / supplier) altta Supabase Auth'a
 * delegasyon yapar. Frontend ve guard kodlar dokunulmaz: bu servis
 * Supabase ile konuşur, sonuçtan domain user'ını çözer, kendi JWT'mizi
 * üreten orijinal AuthService'lere bilgi döner (bridge pattern).
 *
 * Service role key ile oluşturulan admin client RLS'i bypass eder ve
 * `auth.admin.*` API'lerine erişir (createUser, inviteByEmail, deleteUser).
 *
 * KURAL: Bu servis dışında HİÇBİR yerde supabase-js init edilmez.
 */
/** Supabase Auth çağrıları için üst sınır (denetim P11 #9). */
const SUPABASE_TIMEOUT_MS = 10_000;

/**
 * Derin denetim 2026-09-29 Y-11: hosted Supabase Auth, parola girişlerini
 * (sign-ups and sign-ins kotası) İSTEK IP'si başına sayar. Tüm girişler API
 * sunucusundan gittiği için eskiden HERKES Render'ın tek çıkış IP'sini
 * paylaşıyordu → tek saldırgan (ya da lansman trafiği) kotayı doldurunca
 * bütün platformda giriş 503. Supabase, SECRET API anahtarıyla (`sb_secret_…`)
 * gelen isteklerde gerçek son kullanıcı IP'sini bu başlıktan alır ve kotayı
 * o IP'ye uygular. Başlık yalnız secret anahtar yapılandırılmışsa gönderilir
 * (eski anon/service_role JWT'leriyle desteklenmez).
 */
export const SB_FORWARDED_FOR_HEADER = "Sb-Forwarded-For";

/** Supabase Auth hata gövdesinden okunan alanlar (auth-js AuthError alt kümesi). */
type AuthErrorLike = {
  status?: number;
  code?: string;
  name?: string;
  message?: string;
  reasons?: string[];
};

/**
 * The auth service's own "this user does not exist" error code (auth-js reads
 * it from the reply body). The HTTP status alone does not say this: a 404 can
 * also come from the gateway in front of the auth service.
 */
const AUTH_USER_NOT_FOUND_CODE = "user_not_found";

/**
 * Supabase "zayıf parola" reddi mi? (Derin denetim X17.) Sızmış parola
 * koruması iki projede AÇIK: admin createUser / updateUserById HIBP'de geçen
 * parolayı 422 `weak_password` ile reddeder. Yalnız 422'ye bakılmaz —
 * `email_exists` gibi başka 422'ler de var.
 */
function isWeakPasswordError(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  return error.code === "weak_password" || error.name === "AuthWeakPasswordError";
}

/**
 * `verifyPassword` hatası kimlik hatası DEĞİL mi? (Kesinti/yanlış yapılandırma
 * → 503, istemci IP'sinin Supabase kotası → 429.) Çağıranlar bunları audit'e
 * `bad_credentials` yazmadan ve "parola hatalı"ya çevirmeden aynen geçirir.
 */
export function isSupabaseAuthAccessError(err: unknown): boolean {
  return (
    err instanceof ServiceUnavailableException ||
    (err instanceof HttpException && err.getStatus() === HttpStatus.TOO_MANY_REQUESTS)
  );
}

@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger(SupabaseAuthService.name);
  private readonly admin: SupabaseClient;
  private readonly publicClient: SupabaseClient;
  /**
   * Parola doğrulama istemcisi (Y-11). `SUPABASE_SECRET_KEY` geçerli bir secret
   * anahtarsa (`sb_secret_…`, R-3) o anahtarla kurulur ve her isteğe istemci
   * IP'sini `Sb-Forwarded-For` ile ekler; yoksa (eksik ya da tanınmayan anahtar)
   * `publicClient`'ın kendisidir (eski davranış, IP iletilmez).
   */
  private readonly passwordClient: SupabaseClient;
  /** true → `Sb-Forwarded-For` iletiliyor (geçerli `sb_secret_` anahtarı yapılandırılmış). */
  private readonly forwardsClientIp: boolean;
  /** Çağrı bazında iletilecek istemci IP'si (fetch sarmalayıcısı okur). */
  private readonly forwardedFor = new AsyncLocalStorage<string>();

  constructor(private readonly config: ConfigService) {
    const url = this.requireEnv("SUPABASE_URL");
    const serviceRoleKey = this.requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = this.requireEnv("SUPABASE_ANON_KEY");
    const secretKey = this.config.get<string>("SUPABASE_SECRET_KEY")?.trim();

    /**
     * Denetim 2026-08-27 Parça 11 #9: `auth-js`'e özel `fetch` verilmediğinde
     * hiçbir timeout uygulanmıyor (tek tavan undici ≈ 300 sn). Supabase Auth
     * askıda kalırsa giriş/kayıt istekleri dakikalarca tutuluyordu — üstelik
     * login throttle penceresindeki tüm istekler aynı anda asılı kalabiliyordu.
     */
    const timeoutFetch: typeof fetch = (input, init) =>
      fetch(input, {
        ...init,
        signal: AbortSignal.timeout(SUPABASE_TIMEOUT_MS),
      });

    // Admin client — server-side. asla browser'a sızmamalı.
    this.admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: timeoutFetch },
    });

    // Public client — signInWithPassword gibi anonymous user'ın yapabildiği
    // şeyler için. Şifre doğrulamayı bunun üzerinden yaparız.
    this.publicClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { fetch: timeoutFetch },
    });

    // R-3: Supabase `Sb-Forwarded-For`'u YALNIZ secret API anahtarıyla
    // (`sb_secret_…`) dikkate alır. Başka bir değer (ör. yanlışlıkla girilmiş
    // service_role JWT'si) ile başlık sessizce yok sayılır ve kota yine sunucu
    // IP'sinde paylaşılır; bu durumda IP iletimi VARSAYILIRSA paylaşılan kota
    // 429'u "istemci kotası" (warning) sayılır ve platform çapındaki giriş
    // kilidi `auth_rate_limited` error alarmı üretmeden gizlenir. Bu yüzden
    // tanınmayan anahtar hiç kullanılmaz: eski davranışa (anon istemci, IP
    // iletimi yok) düşülür ve yanlış yapılandırma görünür kılınır.
    const validSecretKey = secretKey?.startsWith("sb_secret_") ? secretKey : undefined;
    if (secretKey && !validSecretKey) {
      this.logger.error(
        "SUPABASE_SECRET_KEY does not start with 'sb_secret_'; Supabase honours Sb-Forwarded-For only with a secret API key. Ignoring it: sign-ins use the anon key without client IP forwarding (audit Y-11/R-3).",
      );
      reportToSentry("SUPABASE_SECRET_KEY is not a secret API key (sb_secret_); client IP forwarding disabled", "warning", {
        tags: { supabase: "auth_secret_key_invalid", supabase_ip_forwarding: "false" },
      });
    }

    if (validSecretKey) {
      const forwardingFetch: typeof fetch = (input, init) => {
        const ip = this.forwardedFor.getStore();
        if (!ip) return timeoutFetch(input, init);
        const headers = new Headers(init?.headers);
        headers.set(SB_FORWARDED_FOR_HEADER, ip);
        return timeoutFetch(input, { ...init, headers });
      };
      this.passwordClient = createClient(url, validSecretKey, {
        auth: { autoRefreshToken: false, persistSession: false },
        global: { fetch: forwardingFetch },
      });
      this.forwardsClientIp = true;
    } else {
      this.passwordClient = this.publicClient;
      this.forwardsClientIp = false;
      if (!secretKey && this.config.get<string>("NODE_ENV") === "production") {
        this.logger.warn(
          "SUPABASE_SECRET_KEY is not set — every sign-in reaches Supabase from the server IP; the per-IP sign-in quota can lock out all users (audit Y-11).",
        );
      }
    }
  }

  // ============================================================
  // SIGN-IN — email/password doğrulama
  // ============================================================

  /**
   * Kullanıcının email + parolasını Supabase Auth'a doğrulatır.
   * Başarılıysa `auth.users.id` döner; başarısız ise UnauthorizedException.
   *
   * Bu metod SADECE auth.users tarafında kimlik doğrular — domain
   * kullanıcısı (User/SupplierUser/PlatformAdmin) lookup'ını çağıran yapar.
   *
   * `clientIp` (Y-11): isteği yapan son kullanıcının IP'si (`resolveClientIp`).
   * Secret anahtar yapılandırılmışsa Supabase'e `Sb-Forwarded-For` ile iletilir;
   * Supabase'in IP başına giriş kotası sunucu IP'si yerine bu IP'ye uygulanır.
   */
  async verifyPassword(
    email: string,
    password: string,
    clientIp?: string,
  ): Promise<{ authId: string; email: string }> {
    const ip = clientIp?.trim();
    // Bu çağrıda istemci IP'si gerçekten iletiliyor mu? (Geçersiz/eksik IP'de
    // istek sunucu IP'siyle gider → kota yine paylaşılan kotadır.)
    const forwarded = this.forwardsClientIp && !!ip && isIP(ip) !== 0;
    const signIn = () =>
      this.passwordClient.auth.signInWithPassword({ email, password });
    const { data, error } = forwarded
      ? await this.forwardedFor.run(ip, signIn)
      : await signIn();

    if (error) {
      // Denetim 2026-08-23 #10: kimlik hatası (400/401/403/422 — parola yanlış,
      // e-posta doğrulanmamış) ile ERİŞİM hatası (ağ/0, 429, ≥500) ayrılır.
      // Eskiden hepsi "parola hatalı" → kesintide yanlış audit + kullanıcıya
      // yanlış mesaj + Sentry'e hiçbir şey. Supabase mesajı yine sızdırılmaz.
      const status = (error as { status?: number }).status ?? 0;
      const code = (error as AuthErrorLike).code;
      const extra = { status, name: error.name, code };

      // B3 gözden geçirme: geçersiz / iptal edilmiş / başka projeye ait API
      // anahtarında Supabase ağ geçidi 401 "Invalid API key" döner (GoTrue'ya
      // hiç ulaşmaz → hata kodu yok). Bu kimlik hatası sayılırsa HERKESİN
      // girişi "parola hatalı" ile düşer ve kesinti görünmez olur. GoTrue'nun
      // kendi kimlik hataları her zaman `code` taşır.
      const misconfigured =
        status === 401 &&
        (/api key/i.test(error.message ?? "") || (this.forwardsClientIp && !code));
      if (misconfigured) {
        this.logger.error(
          `Supabase Auth rejected the API key (401, secretKey=${this.forwardsClientIp}): ${error.message}`,
        );
        reportToSentry("Supabase Auth API key rejected (signInWithPassword 401)", "error", {
          tags: {
            supabase: "auth_misconfigured",
            supabase_ip_forwarding: String(this.forwardsClientIp),
          },
          extra,
        });
        throw new ServiceUnavailableException(
          i18nMessage("api.supabaseAuth.girisServisiGeciciOlarakKullanilamiyorLutfen"),
        );
      }

      // B3 gözden geçirme: IP iletilirken 429 = YALNIZ bu istemci IP'sinin
      // kotası doldu (platform kesintisi değil) → kullanıcıya "çok fazla
      // deneme" (429); Sentry'e `warning` (saldırgan IP'si error alarmı
      // üretmesin). IP iletilmiyorsa kota sunucu IP'sinde paylaşılır → aşağıda
      // 503 + error (herkes etkilenir).
      if (status === 429 && forwarded) {
        this.logger.warn(`Supabase Auth per-client sign-in rate limit hit (429): ${error.message}`);
        reportToSentry("Supabase Auth per-client sign-in rate limit (signInWithPassword 429)", "warning", {
          tags: { supabase: "auth_client_rate_limited", supabase_ip_forwarding: "true" },
          extra,
        });
        throw new HttpException(i18nMessage("api.http.cokFazlaDeneme"), HttpStatus.TOO_MANY_REQUESTS);
      }

      const credentialFailure = status === 400 || status === 401 || status === 403 || status === 422;
      if (!credentialFailure) {
        // Y-11: 429 = Supabase giriş kotası doldu (IP iletilmediği için sunucu
        // IP'sinin paylaşılan kotası → herkes etkilenir). Kesintiden AYRI
        // etiketle raporlanır (alarm kuralı `supabase:auth_rate_limited`).
        const rateLimited = status === 429;
        this.logger.error(
          rateLimited
            ? `Supabase Auth sign-in rate limit hit (429, ipForwarding=${this.forwardsClientIp}): ${error.message}`
            : `Supabase Auth erişilemiyor (status=${status}): ${error.name ?? "error"} ${error.message}`,
        );
        reportToSentry(
          rateLimited
            ? "Supabase Auth sign-in rate limit hit (signInWithPassword 429)"
            : "Supabase Auth erişilemiyor (signInWithPassword)",
          "error",
          {
            tags: {
              supabase: rateLimited ? "auth_rate_limited" : "auth_unavailable",
              supabase_ip_forwarding: String(this.forwardsClientIp),
            },
            extra,
          },
        );
        throw new ServiceUnavailableException(
          i18nMessage("api.supabaseAuth.girisServisiGeciciOlarakKullanilamiyorLutfen"),
        );
      }
      this.logger.debug(
        `signInWithPassword failed for ${maskEmail(email)}: ${error.message}`,
      );
      throw new UnauthorizedException(i18nMessage("api.supabaseAuth.ePostaVeyaParolaHatali"));
    }
    if (!data.user) {
      throw new UnauthorizedException(i18nMessage("api.supabaseAuth.ePostaVeyaParolaHatali"));
    }
    return { authId: data.user.id, email: data.user.email ?? email };
  }

  // ============================================================
  // ADMIN — user oluştur / sil / davet
  // ============================================================

  /**
   * Yeni Supabase auth.users kaydı oluşturur (email + password ile).
   * Email confirm'i otomatik yapılır (admin oluşturduğu için).
   * Çakışan email ServiceUnavailable döner (caller ConflictException'a çevirebilir).
   */
  async createUser(
    email: string,
    password: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ authId: string }> {
    const { data, error } = await this.admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: metadata,
    });
    if (error || !data.user) {
      this.logger.error(`createUser failed for ${maskEmail(email)}: ${error?.message}`);
      // Supabase e-posta çakışmasında "already been registered" benzeri döner —
      // kullanıcıya teknik detay değil, dostane çakışma mesajı göster.
      if (error && /registered|exists|taken|already/i.test(error.message)) {
        throw new ConflictException(i18nMessage("api.supabaseAuth.buEPostaIleZatenBir"));
      }
      // X17: zayıf/sızmış parola kullanıcı hatasıdır — "birazdan tekrar
      // deneyin" (503) değil; aynı parolayla tekrar denemek hep başarısız olur.
      this.throwIfWeakPassword(error);
      throw new ServiceUnavailableException(
        i18nMessage("api.supabaseAuth.hesapOlusturulamadiLutfenBirazdanTekrarDeneyin"),
      );
    }
    return { authId: data.user.id };
  }

  /**
   * E-posta ile davet linki gönderir (kullanıcı tarayıcıdan şifresini koyar).
   * Buyer-invite akışı için.
   */
  async inviteByEmail(
    email: string,
    redirectTo: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ authId: string }> {
    const { data, error } = await this.admin.auth.admin.inviteUserByEmail(
      email,
      {
        data: metadata,
        redirectTo,
      },
    );
    if (error || !data.user) {
      this.logger.error(`inviteByEmail failed for ${maskEmail(email)}: ${error?.message}`);
      throw new ServiceUnavailableException(i18nMessage("api.supabaseAuth.davetEPostasiGonderilemedi"));
    }
    return { authId: data.user.id };
  }

  /** auth.users kaydını siler — domain user soft-delete'inde çağrılır. */
  async deleteUser(authId: string): Promise<void> {
    const { error } = await this.admin.auth.admin.deleteUser(authId);
    if (error) {
      this.logger.error(`deleteUser failed for ${authId}: ${error.message}`);
      // throw etme — domain'den silindiyse auth'ta zaten olmayabilir
    }
  }

  /**
   * Deletes the auth user and REPORTS the result. `deleteUser` above only logs
   * a failure, which is right for a clean-up after the fact; this one is for a
   * caller that must not go on unless the sign-in identity is really gone
   * (removal of an expired unverified sign-up - the address must become free).
   *
   * Resolves ONLY when the auth service itself has said that the user does not
   * exist afterwards:
   *  - the delete succeeded;
   *  - the delete answered with the auth service's own `user_not_found` code
   *    (already missing, e.g. the retry of a run whose database commit failed
   *    after the provider had deleted the user). A bare HTTP 404 is NOT that
   *    answer: a gateway that cannot route `/auth/v1` (wrong path in
   *    `SUPABASE_URL`, provider incident) also answers 404, the user still
   *    exists, and a caller that went on would delete the only row that knows
   *    the auth id - the address would stay registered at the provider with
   *    nothing left to release it;
   *  - the delete failed on OUR side (client time-out after the server acted,
   *    connection dropped, unreadable answer) and ONE look-up of the user then
   *    answers `user_not_found`: the delete did happen. Without this look-up
   *    the caller rolls back and keeps a row whose auth id is dead; if that
   *    account is verified before the next run it can never sign in again.
   * Everything else - outage, rejected key, rate limit, a user that is still
   * there, a look-up that fails too - throws, also when the client itself
   * throws.
   */
  async deleteUserStrict(authId: string): Promise<void> {
    const { error } = await this.admin.auth.admin.deleteUser(authId);
    if (!error) return;
    const e = error as AuthErrorLike;
    if (e.code === AUTH_USER_NOT_FOUND_CODE) return;
    if (await this.isAuthUserGone(authId)) {
      this.logger.warn(
        `deleteUserStrict: the delete of ${authId} failed on our side (status=${e.status ?? 0}) but the provider no longer has the user; treated as deleted`,
      );
      return;
    }
    this.logger.error(
      `deleteUserStrict failed for ${authId} (status=${e.status ?? 0}): ${error.message}`,
    );
    throw new Error(`auth user ${authId} could not be deleted (status=${e.status ?? 0})`);
  }

  /**
   * Does the auth service say, in its own words, that this user does not
   * exist? True only for its `user_not_found` answer. A user that is found, a
   * gateway 404 and a look-up that fails are all "not known to be gone".
   */
  private async isAuthUserGone(authId: string): Promise<boolean> {
    try {
      const { error } = await this.admin.auth.admin.getUserById(authId);
      return (error as AuthErrorLike | null)?.code === AUTH_USER_NOT_FOUND_CODE;
    } catch {
      return false;
    }
  }

  /** Şifre değişikliği (kullanıcı kendi şifresini değiştirirken). */
  async updatePassword(authId: string, newPassword: string): Promise<void> {
    const { error } = await this.admin.auth.admin.updateUserById(authId, {
      password: newPassword,
    });
    if (error) {
      this.logger.error(`updatePassword failed for ${authId}: ${error.message}`);
      this.throwIfWeakPassword(error);
      throw new ServiceUnavailableException(i18nMessage("api.supabaseAuth.sifreDegistirilemedi"));
    }
  }

  /**
   * Admin destek — kullanıcının auth e-postasını değiştirir. `email_confirm`
   * true: yeni adres doğrulanmış sayılır (admin güveniyle). Çakışma (başka
   * auth kullanıcısında kayıtlı) durumunda hata fırlatır.
   */
  async updateEmail(authId: string, newEmail: string): Promise<void> {
    const { error } = await this.admin.auth.admin.updateUserById(authId, {
      email: newEmail,
      email_confirm: true,
    });
    if (error) {
      this.logger.error(`updateEmail failed for ${authId}: ${error.message}`);
      // Supabase çakışmada "already been registered" benzeri döner.
      if (/registered|exists|taken/i.test(error.message)) {
        throw new ConflictException(i18nMessage("api.supabaseAuth.buEPostaBaskaBirHesapta"));
      }
      throw new ServiceUnavailableException(i18nMessage("api.supabaseAuth.ePostaDegistirilemedi"));
    }
  }

  /**
   * "Şifremi unuttum" — Supabase password recovery email tetikler.
   * Kullanıcı linke tıklayınca `redirectTo`'ya yönlenir, oradan yeni
   * şifresini set eder.
   */
  async sendPasswordResetEmail(
    email: string,
    redirectTo: string,
  ): Promise<void> {
    const { error } = await this.publicClient.auth.resetPasswordForEmail(
      email,
      { redirectTo },
    );
    if (error) {
      this.logger.warn(
        `sendPasswordResetEmail failed for ${maskEmail(email)}: ${error.message}`,
      );
      // Existence sızdırmamak için sessizce geçeriz (caller her durumda
      // generic "e-posta gönderildi" döner)
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

  /**
   * Supabase `weak_password` reddini 400'e çevirir (X17). Sızıntı listesinde
   * geçen parola (`reasons` içinde `pwned`) ayrı mesaj alır.
   */
  private throwIfWeakPassword(error: AuthErrorLike | null | undefined): void {
    if (!isWeakPasswordError(error)) return;
    const pwned = error?.reasons?.includes("pwned") ?? false;
    throw new BadRequestException(
      i18nMessage(
        pwned
          ? "api.supabaseAuth.sifreSizintiListelerindeGeciyor"
          : "api.supabaseAuth.sifreYeterinceGucluDegil",
        undefined,
        "WEAK_PASSWORD",
      ),
    );
  }

  private requireEnv(key: string): string {
    const v = this.config.get<string>(key);
    if (!v) {
      throw new Error(
        `Env değişkeni eksik: ${key}. .env'de Supabase credentials'larını ayarla.`,
      );
    }
    return v;
  }
}

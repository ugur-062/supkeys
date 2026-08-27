import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { reportToSentry } from "../../instrument";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger(SupabaseAuthService.name);
  private readonly admin: SupabaseClient;
  private readonly publicClient: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    const url = this.requireEnv("SUPABASE_URL");
    const serviceRoleKey = this.requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = this.requireEnv("SUPABASE_ANON_KEY");

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
   */
  async verifyPassword(
    email: string,
    password: string,
  ): Promise<{ authId: string; email: string }> {
    const { data, error } = await this.publicClient.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Denetim 2026-08-23 #10: kimlik hatası (400/401/403/422 — parola yanlış,
      // e-posta doğrulanmamış) ile ERİŞİM hatası (ağ/0, 429, ≥500) ayrılır.
      // Eskiden hepsi "parola hatalı" → kesintide yanlış audit + kullanıcıya
      // yanlış mesaj + Sentry'e hiçbir şey. Supabase mesajı yine sızdırılmaz.
      const status = (error as { status?: number }).status ?? 0;
      const credentialFailure = status === 400 || status === 401 || status === 403 || status === 422;
      if (!credentialFailure) {
        this.logger.error(
          `Supabase Auth erişilemiyor (status=${status}): ${error.name ?? "error"} ${error.message}`,
        );
        reportToSentry("Supabase Auth erişilemiyor (signInWithPassword)", "error", {
          tags: { supabase: "auth_unavailable" },
          extra: { status, name: error.name },
        });
        throw new ServiceUnavailableException(
          "Giriş servisi geçici olarak kullanılamıyor — lütfen birazdan tekrar deneyin",
        );
      }
      this.logger.debug(
        `signInWithPassword failed for ${email}: ${error.message}`,
      );
      throw new UnauthorizedException("E-posta veya parola hatalı");
    }
    if (!data.user) {
      throw new UnauthorizedException("E-posta veya parola hatalı");
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
      this.logger.error(`createUser failed for ${email}: ${error?.message}`);
      // Supabase e-posta çakışmasında "already been registered" benzeri döner —
      // kullanıcıya teknik detay değil, dostane çakışma mesajı göster.
      if (error && /registered|exists|taken|already/i.test(error.message)) {
        throw new ConflictException("Bu e-posta ile zaten bir hesap var");
      }
      throw new ServiceUnavailableException(
        "Hesap oluşturulamadı, lütfen birazdan tekrar deneyin",
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
      this.logger.error(`inviteByEmail failed for ${email}: ${error?.message}`);
      throw new ServiceUnavailableException("Davet e-postası gönderilemedi");
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

  /** Şifre değişikliği (kullanıcı kendi şifresini değiştirirken). */
  async updatePassword(authId: string, newPassword: string): Promise<void> {
    const { error } = await this.admin.auth.admin.updateUserById(authId, {
      password: newPassword,
    });
    if (error) {
      this.logger.error(`updatePassword failed for ${authId}: ${error.message}`);
      throw new ServiceUnavailableException("Şifre değiştirilemedi");
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
        throw new ConflictException("Bu e-posta başka bir hesapta kayıtlı");
      }
      throw new ServiceUnavailableException("E-posta değiştirilemedi");
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
        `sendPasswordResetEmail failed for ${email}: ${error.message}`,
      );
      // Existence sızdırmamak için sessizce geçeriz (caller her durumda
      // generic "e-posta gönderildi" döner)
    }
  }

  // ============================================================
  // HELPERS
  // ============================================================

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

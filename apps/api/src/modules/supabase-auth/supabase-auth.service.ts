import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
@Injectable()
export class SupabaseAuthService {
  private readonly logger = new Logger(SupabaseAuthService.name);
  private readonly admin: SupabaseClient;
  private readonly publicClient: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    const url = this.requireEnv("SUPABASE_URL");
    const serviceRoleKey = this.requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = this.requireEnv("SUPABASE_ANON_KEY");

    // Admin client — server-side. asla browser'a sızmamalı.
    this.admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Public client — signInWithPassword gibi anonymous user'ın yapabildiği
    // şeyler için. Şifre doğrulamayı bunun üzerinden yaparız.
    this.publicClient = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
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
      // Supabase mesajlarını sızdırma — generic Unauthorized
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

/**
 * Timing-attack neutralizer için ortak sabit bcrypt hash.
 *
 * Login akışlarında kullanıcı bulunamadığında veya inaktif olduğunda
 * `bcrypt.compare(password, DUMMY_HASH)` çalıştırılır; böylece
 * "hesap yok" vs "şifre yanlış" sürelerinin farkı (user enumeration vektörü)
 * kapanır. Hiçbir kullanıcının gerçek şifresine eşit değildir
 * ("invalid-password-placeholder" string'inin bcrypt(rounds=12) çıktısıdır).
 *
 * Security audit O-4 — 3 auth servisinde tekrarlanan literal hash bu modülden
 * import edilir. Yeni auth flow eklerken aynı sabit kullanılmalı.
 */
export const DUMMY_HASH =
  "$2b$12$8b/5VmH1kS7lHe9b8p2E6.7jZqL1k4rNQ3sP1bMxUVwYZcTfGdW6e";

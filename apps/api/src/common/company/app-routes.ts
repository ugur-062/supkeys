/**
 * Web uygulamasının derin bağlantıları — TEK KAYNAK (denetim Dalga B-2, P10).
 *
 * E-posta ve bildirim CTA'ları 51 çağrı yerinde elle şablon-literal olarak
 * kuruluyordu (`${this.webUrl()}/company/ilan/${id}` gibi). Bir rota değişince
 * (ör. `/company/siparis` → `/company/siparisler`) hepsini bulmak grep'e
 * kalıyor ve kaçırılan biri KIRIK bir CTA olarak kullanıcıya gidiyordu —
 * e-posta gönderildikten sonra düzeltilemez.
 *
 * Kullanım: `appRoutes.listing(this.webUrl(), listingId)`.
 */
export const appRoutes = {
  home: (base: string) => `${base}/company`,
  listing: (base: string, listingId: string) =>
    `${base}/company/ilan/${listingId}`,
  order: (base: string, orderId: string) => `${base}/company/siparis/${orderId}`,
  approvals: (base: string) => `${base}/company/onaylar`,
  premium: (base: string) => `${base}/company/premium`,
  messagesWith: (base: string, companyId: string) =>
    `${base}/company/mesajlar?with=${companyId}`,
} as const;

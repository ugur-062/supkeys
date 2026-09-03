/**
 * Dönem değişimi yüzdesi — TEK kural (v2 4b).
 *
 * Önceki dönem 0 ise yüzde tanımsız; ŞİMDİKİ dönem 0 ise "%100 düşüş"
 * matematik olarak doğru ama kart üstünde "0 ↘ %100" anlamsız okunuyordu
 * (Bekleyen Sipariş 0 ↘ %100). İkisinde de rozet ÇİZİLMEZ (null).
 */
export function pctChange(current: number, previous: number): number | null {
  if (!(previous > 0) || !(current > 0)) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * "7d | 30d | 3m | 6m | 12m | all" formatında range string'i alıp,
 * o aralık için `createdAt.gte` Date değeri döner. "all" veya geçersiz
 * → null (filter eklenmez).
 */
export function rangeToSinceDate(range: string | undefined): Date | null {
  if (!range || range === "all") return null;
  const now = new Date();
  const since = new Date(now);
  switch (range) {
    case "7d":
      since.setDate(now.getDate() - 7);
      return since;
    case "30d":
      since.setDate(now.getDate() - 30);
      return since;
    case "3m":
      since.setMonth(now.getMonth() - 3);
      return since;
    case "6m":
      since.setMonth(now.getMonth() - 6);
      return since;
    case "12m":
      since.setFullYear(now.getFullYear() - 1);
      return since;
    default:
      return null;
  }
}

import Anthropic from "@anthropic-ai/sdk";
import { Logger } from "@nestjs/common";

/**
 * Web sitesi içeriğinden AI ile profesyonel Türkçe "Hakkımızda" metni üretir.
 * Claude Haiku 4.5 kullanır. ANTHROPIC_API_KEY yoksa veya hata olursa `null`
 * döner — çağıran taraf heuristik (og:description) fallback'ine düşer.
 */

const logger = new Logger("AiAbout");

// Lazy singleton — modül başına bir kez kurulur. undefined: henüz denenmedi.
let client: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  client = apiKey ? new Anthropic({ apiKey }) : null;
  if (!client) {
    logger.log("ANTHROPIC_API_KEY tanımsız — AI 'Hakkımızda' devre dışı (heuristik fallback)");
  }
  return client;
}

const SYSTEM_PROMPT = `Sen bir B2B kurumsal içerik editörüsün. Görevin, bir firmanın web sitesi içeriğinden o firma için profesyonel bir "Hakkımızda" metni yazmak.

Kurallar:
- Dil: Türkçe. Akıcı, profesyonel ve kurumsal bir ton kullan.
- Uzunluk: 2-3 cümle (yaklaşık 40-70 kelime). Kısa ve öz.
- Bakış açısı: Firmayı üçüncü tekil ya da "firmamız/ekibimiz" gibi birinci çoğul ile anlat.
- Sadece verilen içerikteki bilgilere dayan. Bilgi uydurma; kanıtsız üstünlük iddiaları ("Türkiye'nin lideri", "en iyi") kullanma.
- Firmanın ne iş yaptığını, hangi sektörde/alanda faaliyet gösterdiğini öne çıkar.
- İletişim bilgisi, telefon, adres, URL, e-posta veya sosyal medya linki EKLEME.
- Başlık, madde işareti, markdown veya tırnak işareti kullanma — sadece düz paragraf.
- İçerik yetersiz veya alakasızsa, firma adına dayalı genel ama doğru tek bir cümle yaz.

ÇIKTI: Sadece "Hakkımızda" metnini döndür. "İşte metniniz:" gibi hiçbir ön/son açıklama ekleme.`;

export async function generateCompanyAbout(input: {
  companyName: string;
  siteText: string;
}): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  const siteText = input.siteText?.trim() ?? "";
  // Çok az metin varsa AI'a göndermenin anlamı yok.
  if (siteText.length < 80) return null;

  try {
    const res = await anthropic.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: [
        {
          type: "text",
          text: SYSTEM_PROMPT,
          // Sistem prompt'u sabit — prefix cache (eşik üstündeyse okunur).
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        {
          role: "user",
          content: `Firma adı: ${input.companyName || "(bilinmiyor)"}\n\nWeb sitesi içeriği:\n"""\n${siteText.slice(0, 6000)}\n"""\n\nBu firma için yukarıdaki kurallara uygun bir "Hakkımızda" metni yaz.`,
        },
      ],
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    return text.length > 0 ? text.slice(0, 2000) : null;
  } catch (err) {
    logger.warn(
      `AI 'Hakkımızda' üretimi başarısız, heuristik'e düşülüyor: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}

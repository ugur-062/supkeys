import type { ReactNode } from "react";

/**
 * Asistan yanıtları için markdown-lite renderer — BAĞIMLILIKSIZ ve GÜVENLİ
 * (React node üretir, innerHTML yok → XSS yüzeyi yok). Kapsam bilinçli dar:
 * **kalın**, "-"/"*"/"•" madde listesi, "1." numaralı liste. Sistem prompt'u
 * modeli bu alt kümede kalmaya yönlendirir (tablo/başlık/kod bloğu yasak);
 * kapsam dışı işaretler olduğu gibi (düz metin) görünür — sessiz kayıp yok.
 */

const BOLD_RE = /(\*\*[^*]+\*\*)/g;
const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const NUMBERED_RE = /^\s*\d+[.)]\s+(.*)$/;

function renderInline(text: string, keyBase: string): ReactNode[] {
  return text.split(BOLD_RE).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
      <strong key={`${keyBase}-b${i}`} className="font-semibold">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] };

function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flush = () => {
    if (list) {
      blocks.push({ kind: "list", ...list });
      list = null;
    }
  };
  for (const line of text.split("\n")) {
    const bullet = BULLET_RE.exec(line);
    const numbered = bullet ? null : NUMBERED_RE.exec(line);
    if (bullet || numbered) {
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) {
        flush();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]!);
    } else {
      flush();
      if (line.trim()) blocks.push({ kind: "p", text: line });
    }
  }
  flush();
  return blocks;
}

export function AssistantMarkdown({ text }: { text: string }) {
  const blocks = parseBlocks(text);
  return (
    <div className="space-y-1.5">
      {blocks.map((b, i) =>
        b.kind === "p" ? (
          <p key={i}>{renderInline(b.text, `${i}`)}</p>
        ) : b.ordered ? (
          <ol key={i} className="list-decimal space-y-0.5 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{renderInline(item, `${i}-${j}`)}</li>
            ))}
          </ol>
        ) : (
          <ul key={i} className="list-disc space-y-0.5 pl-5">
            {b.items.map((item, j) => (
              <li key={j}>{renderInline(item, `${i}-${j}`)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}

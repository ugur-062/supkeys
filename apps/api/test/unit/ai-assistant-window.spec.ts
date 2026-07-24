/**
 * Faz AI-2 — kayan pencere + özetleme saf mantığı.
 */
import {
  WINDOW_TURNS,
  planWindow,
  type StoredMessage,
} from "../../src/modules/ai/assistant/window";

function convo(turns: number): StoredMessage[] {
  const msgs: StoredMessage[] = [];
  let seq = 0;
  for (let i = 0; i < turns; i++) {
    msgs.push({ seq: ++seq, role: "USER", content: `soru ${i}` });
    msgs.push({ seq: ++seq, role: "ASSISTANT", content: `yanıt ${i}` });
  }
  return msgs;
}

describe("planWindow", () => {
  it("pencereye sığan kısa sohbet: tümü history'de, özetlenecek yok", () => {
    const plan = planWindow(convo(3), null, 0);
    expect(plan.toSummarize).toHaveLength(0);
    expect(plan.history).toHaveLength(6); // 3 tur × 2
    expect(plan.newSummarizedThroughSeq).toBe(0);
  });

  it("pencereyi aşınca en eski turlar özetlenmek üzere ayrılır; pencere sabitlenir", () => {
    const turns = WINDOW_TURNS + 3; // 3 tur taşar
    const plan = planWindow(convo(turns), null, 0);
    // Pencerede son WINDOW_TURNS tur = 2×WINDOW_TURNS mesaj.
    expect(plan.history).toHaveLength(WINDOW_TURNS * 2);
    // Taşan 3 tur = 6 mesaj özetlenecek.
    expect(plan.toSummarize).toHaveLength(6);
    expect(plan.newSummarizedThroughSeq).toBe(6); // 3. turun son mesajı seq=6
  });

  it("mevcut özet history'nin başına eklenir; özetlenmiş mesajlar tekrar özetlenmez", () => {
    const msgs = convo(WINDOW_TURNS + 2); // seq 1..(2W+4)
    const plan = planWindow(msgs, "önceki özet", 4); // ilk 2 tur (seq≤4) zaten özette
    // Özet mesajı + kalan (2W+4−4=2W) mesajın son penceresi.
    expect(plan.history[0]!.parts[0]).toEqual({
      text: expect.stringContaining("önceki özet"),
    });
    // seq>4 taze mesaj = 2W adet; hepsi pencereye sığar (=2W) → taşma yok.
    expect(plan.toSummarize).toHaveLength(0);
    expect(plan.history).toHaveLength(WINDOW_TURNS * 2 + 1); // +1 özet
  });

  it("USER→user, ASSISTANT→model rol eşlemesi", () => {
    const plan = planWindow(convo(1), null, 0);
    expect(plan.history[0]!.role).toBe("user");
    expect(plan.history[1]!.role).toBe("model");
  });
});

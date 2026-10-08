/**
 * ÜLKEYE GÖRE HUKUKİ YAPILAR — kayıt sihirbazındaki "Hukuki yapı" seçicisinin
 * TEK KAYNAĞI (2026-10-08, kullanıcı: "kayıt kısmında ülke bazlı her şeyi daha
 * mantıklı hale getir").
 *
 * Eskiden her ülkeye aynı dört seçenek sunuluyordu (Limited / Anonim / Şahıs /
 * Diğer): Alman firması "Limited Şirket" ile "Diğer → GmbH" arasında kalıyor,
 * Rus firması "ООО"yu elle yazıyordu. Artık seçici SEÇİLEN ÜLKENİN yerel
 * yapılarını listeler; her yapı platformun mevcut `CompanyType` değerine
 * eşlenir, seçilen yerel ad `Company.legalFormLocal`e AYNEN yazılır ve hukuki
 * yapıyı gösteren her ekran onu basar.
 *
 * KURALLAR
 *  · Adlar YEREL yazımıyla (ООО, 株式会社, S.r.l.) — çevrilmez, katalogda değil
 *    VERİDİR. Dile göre değişmez.
 *  · Yalnız VARLIĞINDAN EMİN olunan yapılar. Şüpheli yapı listeye girmez;
 *    listede olmayan yapı için seçicide "Diğer" + serbest metin her zaman var.
 *  · Listesi olmayan ülke (ve bilinmeyen kod) BOŞ liste döner → sihirbaz
 *    bugünkü genel dört seçeneği gösterir. TÜRKİYE ve KKTC bilinçli olarak
 *    listesizdir: onların seçenekleri bugünkü genel listedir (Limited Şirket /
 *    Anonim Şirket / Şahıs Firması / Diğer) ve TR vergi no kuralı
 *    (`isValidTaxIdForCountry`) doğrudan `SOLE_PROPRIETOR` değerine bağlıdır.
 *  · Her ülkede en az bir sermaye şirketi (LIMITED ya da JOINT_STOCK) ve en az
 *    bir şahıs işletmesi (SOLE_PROPRIETOR) bulunur; adlar ülke içinde tekildir
 *    (sözleşme: api `test/unit/legal-forms.spec.ts`).
 *  · TEK KİŞİLİK İŞ STATÜLERİ de listededir (Freiberufler, Самозанятый,
 *    Micro-entrepreneur, Libero professionista, Autônomo): kesin anlamıyla
 *    hukuki yapı değildirler ama o ülkede tek kişinin kendini tanıttığı addır.
 *    Listede olmasalardı kişi "Diğer"i seçer, OTHER olarak kaydolur ve KİŞİSEL
 *    vergi numarası başka firmalara açık kalırdı (bkz. EŞLEME › SOLE_PROPRIETOR).
 *  · LİSTEYE GİRMEYENLER (bilinçli): kâr amacı gütmeyen yapılar (vakıf, dernek)
 *    ve şubeler. Bunlar "Diğer" + serbest metinle yazılır; sihirbazın "Diğer"
 *    kutusundaki örnekler de bunlardır (`legalFormLocalPlaceholderListed`) —
 *    örnek olarak LİSTEDEKİ bir yapı (ör. kooperatif) gösterilmez.
 *
 * SAKLAMA KURALI — EŞLEMENİN SAHİBİ API'DİR (`resolveLegalForm`): yerel ad
 * firmanın ülkesinin listesindeyse saklanan tür LİSTEDEN gelir, istemcinin
 * gönderdiği tür ne olursa olsun (kayıt tamamlama ve admin düzeltmesi). Listede
 * olmayan ad (serbest metin, listesiz ülke) istemcinin türünü korur.
 *
 * EŞLEME
 *  · LIMITED — sınırlı sorumlu, halka kapalı sermaye şirketi (GmbH, Ltd, ООО).
 *  · JOINT_STOCK — paylı / anonim şirket (AG, PLC, АО, S.A.).
 *  · SOLE_PROPRIETOR — şahıs işletmesi ve tek kişilik iş statüsü (e.K., ИП,
 *    Sole trader, Freiberufler). Tek İŞLEVSEL değer budur: şahıs firmasının
 *    vergi numarası kişisel veridir, başka firmalara gösterilmez
 *    (`visible-tax-number.ts`). Kararsız kalınan yapıda (kişisel numarayla da
 *    tüzel kişilikle de kurulabilen RU "КФХ") gizleyen taraf seçilir.
 *  · OTHER — şahıs ortaklıkları, kooperatif ve kalanlar (KG, LLP, S.n.c.).
 */
export type LegalFormType = "LIMITED" | "JOINT_STOCK" | "SOLE_PROPRIETOR" | "OTHER";

export interface LocalLegalForm {
  /** Yerel yazımıyla ad — `Company.legalFormLocal`e aynen yazılır. */
  name: string;
  /** Platform karşılığı (`CompanyType`). */
  type: LegalFormType;
}

const L = "LIMITED";
const J = "JOINT_STOCK";
const S = "SOLE_PROPRIETOR";
const O = "OTHER";

type Row = readonly [name: string, type: LegalFormType];

/** Sıra seçicideki sıradır: sermaye şirketleri → ortaklıklar → şahıs işletmesi. */
const TABLE: Readonly<Record<string, readonly Row[]>> = {
  // ── Avrupa ──────────────────────────────────────────────────────────
  DE: [
    ["GmbH", L],
    ["UG (haftungsbeschränkt)", L],
    ["AG", J],
    ["SE", J],
    ["GmbH & Co. KG", O],
    ["KG", O],
    ["OHG", O],
    ["GbR", O],
    ["PartG mbB", O],
    ["eG", O],
    ["e.K.", S],
    ["Einzelunternehmen", S],
    ["Freiberufler", S],
  ],
  AT: [
    ["GmbH", L],
    ["FlexKapG", L],
    ["AG", J],
    ["GmbH & Co KG", O],
    ["KG", O],
    ["OG", O],
    ["GesbR", O],
    ["e.U.", S],
    ["Einzelunternehmen", S],
    ["Freiberufler", S],
  ],
  // İsviçre'de yapı adları üç resmî dilde kullanılır (Almanca / Fransızca / İtalyanca).
  CH: [
    ["GmbH", L],
    ["Sàrl", L],
    ["Sagl", L],
    ["AG", J],
    ["SA", J],
    ["Kollektivgesellschaft", O],
    ["Société en nom collectif", O],
    ["Società in nome collettivo", O],
    ["Kommanditgesellschaft", O],
    ["Société en commandite", O],
    ["Società in accomandita", O],
    ["Genossenschaft", O],
    ["Société coopérative", O],
    ["Società cooperativa", O],
    ["Einzelunternehmen", S],
    ["Entreprise individuelle", S],
    ["Ditta individuale", S],
  ],
  FR: [
    ["SARL", L],
    ["EURL", L],
    ["SAS", J],
    ["SASU", J],
    ["SA", J],
    ["SNC", O],
    ["SCS", O],
    ["SCI", O],
    ["Entreprise individuelle (EI)", S],
    ["Micro-entrepreneur", S],
  ],
  IT: [
    ["S.r.l.", L],
    ["S.r.l.s.", L],
    ["S.p.A.", J],
    ["S.n.c.", O],
    ["S.a.s.", O],
    ["Società semplice", O],
    ["Società cooperativa", O],
    ["Ditta individuale", S],
    ["Libero professionista", S],
  ],
  ES: [
    ["S.L.", L],
    ["S.L.U.", L],
    ["S.L.L.", L],
    ["S.A.", J],
    ["Sociedad Cooperativa", O],
    ["Sociedad Civil", O],
    ["Comunidad de Bienes", O],
    ["Autónomo", S],
  ],
  PT: [
    ["Lda.", L],
    ["Unipessoal Lda.", L],
    ["S.A.", J],
    ["Cooperativa", O],
    ["Empresário em Nome Individual (ENI)", S],
  ],
  NL: [
    ["B.V.", L],
    ["N.V.", J],
    ["V.O.F.", O],
    ["C.V.", O],
    ["Maatschap", O],
    ["Coöperatie", O],
    ["Eenmanszaak", S],
  ],
  BE: [
    ["BV", L],
    ["SRL", L],
    ["NV", J],
    ["SA", J],
    ["CV", O],
    ["SC", O],
    ["VOF", O],
    ["SNC", O],
    ["CommV", O],
    ["SComm", O],
    ["Maatschap", O],
    ["Société simple", O],
    ["Eenmanszaak", S],
    ["Entreprise individuelle", S],
  ],
  GB: [
    ["Ltd", L],
    ["PLC", J],
    ["LLP", O],
    ["LP", O],
    ["Partnership", O],
    ["Sole trader", S],
  ],
  IE: [
    ["Ltd", L],
    ["DAC", L],
    ["PLC", J],
    ["LP", O],
    ["Partnership", O],
    ["Sole trader", S],
  ],
  // Kısaltmalar Ticaret Şirketleri Kanunu'ndaki yazımla: boşluklu ("sp. j.", "sp. z o.o.").
  PL: [
    ["sp. z o.o.", L],
    ["S.A.", J],
    ["P.S.A.", J],
    ["sp. j.", O],
    ["sp. k.", O],
    ["sp. p.", O],
    ["S.K.A.", O],
    ["s.c.", O],
    ["Spółdzielnia", O],
    ["Jednoosobowa działalność gospodarcza", S],
  ],
  CZ: [
    ["s.r.o.", L],
    ["a.s.", J],
    ["v.o.s.", O],
    ["k.s.", O],
    ["družstvo", O],
    ["OSVČ", S],
  ],
  SK: [
    ["s.r.o.", L],
    ["a.s.", J],
    ["j.s.a.", J],
    ["v.o.s.", O],
    ["k.s.", O],
    ["družstvo", O],
    ["SZČO", S],
  ],
  HU: [
    ["Kft.", L],
    ["Zrt.", J],
    ["Nyrt.", J],
    ["Bt.", O],
    ["Kkt.", O],
    ["Egyéni cég", S],
    ["Egyéni vállalkozó", S],
  ],
  RO: [
    ["S.R.L.", L],
    ["S.A.", J],
    ["S.N.C.", O],
    ["S.C.S.", O],
    ["PFA", S],
    ["Întreprindere individuală", S],
  ],
  BG: [
    ["ООД", L],
    ["ЕООД", L],
    ["АД", J],
    ["ЕАД", J],
    ["СД", O],
    ["КД", O],
    ["ЕТ", S],
  ],
  GR: [
    ["Ι.Κ.Ε.", L],
    ["Ε.Π.Ε.", L],
    ["Α.Ε.", J],
    ["Ο.Ε.", O],
    ["Ε.Ε.", O],
    ["Ατομική επιχείρηση", S],
  ],
  SE: [
    ["AB", L],
    ["AB (publ)", J],
    ["Handelsbolag", O],
    ["Kommanditbolag", O],
    ["Ekonomisk förening", O],
    ["Enskild firma", S],
  ],
  DK: [
    ["ApS", L],
    ["A/S", J],
    ["I/S", O],
    ["K/S", O],
    ["P/S", O],
    ["Enkeltmandsvirksomhed", S],
  ],
  NO: [
    ["AS", L],
    ["ASA", J],
    ["ANS", O],
    ["DA", O],
    ["KS", O],
    ["SA", O],
    ["Enkeltpersonforetak (ENK)", S],
  ],
  // Finlandiya'da yapı adları Fince ve İsveççe kullanılır (Oy = Ab, Oyj = Abp, Ky = Kb).
  FI: [
    ["Oy", L],
    ["Ab", L],
    ["Oyj", J],
    ["Abp", J],
    ["Ky", O],
    ["Kb", O],
    ["Ay", O],
    ["Osuuskunta", O],
    ["Toiminimi", S],
  ],
  RS: [
    ["d.o.o.", L],
    ["a.d.", J],
    ["o.d.", O],
    ["k.d.", O],
    ["Preduzetnik", S],
  ],

  // ── Rusya, Doğu Avrupa, Kafkasya, Orta Asya ─────────────────────────
  RU: [
    ["ООО", L],
    ["АО", J],
    ["ПАО", J],
    ["Производственный кооператив", O],
    ["ГУП", O],
    ["МУП", O],
    ["ИП", S],
    // Çiftlik çoğunlukla başkanının bireysel girişimci kaydıyla (kişisel 12
    // haneli ИНН) yürür; tüzel kişi olarak kurulanı azdır → gizleyen taraf.
    ["КФХ", S],
    ["Самозанятый", S],
  ],
  UA: [
    ["ТОВ", L],
    ["АТ", J],
    ["ПрАТ", J],
    ["ПАТ", J],
    ["ПП", O],
    ["ФОП", S],
  ],
  BY: [
    ["ООО", L],
    ["ОДО", L],
    ["ЗАО", J],
    ["ОАО", J],
    ["УП", O],
    ["ЧУП", O],
    ["ИП", S],
  ],
  // Kazakistan ve Özbekistan'da yapı adları iki dilde kullanılır.
  KZ: [
    ["ТОО", L],
    ["ЖШС", L],
    ["АО", J],
    ["АҚ", J],
    ["ПТ", O],
    ["КТ", O],
    ["ПК", O],
    ["ИП", S],
    ["ЖК", S],
  ],
  UZ: [
    ["MChJ", L],
    ["ООО", L],
    ["AJ", J],
    ["АО", J],
    ["XK", O],
    ["Oilaviy korxona", O],
    ["YaTT", S],
    ["ИП", S],
  ],
  AZ: [
    ["MMC", L],
    ["ASC", J],
    ["QSC", J],
    ["Kooperativ", O],
    ["Fərdi sahibkar", S],
  ],
  GE: [
    ["შპს", L],
    ["სს", J],
    ["სპს", O],
    ["კს", O],
    ["ინდივიდუალური მეწარმე", S],
  ],

  // ── Orta Doğu ve Kuzey Afrika ───────────────────────────────────────
  // BAE ticaret ruhsatlarında yapı adı İngilizce kısaltmasıyla yazılır.
  AE: [
    ["LLC", L],
    ["FZ-LLC", L],
    ["FZE", L],
    ["FZCO", L],
    ["PJSC", J],
    ["Civil Company", O],
    ["Sole Establishment", S],
  ],
  SA: [
    ["شركة ذات مسؤولية محدودة", L],
    ["شركة مساهمة", J],
    ["شركة مساهمة مبسطة", J],
    ["شركة تضامن", O],
    ["شركة توصية بسيطة", O],
    ["مؤسسة فردية", S],
  ],
  EG: [
    ["شركة ذات مسئولية محدودة", L],
    ["شركة الشخص الواحد", L],
    ["شركة مساهمة", J],
    ["شركة تضامن", O],
    ["شركة توصية بسيطة", O],
    ["منشأة فردية", S],
  ],
  MA: [
    ["SARL", L],
    ["SARL AU", L],
    ["SA", J],
    ["SAS", J],
    ["SNC", O],
    ["Entreprise individuelle", S],
    ["Auto-entrepreneur", S],
  ],
  DZ: [
    ["SARL", L],
    ["EURL", L],
    ["SPA", J],
    ["SNC", O],
    ["Entreprise individuelle", S],
  ],

  // ── Asya-Pasifik ────────────────────────────────────────────────────
  CN: [
    ["有限责任公司", L],
    ["股份有限公司", J],
    ["合伙企业", O],
    ["个人独资企业", S],
    ["个体工商户", S],
  ],
  JP: [
    ["株式会社", J],
    ["合同会社", L],
    ["有限会社", L],
    ["合名会社", O],
    ["合資会社", O],
    ["個人事業主", S],
  ],
  KR: [
    ["주식회사", J],
    ["유한회사", L],
    ["유한책임회사", L],
    ["합명회사", O],
    ["합자회사", O],
    ["개인사업자", S],
  ],
  IN: [
    ["Private Limited (Pvt. Ltd.)", L],
    ["One Person Company (OPC)", L],
    ["Public Limited (Ltd.)", J],
    ["LLP", O],
    ["Partnership Firm", O],
    ["Co-operative Society", O],
    ["Sole Proprietorship", S],
  ],
  PK: [
    ["(Pvt.) Ltd.", L],
    ["(SMC-Pvt.) Ltd.", L],
    ["Public Limited (Ltd.)", J],
    ["LLP", O],
    ["Partnership", O],
    ["Sole Proprietorship", S],
  ],
  ID: [
    ["PT", L],
    ["PT Perorangan", L],
    ["PT Tbk", J],
    ["CV", O],
    ["Firma", O],
    ["Koperasi", O],
    ["UD", S],
  ],
  MY: [
    ["Sdn. Bhd.", L],
    ["Bhd.", J],
    ["PLT", O],
    ["Partnership", O],
    ["Sole Proprietorship", S],
  ],
  SG: [
    ["Pte. Ltd.", L],
    ["Ltd.", J],
    ["LLP", O],
    ["LP", O],
    ["Partnership", O],
    ["Sole Proprietorship", S],
  ],
  TH: [
    ["บริษัทจำกัด", L],
    ["บริษัทมหาชนจำกัด", J],
    ["ห้างหุ้นส่วนจำกัด", O],
    ["ห้างหุ้นส่วนสามัญ", O],
    ["กิจการเจ้าของคนเดียว", S],
  ],
  VN: [
    ["Công ty TNHH", L],
    ["Công ty cổ phần", J],
    ["Công ty hợp danh", O],
    ["Hợp tác xã", O],
    ["Doanh nghiệp tư nhân", S],
    ["Hộ kinh doanh", S],
  ],
  AU: [
    ["Pty Ltd", L],
    ["Ltd", J],
    ["Partnership", O],
    ["Trust", O],
    ["Sole trader", S],
  ],

  // ── Amerika ve Afrika ───────────────────────────────────────────────
  // Kanada'da tek sermaye şirketi yapısı var (Inc. / Ltd. / Corp. aynı yapı) ve
  // çoğu küçük, halka kapalı şirkettir → LIMITED (JOINT_STOCK olsaydı hiçbir
  // Kanada şirketi LIMITED olamazdı). Québec'te yapı adları Fransızcadır.
  CA: [
    ["Corporation", L],
    ["Société par actions", L],
    ["General Partnership", O],
    ["Société en nom collectif", O],
    ["Limited Partnership", O],
    ["Société en commandite", O],
    ["LLP", O],
    ["Co-operative", O],
    ["Coopérative", O],
    ["Sole Proprietorship", S],
    ["Entreprise individuelle", S],
  ],
  BR: [
    ["Ltda.", L],
    ["SLU", L],
    ["S.A.", J],
    ["Sociedade Simples", O],
    ["Cooperativa", O],
    ["Empresário Individual (EI)", S],
    ["MEI", S],
    ["Autônomo", S],
  ],
  MX: [
    ["S. de R.L. de C.V.", L],
    ["S. de R.L.", L],
    ["S.A. de C.V.", J],
    ["S.A.", J],
    ["S.A.P.I. de C.V.", J],
    ["S.A.S.", J],
    ["S.C.", O],
    ["Persona física con actividad empresarial", S],
  ],
  ZA: [
    ["(Pty) Ltd", L],
    ["CC", L],
    ["Ltd", J],
    ["Inc.", O],
    ["Partnership", O],
    ["Sole proprietor", S],
  ],
};

/** Ülke kodu → yerel hukuki yapılar (seçicideki sırayla). */
export const LEGAL_FORMS_BY_COUNTRY: Readonly<Record<string, readonly LocalLegalForm[]>> =
  Object.fromEntries(
    Object.entries(TABLE).map(([code, rows]) => [code, rows.map(([name, type]) => ({ name, type }))]),
  );

const NONE: readonly LocalLegalForm[] = [];

const fold = (value: string | null | undefined): string => (value ?? "").normalize("NFC").trim();

/**
 * Ülkenin yerel hukuki yapıları. Listesi olmayan ülke, Türkiye, KKTC ve
 * bilinmeyen / boş kod BOŞ liste döner (çağıran genel listeyi gösterir).
 */
export function localLegalForms(country: string | null | undefined): readonly LocalLegalForm[] {
  if (!country) return NONE;
  return LEGAL_FORMS_BY_COUNTRY[country.toUpperCase()] ?? NONE;
}

/**
 * Ad o ülkenin listesinde mi (baştaki / sondaki boşluk ve Unicode bileşimi
 * dışında AYNEN)? Başka ülkenin listesindeki ad eşleşmez — ülke değişince
 * eski seçimin geçerli sayılmaması bu fonksiyona dayanır.
 */
export function findLocalLegalForm(
  country: string | null | undefined,
  name: string | null | undefined,
): LocalLegalForm | null {
  const wanted = fold(name);
  if (!wanted) return null;
  return localLegalForms(country).find((form) => form.name === wanted) ?? null;
}

/**
 * SAKLANACAK HUKUKİ YAPI — eşlemenin sahibi API'dir (2026-10-08). Yerel ad
 * ülkenin listesindeyse tür LİSTEDEN gelir (istemcinin gönderdiği tür ne olursa
 * olsun) ve ad listedeki yazımıyla döner; listede olmayan ad (serbest metin,
 * listesiz ülke, boş) istemcinin türünü korur, ad kırpılır (boş → null).
 *
 * Gerekçe: tek İŞLEVSEL tür `SOLE_PROPRIETOR`dur (vergi numarasını gizler).
 * Tür yalnız istemcide eşlenseydi eski bir web paketi ya da doğrudan API
 * çağrısı "ИП"yi OTHER olarak kaydedip kişisel numarayı açıkta bırakabilirdi.
 */
export function resolveLegalForm<T extends string | null>(
  country: string | null | undefined,
  type: T,
  name: string | null | undefined,
): { type: T | LegalFormType; name: string | null } {
  const known = findLocalLegalForm(country, name);
  if (known) return { type: known.type, name: known.name };
  return { type, name: (name ?? "").trim() || null };
}

import { i18nMessage } from "../../../common/i18n/http-i18n";
import { tApi } from "../../../common/i18n/i18n.service";
import { BadRequestException, Injectable } from "@nestjs/common";
import {
  BID_DELIVERY_TIMES,
  BID_DELIVERY_TIME_LABELS,
  BID_IMPORT_COLUMNS,
  BID_IMPORT_HELP_SHEET,
  BID_IMPORT_MAX_CSV_BYTES,
  BID_IMPORT_MAX_FILE_BYTES,
  BID_IMPORT_SHEET,
  matchBidImportColumn,
  type BidDeliveryTime,
  type BidImportColumnKey,
  type BidImportMatch,
  type BidImportResult,
} from "@rothern/shared";
import ExcelJS from "exceljs";
import { Readable } from "stream";
import type { AuthenticatedCompanyUser } from "../../company-auth/strategies/company-jwt.strategy";
import { CompanyListingsService } from "../services/company-listings.service";
import {
  matchDocRows,
  normalizeCurrency,
  normalizeDeliveryTime,
  validUnitPrice,
  type DocRow,
  type MatchItem,
} from "./bid-matching";
import { assertXlsxSafe, cellText, parseLocaleNumber } from "./listing-item-import.service";

/**
 * Teklif fiyatı içe aktarma (Faz 2, 2026-08-22).
 *
 *  - buildTemplate: ihaleye ÖZEL xlsx (kalemler ön-dolu + gizli ItemId; yalnız
 *    fiyat/para birimi/teslim/not hücreleri açık). AI yok, her pakete açık.
 *  - parseTemplate: doldurulmuş şablon → ItemId ile KESİN eşleme → önizleme.
 *  - fromDocRows: AI'ın okuduğu belge satırları → eşleştirme motoru → önizleme
 *    (AI servisi çağırır; bu servis model bilmez).
 * Kalemler + yetki `CompanyListingsService.getOne` üzerinden (görünürlük,
 * blok, ücretsiz-üye gizliliği aynen uygulanır (hidden → getOne 403, buraya hiç gelmez)
 * HİÇBİR ŞEY YAZILMAZ — teklif gönderme placeBid'den (ikinci doğrulama orada).
 */

const INK = "18181B";
const LOCKED_FILL = "F4F4F5";
const EDIT_FILL = "FFFFFF";

interface ListingForImport {
  id: string;
  title: string;
  type: string;
  primaryCurrency: string | null;
  allowedCurrencies: string[];
  items: MatchItem[];
}

@Injectable()
export class BidImportService {
  constructor(private readonly listings: CompanyListingsService) {}

  async loadListing(user: AuthenticatedCompanyUser, listingId: string): Promise<ListingForImport> {
    const d = (await this.listings.getOne(user, listingId)) as unknown as {
      id: string;
      title: string;
      type: string;
      isOwner?: boolean;
      primaryCurrency?: string | null;
      allowedCurrencies?: string[] | null;
      items?: {
        id: string;
        lineNo: number;
        name: string;
        quantity: string;
        unit: string;
        materialCode?: string | null;
      }[];
    };
    if (d.isOwner) {
      throw new BadRequestException(i18nMessage("api.companyListings.kendiSatinAlmaTalebinizeTeklifVeremezsiniz"));
    }
    const items: MatchItem[] = (d.items ?? []).map((it) => ({
      id: it.id,
      lineNo: it.lineNo,
      name: it.name,
      quantity: it.quantity,
      unit: it.unit,
      materialCode: it.materialCode ?? null,
    }));
    if (items.length === 0) {
      throw new BadRequestException(
        i18nMessage("api.companyListings.buSatinAlmaTalebindeKalemListesi"),
      );
    }
    const primary = d.primaryCurrency ?? null;
    const allowed = (d.allowedCurrencies ?? []).filter(Boolean);
    return {
      id: d.id,
      title: d.title,
      type: d.type,
      primaryCurrency: primary,
      allowedCurrencies: allowed.length > 0 ? allowed : primary ? [primary] : [],
      items,
    };
  }

  // ------------------------------------------------------------ ŞABLON
  async buildTemplate(user: AuthenticatedCompanyUser, listingId: string): Promise<{ buffer: Buffer; fileName: string }> {
    const l = await this.loadListing(user, listingId);
    const cols = BID_IMPORT_COLUMNS;
    const wb = new ExcelJS.Workbook();
    wb.creator = "Rothern";
    const ws = wb.addWorksheet(BID_IMPORT_SHEET, { views: [{ state: "frozen", ySplit: 1, xSplit: 2 }] });
    ws.columns = cols.map((c) => ({ key: c.key, width: c.width, hidden: c.hidden ?? false }));

    const header = ws.addRow(cols.map((c) => c.header));
    header.height = 22;
    header.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${INK}` } };
      cell.protection = { locked: true };
    });

    const deliveryList = BID_DELIVERY_TIMES.map((c) => BID_DELIVERY_TIME_LABELS[c as BidDeliveryTime]);
    const currencyList = l.allowedCurrencies;

    for (const it of l.items) {
      const row = ws.addRow({
        lineNo: it.lineNo,
        name: it.name,
        quantity: Number(it.quantity),
        unit: it.unit,
        materialCode: it.materialCode ?? "",
        itemId: it.id,
        unitPrice: null,
        currency: l.primaryCurrency ?? "",
        deliveryTime: "",
        note: "",
      });
      cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        cell.protection = { locked: !c.editable };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: `FF${c.editable ? EDIT_FILL : LOCKED_FILL}` },
        };
        if (!c.editable) cell.font = { color: { argb: "FF52525B" } };
        if (c.key === "unitPrice") cell.numFmt = "#,##0.00";
        if (c.key === "quantity") cell.numFmt = "#,##0.###";
        if (c.key === "currency" && currencyList.length > 0) {
          cell.dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [`"${currencyList.join(",")}"`],
            showErrorMessage: true,
            errorTitle: tApi("api.companyListings.bidImport.template.currencyTitle"),
            error: tApi("api.companyListings.bidImport.template.currencyError", {
              list: currencyList.join(", "),
            }),
          };
        }
        if (c.key === "deliveryTime") {
          cell.dataValidation = {
            type: "list",
            allowBlank: true,
            formulae: [`"${deliveryList.join(",")}"`],
            showErrorMessage: true,
            errorTitle: tApi("api.companyListings.bidImport.template.deliveryTitle"),
            error: tApi("api.companyListings.bidImport.template.deliveryError"),
          };
        }
      });
    }
    // Gizli ItemId sütunu — satır eklendikten SONRA açıkça işaretle (exceljs
    // columns[].hidden yalnız tanım anında güvenilir değil).
    const itemIdCol = cols.findIndex((c) => c.key === "itemId") + 1;
    ws.getColumn(itemIdCol).hidden = true;
    await ws.protect("", {
      selectLockedCells: true,
      selectUnlockedCells: true,
      formatColumns: true,
      formatRows: true,
      sort: false,
      autoFilter: false,
    });

    const help = wb.addWorksheet(BID_IMPORT_HELP_SHEET);
    help.columns = [{ width: 110 }];
    const lines = [
      tApi("api.companyListings.bidImport.template.helpTitle", { title: l.title }),
      "",
      tApi("api.companyListings.bidImport.template.helpSheet", { sheet: BID_IMPORT_SHEET }),
      tApi("api.companyListings.bidImport.template.helpFill"),
      tApi("api.companyListings.bidImport.template.helpSkip"),
      tApi("api.companyListings.bidImport.template.helpDecimal"),
      tApi("api.companyListings.bidImport.template.helpUpload"),
    ];
    lines.forEach((t, i) => {
      const r = help.addRow([t]);
      r.getCell(1).alignment = { wrapText: true };
      if (i === 0) r.getCell(1).font = { bold: true, size: 13 };
    });

    const out = await wb.xlsx.writeBuffer();
    const safe =
      l.title.replace(/[^a-zA-Z0-9ğüşöçıİĞÜŞÖÇ _-]/g, "").slice(0, 40).trim() ||
      tApi("api.companyListings.bidImport.template.fileNameFallback");
    const prefix = tApi("api.companyListings.bidImport.template.fileNamePrefix");
    return { buffer: Buffer.from(out as ArrayBuffer), fileName: `${prefix}-${safe}.xlsx` };
  }

  // ------------------------------------------------------------ ŞABLON OKU
  async parseTemplate(
    user: AuthenticatedCompanyUser,
    listingId: string,
    input: { fileName: string; mimeType: string; dataBase64: string },
  ): Promise<BidImportResult> {
    const l = await this.loadListing(user, listingId);
    const buffer = Buffer.from(input.dataBase64.replace(/^data:[^;]+;base64,/, ""), "base64");
    if (buffer.length === 0) throw new BadRequestException(i18nMessage("api.companyListings.dosyaBos"));
    if (buffer.length > BID_IMPORT_MAX_FILE_BYTES) throw new BadRequestException(i18nMessage("api.companyListings.dosyaCokBuyuk5MbSiniri"));

    const wb = new ExcelJS.Workbook();
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b;
    if (isZip) {
      if (/\.xlsm$/i.test(input.fileName)) throw new BadRequestException(i18nMessage("api.companyListings.makroluDosyaXlsmKabulEdilmez"));
      assertXlsxSafe(buffer); // zip bombası koruması (denetim 2026-08-23)
      try {
        await wb.xlsx.load(buffer as unknown as ArrayBuffer);
      } catch {
        throw new BadRequestException(i18nMessage("api.companyListings.excelDosyasiOkunamadiXlsxOlarakKaydedip"));
      }
    } else if (/\.csv$/i.test(input.fileName) && !buffer.subarray(0, 4096).includes(0)) {
      // Bkz. listing-item-import: CSV parse belleği hücre sayısıyla patlar.
      if (buffer.length > BID_IMPORT_MAX_CSV_BYTES) {
        throw new BadRequestException(
          i18nMessage("api.companyListings.csvDosyasiCokBuyukSablonuXlsx"),
        );
      }
      await wb.csv.read(Readable.from(buffer)).catch(() => {
        throw new BadRequestException(i18nMessage("api.companyListings.csvDosyasiOkunamadi"));
      });
    } else {
      throw new BadRequestException(i18nMessage("api.companyListings.desteklenmeyenDosyaBuSatinAlmaTalebinin"));
    }
    const ws = wb.getWorksheet(BID_IMPORT_SHEET) ?? wb.worksheets[0];
    if (!ws) throw new BadRequestException(i18nMessage("api.companyListings.dosyadaSayfaBulunamadi"));

    // Başlık satırı + sütun haritası (ItemId ZORUNLU — kesin eşleme bununla).
    let headerRow = 0;
    let map = new Map<number, BidImportColumnKey>();
    for (let r = 1; r <= Math.min(ws.rowCount, 10); r++) {
      const m = new Map<number, BidImportColumnKey>();
      ws.getRow(r).eachCell({ includeEmpty: false }, (cell, col) => {
        const k = matchBidImportColumn(cellText(cell.value));
        if (k && ![...m.values()].includes(k)) m.set(col, k);
      });
      if (m.size > map.size) {
        map = m;
        headerRow = r;
      }
    }
    const keys = new Set(map.values());
    if (!keys.has("itemId") || !keys.has("unitPrice")) {
      throw new BadRequestException(
        i18nMessage("api.companyListings.buDosyaBuSatinAlmaTalebinin"),
      );
    }
    const colOf = (k: BidImportColumnKey) => [...map.entries()].find(([, v]) => v === k)?.[0];

    const byId = new Map(l.items.map((it) => [it.id, it] as const));
    const seen = new Map<string, BidImportMatch>();
    const notices: string[] = [];
    let unknownRows = 0;

    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const get = (k: BidImportColumnKey) => {
        const c = colOf(k);
        return c ? cellText(row.getCell(c).value) : null;
      };
      const itemId = String(get("itemId") ?? "").trim();
      const priceRaw = get("unitPrice");
      // Doldurulmuş sayılma: fiyat / teslim / not. Para birimi şablonda ÖN-DOLU
      // geldiği için tek başına "doldurulmuş" sayılmaz (yoksa her kalem exact
      // ama fiyatsız görünürdü).
      const anyFill = [priceRaw, get("deliveryTime"), get("note")].some(
        (v) => v != null && String(v).trim() !== "",
      );
      if (!anyFill) continue;
      const it = itemId ? byId.get(itemId) : undefined;
      if (!it) {
        unknownRows++;
        continue;
      }
      const m: BidImportMatch = {
        itemId: it.id,
        lineNo: it.lineNo,
        itemName: it.name,
        itemQuantity: it.quantity,
        itemUnit: it.unit,
        source: tApi("api.companyListings.bidImport.sablonSatir", { n: r }),
        unitPrice: null,
        currency: null,
        deliveryTime: null,
        note: null,
        confidence: "exact",
        errors: [],
        warnings: [],
      };
      // Fiyat: boş = kapsam dışı (hata değil).
      if (priceRaw != null && String(priceRaw).trim() !== "") {
        const n = parseLocaleNumber(priceRaw);
        if (n == null) m.errors.push(tApi("api.companyListings.bidImport.birimFiyatSayiDegil"));
        else {
          const v = validUnitPrice(n);
          if (v.error) m.errors.push(v.error);
          m.unitPrice = v.value;
        }
      }
      const curRaw = get("currency");
      const cur = normalizeCurrency(curRaw);
      if (curRaw != null && String(curRaw).trim() !== "" && !cur)
        m.errors.push(tApi("api.companyListings.bidImport.paraBirimiTaninmadi", { value: String(curRaw) }));
      if (cur) {
        if (l.allowedCurrencies.length > 0 && !l.allowedCurrencies.includes(cur)) {
          m.errors.push(
            tApi("api.companyListings.bidImport.paraBirimiKabulEdilmiyor", {
              currency: cur,
              allowed: l.allowedCurrencies.join(", "),
            }),
          );
        } else {
          m.currency = cur === l.primaryCurrency ? null : cur;
        }
      }
      const delRaw = get("deliveryTime");
      if (delRaw != null && String(delRaw).trim() !== "") {
        const d = normalizeDeliveryTime(delRaw);
        if (!d) m.errors.push(tApi("api.companyListings.bidImport.teslimSuresiTaninmadi", { value: String(delRaw) }));
        m.deliveryTime = d;
      }
      const note = get("note");
      m.note = note != null && String(note).trim() !== "" ? String(note).trim().slice(0, 500) : null;
      if (seen.has(it.id)) m.warnings.push(tApi("api.companyListings.bidImport.ayniKalemBirdenCokSatir"));
      seen.set(it.id, m);
    }
    if (unknownRows > 0)
      notices.push(tApi("api.companyListings.bidImport.baglanamayanSatir", { n: unknownRows }));

    // Her kalem için bir satır (şablonda olmayan/boş kalem → none).
    const matches: BidImportMatch[] = l.items.map(
      (it) =>
        seen.get(it.id) ?? {
          itemId: it.id,
          lineNo: it.lineNo,
          itemName: it.name,
          itemQuantity: it.quantity,
          itemUnit: it.unit,
          source: null,
          unitPrice: null,
          currency: null,
          deliveryTime: null,
          note: null,
          confidence: "none",
          errors: [],
          warnings: [],
        },
    );
    const priced = matches.filter((m) => m.unitPrice != null && m.errors.length === 0).length;
    if (priced === 0) notices.push(tApi("api.companyListings.bidImport.fiyatGirilmisKalemYok"));
    return {
      mode: "template",
      listingId: l.id,
      matches,
      unmatchedDocRows: [],
      notices,
      pricesIncludeVat: null,
      docCurrency: null,
      matchedCount: priced,
    };
  }

  // ------------------------------------------------------------ AI SATIRLARI → ÖNİZLEME
  async fromDocRows(
    l: ListingForImport,
    rows: DocRow[],
    docMeta: { pricesIncludeVat: boolean | null; docCurrency: string | null },
  ): Promise<BidImportResult> {
    const { matches, unmatched } = matchDocRows(l.items, rows, {
      allowedCurrencies: l.allowedCurrencies,
      primaryCurrency: l.primaryCurrency,
    });
    const notices: string[] = [];
    if (docMeta.pricesIncludeVat === true) {
      notices.push(tApi("api.companyListings.bidImport.kdvDahilUyari"));
    }
    const docCur = normalizeCurrency(docMeta.docCurrency);
    if (docCur && l.allowedCurrencies.length > 0 && !l.allowedCurrencies.includes(docCur)) {
      notices.push(
        tApi("api.companyListings.bidImport.belgeParaBirimiKabulEdilmiyor", {
          currency: docCur,
          allowed: l.allowedCurrencies.join(", "),
        }),
      );
    }
    const matchedCount = matches.filter((m) => m.unitPrice != null).length;
    if (matchedCount === 0) notices.push(tApi("api.companyListings.bidImport.fiyatEslenemedi"));
    const medium = matches.filter((m) => m.confidence === "medium").length;
    if (medium > 0) notices.push(tApi("api.companyListings.bidImport.dusukGuven", { n: medium }));
    return {
      mode: "ai",
      listingId: l.id,
      matches,
      unmatchedDocRows: unmatched,
      notices,
      pricesIncludeVat: docMeta.pricesIncludeVat,
      docCurrency: docCur,
      matchedCount,
    };
  }
}

import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { OrderStatus } from "@supkeys/db";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PdfService } from "../pdf/pdf.service";
import {
  generateOrderHtml,
  type OrderPdfData,
} from "../pdf/templates/order-pdf.template";

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Onay Bekliyor",
  ACCEPTED: "Onaylandı",
  IN_DELIVERY: "Gönderildi",
  COMPLETED: "Tamamlandı",
  REJECTED: "Reddedildi",
  CANCELLED: "İptal Edildi",
  IN_PROGRESS: "Üretimde",
  DELIVERED: "Teslim Edildi",
};

interface AddressSnapshot {
  title?: string | null;
  fullAddress?: string | null;
  city?: string | null;
  district?: string | null;
  country?: string | null;
  postalCode?: string | null;
  taxOffice?: string | null;
  taxNumber?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
}

@Injectable()
export class OrderPdfService {
  private readonly logger = new Logger(OrderPdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdfService: PdfService,
  ) {}

  async generateOrderPdf(
    orderId: string,
    scope: { tenantId?: string; supplierId?: string },
  ): Promise<{ buffer: Buffer; filename: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        tenant: {
          select: {
            id: true,
            name: true,
            taxNumber: true,
            taxOffice: true,
            city: true,
            district: true,
            addressLine: true,
            postalCode: true,
          },
        },
        supplier: {
          select: {
            id: true,
            companyName: true,
            taxNumber: true,
            taxOffice: true,
            city: true,
            district: true,
            addressLine: true,
            postalCode: true,
            users: {
              where: { isActive: true },
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { email: true, phone: true },
            },
          },
        },
        tender: {
          select: {
            id: true,
            tenderNumber: true,
            title: true,
            primaryCurrency: true,
            deliveryAddress: true,
            billingAddressSnapshot: true,
            deliveryAddressSnapshot: true,
          },
        },
        bid: {
          select: {
            notes: true,
            currency: true,
            items: {
              where: { isWinner: true },
              include: {
                tenderItem: {
                  select: {
                    name: true,
                    description: true,
                    quantity: true,
                    unit: true,
                  },
                },
              },
              orderBy: { tenderItem: { orderIndex: "asc" } },
            },
          },
        },
      },
    });

    if (!order) throw new NotFoundException("Sipariş bulunamadı");
    if (scope.tenantId && order.tenantId !== scope.tenantId) {
      throw new ForbiddenException("Bu siparişe erişim yetkiniz yok");
    }
    if (scope.supplierId && order.supplierId !== scope.supplierId) {
      throw new ForbiddenException("Bu siparişe erişim yetkiniz yok");
    }

    const billingSnap = (order.tender.billingAddressSnapshot ??
      null) as AddressSnapshot | null;
    const deliverySnap = (order.tender.deliveryAddressSnapshot ??
      null) as AddressSnapshot | null;

    const buyerAddress = billingSnap
      ? this.formatAddressFromSnapshot(billingSnap)
      : this.formatTenantAddress(order.tenant);

    const deliveryAddress = deliverySnap
      ? this.formatAddressFromSnapshot(deliverySnap)
      : (order.tender.deliveryAddress ?? "—");

    const supplierUser = order.supplier.users[0];
    const supplierAddress = this.formatSupplierAddress(order.supplier);

    // Kalemler — winning bid items
    const items = order.bid.items.map((bi) => {
      const qty = bi.awardedQuantity
        ? Number(bi.awardedQuantity)
        : Number(bi.tenderItem.quantity);
      const unitPrice = bi.unitPrice ? Number(bi.unitPrice) : 0;
      const totalPrice = bi.totalPrice ? Number(bi.totalPrice) : qty * unitPrice;
      return {
        name: bi.tenderItem.name,
        description: bi.tenderItem.description,
        quantity: qty,
        unit: bi.tenderItem.unit,
        unitPrice,
        totalPrice,
      };
    });

    const subtotal = items.reduce((s, i) => s + i.totalPrice, 0);
    const vatRate = 20; // V1.5 sabit
    const vatAmount = +(subtotal * (vatRate / 100)).toFixed(2);
    const total = +(subtotal + vatAmount).toFixed(2);

    const data: OrderPdfData = {
      orderNumber: order.orderNumber,
      orderDate: order.createdAt,
      tenderNumber: order.tender.tenderNumber,
      tenderTitle: order.tender.title,

      buyerCompanyName: order.tenant.name,
      buyerTaxOffice: billingSnap?.taxOffice ?? order.tenant.taxOffice ?? null,
      buyerTaxNumber: billingSnap?.taxNumber ?? order.tenant.taxNumber ?? null,
      buyerAddress,
      buyerEmail: billingSnap?.contactEmail ?? null,
      buyerPhone: billingSnap?.contactPhone ?? null,

      supplierCompanyName: order.supplier.companyName,
      supplierTaxOffice: order.supplier.taxOffice ?? null,
      supplierTaxNumber: order.supplier.taxNumber,
      supplierAddress,
      supplierEmail: supplierUser?.email ?? null,
      supplierPhone: supplierUser?.phone ?? null,

      deliveryAddress,

      items,
      subtotal,
      vatRate,
      vatAmount,
      total,
      currency: order.currency,

      statusLabel: STATUS_LABEL[order.status] ?? order.status,

      bidNotes: order.bid.notes ?? null,
      deliveryNote: order.deliveryNote ?? null,
      invoiceNumber: order.invoiceNumber ?? null,
      expectedDeliveryDate: order.expectedDeliveryDate ?? null,
    };

    const html = generateOrderHtml(data);
    const buffer = await this.pdfService.generatePdfFromHtml(html);

    return {
      buffer,
      filename: `Siparis-${order.orderNumber}.pdf`,
    };
  }

  // -------- helpers --------

  private formatAddressFromSnapshot(snap: AddressSnapshot): string {
    const parts: string[] = [];
    if (snap.title) parts.push(snap.title);
    if (snap.fullAddress) parts.push(snap.fullAddress);
    const district = snap.district;
    const city = snap.city;
    if (district && city) parts.push(`${district} / ${city}`);
    else if (city) parts.push(city);
    if (snap.postalCode) parts.push(snap.postalCode);
    if (snap.country && snap.country !== "Türkiye") parts.push(snap.country);
    return parts.filter(Boolean).join("\n") || "—";
  }

  private formatTenantAddress(tenant: {
    addressLine: string | null;
    city: string | null;
    district: string | null;
    postalCode: string | null;
  }): string {
    const parts: string[] = [];
    if (tenant.addressLine) parts.push(tenant.addressLine);
    if (tenant.district && tenant.city)
      parts.push(`${tenant.district} / ${tenant.city}`);
    else if (tenant.city) parts.push(tenant.city);
    if (tenant.postalCode) parts.push(tenant.postalCode);
    return parts.join("\n") || "—";
  }

  private formatSupplierAddress(supplier: {
    addressLine: string;
    city: string;
    district: string;
    postalCode: string | null;
  }): string {
    const parts: string[] = [supplier.addressLine];
    if (supplier.district && supplier.city)
      parts.push(`${supplier.district} / ${supplier.city}`);
    if (supplier.postalCode) parts.push(supplier.postalCode);
    return parts.join("\n");
  }
}

import { CreateTenderDto } from "./create-tender.dto";

/**
 * V1: DRAFT update tüm payload'ı yeniden gönderiyor (full replace).
 * Items + invitations + attachments deleteMany + create ile yeniden yazılır.
 * V2'de delta-based partial update düşünülebilir.
 */
export class UpdateTenderDto extends CreateTenderDto {}

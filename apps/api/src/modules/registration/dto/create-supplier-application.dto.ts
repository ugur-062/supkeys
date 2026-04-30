// Tedarikçi başvurusu için aynı alanlar — buyer ile aynı şema, sade re-export.
import { CreateBuyerApplicationDto } from "./create-buyer-application.dto";

export class CreateSupplierApplicationDto extends CreateBuyerApplicationDto {}

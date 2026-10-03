import { SetMetadata } from "@nestjs/common";

export const ADMIN_ALLOW_WITHOUT_2FA_KEY = "admin_allow_without_2fa";

/**
 * 2FA zorunlu roldeki (ADMIN_2FA_REQUIRED_ROLES) ama 2FA'yi henuz acmamis
 * admin'in de erisebildigi uc. AdminRolesGuard bu isaret YOKSA boyle bir
 * admin'i 403 `ADMIN_2FA_SETUP_REQUIRED` ile reddeder. Yalniz kurulum akisinin
 * kendisi (me + 2fa/setup + 2fa/enable) isaretlenir — baska uca EKLEME.
 */
export const AllowWithoutAdmin2fa = () =>
  SetMetadata(ADMIN_ALLOW_WITHOUT_2FA_KEY, true);

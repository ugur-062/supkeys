/**
 * DRIFT NÖBETÇİSİ — admin buton-kapısı matrisi ↔ backend @RequireAdminRole.
 *
 * apps/admin `src/lib/admin-permissions.ts` (canAdminDo) buton görünürlüğünü bir
 * rol matrisiyle kapılar. apps/admin bilinçle @rothern/shared'a bağlı OLMADIĞINDAN
 * matris o pakette YAŞAYAMAZ; bu yüzden BEKLENEN kopyası burada tutulur (çapraz-ref).
 * Bu test her aksiyonun backend controller handler'ının GERÇEK @RequireAdminRole
 * metadata'sını okuyup beklenenle karşılaştırır → backend decorator değişince KIRILIR.
 * Kırılınca: HEM burayı HEM `apps/admin/src/lib/admin-permissions.ts`'i güncelle.
 */
import "reflect-metadata";
import { ADMIN_ROLES_KEY } from "../../src/modules/admin-auth/decorators/require-admin-role.decorator";
import { ADMIN_ANY_ROLE_KEY } from "../../src/modules/admin-auth/decorators/allow-any-admin-role.decorator";
import { AdminCompaniesController } from "../../src/modules/admin-companies/admin-companies.controller";
import { AdminCompanyUsersController } from "../../src/modules/admin-companies/admin-company-users.controller";
import { AdminStaffController } from "../../src/modules/admin-auth/admin-staff.controller";

const SUPER = ["SUPER_ADMIN"];
const KYC = ["SUPER_ADMIN", "SALES"];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Ctor = { prototype: any };
const rolesOf = (c: Ctor, m: string): string[] | undefined =>
  Reflect.getMetadata(ADMIN_ROLES_KEY, c.prototype[m]);
const anyOf = (c: Ctor, m: string): boolean | undefined =>
  Reflect.getMetadata(ADMIN_ANY_ROLE_KEY, c.prototype[m]);

type Spec =
  | { kind: "method"; ctrl: Ctor; method: string; roles: string[] }
  | { kind: "any"; ctrl: Ctor; method: string }
  | { kind: "class"; ctrl: Ctor; roles: string[] };

// apps/admin ADMIN_ACTION_ROLES ile birebir (çapraz-ref; senkron tut).
const EXPECTED: Record<string, Spec> = {
  setTier: { kind: "method", ctrl: AdminCompaniesController, method: "setTier", roles: SUPER },
  suspend: { kind: "method", ctrl: AdminCompaniesController, method: "suspend", roles: SUPER },
  unsuspend: { kind: "method", ctrl: AdminCompaniesController, method: "unsuspend", roles: SUPER },
  deleteNote: { kind: "method", ctrl: AdminCompaniesController, method: "deleteNote", roles: SUPER },
  deleteCompany: { kind: "method", ctrl: AdminCompaniesController, method: "deleteCompany", roles: SUPER },
  announce: { kind: "method", ctrl: AdminCompaniesController, method: "announce", roles: SUPER },
  editProfile: { kind: "method", ctrl: AdminCompaniesController, method: "updateProfile", roles: KYC },
  verify: { kind: "method", ctrl: AdminCompaniesController, method: "verify", roles: KYC },
  reject: { kind: "method", ctrl: AdminCompaniesController, method: "reject", roles: KYC },
  reviewDocs: { kind: "method", ctrl: AdminCompaniesController, method: "review", roles: KYC },
  extendMembership: { kind: "method", ctrl: AdminCompaniesController, method: "extendMembership", roles: KYC },
  addNote: { kind: "method", ctrl: AdminCompaniesController, method: "addNote", roles: KYC },
  notify: { kind: "method", ctrl: AdminCompaniesController, method: "notify", roles: KYC },
  resolveComplaint: { kind: "method", ctrl: AdminCompaniesController, method: "resolve", roles: KYC },
  manageCompanyUser: { kind: "method", ctrl: AdminCompanyUsersController, method: "addUser", roles: KYC },
  recoverAccount: { kind: "any", ctrl: AdminCompanyUsersController, method: "sendPasswordReset" },
  manageStaff: { kind: "class", ctrl: AdminStaffController, roles: SUPER },
};

describe("admin-action-roles DRIFT NÖBETÇİSİ (matris ↔ backend @RequireAdminRole)", () => {
  for (const [action, spec] of Object.entries(EXPECTED)) {
    it(`${action}: backend decorator beklenen rollerle eşleşir`, () => {
      if (spec.kind === "any") {
        // @AllowAnyAdminRole (recoverAccount = tüm roller)
        expect(anyOf(spec.ctrl, spec.method)).toBe(true);
      } else if (spec.kind === "class") {
        // Sınıf-seviyesi @RequireAdminRole (AdminStaffController tamamı SUPER_ADMIN)
        expect(
          (
            (Reflect.getMetadata(ADMIN_ROLES_KEY, spec.ctrl) as
              | string[]
              | undefined) ?? []
          ).sort(),
        ).toEqual([...spec.roles].sort());
      } else {
        expect((rolesOf(spec.ctrl, spec.method) ?? []).sort()).toEqual(
          [...spec.roles].sort(),
        );
      }
    });
  }
});

import { z } from "zod";

export const TURKISH_PHONE_REGEX = /^[0-9]{10}$/;
export const TAX_NUMBER_REGEX = /^[0-9]{10,11}$/;
export const POSTAL_CODE_REGEX = /^[0-9]{5}$/;

export const COMPANY_TYPE_OPTIONS = [
  { value: "JOINT_STOCK", label: "Anonim Şirketi (A.Ş.)" },
  { value: "LIMITED", label: "Limited Şirketi (Ltd. Şti.)" },
  { value: "SOLE_PROPRIETOR", label: "Şahıs Şirketi" },
] as const;

export const INDUSTRY_OPTIONS = [
  "Üretim ve İmalat",
  "Hizmet",
  "Lojistik ve Taşımacılık",
  "İnşaat",
  "Perakende ve Toptan",
  "Bilgi Teknolojileri",
  "Sağlık",
  "Eğitim",
  "Finans",
  "Tarım",
  "Diğer",
] as const;

export const firmInfoSchema = z.object({
  companyName: z
    .string()
    .min(2, "Firma adı en az 2 karakter olmalı")
    .max(150, "Firma adı 150 karakteri aşamaz"),
  companyType: z.enum(["JOINT_STOCK", "LIMITED", "SOLE_PROPRIETOR"], {
    errorMap: () => ({ message: "Firma tipi seçiniz" }),
  }),
  taxNumber: z
    .string()
    .regex(TAX_NUMBER_REGEX, "Vergi numarası 10 veya 11 hane olmalı"),
  taxOffice: z
    .string()
    .min(2, "Vergi dairesi gerekli")
    .max(50, "Vergi dairesi 50 karakteri aşamaz"),
  taxCertUrl: z.string().min(1, "Vergi levhası yüklemelisiniz"),
  industry: z.string().optional().or(z.literal("")),
  website: z
    .string()
    .url("Geçerli bir URL giriniz (https://...)")
    .optional()
    .or(z.literal("")),
  city: z.string().min(2, "İl seçiniz"),
  district: z.string().min(2, "İlçe seçiniz"),
  addressLine: z
    .string()
    .min(5, "Adres en az 5 karakter")
    .max(500, "Adres 500 karakteri aşamaz"),
  postalCode: z
    .string()
    .regex(POSTAL_CODE_REGEX, "Posta kodu 5 hane")
    .optional()
    .or(z.literal("")),
});

const userInfoBase = z.object({
  adminFirstName: z.string().min(1, "Ad gerekli").max(100),
  adminLastName: z.string().min(1, "Soyad gerekli").max(100),
  adminEmail: z
    .string()
    .email("Geçerli bir e-posta giriniz")
    .max(200, "E-posta 200 karakteri aşamaz"),
  adminPhone: z
    .string()
    .regex(TURKISH_PHONE_REGEX, "10 haneli telefon numarası")
    .optional()
    .or(z.literal("")),
  password: z
    .string()
    .min(8, "Şifre en az 8 karakter")
    .max(72, "Şifre 72 karakteri aşamaz")
    .regex(/[A-Z]/, "En az 1 büyük harf gerekli")
    .regex(/[a-z]/, "En az 1 küçük harf gerekli")
    .regex(/[0-9]/, "En az 1 sayı gerekli"),
  passwordConfirm: z.string(),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "Şartları onaylamanız gerekli" }),
  }),
});

export const userInfoSchema = userInfoBase.refine(
  (data) => data.password === data.passwordConfirm,
  {
    message: "Şifreler eşleşmiyor",
    path: ["passwordConfirm"],
  },
);

export const fullRegistrationSchema = firmInfoSchema
  .merge(userInfoBase)
  .refine((data) => data.password === data.passwordConfirm, {
    message: "Şifreler eşleşmiyor",
    path: ["passwordConfirm"],
  });

export type FirmInfo = z.infer<typeof firmInfoSchema>;
export type UserInfo = z.infer<typeof userInfoSchema>;
export type FullRegistration = z.infer<typeof fullRegistrationSchema>;

export const FIRM_FIELDS = [
  "companyName",
  "companyType",
  "taxNumber",
  "taxOffice",
  "taxCertUrl",
  "industry",
  "website",
  "city",
  "district",
  "addressLine",
  "postalCode",
] as const satisfies readonly (keyof FullRegistration)[];

export const USER_FIELDS = [
  "adminFirstName",
  "adminLastName",
  "adminEmail",
  "adminPhone",
  "password",
  "passwordConfirm",
  "termsAccepted",
] as const satisfies readonly (keyof FullRegistration)[];

import { z } from "zod";

const reqEn = "English name is required";
const reqAr = "Arabic name is required";

export const statusEnum = z.enum(["active", "inactive"]);
export const discountTypeEnum = z.enum(["amount", "percentage"]);

export const clientSchema = z.object({
  englishName: z.string().min(1, reqEn),
  arabicName: z.string().min(1, reqAr),
  phone: z.string().min(1, "Phone is required"),
  secondPhone: z.string().optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().optional().or(z.literal("")),
  city: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  status: statusEnum,
});
export type ClientForm = z.infer<typeof clientSchema>;

export const categorySchema = z.object({
  englishName: z.string().min(1, reqEn),
  arabicName: z.string().min(1, reqAr),
  description: z.string().optional().or(z.literal("")),
  status: statusEnum,
});
export type CategoryForm = z.infer<typeof categorySchema>;

export const productSchema = z.object({
  sku: z.string().min(1, "SKU is required"),
  barcode: z.string().optional().or(z.literal("")),
  englishName: z.string().min(1, reqEn),
  arabicName: z.string().min(1, reqAr),
  categoryId: z.string().min(1, "Category is required"),
  brand: z.string().optional().or(z.literal("")),
  clothingType: z.string().optional().or(z.literal("")),
  color: z.string().optional().or(z.literal("")),
  size: z.string().optional().or(z.literal("")),
  unit: z.string().min(1, "Unit is required"),
  costPrice: z.coerce.number().min(0, "Must be 0 or more"),
  sellingPrice: z.coerce.number().min(0, "Must be 0 or more"),
  currentQty: z.coerce.number().min(0, "Must be 0 or more"),
  minimumQty: z.coerce.number().min(0, "Must be 0 or more"),
  imageBase64: z.string().optional().or(z.literal("")),
  status: statusEnum,
  notes: z.string().optional().or(z.literal("")),
});
export type ProductForm = z.infer<typeof productSchema>;

export const stockAdjustmentSchema = z.object({
  productId: z.string().min(1, "Product is required"),
  type: z.enum(["set", "increase", "decrease"]),
  quantity: z.coerce.number().min(0, "Must be 0 or more"),
  notes: z.string().optional().or(z.literal("")),
});
export type StockAdjustmentForm = z.infer<typeof stockAdjustmentSchema>;

export const invoiceLineSchema = z.object({
  productId: z.string().min(1),
  productSku: z.string(),
  productEnglishName: z.string(),
  productArabicName: z.string(),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  price: z.coerce.number().min(0, "Price must be 0 or more"),
  discountType: discountTypeEnum,
  discountValue: z.coerce.number().min(0, "Discount must be 0 or more"),
});

export const salesInvoiceSchema = z.object({
  invoiceDate: z.string().min(1, "Date is required"),
  clientId: z.string().min(1, "Client is required"),
  notes: z.string().optional().or(z.literal("")),
  lines: z.array(invoiceLineSchema).min(1, "Add at least one product"),
  invoiceDiscountType: discountTypeEnum,
  invoiceDiscountValue: z.coerce.number().min(0),
  paidAmount: z.coerce.number().min(0),
  vaultId: z.string().optional().or(z.literal("")),
  status: z.enum(["draft", "posted"]),
});
export type SalesInvoiceForm = z.infer<typeof salesInvoiceSchema>;

export const returnInvoiceSchema = z.object({
  invoiceDate: z.string().min(1, "Date is required"),
  clientId: z.string().min(1, "Client is required"),
  originalInvoiceId: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  lines: z.array(invoiceLineSchema).min(1, "Add at least one product"),
  invoiceDiscountType: discountTypeEnum,
  invoiceDiscountValue: z.coerce.number().min(0),
  status: z.enum(["draft", "posted"]),
});
export type ReturnInvoiceForm = z.infer<typeof returnInvoiceSchema>;

export const vaultSchema = z.object({
  englishName: z.string().min(1, reqEn),
  arabicName: z.string().min(1, reqAr),
  type: z.enum(["cash", "bank", "custom"]),
  openingBalance: z.coerce.number(),
  status: statusEnum,
  notes: z.string().optional().or(z.literal("")),
});
export type VaultForm = z.infer<typeof vaultSchema>;

export const expenseSchema = z.object({
  date: z.string().min(1, "Date is required"),
  vaultId: z.string().min(1, "Vault is required"),
  category: z.string().min(1, "Category is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  paidTo: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
  attachmentBase64: z.string().optional().or(z.literal("")),
});
export type ExpenseForm = z.infer<typeof expenseSchema>;

export const receiptSchema = z.object({
  date: z.string().min(1, "Date is required"),
  clientId: z.string().min(1, "Client is required"),
  vaultId: z.string().min(1, "Vault is required"),
  amount: z.coerce.number().positive("Amount must be greater than 0"),
  paymentMethod: z.enum(["cash", "bank", "other"]),
  notes: z.string().optional().or(z.literal("")),
});
export type ReceiptForm = z.infer<typeof receiptSchema>;

export const transferSchema = z
  .object({
    date: z.string().min(1, "Date is required"),
    fromVaultId: z.string().min(1, "Source vault is required"),
    toVaultId: z.string().min(1, "Destination vault is required"),
    amount: z.coerce.number().positive("Amount must be greater than 0"),
    notes: z.string().optional().or(z.literal("")),
  })
  .refine((d) => d.fromVaultId !== d.toVaultId, {
    message: "Source and destination must differ",
    path: ["toVaultId"],
  });
export type TransferForm = z.infer<typeof transferSchema>;

export const brandSchema = z.object({
  companyEnglishName: z.string().min(1, reqEn),
  companyArabicName: z.string().min(1, reqAr),
  logoBase64: z.string().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  addressEnglish: z.string().optional().or(z.literal("")),
  addressArabic: z.string().optional().or(z.literal("")),
  taxNumber: z.string().optional().or(z.literal("")),
  commercialRegistration: z.string().optional().or(z.literal("")),
  website: z.string().optional().or(z.literal("")),
  invoiceFooterEnglish: z.string().optional().or(z.literal("")),
  invoiceFooterArabic: z.string().optional().or(z.literal("")),
  currencyEnglish: z.string().optional().or(z.literal("")),
  currencyArabic: z.string().optional().or(z.literal("")),
});
export type BrandForm = z.infer<typeof brandSchema>;

export const userSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email is required"),
  role: z.string().min(1, "Role is required"),
  status: statusEnum,
  language: z.enum(["ar", "en"]),
  avatarBase64: z.string().optional().or(z.literal("")),
});
export type UserForm = z.infer<typeof userSchema>;

export const userCreateSchema = userSchema.extend({
  password: z.string().min(6, "Password must be at least 6 characters"),
});
export type UserCreateForm = z.infer<typeof userCreateSchema>;

export const roleSchema = z.object({
  englishName: z.string().min(1, reqEn),
  arabicName: z.string().min(1, reqAr),
  description: z.string().optional().or(z.literal("")),
});
export type RoleForm = z.infer<typeof roleSchema>;

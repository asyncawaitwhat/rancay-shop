import type { Timestamp } from "firebase/firestore";

/** A Firestore timestamp, an ISO string, or a JS Date — normalised by helpers. */
export type DateLike = Timestamp | string | Date | number | null | undefined;

export type Status = "active" | "inactive";

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------
export type PermissionLevel = "no_access" | "view_only" | "edit" | "full";

export type ScreenKey =
  | "dashboard"
  | "clients"
  | "products"
  | "categories"
  | "inventory"
  | "sales"
  | "returns"
  | "vaults"
  | "transactions"
  | "expenses"
  | "receipts"
  | "reports"
  | "brand"
  | "users"
  | "roles"
  | "audit";

export type PermissionMatrix = Record<ScreenKey, PermissionLevel>;

// ---------------------------------------------------------------------------
// Users & Roles
// ---------------------------------------------------------------------------
export interface Role {
  id: string;
  englishName: string;
  arabicName: string;
  description?: string;
  isSuperAdmin?: boolean;
  permissions: PermissionMatrix;
  createdAt?: DateLike;
  updatedAt?: DateLike;
}

export interface AppUser {
  id: string; // Firestore doc id (== firebaseUid)
  firebaseUid: string;
  name: string;
  email: string;
  role: string; // role id
  status: Status;
  language: "ar" | "en";
  avatarBase64?: string;
  createdAt?: DateLike;
  updatedAt?: DateLike;
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
export interface Client {
  id: string;
  clientCode: string;
  englishName: string;
  arabicName: string;
  phone: string;
  secondPhone?: string;
  email?: string;
  address?: string;
  city?: string;
  notes?: string;
  status: Status;
  // Running balances (kept up to date by transactions).
  totalSales: number;
  totalReturns: number;
  totalPaid: number;
  balance: number; // remaining owed by client = totalSales - totalReturns - totalPaid
  lastPurchaseAt?: DateLike;
  createdAt?: DateLike;
  updatedAt?: DateLike;
}

// ---------------------------------------------------------------------------
// Categories & Products
// ---------------------------------------------------------------------------
export interface Category {
  id: string;
  englishName: string;
  arabicName: string;
  description?: string;
  status: Status;
  createdAt?: DateLike;
  updatedAt?: DateLike;
}

export interface Product {
  id: string;
  sku: string;
  barcode?: string;
  englishName: string;
  arabicName: string;
  categoryId: string;
  categoryEnglishName?: string;
  categoryArabicName?: string;
  brand?: string;
  clothingType?: string;
  color?: string;
  size?: string;
  unit: string;
  costPrice: number;
  sellingPrice: number;
  currentQty: number;
  minimumQty: number;
  imageBase64?: string;
  status: Status;
  notes?: string;
  createdAt?: DateLike;
  updatedAt?: DateLike;
}

export type StockMovementType =
  | "sale"
  | "return"
  | "adjustment"
  | "opening"
  | "initial";

export interface StockMovement {
  id: string;
  productId: string;
  productSku: string;
  productEnglishName: string;
  productArabicName: string;
  type: StockMovementType;
  quantity: number; // signed: negative = out, positive = in
  qtyBefore: number;
  qtyAfter: number;
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  notes?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: DateLike;
}

// ---------------------------------------------------------------------------
// Invoices (sales & returns share a line shape)
// ---------------------------------------------------------------------------
export type DiscountType = "amount" | "percentage";

export interface InvoiceLine {
  productId: string;
  productSku: string;
  productEnglishName: string;
  productArabicName: string;
  quantity: number;
  price: number;
  discountType: DiscountType;
  discountValue: number;
  lineSubtotal: number; // quantity * price
  lineDiscount: number; // resolved discount amount
  lineTotal: number; // lineSubtotal - lineDiscount
}

export type InvoiceStatus = "draft" | "posted" | "cancelled";
export type PaymentStatus = "unpaid" | "partial" | "paid";

export interface SalesInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: DateLike;
  clientId: string;
  clientEnglishName: string;
  clientArabicName: string;
  status: InvoiceStatus;
  notes?: string;
  lines: InvoiceLine[];
  subtotal: number;
  itemDiscountTotal: number;
  invoiceDiscountType: DiscountType;
  invoiceDiscountValue: number;
  invoiceDiscountTotal: number;
  totalDiscount: number;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: PaymentStatus;
  createdBy?: string;
  createdByName?: string;
  createdAt?: DateLike;
  updatedAt?: DateLike;
}

export interface ReturnInvoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: DateLike;
  clientId: string;
  clientEnglishName: string;
  clientArabicName: string;
  status: InvoiceStatus;
  originalInvoiceId?: string;
  originalInvoiceNumber?: string;
  notes?: string;
  lines: InvoiceLine[];
  subtotal: number;
  itemDiscountTotal: number;
  invoiceDiscountType: DiscountType;
  invoiceDiscountValue: number;
  invoiceDiscountTotal: number;
  totalDiscount: number;
  grandTotal: number;
  createdBy?: string;
  createdByName?: string;
  createdAt?: DateLike;
  updatedAt?: DateLike;
}

// ---------------------------------------------------------------------------
// Finance
// ---------------------------------------------------------------------------
export interface Vault {
  id: string;
  englishName: string;
  arabicName: string;
  type: "cash" | "bank" | "custom";
  openingBalance: number;
  currentBalance: number;
  status: Status;
  notes?: string;
  createdAt?: DateLike;
  updatedAt?: DateLike;
}

export type FinanceTransactionType =
  | "income"
  | "expense"
  | "transfer_in"
  | "transfer_out"
  | "invoice_payment"
  | "return_refund"
  | "adjustment";

export interface FinanceTransaction {
  id: string;
  transactionNumber: string;
  date: DateLike;
  vaultId: string;
  vaultEnglishName: string;
  vaultArabicName: string;
  type: FinanceTransactionType;
  amount: number; // signed: positive = into vault, negative = out of vault
  referenceType?: string;
  referenceId?: string;
  referenceNumber?: string;
  notes?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: DateLike;
}

export interface ExpenseSlip {
  id: string;
  expenseNumber: string;
  date: DateLike;
  vaultId: string;
  vaultEnglishName: string;
  vaultArabicName: string;
  category: string;
  amount: number;
  paidTo?: string;
  notes?: string;
  attachmentBase64?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: DateLike;
}

export type PaymentMethod = "cash" | "bank" | "other";

export interface ReceiptSlip {
  id: string;
  receiptNumber: string;
  date: DateLike;
  clientId: string;
  clientEnglishName: string;
  clientArabicName: string;
  vaultId: string;
  vaultEnglishName: string;
  vaultArabicName: string;
  amount: number;
  paymentMethod: PaymentMethod;
  notes?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt?: DateLike;
}

// ---------------------------------------------------------------------------
// Brand settings & Audit logs
// ---------------------------------------------------------------------------
export interface BrandSettings {
  id: string;
  companyEnglishName: string;
  companyArabicName: string;
  logoBase64?: string;
  phone?: string;
  email?: string;
  addressEnglish?: string;
  addressArabic?: string;
  taxNumber?: string;
  commercialRegistration?: string;
  website?: string;
  invoiceFooterEnglish?: string;
  invoiceFooterArabic?: string;
  currencyEnglish?: string;
  currencyArabic?: string;
  updatedAt?: DateLike;
}

export interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  entityType: string;
  entityId?: string;
  description: string;
  beforeData?: string;
  afterData?: string;
  createdAt?: DateLike;
}

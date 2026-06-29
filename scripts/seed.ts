/**
 * Firebase seed script (uses the Firebase Admin SDK).
 *
 * Creates a fully coherent starter dataset so the dashboard shows real numbers
 * immediately: super-admin user, roles + permissions, brand settings, vaults,
 * clients, categories, products (with opening stock movements), and a set of
 * posted sales invoices / returns / receipts / expenses with matching stock
 * movements, finance transactions, client balances and vault balances.
 *
 * USAGE:
 *   1. Download a service account key from the Firebase console
 *      (Project Settings > Service Accounts > Generate new private key).
 *   2. In .env.local set:
 *        NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
 *        FIREBASE_SERVICE_ACCOUNT_PATH=C:/absolute/path/to/serviceAccount.json
 *   3. Run:  npm run seed
 *
 * Default admin login after seeding:
 *   email:    admin@store.com
 *   password: Admin@123456
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import * as admin from "firebase-admin";

// --- Load env from .env.local (simple parser, no extra deps) ---
function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    try {
      const content = readFileSync(resolve(process.cwd(), file), "utf8");
      for (const line of content.split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch {
      /* file may not exist */
    }
  }
}
loadEnv();

const SA_PATH = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!SA_PATH) {
  console.error("\n[seed] FIREBASE_SERVICE_ACCOUNT_PATH is not set in .env.local.");
  console.error("       Download a service account key and point this variable at it.\n");
  process.exit(1);
}

const serviceAccount = JSON.parse(readFileSync(resolve(SA_PATH), "utf8"));
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: PROJECT_ID || serviceAccount.project_id,
});

const db = admin.firestore();
const auth = admin.auth();
const now = admin.firestore.Timestamp.now();
const ts = (d: Date) => admin.firestore.Timestamp.fromDate(d);
const daysAgo = (n: number) => ts(new Date(Date.now() - n * 86400000));

// Permission matrix helpers
const SCREENS = [
  "dashboard", "clients", "products", "categories", "inventory", "sales", "returns",
  "vaults", "transactions", "expenses", "receipts", "reports", "brand", "users", "roles", "audit",
] as const;
type Level = "no_access" | "view_only" | "edit" | "full";
const matrix = (level: Level) => Object.fromEntries(SCREENS.map((s) => [s, level]));
const custom = (overrides: Partial<Record<(typeof SCREENS)[number], Level>>, base: Level = "no_access") =>
  ({ ...matrix(base), ...overrides });

async function run() {
  console.log("[seed] Starting...");

  // -------- 1. Roles --------
  const roles: Record<string, { id: string; data: Record<string, unknown> }> = {
    super: {
      id: "role_super_admin",
      data: { englishName: "Super Admin", arabicName: "مدير عام", description: "Full unrestricted access", isSuperAdmin: true, permissions: matrix("full"), createdAt: now, updatedAt: now },
    },
    admin: {
      id: "role_admin",
      data: { englishName: "Admin", arabicName: "مدير", description: "Administrative access", isSuperAdmin: false, permissions: matrix("full"), createdAt: now, updatedAt: now },
    },
    sales: {
      id: "role_sales",
      data: { englishName: "Sales", arabicName: "مبيعات", description: "Sales operations", isSuperAdmin: false, permissions: custom({ dashboard: "view_only", clients: "full", products: "view_only", sales: "full", returns: "full", receipts: "full", reports: "view_only" }), createdAt: now, updatedAt: now },
    },
    inventory: {
      id: "role_inventory",
      data: { englishName: "Inventory", arabicName: "مخزون", description: "Inventory management", isSuperAdmin: false, permissions: custom({ dashboard: "view_only", products: "full", categories: "full", inventory: "full", reports: "view_only" }), createdAt: now, updatedAt: now },
    },
    finance: {
      id: "role_finance",
      data: { englishName: "Finance", arabicName: "مالية", description: "Finance operations", isSuperAdmin: false, permissions: custom({ dashboard: "view_only", vaults: "full", transactions: "full", expenses: "full", receipts: "full", reports: "full" }), createdAt: now, updatedAt: now },
    },
    viewer: {
      id: "role_viewer",
      data: { englishName: "Viewer", arabicName: "مشاهد", description: "Read-only access", isSuperAdmin: false, permissions: custom({ dashboard: "view_only", clients: "view_only", products: "view_only", sales: "view_only", returns: "view_only", reports: "view_only" }), createdAt: now, updatedAt: now },
    },
  };
  for (const r of Object.values(roles)) await db.collection("roles").doc(r.id).set(r.data);
  console.log("[seed] Roles created.");


  
  // -------- 2. Super admin auth user + profile --------
  const email = "admin@store.com";
  const password = "Admin@123456";
  let uid: string;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    await auth.updateUser(uid, { password });
    console.log("[seed] Admin auth user already existed (password reset).");
  } catch {
    const created = await auth.createUser({ email, password, displayName: "Store Owner" });
    uid = created.uid;
    console.log("[seed] Admin auth user created.");
  }
  await db.collection("users").doc(uid).set({
    firebaseUid: uid, name: "Store Owner", email, role: roles.super.id,
    status: "active", language: "en", avatarBase64: "", createdAt: now, updatedAt: now,
  });

  // -------- 3. Brand settings --------
  await db.collection("brandSettings").doc("main").set({
    companyEnglishName: "Rancay Clothing Store", companyArabicName: "متجر رانساي للملابس",
    logoBase64: "", phone: "+20 100 000 0000", email: "info@rancay.shop",
    addressEnglish: "12 Fashion Street, Cairo", addressArabic: "١٢ شارع الموضة، القاهرة",
    taxNumber: "100-200-300", commercialRegistration: "CR-55555", website: "www.rancay.shop",
    invoiceFooterEnglish: "Thank you for shopping with us!", invoiceFooterArabic: "شكراً لتسوقكم معنا!",
    currencyEnglish: "QAR", currencyArabic: "ر.ق.", updatedAt: now,
  });

  // -------- 4. Vaults --------
  const vaults = [
    { id: "vault_cash", englishName: "Cash Vault", arabicName: "خزنة النقدية", type: "cash", openingBalance: 20000 },
    { id: "vault_bank", englishName: "Bank Account", arabicName: "حساب البنك", type: "bank", openingBalance: 50000 },
  ];
  const vaultBalance: Record<string, number> = {};
  for (const v of vaults) {
    vaultBalance[v.id] = v.openingBalance;
    await db.collection("vaults").doc(v.id).set({ ...v, currentBalance: v.openingBalance, status: "active", notes: "", createdAt: now, updatedAt: now });
  }

  // -------- 5. Categories --------
  const categories = [
    { id: "cat_men", englishName: "Men", arabicName: "رجالي" },
    { id: "cat_women", englishName: "Women", arabicName: "حريمي" },
    { id: "cat_kids", englishName: "Kids", arabicName: "أطفال" },
    { id: "cat_acc", englishName: "Accessories", arabicName: "إكسسوارات" },
  ];
  for (const c of categories) await db.collection("categories").doc(c.id).set({ ...c, description: "", status: "active", createdAt: now, updatedAt: now });

  // -------- 6. Products (with opening stock movements) --------
  const catName = (id: string) => categories.find((c) => c.id === id)!;
  const productsSeed = [
    { id: "prd_1", sku: "PRD-000001", en: "Cotton T-Shirt", ar: "تيشيرت قطن", cat: "cat_men", color: "White", size: "L", cost: 80, sell: 150, qty: 100, min: 15 },
    { id: "prd_2", sku: "PRD-000002", en: "Slim Jeans", ar: "بنطلون جينز", cat: "cat_men", color: "Blue", size: "32", cost: 200, sell: 380, qty: 60, min: 10 },
    { id: "prd_3", sku: "PRD-000003", en: "Summer Dress", ar: "فستان صيفي", cat: "cat_women", color: "Red", size: "M", cost: 250, sell: 480, qty: 40, min: 8 },
    { id: "prd_4", sku: "PRD-000004", en: "Kids Hoodie", ar: "هودي أطفال", cat: "cat_kids", color: "Green", size: "S", cost: 120, sell: 220, qty: 50, min: 10 },
    { id: "prd_5", sku: "PRD-000005", en: "Leather Belt", ar: "حزام جلد", cat: "cat_acc", color: "Brown", size: "—", cost: 90, sell: 170, qty: 8, min: 12 }, // intentionally low stock
    { id: "prd_6", sku: "PRD-000006", en: "Wool Scarf", ar: "وشاح صوف", cat: "cat_acc", color: "Grey", size: "—", cost: 60, sell: 130, qty: 70, min: 10 },
  ];
  const productQty: Record<string, number> = {};
  const productCost: Record<string, number> = {};
  for (const p of productsSeed) {
    productQty[p.id] = p.qty;
    productCost[p.id] = p.cost;
    const c = catName(p.cat);
    await db.collection("products").doc(p.id).set({
      sku: p.sku, barcode: "", englishName: p.en, arabicName: p.ar, categoryId: p.cat,
      categoryEnglishName: c.englishName, categoryArabicName: c.arabicName, brand: "Rancay",
      clothingType: "", color: p.color, size: p.size, unit: "piece", costPrice: p.cost,
      sellingPrice: p.sell, currentQty: p.qty, minimumQty: p.min, imageBase64: "", status: "active",
      notes: "", createdAt: now, updatedAt: now,
    });
    await db.collection("stockMovements").add({
      productId: p.id, productSku: p.sku, productEnglishName: p.en, productArabicName: p.ar,
      type: "opening", quantity: p.qty, qtyBefore: 0, qtyAfter: p.qty, notes: "Opening stock",
      createdBy: uid, createdByName: "Store Owner", createdAt: now,
    });
  }

  // -------- 7. Clients --------
  const clientsSeed = [
    { id: "CL-000001", code: "CL-000001", en: "Ahmed Hassan", ar: "أحمد حسن", phone: "+20 111 111 1111", city: "Cairo" },
    { id: "CL-000002", code: "CL-000002", en: "Sara Mohamed", ar: "سارة محمد", phone: "+20 122 222 2222", city: "Giza" },
    { id: "CL-000003", code: "CL-000003", en: "Omar Ali", ar: "عمر علي", phone: "+20 100 333 3333", city: "Alexandria" },
    { id: "CL-000004", code: "CL-000004", en: "Mona Fathy", ar: "منى فتحي", phone: "+20 155 444 4444", city: "Cairo" },
  ];
  const clientTotals: Record<string, { sales: number; returns: number; paid: number; last?: Date }> = {};
  for (const c of clientsSeed) {
    clientTotals[c.id] = { sales: 0, returns: 0, paid: 0 };
    await db.collection("clients").doc(c.id).set({
      clientCode: c.code, englishName: c.en, arabicName: c.ar, phone: c.phone, secondPhone: "",
      email: "", address: "", city: c.city, notes: "", status: "active",
      totalSales: 0, totalReturns: 0, totalPaid: 0, balance: 0, createdAt: now, updatedAt: now,
    });
  }

  // -------- Numbering counters --------
  const counters = { INV: 0, RET: 0, REC: 0, EXP: 0, TRX: 0 };
  const num = (k: keyof typeof counters, prefix: string) => `${prefix}-${String(++counters[k]).padStart(6, "0")}`;

  function lineOf(pid: string, qty: number, discount = 0) {
    const p = productsSeed.find((x) => x.id === pid)!;
    const lineSubtotal = qty * p.sell;
    const lineDiscount = discount;
    return {
      productId: p.id, productSku: p.sku, productEnglishName: p.en, productArabicName: p.ar,
      quantity: qty, price: p.sell, discountType: "amount", discountValue: discount,
      lineSubtotal, lineDiscount, lineTotal: lineSubtotal - lineDiscount,
    };
  }

  // -------- 8. Posted sales invoices --------
  const invoicePlans = [
    { client: "CL-000001", daysAgo: 10, lines: [lineOf("prd_1", 3), lineOf("prd_2", 1)], paid: 600, vault: "vault_cash" },
    { client: "CL-000002", daysAgo: 6, lines: [lineOf("prd_3", 2, 50)], paid: 910, vault: "vault_bank" },
    { client: "CL-000003", daysAgo: 3, lines: [lineOf("prd_4", 4), lineOf("prd_6", 2)], paid: 500, vault: "vault_cash" },
    { client: "CL-000001", daysAgo: 1, lines: [lineOf("prd_1", 5)], paid: 750, vault: "vault_cash" },
  ];
  for (const plan of invoicePlans) {
    const number = num("INV", "INV");
    const subtotal = plan.lines.reduce((s, l) => s + l.lineSubtotal, 0);
    const itemDiscountTotal = plan.lines.reduce((s, l) => s + l.lineDiscount, 0);
    const grandTotal = subtotal - itemDiscountTotal;
    const paid = Math.min(plan.paid, grandTotal);
    const date = ts(new Date(Date.now() - plan.daysAgo * 86400000));
    await db.collection("salesInvoices").doc(number).set({
      invoiceNumber: number, invoiceDate: date, clientId: plan.client,
      clientEnglishName: clientsSeed.find((c) => c.id === plan.client)!.en,
      clientArabicName: clientsSeed.find((c) => c.id === plan.client)!.ar,
      status: "posted", notes: "", lines: plan.lines, subtotal, itemDiscountTotal,
      invoiceDiscountType: "amount", invoiceDiscountValue: 0, invoiceDiscountTotal: 0,
      totalDiscount: itemDiscountTotal, grandTotal, paidAmount: paid, remainingAmount: grandTotal - paid,
      paymentStatus: paid >= grandTotal ? "paid" : paid > 0 ? "partial" : "unpaid",
      paymentVaultId: plan.vault, createdBy: uid, createdByName: "Store Owner", createdAt: date, updatedAt: date,
    });
    // stock movements + product qty
    for (const l of plan.lines) {
      const before = productQty[l.productId];
      const after = before - l.quantity;
      productQty[l.productId] = after;
      await db.collection("products").doc(l.productId).update({ currentQty: after, updatedAt: now });
      await db.collection("stockMovements").add({
        productId: l.productId, productSku: l.productSku, productEnglishName: l.productEnglishName,
        productArabicName: l.productArabicName, type: "sale", quantity: -l.quantity, qtyBefore: before,
        qtyAfter: after, referenceType: "salesInvoice", referenceId: number, referenceNumber: number,
        notes: "", createdBy: uid, createdByName: "Store Owner", createdAt: date,
      });
    }
    clientTotals[plan.client].sales += grandTotal;
    clientTotals[plan.client].paid += paid;
    clientTotals[plan.client].last = new Date(Date.now() - plan.daysAgo * 86400000);
    if (paid > 0) {
      const trx = num("TRX", "TRX");
      vaultBalance[plan.vault] += paid;
      await db.collection("financeTransactions").doc(trx).set({
        transactionNumber: trx, date, vaultId: plan.vault,
        vaultEnglishName: vaults.find((v) => v.id === plan.vault)!.englishName,
        vaultArabicName: vaults.find((v) => v.id === plan.vault)!.arabicName,
        type: "invoice_payment", amount: paid, referenceType: "salesInvoice", referenceId: number,
        referenceNumber: number, notes: `Payment on invoice ${number}`, createdBy: uid, createdByName: "Store Owner", createdAt: date,
      });
    }
  }

  // -------- 9. Return invoice --------
  {
    const number = num("RET", "RET");
    const lines = [lineOf("prd_4", 1)];
    const subtotal = lines.reduce((s, l) => s + l.lineSubtotal, 0);
    const grandTotal = subtotal;
    const date = daysAgo(2);
    await db.collection("returnInvoices").doc(number).set({
      invoiceNumber: number, invoiceDate: date, clientId: "CL-000003",
      clientEnglishName: "Omar Ali", clientArabicName: "عمر علي", status: "posted",
      originalInvoiceId: "", originalInvoiceNumber: "", notes: "Wrong size", lines, subtotal,
      itemDiscountTotal: 0, invoiceDiscountType: "amount", invoiceDiscountValue: 0,
      invoiceDiscountTotal: 0, totalDiscount: 0, grandTotal, createdBy: uid, createdByName: "Store Owner", createdAt: date, updatedAt: date,
    });
    for (const l of lines) {
      const before = productQty[l.productId];
      const after = before + l.quantity;
      productQty[l.productId] = after;
      await db.collection("products").doc(l.productId).update({ currentQty: after, updatedAt: now });
      await db.collection("stockMovements").add({
        productId: l.productId, productSku: l.productSku, productEnglishName: l.productEnglishName,
        productArabicName: l.productArabicName, type: "return", quantity: l.quantity, qtyBefore: before,
        qtyAfter: after, referenceType: "returnInvoice", referenceId: number, referenceNumber: number,
        notes: "", createdBy: uid, createdByName: "Store Owner", createdAt: date,
      });
    }
    clientTotals["CL-000003"].returns += grandTotal;
  }

  // -------- 10. Receipts --------
  const receiptPlans = [
    { client: "CL-000001", vault: "vault_cash", amount: 400, daysAgo: 5 },
    { client: "CL-000002", vault: "vault_bank", amount: 300, daysAgo: 2 },
  ];
  for (const r of receiptPlans) {
    const number = num("REC", "REC");
    const trx = num("TRX", "TRX");
    const date = daysAgo(r.daysAgo);
    vaultBalance[r.vault] += r.amount;
    clientTotals[r.client].paid += r.amount;
    const c = clientsSeed.find((x) => x.id === r.client)!;
    await db.collection("receiptSlips").doc(number).set({
      receiptNumber: number, date, clientId: r.client, clientEnglishName: c.en, clientArabicName: c.ar,
      vaultId: r.vault, vaultEnglishName: vaults.find((v) => v.id === r.vault)!.englishName,
      vaultArabicName: vaults.find((v) => v.id === r.vault)!.arabicName, amount: r.amount,
      paymentMethod: r.vault === "vault_cash" ? "cash" : "bank", notes: "", createdBy: uid, createdByName: "Store Owner", createdAt: date,
    });
    await db.collection("financeTransactions").doc(trx).set({
      transactionNumber: trx, date, vaultId: r.vault,
      vaultEnglishName: vaults.find((v) => v.id === r.vault)!.englishName,
      vaultArabicName: vaults.find((v) => v.id === r.vault)!.arabicName, type: "income", amount: r.amount,
      referenceType: "receiptSlip", referenceId: number, referenceNumber: number, notes: `Receipt from ${c.en}`,
      createdBy: uid, createdByName: "Store Owner", createdAt: date,
    });
  }

  // -------- 11. Expenses --------
  const expensePlans = [
    { category: "Rent", amount: 5000, vault: "vault_bank", paidTo: "Landlord", daysAgo: 8 },
    { category: "Utilities", amount: 1200, vault: "vault_cash", paidTo: "Electricity Co.", daysAgo: 4 },
  ];
  for (const ex of expensePlans) {
    const number = num("EXP", "EXP");
    const trx = num("TRX", "TRX");
    const date = daysAgo(ex.daysAgo);
    vaultBalance[ex.vault] -= ex.amount;
    await db.collection("expenseSlips").doc(number).set({
      expenseNumber: number, date, vaultId: ex.vault,
      vaultEnglishName: vaults.find((v) => v.id === ex.vault)!.englishName,
      vaultArabicName: vaults.find((v) => v.id === ex.vault)!.arabicName, category: ex.category,
      amount: ex.amount, paidTo: ex.paidTo, notes: "", attachmentBase64: "", createdBy: uid, createdByName: "Store Owner", createdAt: date,
    });
    await db.collection("financeTransactions").doc(trx).set({
      transactionNumber: trx, date, vaultId: ex.vault,
      vaultEnglishName: vaults.find((v) => v.id === ex.vault)!.englishName,
      vaultArabicName: vaults.find((v) => v.id === ex.vault)!.arabicName, type: "expense", amount: -ex.amount,
      referenceType: "expenseSlip", referenceId: number, referenceNumber: number, notes: ex.category,
      createdBy: uid, createdByName: "Store Owner", createdAt: date,
    });
  }

  // -------- 12. Persist final balances --------
  for (const [id, b] of Object.entries(vaultBalance)) {
    await db.collection("vaults").doc(id).update({ currentBalance: b, updatedAt: now });
  }
  for (const [id, c] of Object.entries(clientTotals)) {
    const balance = c.sales - c.returns - c.paid;
    const patch: Record<string, unknown> = { totalSales: c.sales, totalReturns: c.returns, totalPaid: c.paid, balance, updatedAt: now };
    if (c.last) patch.lastPurchaseAt = ts(c.last);
    await db.collection("clients").doc(id).update(patch);
  }

  // -------- 13. Sequence counters --------
  await db.collection("sequences").doc("clients").set({ value: clientsSeed.length, prefix: "CL", updatedAt: now });
  await db.collection("sequences").doc("products").set({ value: productsSeed.length, prefix: "PRD", updatedAt: now });
  await db.collection("sequences").doc("salesInvoices").set({ value: counters.INV, prefix: "INV", updatedAt: now });
  await db.collection("sequences").doc("returnInvoices").set({ value: counters.RET, prefix: "RET", updatedAt: now });
  await db.collection("sequences").doc("receiptSlips").set({ value: counters.REC, prefix: "REC", updatedAt: now });
  await db.collection("sequences").doc("expenseSlips").set({ value: counters.EXP, prefix: "EXP", updatedAt: now });
  await db.collection("sequences").doc("financeTransactions").set({ value: counters.TRX, prefix: "TRX", updatedAt: now });

  // -------- 14. Audit log --------
  await db.collection("auditLogs").add({
    userId: "system", userName: "System", action: "seed", entityType: "system",
    entityId: "", description: "Database seeded with starter data", beforeData: "", afterData: "", createdAt: now,
  });

  console.log("[seed] Done!");
  console.log("[seed] Login -> email: admin@store.com  password: Admin@123456");
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[seed] Failed:", e);
    process.exit(1);
  });

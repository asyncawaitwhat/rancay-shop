import type {
  PermissionLevel,
  PermissionMatrix,
  ScreenKey,
} from "./types";

/** Ordered list of every permission-controlled screen with i18n label keys. */
export const SCREENS: { key: ScreenKey; labelKey: string }[] = [
  { key: "dashboard", labelKey: "nav.dashboard" },
  { key: "clients", labelKey: "nav.clients" },
  { key: "products", labelKey: "nav.products" },
  { key: "categories", labelKey: "nav.categories" },
  { key: "inventory", labelKey: "nav.inventory" },
  { key: "sales", labelKey: "nav.sales" },
  { key: "salesReps", labelKey: "nav.salesReps" },
  { key: "returns", labelKey: "nav.returns" },
  { key: "vaults", labelKey: "nav.vaults" },
  { key: "transactions", labelKey: "nav.transactions" },
  { key: "expenses", labelKey: "nav.expenses" },
  { key: "receipts", labelKey: "nav.receipts" },
  { key: "reports", labelKey: "nav.reports" },
  { key: "brand", labelKey: "nav.brand" },
  { key: "users", labelKey: "nav.users" },
  { key: "roles", labelKey: "nav.roles" },
  { key: "audit", labelKey: "nav.audit" },
  { key: "whatsapp", labelKey: "nav.whatsapp" },
];

export const PERMISSION_LEVELS: PermissionLevel[] = [
  "no_access",
  "view_only",
  "edit",
  "full",
];

const RANK: Record<PermissionLevel, number> = {
  no_access: 0,
  view_only: 1,
  edit: 2,
  full: 3,
};

/** Build a permission matrix where every screen has the same level. */
export function uniformMatrix(level: PermissionLevel): PermissionMatrix {
  return SCREENS.reduce((acc, s) => {
    acc[s.key] = level;
    return acc;
  }, {} as PermissionMatrix);
}

export function emptyMatrix(): PermissionMatrix {
  return uniformMatrix("no_access");
}

export type PermissionAction =
  | "view"
  | "create"
  | "edit"
  | "delete"
  | "export";

/** Minimum permission level required for each action. */
const ACTION_MIN: Record<PermissionAction, PermissionLevel> = {
  view: "view_only",
  create: "edit",
  edit: "edit",
  delete: "full",
  export: "full",
};

export function levelAllows(
  level: PermissionLevel | undefined,
  action: PermissionAction
): boolean {
  if (!level) return false;
  return RANK[level] >= RANK[ACTION_MIN[action]];
}

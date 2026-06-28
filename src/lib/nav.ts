import type { ScreenKey } from "./types";

export interface NavItem {
  screen: ScreenKey;
  href: string;
  labelKey: string;
  icon: string; // lucide icon name
}

export interface NavGroup {
  labelKey: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "nav.group.main",
    items: [
      { screen: "dashboard", href: "/dashboard", labelKey: "nav.dashboard", icon: "LayoutDashboard" },
      { screen: "clients", href: "/clients", labelKey: "nav.clients", icon: "Users" },
    ],
  },
  {
    labelKey: "nav.group.sales",
    items: [
      { screen: "products", href: "/products", labelKey: "nav.products", icon: "Shirt" },
      { screen: "categories", href: "/categories", labelKey: "nav.categories", icon: "Tags" },
      { screen: "inventory", href: "/inventory", labelKey: "nav.inventory", icon: "Boxes" },
      { screen: "sales", href: "/sales", labelKey: "nav.sales", icon: "ReceiptText" },
      { screen: "salesReps", href: "/sales-reps", labelKey: "nav.salesReps", icon: "UserCheck" },
      { screen: "returns", href: "/returns", labelKey: "nav.returns", icon: "Undo2" },
    ],
  },
  {
    labelKey: "nav.group.finance",
    items: [
      { screen: "vaults", href: "/vaults", labelKey: "nav.vaults", icon: "Wallet" },
      { screen: "transactions", href: "/transactions", labelKey: "nav.transactions", icon: "ArrowLeftRight" },
      { screen: "expenses", href: "/expenses", labelKey: "nav.expenses", icon: "TrendingDown" },
      { screen: "receipts", href: "/receipts", labelKey: "nav.receipts", icon: "TrendingUp" },
      { screen: "reports", href: "/reports", labelKey: "nav.reports", icon: "BarChart3" },
    ],
  },
  {
    labelKey: "nav.group.admin",
    items: [
      { screen: "brand", href: "/brand", labelKey: "nav.brand", icon: "Store" },
      { screen: "whatsapp", href: "/whatsapp", labelKey: "nav.whatsapp", icon: "MessageCircle" },
      { screen: "users", href: "/users", labelKey: "nav.users", icon: "UserCog" },
      { screen: "roles", href: "/roles", labelKey: "nav.roles", icon: "ShieldCheck" },
      { screen: "audit", href: "/audit", labelKey: "nav.audit", icon: "ScrollText" },
    ],
  },
];

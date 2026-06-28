"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  Shirt,
  Tags,
  Boxes,
  ReceiptText,
  Undo2,
  Wallet,
  ArrowLeftRight,
  TrendingDown,
  TrendingUp,
  BarChart3,
  Store,
  UserCog,
  ShieldCheck,
  ScrollText,
  MessageCircle,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { NAV_GROUPS } from "@/lib/nav";
import { useLang } from "@/components/providers/language-provider";
import { usePermissions } from "@/components/providers/permission-provider";
import { useAuth } from "@/components/providers/auth-provider";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  LayoutDashboard, Users, Shirt, Tags, Boxes, ReceiptText, Undo2, Wallet,
  ArrowLeftRight, TrendingDown, TrendingUp, BarChart3, Store, UserCog, ShieldCheck, ScrollText,
  MessageCircle, UserCheck,
};

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { t, name } = useLang();
  const { canView } = usePermissions();
  const pathname = usePathname();
  const { user } = useAuth();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-2 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Store className="h-5 w-5" />
        </div>
        <span className="font-bold leading-tight">{t("app.shortTitle")}</span>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => {
          const items = group.items.filter((i) => canView(i.screen));
          if (items.length === 0) return null;
          return (
            <div key={group.labelKey} className="mb-5">
              <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t(group.labelKey)}
              </p>
              <ul className="space-y-1">
                {items.map((item) => {
                  const Icon = ICONS[item.icon] || LayoutDashboard;
                  const active = pathname === item.href || pathname.startsWith(item.href + "/");
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={cn(
                          "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                          active
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground"
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="truncate">{t(item.labelKey)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      {user && (
        <div className="border-t p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">{user.name}</p>
          <p className="truncate">{user.email}</p>
        </div>
      )}
    </div>
  );
}

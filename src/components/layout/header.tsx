"use client";

import { useState } from "react";
import { Menu, LogOut, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { LanguageSwitcher } from "./language-switcher";
import { useAuth } from "@/components/providers/auth-provider";
import { useLang } from "@/components/providers/language-provider";
import { useBrand } from "@/hooks/use-brand";

export function Header({ onMenu }: { onMenu: () => void }) {
  const { user, role, signOut } = useAuth();
  const { t, name } = useLang();
  const brand = useBrand();
  const [busy, setBusy] = useState(false);

  const initials = (user?.name || "?")
    .split(" ")
    .map((s) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenu}>
          <Menu className="h-5 w-5" />
        </Button>
        <span className="hidden text-sm font-medium text-muted-foreground sm:inline">
          {brand ? name(brand.companyEnglishName, brand.companyArabicName) : t("app.title")}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar className="h-8 w-8">
                {user?.avatarBase64 ? <AvatarImage src={user.avatarBase64} /> : null}
                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>
              <span className="hidden text-sm font-medium sm:inline">{user?.name}</span>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="font-medium">{user?.name}</div>
              <div className="text-xs font-normal text-muted-foreground">
                {role ? name(role.englishName, role.arabicName) : ""}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={async () => {
                setBusy(true);
                await signOut();
              }}
              className="text-destructive"
            >
              <LogOut className="h-4 w-4" />
              {busy ? t("auth.loggingOut") : t("action.logout")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

"use client";

import { useCallback, useMemo } from "react";
import { useAuth } from "./auth-provider";
import { levelAllows, type PermissionAction } from "@/lib/permissions";
import type { PermissionLevel, ScreenKey } from "@/lib/types";

/**
 * Permission hook derived from the signed-in user's role. Super Admin always
 * has full access. The same checks are enforced server-side by firestore.rules
 * for the sensitive collections (users, roles, brandSettings).
 */
export function usePermissions() {
  const { role } = useAuth();

  const isSuperAdmin = !!role?.isSuperAdmin;

  const level = useCallback(
    (screen: ScreenKey): PermissionLevel => {
      if (isSuperAdmin) return "full";
      return role?.permissions?.[screen] ?? "no_access";
    },
    [role, isSuperAdmin]
  );

  const can = useCallback(
    (screen: ScreenKey, action: PermissionAction): boolean => {
      if (isSuperAdmin) return true;
      return levelAllows(role?.permissions?.[screen], action);
    },
    [role, isSuperAdmin]
  );

  const canView = useCallback((screen: ScreenKey) => can(screen, "view"), [can]);

  return useMemo(
    () => ({ isSuperAdmin, level, can, canView }),
    [isSuperAdmin, level, can, canView]
  );
}

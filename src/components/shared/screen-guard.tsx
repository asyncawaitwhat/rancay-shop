"use client";

import type { ReactNode } from "react";
import type { ScreenKey } from "@/lib/types";
import { usePermissions } from "@/components/providers/permission-provider";
import { NoAccess } from "./states";

/** Renders children only if the user can view the given screen. */
export function ScreenGuard({ screen, children }: { screen: ScreenKey; children: ReactNode }) {
  const { canView } = usePermissions();
  if (!canView(screen)) return <NoAccess />;
  return <>{children}</>;
}

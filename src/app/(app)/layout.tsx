import { AppShell } from "@/components/layout/app-shell";

// Cloudflare Pages (via @cloudflare/next-on-pages) runs server-rendered routes on
// the Workers/Edge runtime. Declaring it on this route-group layout makes every
// authenticated route — including the dynamic [id] detail pages — Edge-compatible.
export const runtime = "edge";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}

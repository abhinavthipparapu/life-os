import { Button } from "@lifeos/ui/components/button";
import { Drawer, DrawerContent, DrawerTitle, DrawerTrigger } from "@lifeos/ui/components/drawer";
import { cn } from "@lifeos/ui/lib/utils";
import { Check, LogOut, Menu, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Link, NavLink, useLocation, useNavigate, useOutlet } from "react-router-dom";
import { api } from "@/app/api";
import { CelebrationHost } from "@/components/experience/celebration-host";
import { ReducedMotionProvider } from "@/components/experience/reduced-motion";
import { signOut } from "@/features/auth/session";
import { browserTimezone } from "@/lib/dates";
import { useSyncEngine } from "@/offline/use-sync";
import { GlobalSearch } from "./global-search";
import { MOBILE_PRIMARY, NAV } from "./nav";
import { SyncStatus } from "./sync-status";

function Logo() {
  return (
    <Link to="/app" className="flex items-center gap-2 font-semibold">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Check aria-hidden className="size-5" /></span>
      LifeOS
    </Link>
  );
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  cn("flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
    isActive ? "bg-primary-soft text-ink" : "text-ink-muted hover:bg-surface-2 hover:text-ink");

function SideNav({ admin, onNavigate }: { admin: boolean; onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="space-y-1">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={linkClass} onClick={onNavigate}>
          <Icon aria-hidden className="size-5" />{label}
        </NavLink>
      ))}
      {admin && (
        <NavLink to="/admin" className={linkClass} onClick={onNavigate}>
          <ShieldCheck aria-hidden className="size-5" />Admin
        </NavLink>
      )}
    </nav>
  );
}

function MobileBottomNav({ admin }: { admin: boolean }) {
  const [open, setOpen] = useState(false);
  const items = NAV.filter((n) => MOBILE_PRIMARY.includes(n.to));
  const tab = ({ isActive }: { isActive: boolean }) =>
    cn("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs", isActive ? "font-semibold text-primary" : "text-ink-muted");
  return (
    <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-40 flex border-t bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} className={tab}><Icon aria-hidden className="size-5" />{label}</NavLink>
      ))}
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerTrigger className="flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs text-ink-muted">
          <Menu aria-hidden className="size-5" />More
        </DrawerTrigger>
        <DrawerContent aria-describedby={undefined} className="p-4">
          <DrawerTitle className="sr-only">All pages</DrawerTitle>
          <div className="max-h-[70vh] overflow-auto"><SideNav admin={admin} onNavigate={() => setOpen(false)} /></div>
        </DrawerContent>
      </Drawer>
    </nav>
  );
}

const CRUMBS: Record<string, string> = Object.fromEntries(NAV.map((n) => [n.to.split("/").pop() ?? "", n.label]));

function Breadcrumbs() {
  const { pathname } = useLocation();
  const parts = pathname.split("/").filter(Boolean).slice(1);
  if (parts.length < 2) return null;
  return (
    <nav aria-label="Breadcrumb" className="hidden text-sm text-ink-muted sm:block">
      <ol className="flex items-center gap-1.5">
        {parts.map((part, i) => {
          const last = i === parts.length - 1;
          const href = `/app/${parts.slice(0, i + 1).join("/")}`;
          const label = CRUMBS[part] ?? (part === "new" ? "New" : part === "edit" ? "Edit" : "Details");
          return (
            <li key={href} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden>/</span>}
              {last ? <span aria-current="page">{label}</span> : <Link className="hover:underline" to={href}>{label}</Link>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function usePreferenceEffects() {
  const { data } = api.useMeQuery();
  const [update] = api.useUpdateProfileMutation();
  const theme = data?.preferences.theme;
  useEffect(() => {
    if (!theme) return;
    try {
      localStorage.setItem("lifeos.theme", theme);
    } catch { /* Storage can be unavailable in private windows. */ }
    const dark = theme === "dark" || (theme === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  }, [theme]);
  // New accounts start in UTC. Adopt the device's zone once, so "today" means the user's today.
  useEffect(() => {
    if (data?.timezone === "UTC" && browserTimezone() !== "UTC") void update({ timezone: browserTimezone() });
  }, [data?.timezone, update]);
  return data;
}

export function AppShell() {
  const outlet = useOutlet();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const profile = usePreferenceEffects();
  useSyncEngine();
  const admin = profile?.role === "admin" || profile?.role === "support";
  const section = pathname.split("/").slice(0, 3).join("/");

  return (
    <ReducedMotionProvider>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:z-50 focus:m-2 focus:rounded-lg focus:bg-surface focus:p-3">Skip to content</a>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-auto border-r bg-surface/70 p-4 lg:flex">
          <Logo />
          <SideNav admin={admin} />
          <Button variant="ghost" className="mt-auto justify-start" onClick={() => void signOut().then(() => navigate("/login"))}>
            <LogOut aria-hidden className="size-5" />Sign out
          </Button>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-surface/90 px-4 backdrop-blur-sm">
            <div className="lg:hidden"><Logo /></div>
            <Breadcrumbs />
            <div className="ml-auto flex items-center gap-1">
              <SyncStatus />
              <GlobalSearch />
            </div>
          </header>
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-28 outline-none lg:pb-8">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={section} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                {outlet}
              </motion.div>
            </AnimatePresence>
          </main>
        </div>
      </div>
      <MobileBottomNav admin={admin} />
      <CelebrationHost />
    </ReducedMotionProvider>
  );
}

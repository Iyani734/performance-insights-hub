import { useState } from "react";
import { Link, useRouter, useLocation } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Upload,
  Users,
  Mail,
  Briefcase,
  History,
  Settings,
  LogOut,
  Activity,
  Menu,
  ChevronLeft,
  ChevronRight,
  BarChart3,
  LifeBuoy,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, canView } from "@/lib/useAuth";
import { disableDemoMode, isDemoMode } from "@/lib/demoMode";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import logoAsset from "@/assets/arc-barricades-logo.webp.asset.json";

type NavItem = {
  to: string;
  key: string;
  label: string;
  icon: typeof LayoutDashboard;
  superAdminOnly?: boolean;
};

const NAV: NavItem[] = [
  { to: "/dashboard",  key: "dashboard",  label: "Dashboard", icon: LayoutDashboard },
  { to: "/analytics",  key: "analytics",  label: "Analytics", icon: BarChart3 },
  { to: "/uploads",    key: "uploads",    label: "Uploads",   icon: Upload },
  { to: "/open-jobs",  key: "open-jobs",  label: "Open Jobs", icon: Briefcase },
  { to: "/customers",  key: "customers",  label: "Customers", icon: Users },
  { to: "/emails",     key: "emails",     label: "Emails",    icon: Mail },
  { to: "/history",    key: "history",    label: "History",   icon: History },
  { to: "/settings",   key: "settings",   label: "Settings",  icon: Settings },
];

function SidebarInner({
  collapsed,
  onNavigate,
}: {
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const loc = useLocation();
  const router = useRouter();
  const qc = useQueryClient();
  const auth = useAuth();
  const { user, role, isSuperAdmin, displayName } = auth;
  const demoMode = !user && isDemoMode();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    disableDemoMode();
    await supabase.auth.signOut();
    router.navigate({ to: demoMode ? "/" : "/auth", replace: true });
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "flex items-center gap-2 border-b border-sidebar-border px-4 py-4 shrink-0",
          collapsed && "justify-center px-2"
        )}
      >
        <div className={cn("rounded-lg bg-white flex items-center justify-center shrink-0 overflow-hidden", collapsed ? "w-9 h-9" : "w-10 h-10")}>
          <img src="/logo.webp" alt="ARC Barricades" className="w-full h-full object-contain p-0.5" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-display font-semibold text-lg leading-tight truncate">
              ARC Barricades
            </div>
            <div className="text-xs text-sidebar-foreground/60 truncate">
              Operations KPIs
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {NAV.filter((n) => {
          if (n.superAdminOnly) return isSuperAdmin;
          if (demoMode) return true;
          return canView(auth, n.key);
        }).map((n) => {
          const active = loc.pathname.startsWith(n.to);
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to as any}
              onClick={onNavigate}
              title={collapsed ? n.label : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                collapsed && "justify-center px-2",
                active
                  ? "bg-sidebar-primary/15 text-sidebar-primary-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!collapsed && <span className="truncate">{n.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div
        className={cn(
          "border-t border-sidebar-border p-3 shrink-0 space-y-2",
          collapsed && "px-2"
        )}
      >
        {/* Support link — above the user email */}
        <Link
          to="/support"
          onClick={onNavigate}
          title={collapsed ? "Support" : undefined}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            collapsed && "justify-center px-2",
            loc.pathname.startsWith("/support")
              ? "bg-sidebar-primary/15 text-sidebar-primary-foreground"
              : "text-sidebar-foreground/80 hover:bg-sidebar-accent"
          )}
        >
          <LifeBuoy className="w-4 h-4 shrink-0" />
          {!collapsed && <span className="truncate">Support</span>}
        </Link>

        {!collapsed ? (
          <>
            <div className="text-sm font-medium text-sidebar-foreground truncate">
              {demoMode ? "Demo viewer" : (displayName || user?.email)}
            </div>
            <div className="text-xs uppercase tracking-wide">
              <span
                className={cn(
                  "px-2 py-0.5 rounded inline-flex items-center gap-1",
                  isSuperAdmin
                    ? "bg-primary/30 text-primary-foreground"
                    : role === "admin"
                    ? "bg-primary/20 text-primary-foreground"
                    : "bg-sidebar-accent"
                )}
              >
                {isSuperAdmin && <ShieldCheck className="w-3 h-3" />}
                {demoMode ? "demo" : isSuperAdmin ? "super admin" : role ?? "..."}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="w-4 h-4 mr-2" />
              {demoMode ? "Exit demo" : "Sign out"}
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            title={demoMode ? "Exit demo" : "Sign out"}
            className="w-full text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        )}

        {!collapsed ? (
          <div className="border-t border-sidebar-border/70 pt-3 text-[11px] leading-snug text-sidebar-foreground/55">
            Service provided by{" "}
            <a
              href="https://triaconsultingsus.com"
              target="_blank"
              rel="noreferrer"
              className="font-medium text-sidebar-foreground/80 underline-offset-4 hover:text-sidebar-foreground hover:underline"
            >
              TRIA
            </a>
          </div>
        ) : (
          <a
            href="https://triaconsultingsus.com"
            target="_blank"
            rel="noreferrer"
            title="Service provided by TRIA"
            className="block rounded-md border-t border-sidebar-border/70 pt-3 text-center text-[10px] font-semibold tracking-wide text-sidebar-foreground/60 hover:text-sidebar-foreground"
          >
            TRIA
          </a>
        )}
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden md:flex sticky top-0 h-screen border-r border-sidebar-border transition-[width] duration-200",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <div className="relative w-full">
          <SidebarInner collapsed={collapsed} />
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="absolute -right-3 top-6 z-10 h-6 w-6 rounded-full border border-sidebar-border bg-sidebar text-sidebar-foreground shadow flex items-center justify-center hover:bg-sidebar-accent"
          >
            {collapsed ? (
              <ChevronRight className="w-3.5 h-3.5" />
            ) : (
              <ChevronLeft className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-20 flex items-center gap-2 border-b bg-background/80 backdrop-blur px-4 py-3">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu className="w-5 h-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarInner collapsed={false} onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-white flex items-center justify-center overflow-hidden">
              <img src={logoAsset.url} alt="ARC Barricades" className="w-full h-full object-contain p-0.5" />
            </div>
            <span className="font-display font-semibold">ARC Barricades</span>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}

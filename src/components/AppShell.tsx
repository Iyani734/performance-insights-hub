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
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/uploads", label: "Uploads", icon: Upload },
  { to: "/open-jobs", label: "Open Jobs", icon: Briefcase },
  { to: "/customers", label: "Customers", icon: Users },
  { to: "/emails", label: "Emails", icon: Mail },
  { to: "/history", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: true },
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
  const { user, role } = useAuth();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={cn(
          "flex items-center gap-2 border-b border-sidebar-border px-4 py-4 shrink-0",
          collapsed && "justify-center px-2"
        )}
      >
        <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
          <Activity className="w-5 h-5 text-primary" />
        </div>
        {!collapsed && (
          <div className="min-w-0">
            <div className="font-display font-semibold text-lg leading-tight truncate">
              Perf Tracker
            </div>
            <div className="text-xs text-sidebar-foreground/60 truncate">
              Operations KPIs
            </div>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {NAV.filter((n) => !n.adminOnly || role === "admin").map((n) => {
          const active = loc.pathname.startsWith(n.to);
          const Icon = n.icon;
          return (
            <Link
              key={n.to}
              to={n.to}
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
          "border-t border-sidebar-border p-3 shrink-0",
          collapsed && "px-2"
        )}
      >
        {!collapsed ? (
          <>
            <div className="text-xs text-sidebar-foreground/60 mb-2 truncate">
              {user?.email}
            </div>
            <div className="text-xs uppercase tracking-wide mb-3">
              <span
                className={cn(
                  "px-2 py-0.5 rounded",
                  role === "admin"
                    ? "bg-primary/25 text-primary-foreground"
                    : "bg-sidebar-accent"
                )}
              >
                {role ?? "..."}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={signOut}
              className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOut className="w-4 h-4 mr-2" />
              Sign out
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            onClick={signOut}
            title="Sign out"
            className="w-full text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground"
          >
            <LogOut className="w-4 h-4" />
          </Button>
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
            <div className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center">
              <Activity className="w-4 h-4 text-primary" />
            </div>
            <span className="font-display font-semibold">Perf Tracker</span>
          </div>
        </div>

        <div className="max-w-[1400px] mx-auto p-4 md:p-8">{children}</div>
      </main>
    </div>
  );
}

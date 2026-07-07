import { Link, useRouter, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, Upload, Users, Mail, Briefcase, History, Settings, LogOut, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
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

export function AppShell({ children }: { children: React.ReactNode }) {
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
    <div className="flex min-h-screen">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
        <div className="px-6 py-6 flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <div className="font-display font-semibold text-lg leading-tight">Perf Tracker</div>
            <div className="text-xs text-sidebar-foreground/60">Operations KPIs</div>
          </div>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {NAV.filter(n => !n.adminOnly || role === "admin").map(n => {
            const active = loc.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <Link key={n.to} to={n.to} className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                active ? "bg-sidebar-primary/15 text-sidebar-primary-foreground" : "hover:bg-sidebar-accent text-sidebar-foreground/80"
              )}>
                <Icon className="w-4 h-4" />
                {n.label}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-sidebar-border">
          <div className="text-xs text-sidebar-foreground/60 mb-2">{user?.email}</div>
          <div className="text-xs uppercase tracking-wide mb-3">
            <span className={cn("px-2 py-0.5 rounded", role === "admin" ? "bg-primary/25 text-primary-foreground" : "bg-sidebar-accent")}>{role ?? "..."}</span>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <LogOut className="w-4 h-4 mr-2" />Sign out
          </Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="max-w-[1400px] mx-auto p-6 md:p-8">{children}</div>
      </main>
    </div>
  );
}

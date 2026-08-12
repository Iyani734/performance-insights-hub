import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { disableDemoMode } from "@/lib/demoMode";
import type { User } from "@supabase/supabase-js";

export type PagePerm = { page: string; can_view: boolean; can_edit: boolean };
export type AuthRole = "super_admin" | "admin" | "user" | null;

export type AuthState = {
  user: User | null;
  role: AuthRole;
  isSuperAdmin: boolean;
  isAdmin: boolean;
  perms: Record<string, PagePerm>;
  loading: boolean;
  displayName: string | null;
};

// Default permissions when no explicit row exists: no access until a super admin approves the user.
export const DEFAULT_PAGES = [
  "dashboard", "analytics", "uploads", "open-jobs", "customers", "emails", "history", "support", "settings",
];

export function canView(state: AuthState, page: string): boolean {
  if (state.isSuperAdmin) return true;
  const p = state.perms[page];
  if (p) return p.can_view;
  return false;
}

export function canEdit(state: AuthState, page: string): boolean {
  if (state.isSuperAdmin) return true;
  const p = state.perms[page];
  return p?.can_edit ?? false;
}

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({
    user: null, role: null, isSuperAdmin: false, isAdmin: false, perms: {}, loading: true, displayName: null,
  });

  useEffect(() => {
    let cancel = false;
    async function load(user: User | null) {
      if (!user) {
        if (!cancel) setState({ user: null, role: null, isSuperAdmin: false, isAdmin: false, perms: {}, loading: false, displayName: null });
        return;
      }
      disableDemoMode();
      const [rolesRes, permsRes, profileRes] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", user.id),
        supabase.from("page_permissions").select("page,can_view,can_edit").eq("user_id", user.id),
        supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
      ]);
      const roles = ((rolesRes.data ?? []) as any[]).map((r) => r.role);
      const isSuperAdmin = roles.includes("super_admin");
      const isAdmin = isSuperAdmin || roles.includes("admin");
      const role: AuthRole = isSuperAdmin ? "super_admin" : isAdmin ? "admin" : "user";
      const perms: Record<string, PagePerm> = {};
      for (const p of (permsRes.data ?? []) as any[]) perms[p.page] = p;
      const metaNick = (user.user_metadata as any)?.nickname || (user.user_metadata as any)?.full_name;
      const displayName = (profileRes.data as any)?.full_name || metaNick || null;
      if (!cancel) setState({ user, role, isSuperAdmin, isAdmin, perms, loading: false, displayName });
    }
    supabase.auth.getUser().then(({ data }) => load(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => load(session?.user ?? null));
    return () => { cancel = true; sub.subscription.unsubscribe(); };
  }, []);

  return state;
}

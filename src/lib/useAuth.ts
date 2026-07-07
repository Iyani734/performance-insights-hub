import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

export type AuthState = { user: User | null; role: "admin" | "user" | null; loading: boolean };

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ user: null, role: null, loading: true });

  useEffect(() => {
    let cancel = false;
    async function load(user: User | null) {
      if (!user) { if (!cancel) setState({ user: null, role: null, loading: false }); return; }
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      const roles = (data ?? []).map((r: any) => r.role);
      const role = roles.includes("admin") ? "admin" : "user";
      if (!cancel) setState({ user, role, loading: false });
    }
    supabase.auth.getUser().then(({ data }) => load(data.user));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => load(session?.user ?? null));
    return () => { cancel = true; sub.subscription.unsubscribe(); };
  }, []);

  return state;
}

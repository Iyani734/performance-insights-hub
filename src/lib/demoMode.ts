import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const DEMO_MODE_STORAGE_KEY = "perf-tracker-demo-mode";

export function enableDemoMode() {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, "true");
}

export function disableDemoMode() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(DEMO_MODE_STORAGE_KEY);
}

export function isDemoMode() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === "true";
}

export function useDemoMode() {
  const [demoMode, setDemoMode] = useState(isDemoMode);

  useEffect(() => {
    let active = true;

    const sync = (hasUser: boolean) => {
      if (hasUser) disableDemoMode();
      if (active) setDemoMode(!hasUser && isDemoMode());
    };

    supabase.auth.getUser().then(({ data }) => sync(!!data.user));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => sync(!!session?.user));

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return demoMode;
}

import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Activity, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { enableDemoMode } from "@/lib/demoMode";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // If already signed in, jump to dashboard.
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) router.navigate({ to: "/dashboard", replace: true });
    });
  }, [router]);

  async function enterDemo() {
    setBusy(true);
    try {
      enableDemoMode();
      const demoSeed = await supabase.rpc("ensure_demo_data");
      if (demoSeed.error) console.warn("Demo data refresh failed:", demoSeed.error.message);
      router.navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Could not load demo");
    } finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-primary/5 via-background to-background">
      <Card className="w-full max-w-lg p-10 text-center">
        <div className="w-14 h-14 mx-auto rounded-xl bg-primary/15 flex items-center justify-center mb-4">
          <Activity className="w-7 h-7 text-primary" />
        </div>
        <h1 className="font-display text-3xl font-semibold">Performance Tracker</h1>
        <p className="text-sm text-muted-foreground mt-2">Weekly operational KPIs across dispatch, quality, and billing — automated from your ticket exports.</p>

        <div className="mt-8 space-y-3">
          <Button size="lg" className="w-full gap-2" onClick={enterDemo} disabled={busy}>
            <Sparkles className="w-4 h-4" />
            {busy ? "Loading demo…" : "Explore the demo (no login)"}
          </Button>
          <Button size="lg" variant="outline" className="w-full gap-2" asChild>
            <Link to="/auth">Sign in to your workspace <ArrowRight className="w-4 h-4" /></Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mt-6">
          <Link to="/how-it-works" className="hover:underline">How the KPIs are calculated →</Link>
        </p>
      </Card>
    </div>
  );
}

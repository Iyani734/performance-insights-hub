import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Sparkles } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({ component: AuthPage });

const DEMO_EMAIL = "demo@perftracker.app";
const DEMO_PASSWORD = "demo-tracker-2026";

function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
      } else {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: name } },
        });
        if (error) throw error;
        toast.success("Account created");
      }
      router.navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Auth failed");
    } finally { setLoading(false); }
  }

  async function enterDemo() {
    setDemoLoading(true);
    try {
      let res = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
      if (res.error) {
        const signup = await supabase.auth.signUp({
          email: DEMO_EMAIL, password: DEMO_PASSWORD,
          options: { emailRedirectTo: window.location.origin, data: { full_name: "Demo Viewer" } },
        });
        if (signup.error && !/already/i.test(signup.error.message)) throw signup.error;
        res = await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
        if (res.error) throw res.error;
      }
      toast.success("Loaded demo workspace");
      router.navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Could not enter demo");
    } finally { setDemoLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold leading-tight">Performance Tracker</h1>
            <p className="text-xs text-muted-foreground">Sign in or explore the demo</p>
          </div>
        </div>

        <Button
          type="button"
          variant="secondary"
          className="w-full mb-4 gap-2"
          onClick={enterDemo}
          disabled={demoLoading}
        >
          <Sparkles className="w-4 h-4" />
          {demoLoading ? "Loading demo…" : "View demo dashboard (6 months of data)"}
        </Button>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Or use your account</span>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>
          <form onSubmit={submit} className="space-y-4 mt-6">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
            {mode === "signup" && <p className="text-xs text-muted-foreground text-center">The first account created becomes the administrator.</p>}
          </form>
        </Tabs>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Curious how the KPIs are calculated?{" "}
          <Link to="/how-it-works" className="text-primary hover:underline">See the metric guide</Link>
        </p>
      </Card>
    </div>
  );
}

import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Activity, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { disableDemoMode } from "@/lib/demoMode";

export const Route = createFileRoute("/auth")({ component: AuthPage });

function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
      } else {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin, data: { full_name: nickname || name, nickname } },
        });
        if (error) throw error;
        // Persist nickname to profile (handle_new_user seeds it, ensure override applies)
        if (signUpData.user && nickname) {
          await supabase.from("profiles").update({ full_name: nickname }).eq("id", signUpData.user.id);
        }
        toast.success("Account created");
      }
      disableDemoMode();
      router.navigate({ to: "/dashboard", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Auth failed");
    } finally { setLoading(false); }
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
            <p className="text-xs text-muted-foreground">Sign in to your workspace</p>
          </div>
        </div>

        <Tabs value={mode} onValueChange={(v) => setMode(v as any)}>
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            <TabsTrigger value="signup">Create account</TabsTrigger>
          </TabsList>
          <form onSubmit={submit} className="space-y-4 mt-6">
            {mode === "signup" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nickname">Nickname <span className="text-muted-foreground">(shown on your profile)</span></Label>
                  <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="e.g. Alex" required />
                </div>
              </>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
            </Button>
            {mode === "signup" && <p className="text-xs text-muted-foreground text-center">The first account created becomes the administrator.</p>}
          </form>
        </Tabs>

        <p className="text-xs text-muted-foreground text-center mt-6">Explore the calculation guide from Settings after signing in.</p>
      </Card>
    </div>
  );
}

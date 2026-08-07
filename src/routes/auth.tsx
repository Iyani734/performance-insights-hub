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

type AuthMode = "signin" | "signup" | "forgot";

function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [nickname, setNickname] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  function authRedirect(path: string) {
    return new URL(path, window.location.origin).toString();
  }

  function changeMode(nextMode: AuthMode) {
    setMode(nextMode);
    setNotice("");
    setShowPassword(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setNotice("");

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Signed in");
        disableDemoMode();
        router.navigate({ to: "/dashboard", replace: true });
        return;
      }

      if (mode === "signup") {
        const { data: signUpData, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: authRedirect("/auth"),
            data: { full_name: nickname || name, nickname },
          },
        });
        if (error) throw error;

        if (signUpData.user && nickname) {
          await supabase.from("profiles").update({ full_name: nickname }).eq("id", signUpData.user.id);
        }

        setNotice(
          "Account created. Please check your email and confirm your account before signing in. The confirmation link returns you to this login page.",
        );
        toast.success("Check your email to confirm your account");
        setMode("signin");
        setPassword("");
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: authRedirect("/reset-password"),
      });
      if (error) throw error;

      setNotice("Password reset email sent. Open the link in your email to choose a new password.");
      toast.success("Password reset email sent");
      setMode("signin");
    } catch (err: any) {
      toast.error(err.message ?? "Auth failed");
    } finally {
      setLoading(false);
    }
  }

  const passwordMode = mode === "signin" ? "current-password" : "new-password";

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

        <Tabs value={mode === "forgot" ? "signin" : mode} onValueChange={(v) => changeMode(v as "signin" | "signup")}>
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
                  <Label htmlFor="nickname">
                    Nickname <span className="text-muted-foreground">(shown on your profile)</span>
                  </Label>
                  <Input
                    id="nickname"
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="e.g. Alex"
                    required
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
              />
            </div>

            {mode !== "forgot" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password">Password</Label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => changeMode("forgot")}
                      className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete={passwordMode}
                    className="pr-20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center gap-1 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
            )}

            {mode === "forgot" && (
              <p className="text-sm text-muted-foreground">
                Enter your account email. We will send you a secure link to choose a new password.
              </p>
            )}

            {notice && (
              <div className="rounded-md border border-primary/25 bg-primary/10 px-3 py-2 text-sm text-foreground">
                {notice}
              </div>
            )}

            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Please wait..." : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}
            </Button>

            {mode === "signup" && (
              <p className="text-xs text-muted-foreground text-center">
                After creating an account, confirm your email before signing in. The first confirmed account becomes the administrator.
              </p>
            )}

            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => changeMode("signin")}
                className="w-full text-center text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                Back to sign in
              </button>
            )}
          </form>
        </Tabs>

        <p className="text-xs text-muted-foreground text-center mt-6">
          Explore the calculation guide from Settings after signing in.
        </p>
      </Card>
    </div>
  );
}

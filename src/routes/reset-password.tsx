import { Link, createFileRoute, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Activity, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/reset-password")({ component: ResetPasswordPage });

function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setHasRecoverySession(Boolean(data.session));
      setCheckingSession(false);
    });
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      toast.success("Password updated. Please sign in with your new password.");
      await supabase.auth.signOut();
      router.navigate({ to: "/auth", replace: true });
    } catch (err: any) {
      toast.error(err.message ?? "Could not update password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="w-full max-w-md p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-xl font-semibold leading-tight">Choose a new password</h1>
            <p className="text-xs text-muted-foreground">Use the secure link from your reset email.</p>
          </div>
        </div>

        {checkingSession ? (
          <p className="text-sm text-muted-foreground">Checking your reset link...</p>
        ) : hasRecoverySession ? (
          <form onSubmit={submit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <PasswordInput
                id="password"
                value={password}
                showPassword={showPassword}
                onChange={setPassword}
                onToggle={() => setShowPassword((s) => !s)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Confirm password</Label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Updating..." : "Update password"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <div className="rounded-md border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm">
              This reset link is missing, expired, or already used. Request a new password reset email.
            </div>
            <Button asChild className="w-full">
              <Link to="/auth">Back to sign in</Link>
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}

function PasswordInput({
  id,
  value,
  showPassword,
  onChange,
  onToggle,
}: {
  id: string;
  value: string;
  showPassword: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={showPassword ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required
        minLength={6}
        autoComplete="new-password"
        className="pr-20"
      />
      <button
        type="button"
        onClick={onToggle}
        aria-label={showPassword ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center gap-1 px-3 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        {showPassword ? "Hide" : "Show"}
      </button>
    </div>
  );
}

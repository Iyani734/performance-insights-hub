import { createFileRoute } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LifeBuoy, Mail, MessageCircle, Copy, Bug, Sparkles, Wrench } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/support")({ component: SupportPage });

const DEV_EMAIL = "ianchomba734@gmail.com";
const DEV_WHATSAPP = "+254745969305";
const DEV_WA_LINK = "https://wa.me/254745969305";

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Copy failed"),
  );
}

function SupportPage() {
  const subject = encodeURIComponent("Performance Tracker – support request");
  const body = encodeURIComponent(
    "Hi Ian,\n\nI'm using the Performance Tracker and I need help with:\n\n- What I was doing:\n- What went wrong / what I need:\n- Page / feature:\n\nThanks!",
  );

  return (
    <div className="flex min-h-[calc(100vh-6rem)] flex-col gap-6 animate-in fade-in duration-300">
      <header className="shrink-0">
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
          <LifeBuoy className="w-7 h-7 text-primary" />
          Support
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Something broken? Need a new feature or a tweak? Reach the developer directly.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2 shrink-0">
        <Card className="p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="font-display font-semibold">Email</div>
              <div className="text-xs text-muted-foreground">Best for detailed reports & screenshots</div>
            </div>
          </div>
          <div className="text-sm font-medium break-all">{DEV_EMAIL}</div>
          <div className="flex gap-2">
            <Button asChild size="sm">
              <a href={`mailto:${DEV_EMAIL}?subject=${subject}&body=${body}`}>
                <Mail className="w-4 h-4 mr-2" />Compose email
              </a>
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(DEV_EMAIL, "Email")}>
              <Copy className="w-4 h-4 mr-2" />Copy
            </Button>
          </div>
        </Card>

        <Card className="p-6 flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/15 flex items-center justify-center">
              <MessageCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <div className="font-display font-semibold">WhatsApp</div>
              <div className="text-xs text-muted-foreground">Fastest for quick questions</div>
            </div>
          </div>
          <div className="text-sm font-medium">{DEV_WHATSAPP}</div>
          <div className="flex gap-2">
            <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700">
              <a href={DEV_WA_LINK} target="_blank" rel="noreferrer">
                <MessageCircle className="w-4 h-4 mr-2" />Open WhatsApp
              </a>
            </Button>
            <Button size="sm" variant="outline" onClick={() => copy(DEV_WHATSAPP, "WhatsApp number")}>
              <Copy className="w-4 h-4 mr-2" />Copy
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-6 flex-1 flex flex-col gap-4 min-h-[240px]">
        <h2 className="font-display text-lg font-semibold">What to include when you reach out</h2>
        <div className="grid gap-4 md:grid-cols-3 flex-1">
          <div className="flex gap-3">
            <Bug className="w-5 h-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-sm">Something isn't working</div>
              <p className="text-xs text-muted-foreground mt-1">
                Which page you were on, what you clicked, and what happened (or didn't). A screenshot helps a lot.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-sm">New feature request</div>
              <p className="text-xs text-muted-foreground mt-1">
                Describe the outcome you want and how you'd use it — the "why" matters more than the exact UI.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <Wrench className="w-5 h-5 text-warning shrink-0 mt-0.5" />
            <div>
              <div className="font-medium text-sm">Small change / tweak</div>
              <p className="text-xs text-muted-foreground mt-1">
                Wording, colors, thresholds, permissions — anything. Mention which page and which element.
              </p>
            </div>
          </div>
        </div>
        <div className="text-xs text-muted-foreground border-t pt-3">
          Typical response time: within a day. For urgent production issues, WhatsApp is fastest.
        </div>
      </Card>
    </div>
  );
}

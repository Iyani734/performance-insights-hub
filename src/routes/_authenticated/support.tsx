import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { LifeBuoy, Mail, Copy, Send } from "lucide-react";
import { toast } from "sonner";
import { sendSupportRequest } from "@/lib/supportRequest";

export const Route = createFileRoute("/_authenticated/support")({ component: SupportPage });

const SUPPORT_EMAIL = "Yvette@triaconsultingus.com";

function copy(text: string, label: string) {
  navigator.clipboard.writeText(text).then(
    () => toast.success(`${label} copied`),
    () => toast.error("Copy failed"),
  );
}

function SupportPage() {
  const [subject, setSubject] = useState("");
  const [page, setPage] = useState("");
  const [message, setMessage] = useState("");

  const sendRequest = useMutation({
    mutationFn: () =>
      sendSupportRequest({
        data: {
          subject,
          page: page || undefined,
          message,
        },
      }),
    onSuccess: () => {
      toast.success("Support request sent");
      setSubject("");
      setPage("");
      setMessage("");
    },
    onError: (error: any) => toast.error(error.message ?? "Could not send support request"),
  });

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] max-w-5xl flex-col gap-6 animate-in fade-in duration-300">
      <header>
        <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
          <LifeBuoy className="w-7 h-7 text-primary" />
          Support
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Send support requests directly to TRIA from inside the app.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(260px,340px)_1fr]">
        <Card className="p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Mail className="w-5 h-5 text-primary" />
            </div>
            <div>
              <div className="font-display font-semibold">Support Email</div>
              <div className="text-xs text-muted-foreground">All requests go to Yvette</div>
            </div>
          </div>
          <div className="mt-5 rounded-md border bg-muted/25 px-3 py-2 text-sm font-medium break-all">
            {SUPPORT_EMAIL}
          </div>
          <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => copy(SUPPORT_EMAIL, "Email")}>
            <Copy className="w-4 h-4 mr-2" />
            Copy email
          </Button>
        </Card>

        <Card className="p-6">
          <div className="mb-5">
            <h2 className="font-display text-lg font-semibold">Send a Support Request</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Your message is sent by Resend using the app email configuration.
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="support-subject">Subject</Label>
              <Input
                id="support-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                placeholder="Briefly describe the issue or request"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-page">Page / feature</Label>
              <Input
                id="support-page"
                value={page}
                onChange={(event) => setPage(event.target.value)}
                placeholder="e.g. Uploads, Dashboard, Emails"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support-message">Message</Label>
              <Textarea
                id="support-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Explain what happened, what you expected, and any details that help."
                rows={8}
              />
            </div>
            <Button
              onClick={() => sendRequest.mutate()}
              disabled={!subject.trim() || message.trim().length < 10 || sendRequest.isPending}
            >
              <Send className="w-4 h-4 mr-2" />
              {sendRequest.isPending ? "Sending..." : "Send request"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

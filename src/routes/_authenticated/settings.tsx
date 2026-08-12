import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { useAuth, DEFAULT_PAGES } from "@/lib/useAuth";
import { normalizeKpiTargets, type KpiTarget } from "@/lib/kpi";
import { useState, useEffect, useMemo } from "react";
import { Link, Navigate, Outlet, useLocation } from "@tanstack/react-router";
import { Check, X, ShieldCheck, PencilLine, Send, Clock, CheckCircle2, XCircle, Eye, Edit3, BookOpen, LockKeyhole, UnlockKeyhole, ClipboardList } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsRoute });

const PAGE_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  analytics: "Analytics",
  uploads: "Uploads",
  "open-jobs": "Open Jobs",
  customers: "Customers",
  emails: "Emails",
  history: "History",
  support: "Support",
  settings: "Settings",
};

function SettingsRoute() {
  const location = useLocation();
  return location.pathname === "/settings" ? <SettingsPage /> : <Outlet />;
}

function SettingsPage() {
  const auth = useAuth();
  const { user, isSuperAdmin, loading } = auth;
  const qc = useQueryClient();
  const [editMode, setEditMode] = useState(false);

  const targetsQ = useQuery({
    queryKey: ["kpi_targets"],
    queryFn: async () => normalizeKpiTargets(((await supabase.from("kpi_targets").select("*").order("sort_order")).data ?? []) as KpiTarget[]),
  });
  const [drafts, setDrafts] = useState<Record<string, KpiTarget>>({});

  useEffect(() => {
    if (targetsQ.data) {
      const map: Record<string, KpiTarget> = {};
      targetsQ.data.forEach(t => { map[t.id] = { ...t }; });
      setDrafts(map);
    }
  }, [targetsQ.data]);

  const usersQ = useQuery({
    queryKey: ["all_profiles_and_roles"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const [profiles, roles, perms] = await Promise.all([
        supabase.from("profiles").select("id,email,full_name"),
        supabase.from("user_roles").select("user_id,role"),
        (supabase.from as any)("page_permissions").select("user_id,page,can_view,can_edit"),
      ]);
      return {
        profiles: (profiles.data ?? []) as any[],
        roles: (roles.data ?? []) as any[],
        perms: (perms.data ?? []) as any[],
      };
    },
  });

  const logsQ = useQuery({
    queryKey: ["system_logs"],
    enabled: isSuperAdmin,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("system_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const requestsQ = useQuery({
    queryKey: ["edit_requests", isSuperAdmin ? "all" : user?.id],
    enabled: !!user,
    queryFn: async () => {
      const q = (supabase.from as any)("edit_requests").select("*").order("created_at", { ascending: false });
      const res = isSuperAdmin ? await q : await q.eq("requested_by", user!.id);
      return (res.data ?? []) as any[];
    },
  });

  const myPermsQ = useQuery({
    queryKey: ["my_page_perms", user?.id],
    enabled: !!user && !isSuperAdmin,
    queryFn: async () => ((await (supabase.from as any)("page_permissions").select("page,can_view,can_edit").eq("user_id", user!.id)).data ?? []) as any[],
  });

  const usersById = useMemo(() => {
    const m = new Map<string, { email: string; name: string; roles: string[]; perms: Record<string, { can_view: boolean; can_edit: boolean }> }>();
    for (const p of usersQ.data?.profiles ?? []) {
      m.set(p.id, { email: p.email ?? "", name: p.full_name ?? p.email ?? "Unknown", roles: [], perms: {} });
    }
    for (const r of usersQ.data?.roles ?? []) {
      const u = m.get(r.user_id); if (u) u.roles.push(r.role);
    }
    for (const pp of usersQ.data?.perms ?? []) {
      const u = m.get(pp.user_id); if (u) u.perms[pp.page] = { can_view: pp.can_view, can_edit: pp.can_edit };
    }
    return m;
  }, [usersQ.data]);

  const save = useMutation({
    mutationFn: async (t: KpiTarget) => {
      const patch = {
        label: t.label, owner: t.owner, cadence: t.cadence,
        unit: t.unit,
        green_min: t.green_min, yellow_min: t.yellow_min,
        target_display: t.target_display, direction: t.direction,
      };
      if (isSuperAdmin) {
        const { error } = await supabase.from("kpi_targets").update(patch).eq("id", t.id);
        if (error) throw error;
        return { direct: true };
      }
      // Non-super-admin: submit for approval
      const { error } = await (supabase.from as any)("edit_requests").insert({
        requested_by: user!.id,
        requested_by_name: user!.email,
        target_table: "kpi_targets",
        target_id: t.id,
        summary: `Update KPI "${t.label}"`,
        changes: patch,
      });
      if (error) throw error;
      return { direct: false };
    },
    onSuccess: (r) => {
      toast.success(r.direct ? "Saved" : "Submitted for super-admin approval");
      qc.invalidateQueries();
      if (!isSuperAdmin) setEditMode(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const togglePerm = useMutation({
    mutationFn: async ({ userId, page, field, value }: { userId: string; page: string; field: "can_view" | "can_edit"; value: boolean }) => {
      const existing = usersById.get(userId)?.perms[page];
      const row = {
        user_id: userId,
        page,
        can_view: field === "can_view" ? value : existing?.can_view ?? value,
        can_edit: field === "can_edit" ? value : value ? existing?.can_edit ?? false : false,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      };
      const { error } = await (supabase.from as any)("page_permissions").upsert(row, { onConflict: "user_id,page" });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["all_profiles_and_roles"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const setUserAccess = useMutation({
    mutationFn: async ({ userId, grant }: { userId: string; grant: boolean }) => {
      const rows = DEFAULT_PAGES.map((page) => ({
        user_id: userId,
        page,
        can_view: grant,
        can_edit: grant,
        updated_by: user?.id,
        updated_at: new Date().toISOString(),
      }));
      const { error } = await (supabase.from as any)("page_permissions").upsert(rows, { onConflict: "user_id,page" });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      toast.success(vars.grant ? "User approved with full access" : "User access blocked");
      qc.invalidateQueries({ queryKey: ["all_profiles_and_roles"] });
      qc.invalidateQueries({ queryKey: ["system_logs"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resolveRequest = useMutation({
    mutationFn: async ({ req, approve }: { req: any; approve: boolean }) => {
      if (approve) {
        if (req.target_table === "kpi_targets" && req.target_id) {
          const { error } = await supabase.from("kpi_targets").update(req.changes).eq("id", req.target_id);
          if (error) throw error;
        }
      }
      const { error } = await (supabase.from as any)("edit_requests").update({
        status: approve ? "approved" : "rejected",
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq("id", req.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => { toast.success(v.approve ? "Approved & applied" : "Rejected"); qc.invalidateQueries(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (loading) return null;
  if (!user) return <Navigate to="/auth" />;

  const pendingRequests = (requestsQ.data ?? []).filter((r) => r.status === "pending");
  const myRequests = (requestsQ.data ?? []);
  const canEditKpis = isSuperAdmin || editMode; // regular admin/user must turn edit mode on

  const statusPill = (s: string) => {
    const base = "text-[10px] uppercase tracking-wide px-2 py-0.5 rounded inline-flex items-center gap-1";
    if (s === "approved") return <span className={`${base} bg-success/15 text-success`}><CheckCircle2 className="w-3 h-3" />Approved</span>;
    if (s === "rejected") return <span className={`${base} bg-destructive/15 text-destructive`}><XCircle className="w-3 h-3" />Rejected</span>;
    return <span className={`${base} bg-warning/15 text-warning`}><Clock className="w-3 h-3" />Pending</span>;
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold flex items-center gap-2">
            {isSuperAdmin && <ShieldCheck className="w-6 h-6 text-primary" />}
            Settings
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSuperAdmin
              ? "Manage KPI targets, user access, and pending change requests."
              : "Turn on Edit mode to propose changes. All edits are sent to the super admin for approval."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild className="gap-2">
            <Link to="/settings/calculation-guide"><BookOpen className="w-4 h-4" />Calculation guide</Link>
          </Button>
          {!isSuperAdmin && (
            <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2">
              <PencilLine className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Edit mode</span>
              <Switch checked={editMode} onCheckedChange={setEditMode} />
            </div>
          )}
          </div>
      </header>

      {/* Non-super: My access + My change requests */}
      {!isSuperAdmin && (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <div className="px-6 py-4 border-b flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-primary" />
              <h2 className="font-display text-lg font-semibold">My page access</h2>
            </div>
            <div className="p-4">
              {myPermsQ.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading…</div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {DEFAULT_PAGES.filter((p) => p !== "settings" && p !== "support").map((p) => {
                    const explicit = myPermsQ.data?.find((r) => r.page === p);
                    const canV = explicit?.can_view ?? false;
                    const canE = explicit?.can_edit ?? false;
                    return (
                      <li key={p} className="flex items-center justify-between rounded border px-3 py-2">
                        <span className="font-medium">{PAGE_LABELS[p] ?? p}</span>
                        <span className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase px-2 py-0.5 rounded inline-flex items-center gap-1 ${canV ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                            <Eye className="w-3 h-3" />{canV ? "View" : "Hidden"}
                          </span>
                          <span className={`text-[10px] uppercase px-2 py-0.5 rounded inline-flex items-center gap-1 ${canE ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}>
                            <Edit3 className="w-3 h-3" />{canE ? "Edit" : "Pending"}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                "Pending" means edit access has not been granted yet. Ask the super admin to enable Edit for the pages you need.
              </p>
            </div>
          </Card>

          <Card>
            <div className="px-6 py-4 border-b flex items-center gap-2">
              <Send className="w-4 h-4 text-primary" />
              <h2 className="font-display text-lg font-semibold">My change requests</h2>
              <span className="text-xs text-muted-foreground">({myRequests.length})</span>
            </div>
            <div className="divide-y max-h-[420px] overflow-y-auto">
              {myRequests.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground text-center">
                  You haven't submitted any edits yet. Turn on Edit mode below and change a KPI to send a request.
                </div>
              )}
              {myRequests.map((r) => (
                <div key={r.id} className="p-4 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate">{r.summary ?? `${r.target_table} update`}</div>
                    {statusPill(r.status)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Submitted {new Date(r.created_at).toLocaleString()}
                    {r.reviewed_at && <> · Reviewed {new Date(r.reviewed_at).toLocaleString()}</>}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}



      {/* Super-admin approvals inbox */}
      {isSuperAdmin && pendingRequests.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-warning" />
            <h2 className="font-display text-lg font-semibold">Pending change requests</h2>
            <span className="text-xs text-muted-foreground">({pendingRequests.length})</span>
          </div>
          <div className="divide-y">
            {pendingRequests.map((r) => (
              <div key={r.id} className="p-4 flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.summary ?? `${r.target_table} update`}</div>
                  <div className="text-xs text-muted-foreground">
                    From <b>{r.requested_by_name ?? "Unknown"}</b> · {new Date(r.created_at).toLocaleString()}
                  </div>
                  <pre className="mt-1 text-xs bg-muted/50 rounded p-2 overflow-x-auto max-w-full">
                    {JSON.stringify(r.changes, null, 2)}
                  </pre>
                </div>
                <Button size="sm" variant="outline" onClick={() => resolveRequest.mutate({ req: r, approve: false })} disabled={resolveRequest.isPending}>
                  <X className="w-3.5 h-3.5 mr-1" />Reject
                </Button>
                <Button size="sm" onClick={() => resolveRequest.mutate({ req: r, approve: true })} disabled={resolveRequest.isPending}>
                  <Check className="w-3.5 h-3.5 mr-1" />Approve
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* KPI targets — gated by edit mode */}
      <Card>
        <div className="px-6 py-4 border-b flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">KPI Targets</h2>
          {!canEditKpis && (
            <span className="text-xs text-muted-foreground">Turn on Edit mode to make changes</span>
          )}
        </div>
        <div className="divide-y">
          {Object.values(drafts).map((t) => (
            <div key={t.id} className="p-6 grid md:grid-cols-6 gap-3 items-end">
              <div className="md:col-span-2 space-y-1.5">
                <Label>Metric</Label>
                <Input disabled={!canEditKpis} value={t.label} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...t, label: e.target.value } })} />
              </div>
              <div className="space-y-1.5"><Label>Owner</Label><Input disabled={!canEditKpis} value={t.owner ?? ""} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...t, owner: e.target.value } })} /></div>
              <div className="space-y-1.5"><Label>Green ≥/≤</Label><Input disabled={!canEditKpis} type="number" value={t.green_min} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...t, green_min: Number(e.target.value) } })} /></div>
              <div className="space-y-1.5"><Label>Yellow ≥/≤</Label><Input disabled={!canEditKpis} type="number" value={t.yellow_min} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...t, yellow_min: Number(e.target.value) } })} /></div>
              <div>
                <Button onClick={() => save.mutate(t)} disabled={save.isPending || !canEditKpis}>
                  {isSuperAdmin ? "Save" : <><Send className="w-3.5 h-3.5 mr-1" />Request</>}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Super-admin: users & page permissions */}
      {isSuperAdmin && (
        <Card>
          <div className="px-6 py-4 border-b">
            <h2 className="font-display text-lg font-semibold">Users & page access</h2>
            <p className="text-xs text-muted-foreground mt-1">New accounts start blocked. Approve company users, or block access to disconnect a user.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/70 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">User</th>
                  <th className="text-left px-4 py-3 font-medium">Role</th>
                  <th className="text-left px-4 py-3 font-medium">Access</th>
                  {DEFAULT_PAGES.filter((p) => p !== "settings" && p !== "support").map((p) => (
                    <th key={p} className="text-center px-2 py-3 font-medium">{PAGE_LABELS[p] ?? p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from(usersById.entries()).map(([uid, u]) => {
                  const isSuper = u.roles.includes("super_admin");
                  const hasAccess = DEFAULT_PAGES.some((page) => !!u.perms[page]?.can_view);
                  return (
                    <tr key={uid} className="border-t">
                      <td className="px-4 py-3">
                        <div className="font-medium">{u.name}</div>
                        <div className="text-xs text-muted-foreground">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs px-2 py-0.5 rounded ${isSuper ? "bg-primary/25 text-primary-foreground" : "bg-muted"}`}>
                          {isSuper ? "super admin" : u.roles.includes("admin") ? "admin" : "user"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {isSuper ? (
                          <span className="text-xs text-primary">always on</span>
                        ) : hasAccess ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => setUserAccess.mutate({ userId: uid, grant: false })}
                            disabled={setUserAccess.isPending}
                          >
                            <LockKeyhole className="w-3.5 h-3.5" />Block
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            className="gap-1.5"
                            onClick={() => setUserAccess.mutate({ userId: uid, grant: true })}
                            disabled={setUserAccess.isPending}
                          >
                            <UnlockKeyhole className="w-3.5 h-3.5" />Approve
                          </Button>
                        )}
                      </td>
                      {DEFAULT_PAGES.filter((p) => p !== "settings" && p !== "support").map((p) => {
                        const cur = u.perms[p] ?? { can_view: false, can_edit: false };
                        return (
                          <td key={p} className="px-2 py-3 text-center">
                            {isSuper ? (
                              <span className="text-xs text-primary">full</span>
                            ) : (
                              <div className="flex flex-col items-center gap-1">
                                <label className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                                  View
                                  <Switch
                                    checked={cur.can_view}
                                    onCheckedChange={(v) => togglePerm.mutate({ userId: uid, page: p, field: "can_view", value: v })}
                                  />
                                </label>
                                <label className="flex items-center gap-1 text-[10px] uppercase text-muted-foreground">
                                  Edit
                                  <Switch
                                    checked={cur.can_edit}
                                    onCheckedChange={(v) => togglePerm.mutate({ userId: uid, page: p, field: "can_edit", value: v })}
                                  />
                                </label>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
                {usersById.size === 0 && (
                  <tr><td colSpan={DEFAULT_PAGES.length + 1} className="text-center py-8 text-muted-foreground text-sm">No users yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {isSuperAdmin && (
        <Card>
          <div className="px-6 py-4 border-b flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            <div>
              <h2 className="font-display text-lg font-semibold">System logs</h2>
              <p className="text-xs text-muted-foreground">Uploads, deletes, and new account notifications.</p>
            </div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/70 text-xs uppercase text-muted-foreground sticky top-0">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">When</th>
                  <th className="text-left px-4 py-3 font-medium">Actor</th>
                  <th className="text-left px-4 py-3 font-medium">Action</th>
                  <th className="text-left px-4 py-3 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {(logsQ.data ?? []).map((log) => (
                  <tr key={log.id} className="border-t">
                    <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5">{log.actor_email ?? "System"}</td>
                    <td className="px-4 py-2.5">
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium uppercase">
                        {String(log.action ?? "").replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{log.summary ?? log.entity_type}</td>
                  </tr>
                ))}
                {!logsQ.isLoading && (logsQ.data ?? []).length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">No logs yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

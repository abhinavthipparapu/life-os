import { Button } from "@lifeos/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@lifeos/ui/components/dialog";
import { Input } from "@lifeos/ui/components/input";
import { Switch } from "@lifeos/ui/components/switch";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import type { Preferences } from "@/app/types";
import { Field, NativeSelect } from "@/components/common/forms";
import { ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { signOut } from "@/features/auth/session";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";

/** Proves presence by re-entering the password, which mints the fresh token the API requires. */
function ReauthDialog({ title, description, confirmLabel, requireWord, onConfirmed, onClose }: { title: string; description: string; confirmLabel: string; requireWord?: string; onConfirmed: () => Promise<void>; onClose: () => void }) {
  const { data: me } = api.useMeQuery();
  const [password, setPassword] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const { error: failure } = await supabase.auth.signInWithPassword({ email: me!.email, password });
    if (failure) {
      setError("That password is incorrect.");
      setBusy(false);
      return;
    }
    try {
      await onConfirmed();
      onClose();
    } catch (err) {
      setError(messageOf(err));
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
        <form onSubmit={(e) => void confirm(e)} className="space-y-3">
          <Field id="re-pass" label="Your password"><Input id="re-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {requireWord && <Field id="re-word" label={`Type ${requireWord} to confirm`}><Input id="re-word" value={word} onChange={(e) => setWord(e.target.value)} /></Field>}
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" variant={requireWord ? "destructive" : "default"} className="w-full" disabled={busy || !password || (requireWord ? word !== requireWord : false)}>{confirmLabel}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 text-sm">
      <span>{label}{hint && <span className="block text-xs text-ink-muted">{hint}</span>}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

async function downloadExport(id: string) {
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${env.VITE_API_URL}/api/v1/me/requests/${id}/download`, { headers: { Authorization: `Bearer ${data.session?.access_token}` } });
  if (!res.ok) throw new Error("Download failed");
  const { data: body } = (await res.json()) as { data: unknown };
  const url = URL.createObjectURL(new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "lifeos-export.json";
  a.click();
  URL.revokeObjectURL(url);
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = api.useMeQuery();
  const [updateProfile] = api.useUpdateProfileMutation();
  const [updatePrefs] = api.useUpdatePreferencesMutation();
  const { data: requests } = api.useAccountRequestsQuery(undefined, { pollingInterval: 15_000 });
  const [requestExport] = api.useRequestExportMutation();
  const [requestDeletion] = api.useRequestDeletionMutation();
  const [dialog, setDialog] = useState<"export" | "delete" | null>(null);
  const [name, setName] = useState<string>();
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;
  const prefs = data.preferences;
  const set = (patch: Partial<Preferences>) => void updatePrefs(patch).unwrap().catch((err: unknown) => toast.error(messageOf(err)));
  const exportRow = requests?.find((r) => r.kind === "export");
  const timezones = Intl.supportedValuesOf("timeZone");

  return (
    <>
      <PageHeader title="Settings" />
      <div className="space-y-4">
        <section aria-labelledby="account" className="card-surface space-y-4 p-4">
          <h2 id="account" className="font-semibold">Account</h2>
          <p className="text-sm text-ink-muted">{data.email}</p>
          <Field id="s-name" label="Display name">
            <div className="flex gap-2">
              <Input id="s-name" value={name ?? data.displayName ?? ""} onChange={(e) => setName(e.target.value)} />
              <Button variant="outline" onClick={() => name !== undefined && void updateProfile({ displayName: name || null })}>Save</Button>
            </div>
          </Field>
          <Field id="s-tz" label="Timezone" hint="Decides where your days begin and end.">
            <NativeSelect id="s-tz" value={data.timezone} onChange={(e) => void updateProfile({ timezone: e.target.value })}>
              {[...new Set([data.timezone, ...timezones])].map((t) => <option key={t}>{t}</option>)}
            </NativeSelect>
          </Field>
        </section>
        <section aria-labelledby="appearance" className="card-surface space-y-4 p-4">
          <h2 id="appearance" className="font-semibold">Appearance and motion</h2>
          <Field id="s-theme" label="Theme">
            <NativeSelect id="s-theme" value={prefs.theme} onChange={(e) => set({ theme: e.target.value as Preferences["theme"] })}>
              <option value="system">Match device</option><option value="light">Light</option><option value="dark">Dark</option>
            </NativeSelect>
          </Field>
          <Toggle label="Reduce motion" checked={prefs.reducedMotion} onChange={(v) => set({ reducedMotion: v })} />
          <Toggle label="Celebrations" hint="Confetti and milestone moments" checked={prefs.celebrations} onChange={(v) => set({ celebrations: v })} />
        </section>
        <section aria-labelledby="privacy" className="card-surface space-y-4 p-4">
          <h2 id="privacy" className="font-semibold">Privacy and AI</h2>
          <Toggle label="Allow sensitive data in AI" hint="Off by default. Includes health and medication records you marked as sensitive." checked={prefs.aiSensitiveOptIn} onChange={(v) => set({ aiSensitiveOptIn: v })} />
          <Toggle label="Weekly AI report" hint="A short summary in your inbox each Monday." checked={prefs.aiWeeklyReportOptIn} onChange={(v) => set({ aiWeeklyReportOptIn: v })} />
        </section>
        <section aria-labelledby="data" className="card-surface space-y-3 p-4">
          <h2 id="data" className="font-semibold">Your data</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDialog("export")}>Export my data</Button>
            {exportRow?.status === "completed" && <Button variant="outline" onClick={() => void downloadExport(exportRow.id).catch((e: Error) => toast.error(e.message))}>Download latest export</Button>}
          </div>
          {exportRow && exportRow.status !== "completed" && <p role="status" className="text-sm text-ink-muted">Your export is being prepared.</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void signOut().then(() => navigate("/login"))}>Sign out</Button>
            <Button variant="ghost" className="text-danger" onClick={() => setDialog("delete")}>Delete my account</Button>
          </div>
        </section>
      </div>
      {dialog === "export" && (
        <ReauthDialog title="Export your data" description="Enter your password to prepare a download of everything in your account." confirmLabel="Prepare export" onClose={() => setDialog(null)}
          onConfirmed={async () => { await requestExport().unwrap(); toast.success("Export requested"); }} />
      )}
      {dialog === "delete" && (
        <ReauthDialog title="Delete your account" description="This permanently removes your login, planners and history. It cannot be undone." confirmLabel="Delete my account" requireWord="DELETE" onClose={() => setDialog(null)}
          onConfirmed={async () => { await requestDeletion().unwrap(); navigate("/", { replace: true }); await signOut(); }} />
      )}
    </>
  );
}

import { Button } from "@lifeos/ui/components/button";
import { Input } from "@lifeos/ui/components/input";
import { Switch } from "@lifeos/ui/components/switch";
import { Bell } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import { Field } from "@/components/common/forms";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";

const toKey = (base64: string) => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
};

async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) throw new Error("This browser doesn't support notifications");
  if (!env.VITE_VAPID_PUBLIC_KEY) throw new Error("Push isn't configured for this environment yet");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Notification permission was not granted");
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(env.VITE_VAPID_PUBLIC_KEY) });
  const { data } = await supabase.auth.getSession();
  const res = await fetch(`${env.VITE_API_URL}/api/v1/push-subscriptions`, {
    method: "POST",
    headers: { "content-type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!res.ok) throw new Error("Could not register this device");
}

function Preferences() {
  const { data } = api.useMeQuery();
  const [update] = api.useUpdatePreferencesMutation();
  const prefs = data?.preferences;
  const [quiet, setQuiet] = useState<{ start?: string; end?: string }>({});
  if (!prefs) return null;
  const toggle = async (on: boolean) => {
    try {
      if (on) await enablePush();
      await update({ pushEnabled: on }).unwrap();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : messageOf(err));
    }
  };
  const start = quiet.start ?? prefs.quietHoursStart ?? "";
  const end = quiet.end ?? prefs.quietHoursEnd ?? "";
  return (
    <section aria-labelledby="delivery" className="card-surface space-y-4 p-4">
      <h2 id="delivery" className="font-semibold">Delivery</h2>
      <label className="flex items-center justify-between gap-3 text-sm">Push notifications on this device<Switch checked={prefs.pushEnabled} onCheckedChange={(v) => void toggle(v)} /></label>
      <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
        <Field id="q-start" label="Quiet hours start"><Input id="q-start" type="time" value={start} onChange={(e) => setQuiet({ ...quiet, start: e.target.value })} /></Field>
        <Field id="q-end" label="Quiet hours end"><Input id="q-end" type="time" value={end} onChange={(e) => setQuiet({ ...quiet, end: e.target.value })} /></Field>
        <Button variant="outline" onClick={() => void update({ quietHoursStart: start || null, quietHoursEnd: end || null })}>Save quiet hours</Button>
      </div>
      <p className="text-xs text-ink-muted">During quiet hours, reminders wait in your inbox without a push.</p>
    </section>
  );
}

export function NotificationsPage() {
  const { data, isLoading, error, refetch } = api.useNotificationsQuery();
  const [read] = api.useReadNotificationMutation();
  const [readAll] = api.useReadAllNotificationsMutation();
  const unread = data?.some((n) => !n.readAt);
  return (
    <>
      <PageHeader title="Notifications" actions={unread ? <Button variant="outline" onClick={() => void readAll()}>Mark all read</Button> : undefined} />
      <div className="space-y-4">
        {isLoading && <PageSkeleton />}
        {error && <ErrorState error={error} retry={() => void refetch()} />}
        {data?.length === 0 && <EmptyState icon={Bell} title="You're all caught up" description="Reminders and reports will appear here." />}
        <ul className="space-y-2">
          {data?.map((n) => (
            <li key={n.id} className="card-surface flex items-start gap-3 p-3">
              {!n.readAt && <span className="mt-2 size-2 shrink-0 rounded-full bg-primary"><span className="sr-only">Unread</span></span>}
              <div className="min-w-0 flex-1">
                <p className="font-medium">{n.link ? <Link className="hover:underline" to={n.link} onClick={() => void read(n.id)}>{n.title}</Link> : n.title}</p>
                <p className="text-sm whitespace-pre-wrap text-ink-muted">{n.body}</p>
              </div>
              {!n.readAt && <Button variant="ghost" size="sm" onClick={() => void read(n.id)}>Mark read</Button>}
            </li>
          ))}
        </ul>
        <Preferences />
      </div>
    </>
  );
}

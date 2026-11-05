import type { Session } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { api } from "@/app/api";
import { store } from "@/app/store";
import { PageSkeleton } from "@/components/common/states";
import { supabase } from "@/lib/supabase";
import { wipeLocalData } from "@/offline/db";

const SessionContext = createContext<{ session: Session | null; loading: boolean }>({
  session: null,
  loading: true,
});
export const useSession = () => useContext(SessionContext);

async function removePushSubscription(accessToken?: string) {
  const registration = await navigator.serviceWorker?.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const { env } = await import("@/lib/env");
  if (accessToken) {
    await fetch(`${env.VITE_API_URL}/api/v1/push-subscriptions`, {
      method: "DELETE",
      headers: { "content-type": "application/json", Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => undefined);
  }
  await subscription.unsubscribe();
}

/** Clears cached private data and the push subscription before the token is dropped (section 8). */
export async function signOut() {
  const { data } = await supabase.auth.getSession();
  await removePushSubscription(data.session?.access_token).catch(() => undefined);
  await wipeLocalData();
  store.dispatch(api.util.resetApiState());
  await supabase.auth.signOut();
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ session: Session | null; loading: boolean }>({
    session: null,
    loading: true,
  });
  useEffect(() => {
    void supabase.auth
      .getSession()
      .then(({ data }) => setState({ session: data.session, loading: false }));
    const { data } = supabase.auth.onAuthStateChange((_event, session) =>
      setState({ session, loading: false }),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}

export function RequireAuth() {
  const { session, loading } = useSession();
  const location = useLocation();
  if (loading)
    return (
      <div className="p-6">
        <PageSkeleton />
      </div>
    );
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

export function PublicOnly() {
  const { session, loading } = useSession();
  if (loading) return null;
  return session ? <Navigate to="/app" replace /> : <Outlet />;
}

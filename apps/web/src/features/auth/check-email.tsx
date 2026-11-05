import { Button } from "@lifeos/ui/components/button";
import { Input } from "@lifeos/ui/components/input";
import { Label } from "@lifeos/ui/components/label";
import { MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "./auth-layout";
import { useSession } from "./session";

const RESEND_COOLDOWN_SECONDS = 60;
const LOCAL_MAIL_SINK = "http://localhost:58025";

interface CheckEmailState {
  email?: string;
  /** Set when arriving straight from signup, because an email has only just been sent. */
  justSent?: boolean;
  /** Set when login was refused because the address is not confirmed yet. */
  unverified?: boolean;
}

export const verificationRedirect = () => `${window.location.origin}/verify-email`;

/** The step between signup and first login. It also serves unverified logins and expired links. */
export function CheckEmailPage() {
  const { session } = useSession();
  const navigate = useNavigate();
  const state = (useLocation().state ?? {}) as CheckEmailState;
  const [email, setEmail] = useState(state.email ?? "");
  const [cooldown, setCooldown] = useState(state.justSent ? RESEND_COOLDOWN_SECONDS : 0);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<{ kind: "sent" | "error"; text: string }>();

  // Confirming in another tab signs this browser in, so this tab can move on by itself.
  useEffect(() => {
    if (session) navigate("/app", { replace: true });
  }, [session, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const resend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!z.email().safeParse(email.trim()).success) {
      setStatus({ kind: "error", text: "Enter a valid email address." });
      return;
    }
    setSending(true);
    setStatus(undefined);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: verificationRedirect() },
    });
    setSending(false);
    if (error?.status === 429) {
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setStatus({ kind: "error", text: "Please wait a minute before asking for another email." });
      return;
    }
    // The same message either way, so this form cannot reveal which addresses are registered.
    setCooldown(RESEND_COOLDOWN_SECONDS);
    setStatus({
      kind: "sent",
      text: "If this address needs confirming, a new email is on its way.",
    });
  };

  return (
    <AuthLayout
      title="Verify your email"
      subtitle={
        state.unverified
          ? "Your account isn't active yet. Confirm your email to sign in."
          : undefined
      }
      footer={
        <>
          Already confirmed?{" "}
          <Link className="font-medium text-primary underline" to="/login">
            Sign in
          </Link>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl bg-primary-soft p-4">
          <MailCheck aria-hidden className="mt-0.5 size-5 shrink-0 text-primary" />
          <p className="min-w-0 text-sm">
            {state.email ? (
              <>
                We sent a confirmation link to <strong className="break-all">{state.email}</strong>.
              </>
            ) : (
              "Enter your email address and we'll send a new confirmation link."
            )}{" "}
            Open it to activate your account.
          </p>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-ink-muted">
          <li>The email can take a minute or two to arrive.</li>
          <li>Check your spam or junk folder.</li>
          <li>You can close this page. The link will still work.</li>
        </ul>
        {import.meta.env.DEV && (
          <p className="rounded-xl bg-reward-soft p-3 text-sm">
            Local development: emails go to the{" "}
            <a
              className="font-medium underline"
              href={LOCAL_MAIL_SINK}
              target="_blank"
              rel="noreferrer"
            >
              local mail inbox
            </a>
            , not your real inbox.
          </p>
        )}
        <form onSubmit={(e) => void resend(e)} noValidate className="space-y-3">
          {!state.email && (
            <div>
              <Label htmlFor="resend-email">Email</Label>
              <Input
                id="resend-email"
                type="email"
                autoComplete="email"
                className="mt-1.5"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          )}
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={sending || cooldown > 0}
          >
            {cooldown > 0 ? `Resend email in ${cooldown}s` : sending ? "Sending" : "Resend email"}
          </Button>
        </form>
        <p
          role="status"
          className={status?.kind === "error" ? "text-sm text-danger" : "text-sm text-ink-muted"}
        >
          {status?.text}
        </p>
      </div>
    </AuthLayout>
  );
}

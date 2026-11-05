import { Button } from "@lifeos/ui/components/button";
import { Input } from "@lifeos/ui/components/input";
import { useEffect, useState } from "react";
import { Field } from "@/components/common/forms";
import { supabase } from "@/lib/supabase";

type Step =
  | { kind: "loading" }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "verify"; factorId: string };

/** Admin access needs a second factor, so this is where an admin sets it up or proves it. */
export function MfaGate({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [error, setError] = useState<string>();

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.mfa.listFactors();
      const verified = data?.totp[0];
      if (verified) return setStep({ kind: "verify", factorId: verified.id });
      // An abandoned enrollment would block a new one, so clear it first.
      for (const factor of data?.all ?? [])
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      const { data: enrolled, error: failure } = await supabase.auth.mfa.enroll({
        factorType: "totp",
      });
      if (failure || !enrolled)
        return setError("Two-factor setup is unavailable. Please try again later.");
      setStep({
        kind: "enroll",
        factorId: enrolled.id,
        qr: enrolled.totp.qr_code,
        secret: enrolled.totp.secret,
      });
    })();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step.kind === "loading") return;
    setError(undefined);
    const { error: failure } = await supabase.auth.mfa.challengeAndVerify({
      factorId: step.factorId,
      code: code.trim(),
    });
    if (failure)
      return setError("That code didn't work. Check your authenticator app and try again.");
    onDone();
  };

  return (
    <section aria-labelledby="mfa" className="card-surface mx-auto max-w-md space-y-4 p-6">
      <h2 id="mfa" className="text-lg font-semibold">
        Two-factor authentication
      </h2>
      {step.kind === "enroll" && (
        <>
          <p className="text-sm text-ink-muted">
            Admin access requires a second factor. Scan this code with an authenticator app, or
            enter the key by hand.
          </p>
          <img
            src={step.qr}
            alt="QR code for your authenticator app"
            className="mx-auto size-44 rounded-lg bg-white p-2"
          />
          <p className="text-center font-mono text-xs break-all" data-testid="mfa-secret">
            {step.secret}
          </p>
        </>
      )}
      {step.kind === "verify" && (
        <p className="text-sm text-ink-muted">
          Enter the current code from your authenticator app.
        </p>
      )}
      {step.kind !== "loading" && (
        <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <Field id="mfa-code" label="Six digit code">
            <Input
              id="mfa-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
          <Button type="submit" className="w-full" disabled={code.trim().length < 6}>
            Verify
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

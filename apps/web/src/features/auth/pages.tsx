import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@lifeos/ui/components/button";
import { Input } from "@lifeos/ui/components/input";
import { Label } from "@lifeos/ui/components/label";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { z } from "zod";
import { FieldError } from "@/components/common/states";
import { supabase } from "@/lib/supabase";
import { AuthLayout } from "./auth-layout";
import { useSession } from "./session";

const email = z.email("Enter a valid email address");
const password = z.string().min(10, "Use at least 10 characters");
const credentials = z.object({ email, password });
type Credentials = z.infer<typeof credentials>;

function Field({
  id,
  label,
  error,
  ...props
}: { id: string; label: string; error?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className="mt-1.5"
        {...props}
      />
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

const origin = () => window.location.origin;

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string>();
  const form = useForm<Credentials>({
    resolver: zodResolver(
      credentials.extend({ password: z.string().min(1, "Enter your password") }),
    ),
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setError(undefined);
    const { error: failure } = await supabase.auth.signInWithPassword(values);
    if (failure) {
      // One message for every failure, so this form cannot be used to discover registered emails.
      setError(
        failure.code === "email_not_confirmed"
          ? "Please confirm your email first."
          : "Email or password is incorrect.",
      );
      return;
    }
    navigate((location.state as { from?: string } | null)?.from ?? "/app", { replace: true });
  });

  return (
    <AuthLayout
      title="Welcome back"
      footer={
        <>
          New here?{" "}
          <Link className="font-medium text-primary underline" to="/signup">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...form.register("email")}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...form.register("password")}
        />
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Signing in" : "Sign in"}
        </Button>
        <p className="text-center text-sm">
          <Link className="text-primary underline" to="/forgot-password">
            Forgot your password?
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export function SignupPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string>();
  const form = useForm<Credentials>({ resolver: zodResolver(credentials) });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    setError(undefined);
    const { error: failure } = await supabase.auth.signUp({
      ...values,
      options: { emailRedirectTo: `${origin()}/verify-email` },
    });
    if (failure && failure.status !== 422) {
      setError("We couldn't create your account. Please try again.");
      return;
    }
    setSent(true);
  });

  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="If this address can be registered, we've sent a confirmation link."
      >
        <Link className="text-sm font-medium text-primary underline" to="/login">
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      title="Create your account"
      subtitle="Your planners, your rules."
      footer={
        <>
          Already have an account?{" "}
          <Link className="font-medium text-primary underline" to="/login">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email?.message}
          {...form.register("email")}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          error={errors.password?.message}
          {...form.register("password")}
        />
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Creating account" : "Create account"}
        </Button>
        <p className="text-center text-xs text-ink-muted">
          By continuing you agree to the{" "}
          <Link className="underline" to="/terms">
            Terms
          </Link>{" "}
          and{" "}
          <Link className="underline" to="/privacy">
            Privacy Policy
          </Link>
          .
        </p>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const schema = z.object({ email });
  const form = useForm<{ email: string }>({ resolver: zodResolver(schema) });
  const submit = form.handleSubmit(async (values) => {
    await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: `${origin()}/reset-password`,
    });
    setSent(true); // Same outcome whether or not the account exists.
  });
  if (sent) {
    return (
      <AuthLayout
        title="Check your email"
        subtitle="If an account exists for that address, a reset link is on its way."
      >
        <Link className="text-sm font-medium text-primary underline" to="/login">
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      title="Reset your password"
      footer={
        <Link className="text-primary underline" to="/login">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={form.formState.errors.email?.message}
          {...form.register("email")}
        />
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          Send reset link
        </Button>
      </form>
    </AuthLayout>
  );
}

function linkError() {
  const params = new URLSearchParams(window.location.hash.slice(1));
  return params.get("error_description") ?? params.get("error");
}

export function ResetPasswordPage() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState<string>();
  const form = useForm<{ password: string }>({ resolver: zodResolver(z.object({ password })) });
  const submit = form.handleSubmit(async (values) => {
    const { error: failure } = await supabase.auth.updateUser(values);
    if (failure) return setError("We couldn't update your password. Please request a new link.");
    navigate("/app", { replace: true });
  });
  if (loading) return null;
  if (!session || linkError()) {
    return (
      <AuthLayout
        title="This link has expired"
        subtitle="Reset links work once and expire quickly."
      >
        <Link className="text-sm font-medium text-primary underline" to="/forgot-password">
          Request a new link
        </Link>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Choose a new password">
      <form onSubmit={submit} noValidate className="space-y-4">
        <Field
          id="password"
          label="New password"
          type="password"
          autoComplete="new-password"
          error={form.formState.errors.password?.message}
          {...form.register("password")}
        />
        {error && (
          <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}

export function VerifyEmailPage() {
  const { session, loading } = useSession();
  const navigate = useNavigate();
  useEffect(() => {
    if (session) navigate("/app", { replace: true });
  }, [session, navigate]);
  if (loading || session)
    return (
      <AuthLayout title="Confirming your email">
        <p className="text-sm text-ink-muted">One moment.</p>
      </AuthLayout>
    );
  return (
    <AuthLayout
      title="This link is invalid or has expired"
      subtitle={linkError() ?? "Try signing in, or sign up again for a new link."}
    >
      <Link className="text-sm font-medium text-primary underline" to="/login">
        Go to sign in
      </Link>
    </AuthLayout>
  );
}

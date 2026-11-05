import { Button } from "@lifeos/ui/components/button";
import { Skeleton } from "@lifeos/ui/components/skeleton";
import { CloudOff, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { messageOf } from "@/app/api";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-3">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-20 w-full rounded-2xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="card-surface flex flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid size-14 place-items-center rounded-full bg-primary-soft">
        <Icon aria-hidden className="size-6 text-primary" />
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const offline = (error as { status?: number } | undefined)?.status === 0;
  return (
    <div role="alert" className="card-surface flex flex-col items-center px-6 py-10 text-center">
      {offline && <CloudOff aria-hidden className="mb-3 size-6 text-ink-muted" />}
      <h2 className="text-lg font-semibold">
        {offline ? "This page needs a connection" : "Something went wrong"}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {offline ? "Today's tasks still work offline." : messageOf(error)}
      </p>
      {retry && (
        <Button variant="outline" className="mt-4" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-danger">
      {message}
    </p>
  );
}

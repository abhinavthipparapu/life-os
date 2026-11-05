import { Label } from "@lifeos/ui/components/label";
import { cn } from "@lifeos/ui/lib/utils";
import type { ComponentProps, ReactNode } from "react";

/** Native select: reliable on mobile and fully keyboard accessible without extra code. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn("h-11 w-full rounded-lg border border-input bg-surface px-3 text-base text-ink md:text-sm", className)}
      {...props}
    />
  );
}

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

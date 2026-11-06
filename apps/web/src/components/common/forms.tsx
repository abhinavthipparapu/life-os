import { Input } from "@lifeos/ui/components/input";
import { Label } from "@lifeos/ui/components/label";
import { cn } from "@lifeos/ui/lib/utils";
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { toast } from "sonner";
import { messageOf } from "@/app/api";

/** Native select: reliable on mobile and fully keyboard accessible without extra code. */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-lg border border-input bg-surface px-3 text-base text-ink md:text-sm",
        className,
      )}
      {...props}
    />
  );
}

export function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1.5">{children}</div>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}

/** A name that saves when you leave the field. Blank or unchanged text saves nothing. */
export function EditableName({
  value,
  label,
  onSave,
  className,
}: {
  value: string;
  label: string;
  onSave: (next: string) => Promise<unknown>;
  className?: string;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const save = () => {
    const next = text.trim();
    if (!next || next === value) return setText(value);
    onSave(next).catch((err: unknown) => {
      setText(value);
      toast.error(messageOf(err));
    });
  };
  return (
    <Input
      aria-label={label}
      value={text}
      className={className}
      onChange={(e) => setText(e.target.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}

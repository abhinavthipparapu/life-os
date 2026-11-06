import { Button } from "@lifeos/ui/components/button";
import { Input } from "@lifeos/ui/components/input";
import { cn } from "@lifeos/ui/lib/utils";
import { Check, Moon, SkipForward, Undo2 } from "lucide-react";
import { motion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import type { Occurrence } from "@/app/types";
import { CompletionPulse, haptic, StrikeText } from "@/components/experience/completion-pulse";
import { formatTime } from "@/lib/dates";
import { actOnOccurrence } from "@/offline/use-sync";

const LABEL: Record<Occurrence["status"], string> = {
  pending: "",
  completed: "Done",
  skipped: "Skipped",
  rest: "Rest",
  not_applicable: "Moved",
};

export function TaskCompletionControl({
  occurrence,
  value,
}: {
  occurrence: Occurrence;
  value?: number;
}) {
  const done = occurrence.status === "completed";
  const toggle = async () => {
    if (done) {
      await actOnOccurrence(occurrence, "reopen");
      return;
    }
    haptic();
    await actOnOccurrence(occurrence, "complete", value === undefined ? {} : { value });
    toast("Marked done", {
      duration: 8000,
      action: {
        label: "Undo",
        onClick: () =>
          void actOnOccurrence({ id: occurrence.id, version: occurrence.version + 1 }, "reopen"),
      },
    });
  };
  return (
    <CompletionPulse active={done}>
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${occurrence.task.title}: ${done ? "done" : "not done"}`}
        onClick={() => void toggle()}
        className={cn(
          "tactile grid size-11 place-items-center rounded-full border-2 transition-colors",
          done ? "border-primary bg-primary text-primary-foreground" : "border-input bg-surface",
        )}
      >
        {done && (
          <motion.span
            initial={{ scale: 0, rotate: -25 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
          >
            <Check aria-hidden className="size-5" />
          </motion.span>
        )}
      </button>
    </CompletionPulse>
  );
}

export function OccurrenceCard({
  occurrence,
  timezone,
  pending,
}: {
  occurrence: Occurrence;
  timezone: string;
  pending: boolean;
}) {
  const { task, status } = occurrence;
  const [value, setValue] = useState("");
  const open = status === "pending";
  const measured = task.type === "quantity" || task.type === "duration" || task.type === "rating";

  return (
    <li
      className={cn(
        "card-surface flex items-center gap-3 p-3",
        !open && status !== "completed" && "opacity-70",
      )}
    >
      <TaskCompletionControl
        occurrence={occurrence}
        value={value === "" ? undefined : Number(value)}
      />
      <div className="min-w-0 flex-1">
        <Link to={`/app/tasks/${task.id}`} className="block truncate font-medium hover:underline">
          <StrikeText done={status === "completed"}>{task.title}</StrikeText>
        </Link>
        <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
          <span className="inline-flex items-center gap-1">
            <span
              aria-hidden
              className="size-2 rounded-full"
              style={{ background: task.planner.color }}
            />
            {task.planner.name}
          </span>
          {occurrence.scheduledAt && <span>{formatTime(occurrence.scheduledAt, timezone)}</span>}
          {task.targetValue !== null && (
            <span>
              Target {task.targetValue} {task.targetUnit}
            </span>
          )}
          {LABEL[status] && <span>{LABEL[status]}</span>}
          {pending && <span className="font-medium text-ink">Pending sync</span>}
        </p>
      </div>
      {measured && open && (
        <Input
          aria-label={`Value for ${task.title}`}
          inputMode="decimal"
          type="number"
          className="w-20"
          placeholder={task.targetUnit ?? "Value"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}
      {open ? (
        <div className="flex">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Skip ${task.title}`}
            onClick={() =>
              void actOnOccurrence(occurrence, "skip", { reason: "Skipped from Today" })
            }
          >
            <SkipForward aria-hidden className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Mark ${task.title} as a rest day`}
            onClick={() =>
              void actOnOccurrence(occurrence, "skip", { reason: "Rest day", kind: "rest" })
            }
          >
            <Moon aria-hidden className="size-4" />
          </Button>
        </div>
      ) : status !== "completed" && status !== "not_applicable" ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Undo ${task.title}`}
          onClick={() => void actOnOccurrence(occurrence, "reopen")}
        >
          <Undo2 aria-hidden className="size-4" />
        </Button>
      ) : null}
    </li>
  );
}

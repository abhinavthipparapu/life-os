import { animate, createScope, createTimeline, type Scope } from "animejs";
import { PartyPopper } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { useExperience } from "./reduced-motion";

const COLORS = ["#1FAD82", "#7468E8", "#F2B84A"];
const MAX_PARTICLES = 28;

/** Daily milestone. Anime.js owns these particles alone and is reverted on unmount. */
export function ConfettiBurst({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const scope = useRef<Scope | null>(null);
  const { reduced } = useExperience();
  const particles = useMemo(
    () =>
      Array.from({ length: MAX_PARTICLES }, (_, i) => ({
        x: (Math.random() - 0.5) * 520,
        y: -120 - Math.random() * 320,
        rotate: (Math.random() - 0.5) * 540,
        color: COLORS[i % COLORS.length],
      })),
    [],
  );

  useEffect(() => {
    if (reduced) {
      onDone();
      return;
    }
    scope.current = createScope({ root }).add(() => {
      animate(".particle", {
        translateX: (_target, i) => particles[i ?? 0]!.x,
        translateY: (_target, i) => particles[i ?? 0]!.y,
        rotate: (_target, i) => particles[i ?? 0]!.rotate,
        opacity: [1, 0],
        duration: 1000,
        ease: "out(3)",
        onComplete: onDone,
      });
    });
    return () => scope.current?.revert();
  }, [reduced, onDone, particles]);

  if (reduced) return null;
  return (
    <div ref={root} aria-hidden className="pointer-events-none fixed inset-x-0 bottom-1/3 z-50 flex justify-center">
      {particles.map((p, i) => (
        <span key={i} className="particle absolute size-2.5 rounded-sm" style={{ background: p.color }} />
      ))}
    </div>
  );
}

/** Planner completion. Plays once, and shows the same message as a static dialog under reduced motion. */
export function PlannerHero({ name, onClose }: { name: string; onClose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const scope = useRef<Scope | null>(null);
  const { reduced } = useExperience();

  useEffect(() => {
    if (reduced) return;
    scope.current = createScope({ root }).add(() => {
      createTimeline()
        .add(".hero-card", { opacity: [0, 1], scale: [0.9, 1], duration: 320, ease: "out(3)" })
        .add(".hero-icon", { rotate: [-12, 0], scale: [0.6, 1], duration: 420, ease: "outBack" }, "-=160");
    });
    return () => scope.current?.revert();
  }, [reduced]);

  return (
    <div ref={root} role="dialog" aria-modal="true" aria-label="Planner complete" className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div className="hero-card card-surface w-full max-w-sm p-8 text-center">
        <div className="hero-icon mx-auto mb-4 grid size-16 place-items-center rounded-full bg-reward-soft">
          <PartyPopper aria-hidden className="size-8 text-ink" />
        </div>
        <h2 className="text-2xl font-semibold">Planner complete</h2>
        <p className="mt-2 text-ink-muted">You finished everything in {name}.</p>
        <button autoFocus onClick={onClose} className="tactile mt-6 min-h-11 w-full rounded-xl bg-primary px-4 font-medium text-primary-foreground">
          Wonderful
        </button>
      </div>
    </div>
  );
}

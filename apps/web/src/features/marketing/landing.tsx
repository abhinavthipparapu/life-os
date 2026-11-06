import { Button } from "@lifeos/ui/components/button";
import { cn } from "@lifeos/ui/lib/utils";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Briefcase,
  Check,
  CloudOff,
  Flame,
  HeartPulse,
  Home,
  ListChecks,
  ListTree,
  Lock,
  PenLine,
  RotateCcw,
  Sparkles,
  Trophy,
} from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { useCallback, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CompletionPulse, StrikeText } from "@/components/experience/completion-pulse";
import { ConfettiBurst } from "@/components/experience/confetti-burst";
import { ProductClip } from "./clip";
import { CHAPTERS, Journey } from "./journey";
import { usePageMeta } from "./meta";

const STORY = ["build", "today", "offline", "insights"];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2 font-semibold">
      <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
        <Check aria-hidden className="size-5" />
      </span>
      LifeOS
    </Link>
  );
}

function SiteShell({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b bg-canvas/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Logo />
          <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" className="hidden sm:inline-flex" asChild>
              <Link to="/how-it-works">How it works</Link>
            </Button>
            <Button variant="ghost" asChild>
              <Link to="/login">Sign in</Link>
            </Button>
            <Button asChild>
              <Link to="/signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4">{children}</main>
      <footer className="mt-8 border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-muted">
          <Logo />
          <nav aria-label="Footer" className="flex gap-4">
            <Link className="underline" to="/how-it-works">
              How it works
            </Link>
            <Link className="underline" to="/privacy">
              Privacy
            </Link>
            <Link className="underline" to="/terms">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </>
  );
}

function FloatingNote({
  icon: Icon,
  children,
  className,
  delay,
}: {
  icon: typeof Flame;
  children: ReactNode;
  className: string;
  delay: number;
}) {
  const still = useReducedMotion();
  return (
    <motion.div
      aria-hidden
      className={cn(
        "absolute z-10 hidden items-center gap-2 rounded-xl border bg-surface px-3 py-2 text-sm font-medium shadow-e2 md:flex",
        className,
      )}
      animate={still ? undefined : { y: [0, -7, 0] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <Icon aria-hidden className="size-4 text-primary" />
      {children}
    </motion.div>
  );
}

function Hero() {
  return (
    <section className="relative grid items-center gap-10 py-12 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 right-0 -z-10 size-[28rem] rounded-full bg-primary-soft opacity-70 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 -left-24 -z-10 size-80 rounded-full bg-reward-soft opacity-70 blur-3xl"
      />
      <div>
        <p className="inline-flex items-center gap-2 rounded-full border bg-surface px-3 py-1 text-sm font-medium">
          <Sparkles aria-hidden className="size-4 text-primary" />
          Your whole life, in one planner
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
          Plan your life your way, and actually stick to it
        </h1>
        <p className="mt-4 text-lg text-ink-muted">
          Build plans for health, study, work or home. Tick things off each day, and watch your real
          progress grow, on any device, even offline.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="lg" asChild>
            <Link to="/signup">
              Create your free account
              <ArrowRight aria-hidden className="size-4" />
            </Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="#try-it">Try it first</a>
          </Button>
        </div>
      </div>
      <div className="relative">
        <FloatingNote icon={Flame} className="-top-4 -left-4" delay={0}>
          Build your streak
        </FloatingNote>
        <FloatingNote icon={Trophy} className="-right-3 -bottom-4" delay={1.2}>
          Celebrate perfect days
        </FloatingNote>
        <ProductClip
          clip="today"
          title="Today page"
          alt="Ticking off every task on the Today page until the day is complete."
          eager
        />
      </div>
    </section>
  );
}

const SAMPLE_TASKS = ["Go for a morning walk", "Read 20 pages", "Drink 2 litres of water"];

/** The real tick, strike line and confetti from the app, with nothing to sign up for. */
function TryIt() {
  const still = useReducedMotion();
  const [done, setDone] = useState<boolean[]>(SAMPLE_TASKS.map(() => false));
  const [burst, setBurst] = useState(false);
  const count = done.filter(Boolean).length;
  const finished = count === SAMPLE_TASKS.length;
  const endBurst = useCallback(() => setBurst(false), []);

  const toggle = (index: number) => {
    const next = done.map((value, i) => (i === index ? !value : value));
    setDone(next);
    if (next.every(Boolean) && !still) setBurst(true);
  };

  return (
    <section id="try-it" aria-labelledby="try-heading" className="scroll-mt-20 py-12">
      <div className="card-surface grid items-center gap-8 p-6 sm:p-10 md:grid-cols-2">
        <div>
          <p className="text-sm font-medium text-primary">No signup needed</p>
          <h2 id="try-heading" className="mt-1 text-3xl font-semibold tracking-tight">
            Go on, tick something off
          </h2>
          <p className="mt-2 text-ink-muted">
            This is how every day feels in LifeOS. Small wins you can see. Try finishing this list.
          </p>
        </div>
        <div className="rounded-2xl border bg-canvas p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="font-medium">Today</p>
            <p aria-live="polite" className="text-sm text-ink-muted">
              {count} of {SAMPLE_TASKS.length} done
            </p>
          </div>
          <div aria-hidden className="mb-3 h-2 overflow-hidden rounded-full bg-surface-2">
            <motion.div
              className="h-full rounded-full bg-primary"
              initial={false}
              animate={{ width: `${(count / SAMPLE_TASKS.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <ul className="space-y-2">
            {SAMPLE_TASKS.map((task, i) => (
              <li key={task} className="flex items-center gap-3 rounded-xl border bg-surface p-2">
                <CompletionPulse active={done[i]!}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={done[i]}
                    aria-label={task}
                    onClick={() => toggle(i)}
                    className={cn(
                      "tactile grid size-11 place-items-center rounded-full border-2 transition-colors",
                      done[i]
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-input bg-surface",
                    )}
                  >
                    {done[i] && <Check aria-hidden className="size-5" />}
                  </button>
                </CompletionPulse>
                <span className="min-w-0 font-medium">
                  <StrikeText done={done[i]!}>{task}</StrikeText>
                </span>
              </li>
            ))}
          </ul>
          {finished && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-reward-soft p-3">
              <p className="font-medium">That's a perfect day. Imagine a month of them.</p>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Start the list again"
                  onClick={() => setDone(SAMPLE_TASKS.map(() => false))}
                >
                  <RotateCcw aria-hidden className="size-4" />
                </Button>
                <Button size="sm" asChild>
                  <Link to="/signup">Start for real</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
      {burst && <ConfettiBurst onDone={endBurst} />}
    </section>
  );
}

const STEPS = [
  { icon: ListChecks, title: "Plan", body: "Make planners for anything, your way." },
  { icon: Check, title: "Do", body: "Open Today and tick things off." },
  { icon: BarChart3, title: "See progress", body: "Watch your streaks and numbers grow." },
];

function HowItWorks() {
  return (
    <section aria-label="How LifeOS works in three steps" className="py-6">
      <ol className="grid gap-4 sm:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary-soft">
              <Icon aria-hidden className="size-5 text-primary" />
            </span>
            <div>
              <h2 className="font-semibold">
                {i + 1}. {title}
              </h2>
              <p className="text-sm text-ink-muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const AUDIENCES = [
  {
    icon: BookOpen,
    title: "Students",
    body: "Study plans, revision schedules and exam countdowns.",
  },
  {
    icon: HeartPulse,
    title: "Health and fitness",
    body: "Workouts, water, sleep and habits you track.",
  },
  { icon: Briefcase, title: "Careers", body: "Skills to learn, deep work and goals to hit." },
  { icon: Home, title: "Home and family", body: "Routines, chores and everything in between." },
];

function WhoItsFor() {
  return (
    <section aria-labelledby="who" className="py-12">
      <h2 id="who" className="text-center text-3xl font-semibold tracking-tight">
        Whatever you're working on
      </h2>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AUDIENCES.map(({ icon: Icon, title, body }) => (
          <li key={title} className="card-surface p-5 transition-shadow hover:shadow-e3">
            <Icon aria-hidden className="size-6 text-primary" />
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-1 text-sm text-ink-muted">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MiniHeatmap() {
  // A fixed decorative pattern, not user data.
  const levels = [
    1, 3, 2, 4, 4, 2, 0, 3, 4, 4, 1, 3, 4, 2, 2, 4, 3, 4, 4, 0, 3, 4, 1, 4, 3, 2, 4, 4,
  ];
  return (
    <div aria-hidden className="mt-4 grid w-fit grid-flow-col grid-rows-4 gap-1">
      {levels.map((level, i) => (
        <span
          key={i}
          className="size-3.5 rounded-sm bg-primary"
          style={{ opacity: level === 0 ? 0.1 : level / 4 }}
        />
      ))}
    </div>
  );
}

function MiniTree() {
  return (
    <ul aria-hidden className="mt-4 space-y-1.5 text-sm">
      <li className="flex items-center gap-2">
        <span className="size-3 rounded-full bg-primary" /> Get fit
      </li>
      <li className="ml-5 flex items-center gap-2 text-ink-muted">
        <span className="size-2.5 rounded-full border-2 border-primary" /> Morning run
      </li>
      <li className="ml-10 flex items-center gap-2 text-ink-muted">
        <span className="size-2 rounded-full border-2 border-primary" /> Stretch after
      </li>
    </ul>
  );
}

function Tile({
  icon: Icon,
  title,
  body,
  className,
  children,
}: {
  icon: typeof Lock;
  title: string;
  body: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <li className={cn("card-surface p-6", className)}>
      <Icon aria-hidden className="size-6 text-primary" />
      <h3 className="mt-3 text-lg font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-ink-muted">{body}</p>
      {children}
    </li>
  );
}

function Features() {
  return (
    <section aria-labelledby="features" className="py-12">
      <h2 id="features" className="text-center text-3xl font-semibold tracking-tight">
        Everything you need, nothing forced on you
      </h2>
      <ul className="mt-8 grid gap-4 md:grid-cols-3">
        <Tile
          icon={ListTree}
          title="Plans that fit you"
          body="Unlimited planners, nested tasks and your own custom fields."
          className="md:col-span-2"
        >
          <MiniTree />
        </Tile>
        <Tile
          icon={Sparkles}
          title="AI that asks first"
          body="Describe a goal and review the draft. Nothing changes until you approve."
        />
        <Tile
          icon={CloudOff}
          title="Works offline"
          body="Tick things off anywhere. Everything syncs when you're back."
        />
        <Tile
          icon={BarChart3}
          title="Honest progress"
          body="Clear numbers and your own dashboards. Rest days never count against you."
          className="md:col-span-2"
        >
          <MiniHeatmap />
        </Tile>
        <Tile
          icon={Lock}
          title="Private by default"
          body="Only you can see your data, and health records stay out of AI unless you opt in."
        />
        <Tile
          icon={PenLine}
          title="Start in seconds"
          body="Use a ready-made template, then change anything you like."
          className="md:col-span-2"
        />
      </ul>
    </section>
  );
}

const QUESTIONS = [
  {
    q: "Does it work on my phone?",
    a: "Yes. It runs in your browser on any device, and you can add it to your home screen like an app.",
  },
  {
    q: "What happens when I'm offline?",
    a: "You can still see today's tasks and tick, skip or undo them. Your changes sync when you reconnect.",
  },
  {
    q: "Who can see my data?",
    a: "Only you. You can export everything or delete your account at any time from Settings.",
  },
  {
    q: "Do I have to use the AI?",
    a: "No. It's optional, and it never changes anything until you approve it.",
  },
];

function Faq() {
  return (
    <section aria-labelledby="faq" className="mx-auto max-w-2xl py-12">
      <h2 id="faq" className="text-center text-3xl font-semibold tracking-tight">
        Good questions
      </h2>
      <div className="mt-6 space-y-2">
        {QUESTIONS.map(({ q, a }) => (
          <details key={q} className="card-surface group p-4">
            <summary className="min-h-6 cursor-pointer font-medium">{q}</summary>
            <p className="mt-2 text-sm text-ink-muted">{a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function FinalCall() {
  return (
    <section className="my-12 rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground">
      <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Your journey starts with one tick
      </h2>
      <p className="mx-auto mt-2 max-w-md opacity-90">
        Set up your first planner in a couple of minutes.
      </p>
      <Button size="lg" variant="secondary" className="mt-6" asChild>
        <Link to="/signup">
          Start yours today
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      </Button>
    </section>
  );
}

export function LandingPage() {
  usePageMeta(
    "LifeOS: plan your life your way",
    "Build plans for health, study, work or home. Tick things off each day and see real progress, even offline.",
  );
  return (
    <SiteShell>
      <Hero />
      <HowItWorks />
      <TryIt />
      <Journey
        chapters={CHAPTERS.filter((c) => STORY.includes(c.clip))}
        title="See how it fits into your life"
        subtitle="One person, one plan, a few weeks of showing up."
      />
      <WhoItsFor />
      <Features />
      <Faq />
      <FinalCall />
    </SiteShell>
  );
}

export function HowItWorksPage() {
  usePageMeta(
    "How LifeOS works",
    "A step by step look at LifeOS, from signing up to seeing your progress.",
  );
  return (
    <SiteShell>
      <div className="pt-10">
        <Journey
          chapters={CHAPTERS}
          title="How LifeOS works"
          subtitle="Every step, from your first minute to your first month."
        />
      </div>
      <FinalCall />
    </SiteShell>
  );
}

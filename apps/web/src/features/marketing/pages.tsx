import { Button } from "@lifeos/ui/components/button";
import {
  BarChart3,
  Check,
  CloudOff,
  LayoutTemplate,
  ListTree,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

const FEATURES = [
  {
    icon: ListTree,
    title: "Plans that fit you",
    body: "Unlimited categories, planners, nested tasks and custom fields. Nothing is hardcoded.",
  },
  {
    icon: LayoutTemplate,
    title: "Start from a template",
    body: "Health, career and lifestyle starters become your own editable copy.",
  },
  {
    icon: Sparkles,
    title: "AI that asks first",
    body: "Describe a plan and review the draft. Nothing changes until you approve it.",
  },
  {
    icon: BarChart3,
    title: "Honest analytics",
    body: "Build your own dashboards from numbers calculated exactly, with clear definitions.",
  },
  {
    icon: CloudOff,
    title: "Works offline",
    body: "Check things off anywhere. Changes sync when you're back online.",
  },
];

const EXAMPLES = ["Healthy routine", "Career growth", "Balanced lifestyle"];

function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  }, [title, description]);
}

const GUIDE = [
  {
    clip: "signup",
    title: "Create your account",
    text: "Sign up, confirm your email, and you're in. It takes about a minute.",
    alt: "Filling in the signup form, seeing the verify email screen, then arriving at the home page.",
  },
  {
    clip: "build",
    title: "Build a planner your way",
    text: "Add tasks, nest them, and schedule them for the days that suit you.",
    alt: "Creating a planner, adding a task and scheduling it for Saturdays.",
  },
  {
    clip: "template",
    title: "Or start from a template",
    text: "Preview a ready-made plan, then make it your own editable copy.",
    alt: "Previewing the Career growth template and installing it as a planner.",
  },
  {
    clip: "ai",
    title: "Let AI draft a plan",
    text: "Describe what you want. Nothing is created until you approve it. Example shown.",
    alt: "Typing a request, reviewing a draft study plan, then approving it.",
  },
  {
    clip: "today",
    title: "Tick off your day",
    text: "Everything due today in one place, with a small celebration when you finish.",
    alt: "Ticking off tasks on the Today page until the day is complete.",
  },
  {
    clip: "offline",
    title: "Keep going offline",
    text: "No signal? Tick things off anyway. Changes sync when you're back online.",
    alt: "Completing a task while offline, then watching it sync on reconnecting.",
  },
  {
    clip: "insights",
    title: "See your real progress",
    text: "Clear adherence numbers, a six-month activity view and your own dashboards.",
    alt: "Scrolling through analytics charts and a personal dashboard.",
  },
];

/** Moving images autoplay only if the visitor allows motion, and can always be paused. */
function GuideClip({ clip, title, alt }: { clip: string; title: string; alt: string }) {
  const [paused, setPaused] = useState(false);
  return (
    <div className="relative">
      <picture>
        {!paused && (
          <source media="(prefers-reduced-motion: no-preference)" srcSet={`/guide/${clip}.gif`} />
        )}
        <img
          src={`/guide/${clip}.png`}
          alt={alt}
          width={800}
          height={500}
          loading="lazy"
          className="h-auto w-full rounded-xl border"
        />
      </picture>
      <Button
        variant="outline"
        size="sm"
        className="absolute right-2 bottom-2 bg-surface motion-reduce:hidden"
        aria-label={`${paused ? "Play" : "Pause"} ${title}`}
        onClick={() => setPaused(!paused)}
      >
        {paused ? (
          <Play aria-hidden className="size-4" />
        ) : (
          <Pause aria-hidden className="size-4" />
        )}
      </Button>
    </div>
  );
}

export function LandingPage() {
  usePageMeta(
    "LifeOS: plan your life your way",
    "Build your own planners, track what matters and see real progress. Works offline.",
  );
  return (
    <div className="mx-auto max-w-5xl px-4">
      <header className="flex h-16 items-center justify-between">
        <span className="flex items-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
            <Check aria-hidden className="size-5" />
          </span>
          LifeOS
        </span>
        <nav aria-label="Account" className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link to="/login">Sign in</Link>
          </Button>
          <Button asChild>
            <Link to="/signup">Get started</Link>
          </Button>
        </nav>
      </header>
      <main>
        <section className="py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
            A planner shaped around your life, not the other way round
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-muted">
            Design planners for anything, track what you do, and see honest progress on any device.
          </p>
          <Button size="lg" className="mt-8" asChild>
            <Link to="/signup">Create your free account</Link>
          </Button>
        </section>
        <section aria-label="Features" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card-surface p-5">
              <Icon aria-hidden className="mb-3 size-6 text-primary" />
              <h2 className="font-semibold">{title}</h2>
              <p className="mt-1 text-sm text-ink-muted">{body}</p>
            </div>
          ))}
        </section>
        <section aria-labelledby="how-it-works" className="pt-16">
          <h2 id="how-it-works" className="text-center text-2xl font-semibold">
            See how it works
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-2">
            {GUIDE.map((step, i) => (
              <li key={step.clip} className="card-surface flex flex-col gap-3 p-4">
                <GuideClip clip={step.clip} title={step.title} alt={step.alt} />
                <div>
                  <h3 className="font-semibold">
                    {i + 1}. {step.title}
                  </h3>
                  <p className="mt-1 text-sm text-ink-muted">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>
        <section className="py-16 text-center">
          <h2 className="text-2xl font-semibold">Start from an example</h2>
          <ul className="mt-4 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((e) => (
              <li key={e} className="rounded-full border bg-surface px-4 py-2 text-sm">
                {e}
              </li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="flex justify-center gap-4 border-t py-6 text-sm text-ink-muted">
        <Link className="underline" to="/privacy">
          Privacy
        </Link>
        <Link className="underline" to="/terms">
          Terms
        </Link>
      </footer>
    </div>
  );
}

function Legal({ title, children }: { title: string; children: ReactNode }) {
  usePageMeta(`${title} | LifeOS`, `LifeOS ${title}`);
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-12">
      <Link to="/" className="text-sm text-primary underline">
        Back to LifeOS
      </Link>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p role="note" className="rounded-lg bg-reward-soft p-3 text-sm">
        Draft: this text must be reviewed by a qualified lawyer before public launch.
      </p>
      {children}
    </main>
  );
}

export function PrivacyPage() {
  return (
    <Legal title="Privacy Policy">
      <p>
        LifeOS stores the planners, tasks and metrics you create so that you can use them across
        your devices. Your data is visible only to you.
      </p>
      <p>
        Health and other sensitive records are optional. They are excluded from AI features unless
        you turn that on in Settings.
      </p>
      <p>
        You can export your data or delete your account at any time from Settings. Deleting your
        account removes your login and your data.
      </p>
    </Legal>
  );
}

export function TermsPage() {
  return (
    <Legal title="Terms of Service">
      <p>
        LifeOS is a personal planning tool. It does not provide medical, legal or financial advice,
        including through its AI features.
      </p>
      <p>You are responsible for reviewing AI-generated plans before applying them.</p>
    </Legal>
  );
}

import { Button } from "@lifeos/ui/components/button";
import { BarChart3, Check, CloudOff, LayoutTemplate, ListTree, Sparkles } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

const FEATURES = [
  { icon: ListTree, title: "Plans that fit you", body: "Unlimited categories, planners, nested tasks and custom fields. Nothing is hardcoded." },
  { icon: LayoutTemplate, title: "Start from a template", body: "Health, career and lifestyle starters become your own editable copy." },
  { icon: Sparkles, title: "AI that asks first", body: "Describe a plan and review the draft. Nothing changes until you approve it." },
  { icon: BarChart3, title: "Honest analytics", body: "Build your own dashboards from numbers calculated exactly, with clear definitions." },
  { icon: CloudOff, title: "Works offline", body: "Check things off anywhere. Changes sync when you're back online." },
];

const EXAMPLES = ["Healthy routine", "Career growth", "Balanced lifestyle"];

function usePageMeta(title: string, description: string) {
  useEffect(() => {
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  }, [title, description]);
}

export function LandingPage() {
  usePageMeta("LifeOS: plan your life your way", "Build your own planners, track what matters and see real progress. Works offline.");
  return (
    <div className="mx-auto max-w-5xl px-4">
      <header className="flex h-16 items-center justify-between">
        <span className="flex items-center gap-2 font-semibold">
          <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Check aria-hidden className="size-5" /></span>
          LifeOS
        </span>
        <nav aria-label="Account" className="flex gap-2">
          <Button variant="ghost" asChild><Link to="/login">Sign in</Link></Button>
          <Button asChild><Link to="/signup">Get started</Link></Button>
        </nav>
      </header>
      <main>
        <section className="py-16 text-center sm:py-24">
          <h1 className="mx-auto max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">A planner shaped around your life, not the other way round</h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-ink-muted">Design planners for anything, track what you do, and see honest progress on any device.</p>
          <Button size="lg" className="mt-8" asChild><Link to="/signup">Create your free account</Link></Button>
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
        <section className="py-16 text-center">
          <h2 className="text-2xl font-semibold">Start from an example</h2>
          <ul className="mt-4 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((e) => <li key={e} className="rounded-full border bg-surface px-4 py-2 text-sm">{e}</li>)}
          </ul>
        </section>
      </main>
      <footer className="flex justify-center gap-4 border-t py-6 text-sm text-ink-muted">
        <Link className="underline" to="/privacy">Privacy</Link>
        <Link className="underline" to="/terms">Terms</Link>
      </footer>
    </div>
  );
}

function Legal({ title, children }: { title: string; children: ReactNode }) {
  usePageMeta(`${title} | LifeOS`, `LifeOS ${title}`);
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-12">
      <Link to="/" className="text-sm text-primary underline">Back to LifeOS</Link>
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p role="note" className="rounded-lg bg-reward-soft p-3 text-sm">Draft: this text must be reviewed by a qualified lawyer before public launch.</p>
      {children}
    </main>
  );
}

export function PrivacyPage() {
  return (
    <Legal title="Privacy Policy">
      <p>LifeOS stores the planners, tasks and metrics you create so that you can use them across your devices. Your data is visible only to you.</p>
      <p>Health and other sensitive records are optional. They are excluded from AI features unless you turn that on in Settings.</p>
      <p>You can export your data or delete your account at any time from Settings. Deleting your account removes your login and your data.</p>
    </Legal>
  );
}

export function TermsPage() {
  return (
    <Legal title="Terms of Service">
      <p>LifeOS is a personal planning tool. It does not provide medical, legal or financial advice, including through its AI features.</p>
      <p>You are responsible for reviewing AI-generated plans before applying them.</p>
    </Legal>
  );
}

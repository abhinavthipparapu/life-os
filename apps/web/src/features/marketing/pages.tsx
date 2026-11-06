import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePageMeta } from "./meta";

export { HowItWorksPage, LandingPage } from "./landing";

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

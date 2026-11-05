import { Button } from "@lifeos/ui/components/button";
import { Flame, Target, Trophy } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "@/app/api";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { formatDate } from "@/lib/dates";

const SUGGESTIONS: Record<string, { label: string; to: string }> = {
  create_planner: { label: "Create your first planner", to: "/app/planners/new" },
  schedule_task: { label: "Schedule a task for today", to: "/app/planners" },
  create_goal: { label: "Set a goal to work toward", to: "/app/goals" },
};

function Stat({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Flame }) {
  return (
    <div className="card-surface p-4">
      <p className="flex items-center gap-2 text-sm text-ink-muted"><Icon aria-hidden className="size-4" />{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

export function HomePage() {
  const { data: me } = api.useMeQuery();
  const { data, isLoading, error, refetch } = api.useHomeQuery();
  const { data: achievements } = api.useAchievementsQuery();
  const name = me?.displayName ?? me?.email.split("@")[0];
  return (
    <>
      <PageHeader title={name ? `Hello, ${name}` : "Hello"} description={data ? formatDate(data.today, { weekday: "long", month: "long", day: "numeric" }) : undefined} />
      {isLoading && <PageSkeleton />}
      {error && <ErrorState error={error} retry={() => void refetch()} />}
      {data && (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat icon={Target} label="Daily score" value={data.score === null ? "No tasks yet" : `${data.score}%`} />
            <Stat icon={Flame} label="Current streak" value={`${data.streak.current} ${data.streak.current === 1 ? "day" : "days"}`} />
            <Stat icon={Trophy} label="Longest streak" value={`${data.streak.longest} ${data.streak.longest === 1 ? "day" : "days"}`} />
          </div>
          {data.suggestions.length > 0 && (
            <section aria-labelledby="next-steps">
              <h2 id="next-steps" className="mb-2 font-semibold">Next steps</h2>
              <div className="flex flex-wrap gap-2">
                {data.suggestions.map((s) => SUGGESTIONS[s] && <Button key={s} variant="outline" asChild><Link to={SUGGESTIONS[s].to}>{SUGGESTIONS[s].label}</Link></Button>)}
              </div>
            </section>
          )}
          <section aria-labelledby="planners">
            <h2 id="planners" className="mb-2 font-semibold">Active planners</h2>
            {data.planners.length === 0 ? (
              <EmptyState icon={Target} title="No planners yet" description="Start blank, from a template, or describe what you want." action={<Button asChild><Link to="/app/planners/new">Create a planner</Link></Button>} />
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {data.planners.map((p) => (
                  <li key={p.id}>
                    <Link to={`/app/planners/${p.id}`} className="card-surface flex items-center gap-3 p-4 hover:shadow-e3">
                      <span aria-hidden className="size-3 rounded-full" style={{ background: p.color }} />
                      <span className="font-medium">{p.name}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {achievements && achievements.length > 0 && (
            <section aria-labelledby="achievements">
              <h2 id="achievements" className="mb-2 font-semibold">Achievements</h2>
              <ul className="flex flex-wrap gap-2">
                {achievements.map((a) => (
                  <li key={a.id} className="rounded-full bg-reward-soft px-3 py-1.5 text-sm" title={a.achievement.description}>{a.achievement.title}</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </>
  );
}

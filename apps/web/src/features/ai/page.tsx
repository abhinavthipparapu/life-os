import { Button } from "@lifeos/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@lifeos/ui/components/dialog";
import { Input } from "@lifeos/ui/components/input";
import { Progress } from "@lifeos/ui/components/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lifeos/ui/components/tabs";
import { Textarea } from "@lifeos/ui/components/textarea";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import type { AiDraft, PlanTaskNode } from "@/app/types";
import { Field, NativeSelect } from "@/components/common/forms";
import { PageHeader } from "@/components/common/states";
import { PlanTree } from "@/features/templates/page";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";

function AIUsageIndicator() {
  const { data } = api.useAiUsageQuery();
  if (!data) return null;
  const percent = Math.min(100, Math.round((data.used / data.budget) * 100));
  return (
    <div className="card-surface mb-4 p-3">
      <p className="mb-1 flex justify-between text-sm"><span>AI allowance this month</span><span className="text-ink-muted">{percent}% used</span></p>
      <Progress value={percent} aria-label={`${percent} percent of AI allowance used`} />
      {data.provider === "mock" && <p className="mt-2 text-xs text-ink-muted">Demo mode: AI answers are sample output until a provider key is configured.</p>}
    </div>
  );
}

const countTasks = (tasks: PlanTaskNode[]): number => tasks.reduce((n, t) => n + 1 + countTasks(t.children ?? []), 0);

function PlanPreview({ draft, onDiscard }: { draft: AiDraft; onDiscard: () => void }) {
  const navigate = useNavigate();
  const [confirming, setConfirming] = useState(false);
  const [apply, { isLoading }] = api.useApplyDraftMutation();
  const { data: categories } = api.useCategoriesQuery();
  const [categoryId, setCategoryId] = useState("");
  const plan = draft.validatedJson;
  const total = plan.sections.reduce((n, s) => n + countTasks(s.tasks), 0);
  const confirm = async () => {
    try {
      const planner = await apply({ id: draft.id, categoryId: categoryId || null }).unwrap();
      toast.success("Planner created");
      navigate(`/app/planners/${planner.id}`);
    } catch (err) {
      toast.error(messageOf(err));
      setConfirming(false);
    }
  };
  return (
    <section aria-labelledby="preview" className="card-surface mt-4 space-y-3 p-4">
      <p className="w-fit rounded-full bg-reward-soft px-3 py-1 text-xs font-medium">Preview only. Nothing has been created.</p>
      <h2 id="preview" className="text-lg font-semibold">{plan.name}</h2>
      {plan.description && <p className="text-sm text-ink-muted">{plan.description}</p>}
      {plan.sections.map((s) => <div key={s.name}><h3 className="mb-1 font-medium">{s.name}</h3><PlanTree tasks={s.tasks} /></div>)}
      <div className="flex gap-2">
        <Button onClick={() => setConfirming(true)}>Review and apply</Button>
        <Button variant="outline" onClick={onDiscard}>Discard</Button>
      </div>
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create this planner?</DialogTitle>
            <DialogDescription>This adds "{plan.name}" with {plan.sections.length} {plan.sections.length === 1 ? "section" : "sections"} and {total} {total === 1 ? "task" : "tasks"} to your account. You can edit or archive it afterward.</DialogDescription>
          </DialogHeader>
          <Field id="ai-cat" label="Category">
            <NativeSelect id="ai-cat" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">None</option>
              {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </NativeSelect>
          </Field>
          <Button disabled={isLoading} onClick={() => void confirm()}>Create planner</Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PromptComposer() {
  const [prompt, setPrompt] = useState("");
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [create, { isLoading }] = api.useCreateDraftMutation();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setDraft(await create({ prompt: prompt.trim() }).unwrap());
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <>
      <form onSubmit={(e) => void submit(e)} className="card-surface space-y-3 p-4">
        <Field id="ai-prompt" label="What do you want to plan?" hint="Example: a 12 week study plan for a certification, with weekly reviews.">
          <Textarea id="ai-prompt" rows={4} value={prompt} maxLength={2000} onChange={(e) => setPrompt(e.target.value)} />
        </Field>
        <Button type="submit" disabled={isLoading || prompt.trim().length < 5}>{isLoading ? "Drafting" : "Draft a plan"}</Button>
      </form>
      {draft && <PlanPreview draft={draft} onDiscard={() => setDraft(null)} />}
    </>
  );
}

interface Source {
  label: string;
  value: number | null;
  unit?: string | null;
}

function SourceList({ sources }: { sources: Source[] }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 rounded-lg bg-surface-2 p-3 text-sm">
      {sources.map((s) => (
        <div key={s.label} className="contents">
          <dt className="text-ink-muted">{s.label}</dt>
          <dd className="text-right font-medium">{s.value ?? "No data"}{s.unit ? ` ${s.unit}` : ""}</dd>
        </div>
      ))}
    </dl>
  );
}

function Insights() {
  const [text, setText] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);

  const run = async () => {
    setText("");
    setSources([]);
    setRunning(true);
    controller.current = new AbortController();
    try {
      const { data } = await supabase.auth.getSession();
      const res = await fetch(`${env.VITE_API_URL}/api/v1/ai/insights`, {
        method: "POST",
        signal: controller.current.signal,
        headers: { "content-type": "application/json", Authorization: `Bearer ${data.session?.access_token}` },
        body: JSON.stringify({ rangeDays: 30 }),
      });
      if (!res.ok || !res.body) throw new Error("The insight could not be started");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";
        for (const raw of events) {
          const name = /^event: (.*)$/m.exec(raw)?.[1];
          const payload = JSON.parse(/^data: (.*)$/m.exec(raw)?.[1] ?? "{}") as { text?: string; sources?: Source[]; message?: string };
          if (name === "sources") setSources(payload.sources ?? []);
          if (name === "delta") setText((t) => t + (payload.text ?? ""));
          if (name === "error") toast.error(payload.message ?? "Something went wrong");
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") toast.error((err as Error).message);
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="card-surface p-4">
      <p className="text-sm text-ink-muted">A plain summary of your last 30 days. Every number is calculated by LifeOS and shown below. Sensitive metrics stay out unless you opt in.</p>
      <div className="mt-3 flex gap-2">
        <Button disabled={running} onClick={() => void run()}>{running ? "Writing" : "Generate insight"}</Button>
        {running && <Button variant="outline" onClick={() => controller.current?.abort()}>Stop</Button>}
      </div>
      {text && <p aria-live="polite" className="mt-3 text-sm whitespace-pre-wrap">{text}</p>}
      {sources.length > 0 && <SourceList sources={sources} />}
    </div>
  );
}

function AskData() {
  const [question, setQuestion] = useState("");
  const [ask, { data, isLoading, reset }] = api.useAskDataMutation();
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    reset();
    ask(question.trim()).unwrap().catch((err: unknown) => toast.error(messageOf(err)));
  };
  return (
    <div className="card-surface p-4">
      <form onSubmit={submit} className="flex gap-2">
        <Input aria-label="Ask about your data" placeholder="How much water did I drink this month?" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <Button type="submit" disabled={isLoading || question.trim().length < 3}>Ask</Button>
      </form>
      {data && (<><p aria-live="polite" className="mt-3 text-sm">{data.answer}</p>{data.sources.length > 0 && <SourceList sources={data.sources} />}</>)}
    </div>
  );
}

function ScheduleHelper() {
  const { data: planners } = api.usePlannersQuery({ limit: 100 });
  const [plannerId, setPlannerId] = useState("");
  const [constraints, setConstraints] = useState("");
  const [suggest, { data, isLoading, reset }] = api.useSuggestScheduleMutation();
  const [apply, { isLoading: applying }] = api.useApplyScheduleMutation();
  const run = () => void suggest({ plannerId, constraints }).unwrap().catch((err: unknown) => toast.error(messageOf(err)));
  const accept = async () => {
    try {
      const { applied } = await apply(data!.draft.id).unwrap();
      toast.success(`Updated ${applied} schedules`);
      reset();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <div className="card-surface space-y-3 p-4">
      <Field id="s-planner" label="Planner">
        <NativeSelect id="s-planner" value={plannerId} onChange={(e) => setPlannerId(e.target.value)}>
          <option value="">Choose a planner</option>
          {planners?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
      </Field>
      <Field id="s-con" label="Constraints"><Input id="s-con" placeholder="I'm free before 9am and after 6pm" value={constraints} onChange={(e) => setConstraints(e.target.value)} /></Field>
      <Button disabled={!plannerId || isLoading} onClick={run}>Suggest changes</Button>
      {data && (
        <section aria-label="Proposed changes" className="space-y-2">
          <table className="w-full text-sm">
            <caption className="mb-1 text-left text-xs text-ink-muted">Proposed changes. Nothing changes until you apply them.</caption>
            <thead><tr className="border-b text-left text-ink-muted"><th scope="col">Task</th><th scope="col">Now</th><th scope="col">Proposed</th></tr></thead>
            <tbody>
              {data.proposals.map((p) => (
                <tr key={p.taskId} className="border-b"><th scope="row" className="py-1 text-left font-normal">{p.title}<span className="block text-xs text-ink-muted">{p.reason}</span></th><td>{p.current ?? "Not set"}</td><td className="font-medium">{p.localTime}</td></tr>
              ))}
            </tbody>
          </table>
          {data.conflicts.length > 0 && <p role="alert" className="rounded-lg bg-danger-soft p-2 text-sm text-danger">Two or more tasks would share {data.conflicts.join(", ")}.</p>}
          <div className="flex gap-2">
            <Button disabled={applying || data.proposals.length === 0} onClick={() => void accept()}>Apply changes</Button>
            <Button variant="outline" onClick={reset}>Discard</Button>
          </div>
        </section>
      )}
    </div>
  );
}

export function AiPage() {
  return (
    <>
      <PageHeader title="Assistant" description="AI suggests, and you decide. Nothing changes without your approval." />
      <AIUsageIndicator />
      <Tabs defaultValue="plan">
        <TabsList className="mb-4 flex-wrap">
          <TabsTrigger value="plan">Create plan</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
          <TabsTrigger value="ask">Ask my data</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>
        <TabsContent value="plan"><PromptComposer /></TabsContent>
        <TabsContent value="insights"><Insights /></TabsContent>
        <TabsContent value="ask"><AskData /></TabsContent>
        <TabsContent value="schedule"><ScheduleHelper /></TabsContent>
      </Tabs>
    </>
  );
}

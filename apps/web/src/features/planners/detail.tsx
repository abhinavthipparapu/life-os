import { Button } from "@lifeos/ui/components/button";
import { ChevronDown, ChevronRight, ListPlus, Pencil, Save } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import type { PlannerDetail } from "@/app/types";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { buildTree, describeRule, type TreeNode } from "./tree";

export function TaskRowView({ node, depth }: { node: TreeNode; depth: number }) {
  const [open, setOpen] = useState(true);
  const { task, children } = node;
  return (
    <li>
      <div className="flex min-h-11 items-center gap-1 rounded-lg px-1 hover:bg-surface-2" style={{ paddingLeft: depth * 16 }}>
        {children.length > 0 ? (
          <Button variant="ghost" size="icon-sm" aria-expanded={open} aria-label={`${open ? "Collapse" : "Expand"} ${task.title}`} onClick={() => setOpen(!open)}>
            {open ? <ChevronDown aria-hidden className="size-4" /> : <ChevronRight aria-hidden className="size-4" />}
          </Button>
        ) : <span className="w-3" />}
        <Link to={`/app/tasks/${task.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:underline">{task.title}</Link>
        <span className="hidden shrink-0 text-xs text-ink-muted sm:inline">{describeRule(task.schedules[0]?.rrule)}</span>
      </div>
      {open && children.length > 0 && <SubtaskList nodes={children} depth={depth + 1} />}
    </li>
  );
}

export function SubtaskList({ nodes, depth }: { nodes: TreeNode[]; depth: number }) {
  return <ul>{nodes.map((n) => <TaskRowView key={n.task.id} node={n} depth={depth} />)}</ul>;
}

function TaskTree({ planner }: { planner: PlannerDetail }) {
  const sections = planner.sections.map((s) => ({ ...s, tasks: planner.tasks.filter((t) => t.sectionId === s.id) }));
  const loose = planner.tasks.filter((t) => !t.sectionId);
  return (
    <div className="space-y-4">
      {sections.map((s) => (
        <section key={s.id} className="card-surface p-3" aria-label={s.name}>
          <h2 className="mb-1 px-2 font-semibold">{s.name}</h2>
          {s.tasks.length ? <SubtaskList nodes={buildTree(s.tasks)} depth={0} /> : <p className="px-2 text-sm text-ink-muted">No tasks in this section.</p>}
        </section>
      ))}
      {loose.length > 0 && (
        <section className="card-surface p-3" aria-label="Tasks">
          <SubtaskList nodes={buildTree(loose)} depth={0} />
        </section>
      )}
    </div>
  );
}

export function PlannerPage() {
  const { id = "" } = useParams();
  const { data, isLoading, error, refetch } = api.usePlannerQuery(id);
  const [saveTemplate, { isLoading: saving }] = api.useCreateTemplateMutation();
  const asTemplate = async () => {
    try {
      await saveTemplate({ name: data!.name, plannerId: id }).unwrap();
      toast.success("Saved to your templates");
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;
  return (
    <>
      <PageHeader title={data.name} description={data.description ?? undefined} actions={
        <>
          <Button variant="outline" disabled={saving || data.tasks.length === 0} onClick={() => void asTemplate()}><Save aria-hidden className="size-4" />Save as template</Button>
          <Button asChild><Link to={`/app/planners/${id}/edit`}><Pencil aria-hidden className="size-4" />Edit</Link></Button>
        </>
      } />
      {data.tasks.length === 0 && data.sections.length === 0 ? (
        <EmptyState icon={ListPlus} title="This planner is empty" description="Add sections and tasks in the builder." action={<Button asChild><Link to={`/app/planners/${id}/edit`}>Open builder</Link></Button>} />
      ) : <TaskTree planner={data} />}
    </>
  );
}

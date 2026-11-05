import { Button } from "@lifeos/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@lifeos/ui/components/dialog";
import { LayoutTemplate } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import type { PlanTaskNode, Template } from "@/app/types";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { describeRule } from "@/features/planners/tree";

export function PlanTree({ tasks }: { tasks: PlanTaskNode[] }) {
  return (
    <ul className="ml-4 list-disc space-y-1 text-sm">
      {tasks.map((t, i) => (
        <li key={`${t.title}-${i}`}>
          {t.title}{t.rrule && <span className="text-ink-muted"> · {describeRule(t.rrule)}</span>}
          {t.children && t.children.length > 0 && <PlanTree tasks={t.children} />}
        </li>
      ))}
    </ul>
  );
}

function Preview({ template, onClose }: { template: Template; onClose: () => void }) {
  const navigate = useNavigate();
  const { data, isLoading } = api.useTemplateQuery({ id: template.id });
  const [install, { isLoading: installing }] = api.useInstantiateTemplateMutation();
  const version = data?.versions[0];
  const copy = async () => {
    try {
      const planner = await install({ id: template.id, version: version?.version }).unwrap();
      toast.success("Your own copy is ready");
      navigate(`/app/planners/${planner.id}`);
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-auto">
        <DialogHeader>
          <DialogTitle>{template.name}</DialogTitle>
          <DialogDescription>{template.description} Version {version?.version ?? "..."}. Installing makes an editable copy, and this template stays unchanged.</DialogDescription>
        </DialogHeader>
        {isLoading && <PageSkeleton rows={2} />}
        {version?.snapshotJson.sections.map((s) => (
          <section key={s.name}><h3 className="mb-1 font-medium">{s.name}</h3><PlanTree tasks={s.tasks} /></section>
        ))}
        <Button disabled={!version || installing} onClick={() => void copy()}>Use this template</Button>
      </DialogContent>
    </Dialog>
  );
}

export function TemplatesPage() {
  const { data, isLoading, error, refetch } = api.useTemplatesQuery({});
  const [preview, setPreview] = useState<Template | null>(null);
  const groups: [string, Template[]][] = [
    ["Starter templates", data?.filter((t) => t.visibility === "starter") ?? []],
    ["Your templates", data?.filter((t) => t.ownerId) ?? []],
  ];
  return (
    <>
      <PageHeader title="Templates" description="Optional starting points. Every install is your own editable copy." />
      {isLoading && <PageSkeleton />}
      {error && <ErrorState error={error} retry={() => void refetch()} />}
      {data?.length === 0 && <EmptyState icon={LayoutTemplate} title="No templates yet" description="Save any planner as a template to reuse it." />}
      {data && groups.map(([title, items]) => items.length > 0 && (
        <section key={title} className="mb-6" aria-label={title}>
          <h2 className="mb-2 font-semibold">{title}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {items.map((t) => (
              <li key={t.id} className="card-surface flex flex-col gap-2 p-4">
                <h3 className="font-medium">{t.name}</h3>
                <p className="flex-1 text-sm text-ink-muted">{t.description}</p>
                <Button variant="outline" onClick={() => setPreview(t)}>Preview</Button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {preview && <Preview template={preview} onClose={() => setPreview(null)} />}
    </>
  );
}

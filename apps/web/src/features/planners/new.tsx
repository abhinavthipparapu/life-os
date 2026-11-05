import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@lifeos/ui/components/button";
import { Input } from "@lifeos/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lifeos/ui/components/tabs";
import { Textarea } from "@lifeos/ui/components/textarea";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";
import { api, messageOf } from "@/app/api";
import { Field, NativeSelect } from "@/components/common/forms";
import { FieldError, PageHeader } from "@/components/common/states";

const schema = z.object({
  name: z.string().trim().min(1, "Give your planner a name").max(120),
  description: z.string().trim().max(2000),
  categoryId: z.string(),
  color: z.string(),
});
type Values = z.infer<typeof schema>;

const DRAFT_KEY = "lifeos.plannerDraft";

function readDraft(): Partial<Values> {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") as Partial<Values>;
  } catch {
    return {};
  }
}

function BlankForm() {
  const navigate = useNavigate();
  const { data: categories } = api.useCategoriesQuery();
  const [create] = api.useCreatePlannerMutation();
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", description: "", categoryId: "", color: "#1FAD82", ...readDraft() },
  });
  const { errors, isSubmitting } = form.formState;
  // Draft stays on this device until it is saved (section 3).
  useEffect(() => {
    const sub = form.watch((values) => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(values));
      } catch { /* Storage may be unavailable. The form still works. */ }
    });
    return () => sub.unsubscribe();
  }, [form]);

  const submit = form.handleSubmit(async (values) => {
    try {
      const planner = await create({
        name: values.name,
        color: values.color,
        description: values.description || null,
        categoryId: values.categoryId || null,
      }).unwrap();
      localStorage.removeItem(DRAFT_KEY);
      navigate(`/app/planners/${planner.id}/edit`);
    } catch (err) {
      toast.error(messageOf(err));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="card-surface space-y-4 p-5">
      <Field id="name" label="Name">
        <Input id="name" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "name-error" : undefined} {...form.register("name")} />
        <FieldError id="name-error" message={errors.name?.message} />
      </Field>
      <Field id="description" label="Description">
        <Textarea id="description" {...form.register("description")} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="category" label="Category">
          <NativeSelect id="category" {...form.register("categoryId")}>
            <option value="">None</option>
            {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </NativeSelect>
        </Field>
        <Field id="color" label="Color">
          <input id="color" type="color" className="h-11 w-full rounded-xl border bg-transparent p-1" {...form.register("color")} />
        </Field>
      </div>
      <Button type="submit" disabled={isSubmitting}>Create and build</Button>
    </form>
  );
}

export function NewPlannerPage() {
  return (
    <>
      <PageHeader title="New planner" description="Choose how you want to start." />
      <Tabs defaultValue="blank">
        <TabsList className="mb-4">
          <TabsTrigger value="blank">Blank</TabsTrigger>
          <TabsTrigger value="template">Template</TabsTrigger>
          <TabsTrigger value="ai">AI</TabsTrigger>
        </TabsList>
        <TabsContent value="blank"><BlankForm /></TabsContent>
        <TabsContent value="template">
          <div className="card-surface p-5">
            <p className="text-sm text-ink-muted">Preview a template and install your own editable copy.</p>
            <Button className="mt-3" asChild><Link to="/app/templates">Browse templates</Link></Button>
          </div>
        </TabsContent>
        <TabsContent value="ai">
          <div className="card-surface p-5">
            <p className="text-sm text-ink-muted">Describe what you want. You review the draft, and nothing is created until you approve it.</p>
            <Button className="mt-3" asChild><Link to="/app/ai">Open the assistant</Link></Button>
          </div>
        </TabsContent>
      </Tabs>
    </>
  );
}

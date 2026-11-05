import { Button } from "@lifeos/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@lifeos/ui/components/dialog";
import { Input } from "@lifeos/ui/components/input";
import { Switch } from "@lifeos/ui/components/switch";
import { Textarea } from "@lifeos/ui/components/textarea";
import { ArrowDown, ArrowUp, CalendarClock, IndentDecrease, IndentIncrease, Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf, problemOf } from "@/app/api";
import type { FieldDefinition, PlannerDetail, Section, TaskRow } from "@/app/types";
import { Field, NativeSelect } from "@/components/common/forms";
import { ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { localToday } from "@/lib/dates";
import { buildTree, describeRule, fromRrule, toRrule, WEEKDAYS, type ScheduleMode, type TreeNode } from "./tree";

export function ScheduleEditor({ task, timezone, onClose }: { task: TaskRow; timezone: string; onClose: () => void }) {
  const current = task.schedules[0];
  const parsed = fromRrule(current?.rrule);
  const [mode, setMode] = useState<ScheduleMode>(parsed.mode);
  const [days, setDays] = useState<string[]>(parsed.days);
  const [time, setTime] = useState(current?.localTime ?? "");
  const [reminder, setReminder] = useState(String(current?.reminderOffsets[0] ?? ""));
  const [update, { isLoading }] = api.useUpdateTaskMutation();
  const save = async () => {
    const rrule = toRrule(mode, days);
    try {
      await update({
        id: task.id,
        plannerId: task.plannerId,
        expectedVersion: task.version,
        schedule: rrule
          ? {
              rrule,
              slot: current?.slot ?? "default",
              startsOn: current?.startsOn.slice(0, 10) ?? localToday(timezone),
              localTime: time || null,
              reminderOffsets: reminder === "" ? [] : [Number(reminder)],
            }
          : null,
      }).unwrap();
      onClose();
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule</DialogTitle>
          <DialogDescription>{task.title}. Times use {timezone}. Past completions are never changed.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field id="repeat" label="Repeats">
            <NativeSelect id="repeat" value={mode} onChange={(e) => setMode(e.target.value as ScheduleMode)}>
              <option value="none">Does not repeat</option>
              <option value="daily">Every day</option>
              <option value="weekdays">Weekdays</option>
              <option value="weekly">Specific days</option>
              <option value="monthly">Monthly</option>
            </NativeSelect>
          </Field>
          {mode === "weekly" && (
            <fieldset>
              <legend className="text-sm font-medium">Days</legend>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {WEEKDAYS.map((d) => (
                  <Button key={d} type="button" size="icon-sm" variant={days.includes(d) ? "default" : "outline"} aria-pressed={days.includes(d)}
                    onClick={() => setDays(days.includes(d) ? days.filter((x) => x !== d) : [...days, d])}>{d}</Button>
                ))}
              </div>
            </fieldset>
          )}
          {mode !== "none" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="time" label="Time (optional)"><Input id="time" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></Field>
              <Field id="reminder" label="Reminder">
                <NativeSelect id="reminder" value={reminder} disabled={!time} onChange={(e) => setReminder(e.target.value)}>
                  <option value="">None</option>
                  <option value="0">At the time</option>
                  <option value="10">10 minutes before</option>
                  <option value="60">1 hour before</option>
                </NativeSelect>
              </Field>
            </div>
          )}
          <Button className="w-full" disabled={isLoading} onClick={() => void save()}>Save schedule</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CustomFieldEditor({ plannerId, fields }: { plannerId: string; fields: FieldDefinition[] }) {
  const [label, setLabel] = useState("");
  const [type, setType] = useState<FieldDefinition["type"]>("text");
  const [options, setOptions] = useState("");
  const [required, setRequired] = useState(false);
  const [create, { isLoading }] = api.useCreateFieldMutation();
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "f_$1");
    if (!key) return;
    try {
      await create({
        plannerId,
        key,
        label: label.trim(),
        type,
        validation: { required, ...(type === "select" ? { options: options.split(",").map((o) => o.trim()).filter(Boolean) } : {}) },
      }).unwrap();
      setLabel("");
      setOptions("");
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <section aria-labelledby="fields" className="card-surface p-4">
      <h2 id="fields" className="font-semibold">Custom fields</h2>
      {fields.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {fields.map((f) => <li key={f.id} className="rounded-full bg-surface-2 px-3 py-1 text-sm">{f.label} ({f.type})</li>)}
        </ul>
      )}
      <form onSubmit={(e) => void submit(e)} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <Field id="field-label" label="Field name"><Input id="field-label" value={label} onChange={(e) => setLabel(e.target.value)} /></Field>
        <Field id="field-type" label="Type">
          <NativeSelect id="field-type" value={type} onChange={(e) => setType(e.target.value as FieldDefinition["type"])}>
            {["text", "number", "boolean", "date", "select", "rating"].map((t) => <option key={t} value={t}>{t}</option>)}
          </NativeSelect>
        </Field>
        <Button type="submit" variant="outline" disabled={isLoading || !label.trim()}>Add field</Button>
        {type === "select" && (
          <div className="sm:col-span-3"><Field id="field-options" label="Options, separated by commas"><Input id="field-options" value={options} onChange={(e) => setOptions(e.target.value)} /></Field></div>
        )}
        <label className="flex items-center gap-2 text-sm sm:col-span-3"><Switch checked={required} onCheckedChange={setRequired} />Required on new tasks</label>
      </form>
    </section>
  );
}

function BuilderRow({ node, siblings, index, depth, timezone, parentOfParent }: { node: TreeNode; siblings: TreeNode[]; index: number; depth: number; timezone: string; parentOfParent: string | null | undefined }) {
  const { task } = node;
  const [title, setTitle] = useState(task.title);
  const [scheduling, setScheduling] = useState(false);
  useEffect(() => setTitle(task.title), [task.title]);
  const [update] = api.useUpdateTaskMutation();
  const [reparent] = api.useReparentTaskMutation();
  const [archive] = api.useArchiveTaskMutation();
  const report = (err: unknown) => {
    toast.error(problemOf(err)?.code === "too_deep" ? "Tasks can nest at most 5 levels" : messageOf(err));
  };
  const saveTitle = () => {
    if (title.trim() && title !== task.title) {
      update({ id: task.id, plannerId: task.plannerId, expectedVersion: task.version, title: title.trim() }).unwrap().catch(report);
    }
  };
  const swap = async (other: TreeNode) => {
    try {
      await update({ id: task.id, plannerId: task.plannerId, expectedVersion: task.version, sortOrder: other.task.sortOrder }).unwrap();
      await update({ id: other.task.id, plannerId: task.plannerId, expectedVersion: other.task.version, sortOrder: task.sortOrder }).unwrap();
    } catch (err) {
      report(err);
    }
  };
  const move = (parentTaskId: string | null) =>
    reparent({ id: task.id, plannerId: task.plannerId, parentTaskId, expectedVersion: task.version }).unwrap().catch(report);
  const previous = siblings[index - 1];
  const up = siblings[index - 1];
  const down = siblings[index + 1];
  return (
    <li>
      <div className="flex flex-wrap items-center gap-1 border-b py-1.5" style={{ paddingLeft: depth * 16 }}>
        <Input aria-label="Task title" value={title} onChange={(e) => setTitle(e.target.value)} onBlur={saveTitle} className="min-w-40 flex-1" />
        <Button variant="ghost" size="sm" aria-label={`Schedule ${task.title}`} onClick={() => setScheduling(true)}>
          <CalendarClock aria-hidden className="size-4" />
          <span className="hidden text-xs md:inline">{describeRule(task.schedules[0]?.rrule)}</span>
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Move ${task.title} up`} disabled={!up} onClick={() => up && void swap(up)}><ArrowUp aria-hidden className="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Move ${task.title} down`} disabled={!down} onClick={() => down && void swap(down)}><ArrowDown aria-hidden className="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Indent ${task.title}`} disabled={!previous} onClick={() => previous && void move(previous.task.id)}><IndentIncrease aria-hidden className="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Outdent ${task.title}`} disabled={parentOfParent === undefined} onClick={() => parentOfParent !== undefined && void move(parentOfParent)}><IndentDecrease aria-hidden className="size-4" /></Button>
        <Button variant="ghost" size="icon-sm" aria-label={`Delete ${task.title}`} onClick={() => void archive({ id: task.id, plannerId: task.plannerId })}><Trash2 aria-hidden className="size-4" /></Button>
      </div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((child, i) => (
            <BuilderRow key={child.task.id} node={child} siblings={node.children} index={i} depth={depth + 1} timezone={timezone} parentOfParent={task.parentTaskId} />
          ))}
        </ul>
      )}
      {scheduling && <ScheduleEditor task={task} timezone={timezone} onClose={() => setScheduling(false)} />}
    </li>
  );
}

export function SectionEditor({ planner, section }: { planner: PlannerDetail; section: Section | null }) {
  const [title, setTitle] = useState("");
  const [create, { isLoading }] = api.useCreateTaskMutation();
  const nodes = buildTree(planner.tasks.filter((t) => t.sectionId === (section?.id ?? null)));
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await create({ plannerId: planner.id, title: title.trim(), sectionId: section?.id ?? null }).unwrap();
      setTitle("");
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <section className="card-surface p-4" aria-label={section?.name ?? "Tasks"}>
      <h2 className="font-semibold">{section?.name ?? "Tasks"}</h2>
      <ul className="mt-2">
        {nodes.map((n, i) => <BuilderRow key={n.task.id} node={n} siblings={nodes} index={i} depth={0} timezone={planner.timezone} parentOfParent={undefined} />)}
      </ul>
      <form onSubmit={(e) => void add(e)} className="mt-3 flex gap-2">
        <Input aria-label={`New task in ${section?.name ?? "planner"}`} placeholder="Add a task" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Button type="submit" variant="outline" disabled={isLoading || !title.trim()}><Plus aria-hidden className="size-4" />Add</Button>
      </form>
    </section>
  );
}

function PlannerSettings({ planner }: { planner: PlannerDetail }) {
  const [form, setForm] = useState({ name: planner.name, description: planner.description ?? "", color: planner.color, isSensitive: planner.isSensitive });
  const [conflict, setConflict] = useState<{ name: string; version: number } | null>(null);
  const [update, { isLoading }] = api.useUpdatePlannerMutation();
  const dirty = form.name !== planner.name || form.description !== (planner.description ?? "") || form.color !== planner.color || form.isSensitive !== planner.isSensitive;
  const blocker = useBlocker(dirty);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirty) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async (expectedVersion: number) => {
    try {
      await update({ id: planner.id, expectedVersion, ...form, description: form.description || null }).unwrap();
      setConflict(null);
      toast.success("Saved");
    } catch (err) {
      const problem = problemOf(err);
      if (problem?.code === "version_conflict") setConflict(problem.current as { name: string; version: number });
      else toast.error(messageOf(err));
    }
  };

  return (
    <section aria-labelledby="settings" className="card-surface space-y-4 p-4">
      <h2 id="settings" className="font-semibold">Planner details</h2>
      <Field id="p-name" label="Name"><Input id="p-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
      <Field id="p-desc" label="Description"><Textarea id="p-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">Color<input type="color" className="size-9 rounded-lg border bg-transparent" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={form.isSensitive} onCheckedChange={(v) => setForm({ ...form, isSensitive: v })} />Sensitive, keep out of AI</label>
        <Button className="ml-auto" disabled={!dirty || isLoading || !form.name.trim()} onClick={() => void save(planner.version)}>Save details</Button>
      </div>
      <Dialog open={Boolean(conflict)} onOpenChange={(o) => !o && setConflict(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Changed elsewhere</DialogTitle>
            <DialogDescription>This planner was updated on another device (now named "{conflict?.name}"). Overwrite it with your edits?</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => conflict && void save(conflict.version)}>Overwrite</Button>
            <Button className="flex-1" variant="outline" onClick={() => setConflict(null)}>Keep editing</Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={blocker.state === "blocked"}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Leave without saving?</DialogTitle>
            <DialogDescription>Your changes to the planner details will be lost.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button className="flex-1" variant="outline" onClick={() => blocker.proceed?.()}>Leave</Button>
            <Button className="flex-1" onClick={() => blocker.reset?.()}>Stay</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

export function PlannerBuilder() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = api.usePlannerQuery(id);
  const [createSection] = api.useCreateSectionMutation();
  const [archive] = api.useArchivePlannerMutation();
  const [sectionName, setSectionName] = useState("");
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <ErrorState error={error} retry={() => void refetch()} />;
  const addSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sectionName.trim()) return;
    await createSection({ plannerId: id, name: sectionName.trim() });
    setSectionName("");
  };
  const remove = async () => {
    if (!window.confirm(`Archive ${data.name}?`)) return;
    await archive(id);
    navigate("/app/planners");
  };
  return (
    <>
      <PageHeader title={`Edit ${data.name}`} actions={<Button variant="outline" asChild><Link to={`/app/planners/${id}`}>Done</Link></Button>} />
      <div className="space-y-4">
        <PlannerSettings key={data.version} planner={data} />
        {data.sections.map((s) => <SectionEditor key={s.id} planner={data} section={s} />)}
        {(data.sections.length === 0 || data.tasks.some((t) => !t.sectionId)) && <SectionEditor planner={data} section={null} />}
        <form onSubmit={(e) => void addSection(e)} className="flex gap-2">
          <Input aria-label="New section name" placeholder="New section, for example Morning" value={sectionName} onChange={(e) => setSectionName(e.target.value)} />
          <Button type="submit" variant="outline" disabled={!sectionName.trim()}>Add section</Button>
        </form>
        <CustomFieldEditor plannerId={id} fields={data.fieldDefinitions} />
        <Button variant="ghost" className="text-danger" onClick={() => void remove()}>Archive planner</Button>
      </div>
    </>
  );
}

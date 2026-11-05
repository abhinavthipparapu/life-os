import { Button } from "@lifeos/ui/components/button";
import { Input } from "@lifeos/ui/components/input";
import { ArrowDown, ArrowUp, Archive, FolderTree, GripVertical } from "lucide-react";
import { Reorder } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import type { Category } from "@/app/types";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";

function CategoryCard({ category, index, total, move }: { category: Category; index: number; total: number; move: (from: number, to: number) => void }) {
  const [update] = api.useUpdateCategoryMutation();
  const [archive] = api.useArchiveCategoryMutation();
  const [name, setName] = useState(category.name);
  useEffect(() => setName(category.name), [category.name]);
  const save = async () => {
    if (name.trim() === category.name) return;
    try {
      await update({ id: category.id, name: name.trim() }).unwrap();
    } catch (err) {
      setName(category.name);
      toast.error(messageOf(err));
    }
  };
  return (
    <div className="card-surface flex items-center gap-2 p-2">
      <GripVertical aria-hidden className="size-5 shrink-0 cursor-grab text-ink-muted" />
      <input
        type="color"
        aria-label={`Color for ${category.name}`}
        className="size-9 shrink-0 rounded-lg border bg-transparent"
        value={category.color}
        onChange={(e) => void update({ id: category.id, color: e.target.value })}
      />
      <Input aria-label="Category name" value={name} onChange={(e) => setName(e.target.value)} onBlur={() => void save()} className="min-w-0 flex-1" />
      <Button variant="ghost" size="icon-sm" aria-label={`Move ${category.name} up`} disabled={index === 0} onClick={() => move(index, index - 1)}><ArrowUp aria-hidden className="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Move ${category.name} down`} disabled={index === total - 1} onClick={() => move(index, index + 1)}><ArrowDown aria-hidden className="size-4" /></Button>
      <Button variant="ghost" size="icon-sm" aria-label={`Archive ${category.name}`} onClick={() => void archive(category.id)}><Archive aria-hidden className="size-4" /></Button>
    </div>
  );
}

export function CategoriesPage() {
  const { data, isLoading, error, refetch } = api.useCategoriesQuery();
  const [create, { isLoading: creating }] = api.useCreateCategoryMutation();
  const [reorder] = api.useReorderCategoriesMutation();
  const [order, setOrder] = useState<Category[]>([]);
  const [name, setName] = useState("");
  useEffect(() => setOrder(data ?? []), [data]);

  const persist = (next: Category[]) => void reorder(next.map((c) => c.id));
  const move = (from: number, to: number) => {
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    setOrder(next);
    persist(next);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await create({ name: name.trim() }).unwrap();
      setName("");
    } catch (err) {
      toast.error(messageOf(err));
    }
  };

  return (
    <>
      <PageHeader title="Categories" description="Organize planners however you think about your life." />
      <form onSubmit={(e) => void submit(e)} className="mb-4 flex gap-2">
        <Input aria-label="New category name" placeholder="New category" value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" disabled={creating || !name.trim()}>Add</Button>
      </form>
      {isLoading && <PageSkeleton />}
      {error && <ErrorState error={error} retry={() => void refetch()} />}
      {data?.length === 0 && <EmptyState icon={FolderTree} title="No categories yet" description="Health, Career, Home, or anything else that fits you." />}
      <Reorder.Group axis="y" values={order} onReorder={setOrder} className="space-y-2">
        {order.map((c, i) => (
          <Reorder.Item key={c.id} value={c} onDragEnd={() => persist(order)}>
            <CategoryCard category={c} index={i} total={order.length} move={move} />
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </>
  );
}

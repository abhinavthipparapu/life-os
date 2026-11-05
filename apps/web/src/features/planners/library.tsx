import { Button } from "@lifeos/ui/components/button";
import { Input } from "@lifeos/ui/components/input";
import { Copy, ListChecks, Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf } from "@/app/api";
import type { Planner } from "@/app/types";
import { NativeSelect } from "@/components/common/forms";
import { EmptyState, ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";

function PlannerCard({ planner }: { planner: Planner }) {
  const [clone, { isLoading }] = api.useClonePlannerMutation();
  const navigate = useNavigate();
  const duplicate = async () => {
    try {
      const copy = await clone(planner.id).unwrap();
      navigate(`/app/planners/${copy.id}`);
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <li className="card-surface flex items-start gap-3 p-4">
      <span
        aria-hidden
        className="mt-1.5 size-3 shrink-0 rounded-full"
        style={{ background: planner.color }}
      />
      <div className="min-w-0 flex-1">
        <Link
          to={`/app/planners/${planner.id}`}
          className="block truncate font-medium hover:underline"
        >
          {planner.name}
        </Link>
        <p className="text-sm text-ink-muted">
          {planner._count?.tasks ?? 0} {planner._count?.tasks === 1 ? "task" : "tasks"}
          {planner.category && ` in ${planner.category.name}`}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={isLoading}
        aria-label={`Duplicate ${planner.name}`}
        onClick={() => void duplicate()}
      >
        <Copy aria-hidden className="size-4" />
      </Button>
    </li>
  );
}

export function PlannersPage() {
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [cursor, setCursor] = useState<string>();
  const [items, setItems] = useState<Planner[]>([]);
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(text.trim());
      setCursor(undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [text]);
  const { data: categories } = api.useCategoriesQuery();
  const params = {
    limit: 20,
    ...(search ? { search } : {}),
    ...(categoryId ? { categoryId } : {}),
    ...(cursor ? { cursor } : {}),
  };
  const { data, isLoading, isFetching, error, refetch } = api.usePlannersQuery(params);
  useEffect(() => {
    if (data)
      setItems((prev) =>
        cursor
          ? [...prev, ...data.items.filter((p) => !prev.some((x) => x.id === p.id))]
          : data.items,
      );
  }, [data, cursor]);

  return (
    <>
      <PageHeader
        title="Planners"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/app/templates">Templates</Link>
            </Button>
            <Button asChild>
              <Link to="/app/planners/new">
                <Plus aria-hidden className="size-4" />
                New planner
              </Link>
            </Button>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input
          aria-label="Search planners"
          placeholder="Search planners"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-w-48 flex-1"
        />
        {categories && categories.length > 0 && (
          <NativeSelect
            aria-label="Filter by category"
            className="w-auto"
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setCursor(undefined);
            }}
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        )}
      </div>
      {isLoading && <PageSkeleton />}
      {error && <ErrorState error={error} retry={() => void refetch()} />}
      {data && items.length === 0 && (
        <EmptyState
          icon={ListChecks}
          title={search ? "No planners match your search" : "No planners yet"}
          description={
            search ? "Try another word." : "Create one from scratch, a template, or a description."
          }
          action={
            !search ? (
              <Button asChild>
                <Link to="/app/planners/new">Create a planner</Link>
              </Button>
            ) : undefined
          }
        />
      )}
      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((p) => (
          <PlannerCard key={p.id} planner={p} />
        ))}
      </ul>
      {data?.nextCursor && (
        <Button
          variant="outline"
          className="mt-4 w-full"
          disabled={isFetching}
          onClick={() => setCursor(data.nextCursor!)}
        >
          Load more
        </Button>
      )}
    </>
  );
}

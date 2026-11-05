import { Button } from "@lifeos/ui/components/button";
import { Dialog, DialogContent, DialogTitle } from "@lifeos/ui/components/dialog";
import { Input } from "@lifeos/ui/components/input";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/app/api";
import { NAV } from "./nav";

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 250); // Debounced search (section 3.2).
    return () => clearTimeout(timer);
  }, [text]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  const { data } = api.usePlannersQuery(
    { search: query, limit: 8 },
    { skip: !open || query.length < 2 },
  );
  const pages = NAV.filter((n) => query && n.label.toLowerCase().includes(query.toLowerCase()));
  const close = () => setOpen(false);

  return (
    <>
      <Button variant="ghost" size="icon-sm" aria-label="Search" onClick={() => setOpen(true)}>
        <Search aria-hidden className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby={undefined}>
          <DialogTitle>Search</DialogTitle>
          <Input
            autoFocus
            aria-label="Search planners and pages"
            placeholder="Search planners and pages"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <ul className="max-h-72 space-y-1 overflow-auto">
            {pages.map((p) => (
              <li key={p.to}>
                <Link onClick={close} className="block rounded-lg p-3 hover:bg-surface-2" to={p.to}>
                  {p.label}
                </Link>
              </li>
            ))}
            {data?.items.map((p) => (
              <li key={p.id}>
                <Link
                  onClick={close}
                  className="block rounded-lg p-3 hover:bg-surface-2"
                  to={`/app/planners/${p.id}`}
                >
                  {p.name}
                </Link>
              </li>
            ))}
            {query.length >= 2 && !pages.length && data?.items.length === 0 && (
              <li className="p-3 text-sm text-ink-muted">No results</li>
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}

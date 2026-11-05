import { Button } from "@lifeos/ui/components/button";
import { Input } from "@lifeos/ui/components/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@lifeos/ui/components/tabs";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { api, messageOf, problemOf } from "@/app/api";
import { ErrorState, PageHeader, PageSkeleton } from "@/components/common/states";
import { MfaGate } from "./mfa";

function Audit() {
  const { data, isLoading, error } = api.useAdminAuditQuery({});
  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorState error={error} />;
  return (
    <div className="card-surface overflow-auto p-3">
      <table className="w-full text-sm">
        <caption className="sr-only">Audit events</caption>
        <thead>
          <tr className="border-b text-left text-ink-muted">
            <th scope="col">When</th>
            <th scope="col">Action</th>
            <th scope="col">Entity</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((e) => (
            <tr key={e.id} className="border-b">
              <td className="py-1 pr-3 whitespace-nowrap">
                {new Date(e.createdAt).toLocaleString()}
              </td>
              <td className="pr-3">{e.action}</td>
              <td>{e.entityType}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Users() {
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const { data, error } = api.useAdminUsersQuery(search, { skip: !search });
  const [revoke] = api.useAdminRevokeMutation();
  const act = async (id: string, address: string) => {
    const reason = window.prompt(`Revoke access for ${address}? Enter the reason:`);
    if (!reason) return;
    try {
      await revoke({ id, reason }).unwrap();
      toast.success("Access revoked");
    } catch (err) {
      toast.error(messageOf(err));
    }
  };
  return (
    <div className="card-surface space-y-3 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(email.trim());
        }}
        className="flex gap-2"
      >
        <Input
          aria-label="Exact email address"
          placeholder="Exact email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit">Look up</Button>
      </form>
      {error && <ErrorState error={error} />}
      <ul className="space-y-2">
        {data?.map((u) => (
          <li key={u.authUserId} className="flex items-center justify-between gap-2 text-sm">
            <span>
              {u.email} ({u.role}){u.accessRevokedAt ? ", revoked" : ""}
            </span>
            {!u.accessRevokedAt && (
              <Button variant="outline" size="sm" onClick={() => void act(u.authUserId, u.email)}>
                Revoke access
              </Button>
            )}
          </li>
        ))}
        {data?.length === 0 && <li className="text-sm text-ink-muted">No user found.</li>}
      </ul>
    </div>
  );
}

function Jobs() {
  const { data, isLoading, error } = api.useAdminJobsQuery();
  if (isLoading) return <PageSkeleton />;
  if (error) return <ErrorState error={error} />;
  return (
    <dl className="card-surface grid grid-cols-2 gap-2 p-4 text-sm">
      <dt className="text-ink-muted">Pending outbox events</dt>
      <dd>{data?.pendingOutbox}</dd>
      <dt className="text-ink-muted">Oldest pending</dt>
      <dd>{data?.oldestPendingSeconds}s</dd>
      <dt className="text-ink-muted">Failures, last 24 hours</dt>
      <dd>{data?.failuresLast24h}</dd>
    </dl>
  );
}

export function AdminPage() {
  const { error, refetch } = api.useAdminJobsQuery();
  const problem = problemOf(error);
  const [verified, setVerified] = useState(false);
  if (problem?.status === 404) {
    return (
      <main className="p-8 text-center">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <Link className="text-primary underline" to="/app">
          Go home
        </Link>
      </main>
    );
  }
  const header = (
    <PageHeader
      title="Admin"
      description="Every action here is audited."
      actions={
        <Button variant="outline" asChild>
          <Link to="/app">Back to app</Link>
        </Button>
      }
    />
  );
  if (problem?.code === "mfa_required" && !verified) {
    return (
      <main className="mx-auto max-w-4xl p-4">
        {header}
        <MfaGate
          onDone={() => {
            setVerified(true);
            void refetch();
          }}
        />
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-4xl p-4">
      {header}
      <Tabs defaultValue="audit">
        <TabsList className="mb-4">
          <TabsTrigger value="audit">Audit</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="jobs">Jobs</TabsTrigger>
        </TabsList>
        <TabsContent value="audit">
          <Audit />
        </TabsContent>
        <TabsContent value="users">
          <Users />
        </TabsContent>
        <TabsContent value="jobs">
          <Jobs />
        </TabsContent>
      </Tabs>
    </main>
  );
}

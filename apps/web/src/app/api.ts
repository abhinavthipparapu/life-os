import type { ApiEnvelope, ProblemDetails, QuerySpec } from "@lifeos/contracts";
import {
  createApi,
  fetchBaseQuery,
  type BaseQueryFn,
  type FetchArgs,
} from "@reduxjs/toolkit/query/react";
import { env } from "@/lib/env";
import { supabase } from "@/lib/supabase";
import type {
  AccountRequest,
  Achievement,
  AdherenceResult,
  AiDraft,
  AiUsage,
  Category,
  Dashboard,
  Goal,
  HomeSummary,
  Metric,
  MetricLog,
  Notification,
  Occurrence,
  Planner,
  PlannerDetail,
  Profile,
  SeriesPoint,
  TaskDetail,
  TaskRow,
  Template,
} from "./types";

export interface ApiError {
  status: number;
  problem: ProblemDetails;
}

const raw = fetchBaseQuery({
  baseUrl: `${env.VITE_API_URL}/api/v1`,
  prepareHeaders: async (headers) => {
    const { data } = await supabase.auth.getSession();
    if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
    return headers;
  },
});

/** Unwraps the {data, meta, error} envelope, so components only handle data or a typed problem. */
const baseQuery: BaseQueryFn<
  string | FetchArgs,
  unknown,
  ApiError,
  object,
  { envelopeMeta?: ApiEnvelope<unknown>["meta"] }
> = async (args, api, extra) => {
  const result = await raw(args, api, extra);
  if (result.error) {
    const body = result.error.data as ApiEnvelope<unknown> | undefined;
    const status = typeof result.error.status === "number" ? result.error.status : 0;
    // Revoked or deleted: the local session is dead even though its token has not expired.
    if (body?.error?.code === "access_revoked") {
      const { signOut } = await import("@/features/auth/session");
      void signOut();
    }
    return {
      error: {
        status,
        problem: body?.error ?? {
          type: "about:blank",
          title: status === 0 ? "You appear to be offline" : "Something went wrong",
          status,
        },
      },
    };
  }
  const envelope = result.data as ApiEnvelope<unknown> | null;
  return { data: envelope?.data ?? null, meta: { envelopeMeta: envelope?.meta ?? null } };
};

const list = <T extends string>(type: T, rows?: { id: string }[]) => [
  ...(rows ?? []).map(({ id }) => ({ type, id })),
  { type, id: "LIST" },
];

type Paged<T> = { items: T[]; nextCursor: string | null };

export const api = createApi({
  reducerPath: "api",
  baseQuery,
  tagTypes: [
    "Me",
    "Category",
    "Planner",
    "Task",
    "Occurrence",
    "Metric",
    "MetricLog",
    "Goal",
    "Template",
    "Dashboard",
    "Analytics",
    "Home",
    "Notification",
    "Achievement",
    "AiUsage",
    "Request",
  ],
  endpoints: (b) => ({
    me: b.query<Profile, void>({ query: () => "/me", providesTags: ["Me"] }),
    updateProfile: b.mutation<Profile, Partial<Pick<Profile, "displayName" | "timezone">>>({
      query: (body) => ({ url: "/me", method: "PATCH", body }),
      invalidatesTags: ["Me", "Home"],
    }),
    updatePreferences: b.mutation<Profile, Record<string, unknown>>({
      query: (body) => ({ url: "/me/preferences", method: "PATCH", body }),
      invalidatesTags: ["Me"],
    }),
    accountRequests: b.query<AccountRequest[], void>({
      query: () => "/me/requests",
      providesTags: ["Request"],
    }),
    requestExport: b.mutation<AccountRequest, void>({
      query: () => ({ url: "/me/export", method: "POST", body: {} }),
      invalidatesTags: ["Request"],
    }),
    requestDeletion: b.mutation<AccountRequest, void>({
      query: () => ({ url: "/me/deletion", method: "POST", body: { confirm: "DELETE" } }),
      invalidatesTags: ["Request"],
    }),
    home: b.query<HomeSummary, void>({ query: () => "/home", providesTags: ["Home"] }),

    categories: b.query<Category[], void>({
      query: () => "/categories",
      providesTags: (r) => list("Category", r),
    }),
    createCategory: b.mutation<Category, Partial<Category>>({
      query: (body) => ({ url: "/categories", method: "POST", body }),
      invalidatesTags: [{ type: "Category", id: "LIST" }],
    }),
    updateCategory: b.mutation<Category, Partial<Category> & { id: string }>({
      query: ({ id, ...body }) => ({ url: `/categories/${id}`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "Category", id }],
    }),
    reorderCategories: b.mutation<Category[], string[]>({
      query: (orderedIds) => ({ url: "/categories/reorder", method: "POST", body: { orderedIds } }),
      invalidatesTags: [{ type: "Category", id: "LIST" }],
    }),
    archiveCategory: b.mutation<void, string>({
      query: (id) => ({ url: `/categories/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Category", id: "LIST" }],
    }),

    planners: b.query<
      Paged<Planner>,
      { search?: string; categoryId?: string; cursor?: string; limit?: number }
    >({
      query: (params) => ({ url: "/planners", params }),
      transformResponse: (
        items: Planner[],
        meta: { envelopeMeta?: { nextCursor?: string | null } | null },
      ) => ({
        items,
        nextCursor: meta?.envelopeMeta?.nextCursor ?? null,
      }),
      providesTags: (r) => list("Planner", r?.items),
    }),
    planner: b.query<PlannerDetail, string>({
      query: (id) => `/planners/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Planner", id }],
    }),
    createPlanner: b.mutation<Planner, Record<string, unknown>>({
      query: (body) => ({
        url: "/planners",
        method: "POST",
        body,
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
      invalidatesTags: [{ type: "Planner", id: "LIST" }, "Home"],
    }),
    updatePlanner: b.mutation<
      Planner,
      { id: string; expectedVersion: number } & Record<string, unknown>
    >({
      query: ({ id, ...body }) => ({ url: `/planners/${id}`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Planner", id },
        { type: "Planner", id: "LIST" },
      ],
    }),
    archivePlanner: b.mutation<void, string>({
      query: (id) => ({ url: `/planners/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Planner", id: "LIST" }, "Home", "Occurrence"],
    }),
    clonePlanner: b.mutation<Planner, string>({
      query: (id) => ({
        url: `/planners/${id}/clone`,
        method: "POST",
        body: {},
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
      invalidatesTags: [{ type: "Planner", id: "LIST" }, "Occurrence"],
    }),
    createSection: b.mutation<{ id: string }, { plannerId: string; name: string }>({
      query: ({ plannerId, name }) => ({
        url: `/planners/${plannerId}/sections`,
        method: "POST",
        body: { name },
      }),
      invalidatesTags: (_r, _e, { plannerId }) => [{ type: "Planner", id: plannerId }],
    }),
    createField: b.mutation<{ id: string }, { plannerId: string } & Record<string, unknown>>({
      query: ({ plannerId, ...body }) => ({
        url: `/planners/${plannerId}/fields`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { plannerId }) => [{ type: "Planner", id: plannerId }],
    }),

    task: b.query<TaskDetail, string>({
      query: (id) => `/tasks/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Task", id }],
    }),
    createTask: b.mutation<TaskRow, { plannerId: string } & Record<string, unknown>>({
      query: ({ plannerId, ...body }) => ({
        url: `/planners/${plannerId}/tasks`,
        method: "POST",
        body,
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
      invalidatesTags: (_r, _e, { plannerId }) => [
        { type: "Planner", id: plannerId },
        "Occurrence",
        "Home",
      ],
    }),
    updateTask: b.mutation<
      TaskRow,
      { id: string; plannerId: string; expectedVersion: number } & Record<string, unknown>
    >({
      query: ({ id, plannerId: _p, ...body }) => ({ url: `/tasks/${id}`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { id, plannerId }) => [
        { type: "Task", id },
        { type: "Planner", id: plannerId },
        "Occurrence",
      ],
    }),
    reparentTask: b.mutation<
      TaskRow,
      {
        id: string;
        plannerId: string;
        parentTaskId: string | null;
        sortOrder?: number;
        expectedVersion: number;
      }
    >({
      query: ({ id, plannerId: _p, ...body }) => ({
        url: `/tasks/${id}/reparent`,
        method: "POST",
        body,
      }),
      invalidatesTags: (_r, _e, { id, plannerId }) => [
        { type: "Task", id },
        { type: "Planner", id: plannerId },
      ],
    }),
    archiveTask: b.mutation<void, { id: string; plannerId: string }>({
      query: ({ id }) => ({ url: `/tasks/${id}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, { plannerId }) => [
        { type: "Planner", id: plannerId },
        "Occurrence",
        "Home",
      ],
    }),

    occurrences: b.query<Occurrence[], { from: string; to: string; plannerId?: string }>({
      query: (params) => ({ url: "/occurrences", params }),
      providesTags: ["Occurrence"],
    }),
    deferOccurrence: b.mutation<
      Occurrence,
      { id: string; toDate: string; expectedVersion?: number }
    >({
      query: ({ id, ...body }) => ({ url: `/occurrences/${id}/defer`, method: "POST", body }),
      invalidatesTags: ["Occurrence", "Home", "Analytics"],
    }),

    metrics: b.query<Metric[], void>({
      query: () => "/metrics",
      providesTags: (r) => list("Metric", r),
    }),
    createMetric: b.mutation<Metric, Record<string, unknown>>({
      query: (body) => ({ url: "/metrics", method: "POST", body }),
      invalidatesTags: [{ type: "Metric", id: "LIST" }],
    }),
    metricLogs: b.query<MetricLog[], { metricId?: string; limit?: number }>({
      query: (params) => ({ url: "/metric-logs", params }),
      providesTags: ["MetricLog"],
    }),
    logMetric: b.mutation<MetricLog, Record<string, unknown>>({
      query: (body) => ({ url: "/metric-logs", method: "POST", body }),
      invalidatesTags: ["MetricLog", "Goal", "Analytics"],
    }),

    goals: b.query<Goal[], void>({ query: () => "/goals", providesTags: (r) => list("Goal", r) }),
    createGoal: b.mutation<Goal, Record<string, unknown>>({
      query: (body) => ({ url: "/goals", method: "POST", body }),
      invalidatesTags: [{ type: "Goal", id: "LIST" }, "Home"],
    }),
    archiveGoal: b.mutation<void, string>({
      query: (id) => ({ url: `/goals/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Goal", id: "LIST" }, "Home"],
    }),

    templates: b.query<Template[], { search?: string }>({
      query: (params) => ({ url: "/templates", params }),
      providesTags: (r) => list("Template", r),
    }),
    template: b.query<Template, { id: string; version?: number }>({
      query: ({ id, version }) => ({ url: `/templates/${id}`, params: version ? { version } : {} }),
      providesTags: (_r, _e, { id }) => [{ type: "Template", id }],
    }),
    createTemplate: b.mutation<Template, Record<string, unknown>>({
      query: (body) => ({ url: "/templates", method: "POST", body }),
      invalidatesTags: [{ type: "Template", id: "LIST" }],
    }),
    instantiateTemplate: b.mutation<
      Planner,
      { id: string; version?: number; categoryId?: string | null; name?: string }
    >({
      query: ({ id, ...body }) => ({
        url: `/templates/${id}/instantiate`,
        method: "POST",
        body,
        headers: { "Idempotency-Key": crypto.randomUUID() },
      }),
      invalidatesTags: [{ type: "Planner", id: "LIST" }, "Occurrence", "Home"],
    }),

    dashboards: b.query<Dashboard[], void>({
      query: () => "/dashboards",
      providesTags: (r) => list("Dashboard", r),
    }),
    dashboard: b.query<Dashboard, string>({
      query: (id) => `/dashboards/${id}`,
      providesTags: (_r, _e, id) => [{ type: "Dashboard", id }],
    }),
    createDashboard: b.mutation<Dashboard, Record<string, unknown>>({
      query: (body) => ({ url: "/dashboards", method: "POST", body }),
      invalidatesTags: [{ type: "Dashboard", id: "LIST" }],
    }),
    updateDashboard: b.mutation<Dashboard, { id: string } & Record<string, unknown>>({
      query: ({ id, ...body }) => ({ url: `/dashboards/${id}`, method: "PATCH", body }),
      invalidatesTags: (_r, _e, { id }) => [
        { type: "Dashboard", id },
        { type: "Dashboard", id: "LIST" },
      ],
    }),
    archiveDashboard: b.mutation<void, string>({
      query: (id) => ({ url: `/dashboards/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Dashboard", id: "LIST" }],
    }),
    analyticsQuery: b.query<SeriesPoint[], QuerySpec>({
      query: (body) => ({ url: "/analytics/query", method: "POST", body }),
      providesTags: ["Analytics"],
    }),
    adherence: b.query<
      AdherenceResult,
      { from: string; to: string; plannerId?: string; categoryId?: string }
    >({
      query: (params) => ({ url: "/analytics/adherence", params }),
      providesTags: ["Analytics"],
    }),

    aiUsage: b.query<AiUsage, void>({ query: () => "/ai/usage", providesTags: ["AiUsage"] }),
    createDraft: b.mutation<AiDraft, { prompt: string; includeSensitive?: boolean }>({
      query: (body) => ({ url: "/ai/planner-drafts", method: "POST", body }),
      invalidatesTags: ["AiUsage"],
    }),
    applyDraft: b.mutation<Planner, { id: string; snapshot?: unknown; categoryId?: string | null }>(
      {
        query: ({ id, ...body }) => ({
          url: `/ai/planner-drafts/${id}/apply`,
          method: "POST",
          body,
        }),
        invalidatesTags: [{ type: "Planner", id: "LIST" }, "Occurrence", "Home"],
      },
    ),
    askData: b.mutation<
      {
        answer: string;
        sources: { label: string; value: number | null; unit?: string | null }[];
        range: { from: string; to: string };
      },
      string
    >({
      query: (question) => ({ url: "/ai/ask", method: "POST", body: { question } }),
      invalidatesTags: ["AiUsage"],
    }),
    suggestSchedule: b.mutation<
      {
        draft: { id: string };
        proposals: {
          taskId: string;
          title: string;
          current: string | null;
          localTime: string;
          reason: string;
        }[];
        conflicts: string[];
      },
      { plannerId: string; constraints: string }
    >({
      query: (body) => ({ url: "/ai/schedule-suggestions", method: "POST", body }),
      invalidatesTags: ["AiUsage"],
    }),
    applySchedule: b.mutation<{ applied: number }, string>({
      query: (id) => ({ url: `/ai/schedule-drafts/${id}/apply`, method: "POST", body: {} }),
      invalidatesTags: ["Occurrence", { type: "Planner", id: "LIST" }],
    }),

    notifications: b.query<Notification[], void>({
      query: () => "/notifications",
      providesTags: ["Notification"],
    }),
    readNotification: b.mutation<void, string>({
      query: (id) => ({ url: `/notifications/${id}/read`, method: "POST", body: {} }),
      invalidatesTags: ["Notification"],
    }),
    readAllNotifications: b.mutation<void, void>({
      query: () => ({ url: "/notifications/read-all", method: "POST", body: {} }),
      invalidatesTags: ["Notification"],
    }),
    achievements: b.query<Achievement[], void>({
      query: () => "/achievements",
      providesTags: ["Achievement"],
    }),

    adminAudit: b.query<
      {
        id: string;
        action: string;
        entityType: string;
        entityId: string | null;
        actorId: string | null;
        createdAt: string;
      }[],
      { action?: string }
    >({
      query: (params) => ({ url: "/admin/audit-events", params }),
    }),
    adminUsers: b.query<
      {
        authUserId: string;
        email: string;
        role: string;
        createdAt: string;
        accessRevokedAt: string | null;
      }[],
      string
    >({
      query: (email) => ({ url: "/admin/users", params: { email } }),
    }),
    adminJobs: b.query<
      {
        pendingOutbox: number;
        oldestPendingSeconds: number;
        failuresLast24h: number;
        jobs: { job: string; status: string; count: number }[];
      },
      void
    >({
      query: () => "/admin/jobs/health",
    }),
    adminRevoke: b.mutation<void, { id: string; reason: string }>({
      query: ({ id, reason }) => ({
        url: `/admin/users/${id}/revoke`,
        method: "POST",
        body: { confirm: "REVOKE", reason },
      }),
    }),
  }),
});

export const problemOf = (error: unknown) => (error as ApiError | undefined)?.problem;
export const messageOf = (error: unknown) => problemOf(error)?.title ?? "Something went wrong";

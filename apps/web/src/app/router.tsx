import { Button } from "@lifeos/ui/components/button";
import {
  createBrowserRouter,
  Link,
  Outlet,
  ScrollRestoration,
  useRouteError,
} from "react-router-dom";
import { AppShell } from "@/components/shell/app-shell";
import { PublicOnly, RequireAuth } from "@/features/auth/session";

function RouteError() {
  const error = useRouteError() as { status?: number } | undefined;
  const missing = error?.status === 404;
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">
          {missing ? "Page not found" : "Something went wrong"}
        </h1>
        <p className="mt-2 text-ink-muted">
          {missing ? "That page doesn't exist." : "Your data is safe. Please try again."}
        </p>
        <Button className="mt-4" asChild>
          <Link to="/app">Go home</Link>
        </Button>
      </div>
    </main>
  );
}

function Root() {
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  );
}

/** One lazy chunk per feature, each loaded on first visit (section 3.2). */
const page = <T extends object>(load: () => Promise<T>, name: keyof T) => ({
  lazy: async () => ({ Component: (await load())[name] as React.ComponentType }),
  errorElement: <RouteError />,
  HydrateFallback: () => null,
});
const auth = () => import("@/features/auth/pages");
const marketing = () => import("@/features/marketing/pages");
const planners = () => import("@/features/planners/library");
const dashboards = () => import("@/features/dashboards/pages");

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteError />,
    HydrateFallback: () => null,
    children: [
      { path: "/", ...page(marketing, "LandingPage") },
      { path: "/privacy", ...page(marketing, "PrivacyPage") },
      { path: "/terms", ...page(marketing, "TermsPage") },
      { path: "/verify-email", ...page(auth, "VerifyEmailPage") },
      {
        path: "/check-email",
        ...page(() => import("@/features/auth/check-email"), "CheckEmailPage"),
      },
      { path: "/forgot-password", ...page(auth, "ForgotPasswordPage") },
      { path: "/reset-password", ...page(auth, "ResetPasswordPage") },
      {
        element: <PublicOnly />,
        children: [
          { path: "/login", ...page(auth, "LoginPage") },
          { path: "/signup", ...page(auth, "SignupPage") },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          { path: "/admin/*", ...page(() => import("@/features/admin/page"), "AdminPage") },
          {
            path: "/app",
            element: <AppShell />,
            errorElement: <RouteError />,
            children: [
              { index: true, ...page(() => import("@/features/home/page"), "HomePage") },
              { path: "today", ...page(() => import("@/features/today/page"), "TodayPage") },
              {
                path: "calendar",
                ...page(() => import("@/features/calendar/page"), "CalendarPage"),
              },
              {
                path: "categories",
                ...page(() => import("@/features/categories/page"), "CategoriesPage"),
              },
              { path: "planners", ...page(planners, "PlannersPage") },
              {
                path: "planners/new",
                ...page(() => import("@/features/planners/new"), "NewPlannerPage"),
              },
              {
                path: "planners/:id",
                ...page(() => import("@/features/planners/detail"), "PlannerPage"),
              },
              {
                path: "planners/:id/edit",
                ...page(() => import("@/features/planners/builder"), "PlannerBuilder"),
              },
              {
                path: "templates",
                ...page(() => import("@/features/templates/page"), "TemplatesPage"),
              },
              { path: "tasks/:id", ...page(() => import("@/features/tasks/page"), "TaskPage") },
              { path: "goals", ...page(() => import("@/features/goals/page"), "GoalsPage") },
              { path: "dashboards", ...page(dashboards, "DashboardsPage") },
              { path: "dashboards/:id/edit", ...page(dashboards, "DashboardEditPage") },
              {
                path: "analytics",
                ...page(() => import("@/features/analytics/page"), "AnalyticsPage"),
              },
              { path: "ai", ...page(() => import("@/features/ai/page"), "AiPage") },
              {
                path: "notifications",
                ...page(() => import("@/features/notifications/page"), "NotificationsPage"),
              },
              {
                path: "settings",
                ...page(() => import("@/features/settings/page"), "SettingsPage"),
              },
            ],
          },
        ],
      },
    ],
  },
]);

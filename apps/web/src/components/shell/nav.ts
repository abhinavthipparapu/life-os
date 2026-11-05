import {
  BarChart3,
  Bot,
  Calendar,
  CheckSquare,
  FolderTree,
  Home,
  LayoutDashboard,
  LayoutTemplate,
  ListChecks,
  Settings,
  Target,
  Bell,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV: NavItem[] = [
  { to: "/app", label: "Home", icon: Home, end: true },
  { to: "/app/today", label: "Today", icon: CheckSquare },
  { to: "/app/calendar", label: "Calendar", icon: Calendar },
  { to: "/app/planners", label: "Planners", icon: ListChecks },
  { to: "/app/categories", label: "Categories", icon: FolderTree },
  { to: "/app/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/app/goals", label: "Goals", icon: Target },
  { to: "/app/dashboards", label: "Dashboards", icon: LayoutDashboard },
  { to: "/app/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/app/ai", label: "Assistant", icon: Bot },
  { to: "/app/notifications", label: "Notifications", icon: Bell },
  { to: "/app/settings", label: "Settings", icon: Settings },
];

export const MOBILE_PRIMARY = ["/app", "/app/today", "/app/planners", "/app/goals"];

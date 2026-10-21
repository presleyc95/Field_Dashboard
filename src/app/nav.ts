import {
  CalendarRange,
  ClipboardCheck,
  FileText,
  FolderKanban,
  Gauge,
  LineChart,
  type LucideIcon,
  Search,
  Settings,
  ShieldAlert,
  User,
  Users,
} from "lucide-react";

export type NavItem = {
  path: string;
  label: string;
  icon: LucideIcon;
};

export const NAV_ITEMS: NavItem[] = [
  { path: "/", label: "Command Center", icon: Gauge },
  { path: "/daily", label: "Daily Report", icon: FileText },
  { path: "/hitches", label: "Hitches", icon: CalendarRange },
  { path: "/production", label: "Production", icon: LineChart },
  { path: "/projects", label: "Projects", icon: FolderKanban },
  { path: "/teams", label: "Teams", icon: Users },
  { path: "/people", label: "People", icon: User },
  { path: "/search", label: "Search", icon: Search },
  { path: "/queue", label: "Upload Queue", icon: ClipboardCheck },
  { path: "/quality", label: "Data Quality", icon: ShieldAlert },
  { path: "/settings", label: "Settings", icon: Settings },
];

/** Label for the header breadcrumb, including routes that aren't in the sidebar. */
export function pageLabel(pathname: string): string {
  if (pathname.startsWith("/permit/")) return "Permit";
  const match = NAV_ITEMS.filter((item) => item.path !== "/").find((item) =>
    pathname.startsWith(item.path),
  );
  return (match ?? NAV_ITEMS[0]!).label;
}

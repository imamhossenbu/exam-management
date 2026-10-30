import {
  BarChart3,
  BookOpen,
  ClipboardCheck,
  FileStack,
  FileText,
  GraduationCap,
  LayoutDashboard,
  Settings,
  Ticket,
  Trophy,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; exact?: boolean };
export type NavGroup = { label: string; items: NavItem[] };
export type NavKind = "teacher" | "student";

export const NAV: Record<NavKind, NavGroup[]> = {
  teacher: [
    { label: "Overview", items: [{ href: "/teacher", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
    {
      label: "Teaching",
      items: [
        { href: "/teacher/courses", label: "Courses", icon: BookOpen },
        { href: "/teacher/students", label: "Students", icon: Users },
        { href: "/teacher/exams", label: "Exams", icon: FileText },
        { href: "/teacher/sources", label: "Question sources", icon: FileStack },
      ],
    },
    {
      label: "Assessment",
      items: [
        { href: "/teacher/grading", label: "Grading", icon: ClipboardCheck },
        { href: "/teacher/results", label: "Results", icon: BarChart3 },
      ],
    },
    { label: "Account", items: [{ href: "/teacher/settings", label: "Settings", icon: Settings }] },
  ],
  student: [
    { label: "Overview", items: [{ href: "/student", label: "Dashboard", icon: LayoutDashboard, exact: true }] },
    {
      label: "Learning",
      items: [
        { href: "/student/courses", label: "My courses", icon: GraduationCap },
        { href: "/student/exams", label: "Exams", icon: FileText },
        { href: "/student/results", label: "Results", icon: Trophy },
        { href: "/student/notes", label: "Resources", icon: FileStack },
      ],
    },
    {
      label: "Account",
      items: [
        { href: "/student/join", label: "Join a course", icon: Ticket },
        { href: "/student/settings", label: "Settings", icon: Settings },
      ],
    },
  ],
};

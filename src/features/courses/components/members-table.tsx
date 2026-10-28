"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { MoreHorizontal, UserCheck, UserMinus, UserPlus, UserX, Users } from "lucide-react";
import { DataTable, dataTableColumns } from "@/components/tables/data-table";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { formatDate } from "@/lib/utils/datetime";
import { enrollByEmailSchema, type EnrollByEmailInput } from "@/lib/validations/courses";
import { enrollByEmailAction, setMemberStatusAction } from "../actions";
import type { CourseMemberRow } from "../queries";

type Row = CourseMemberRow & { timezone: string };
const col = dataTableColumns<Row>();

const STATUS: Record<CourseMemberRow["status"], { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "success" },
  suspended: { label: "Suspended", tone: "warning" },
  removed: { label: "Removed", tone: "neutral" },
};

function MemberActions({ member }: { member: Row }) {
  const { run } = useServerAction(setMemberStatusAction);
  const set = (status: CourseMemberRow["status"]) => run({ memberId: member.id, status }).then((r) => r?.ok ?? false);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.name}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem asChild>
          <Link href={`/teacher/students/${member.studentId}`}>View profile</Link>
        </DropdownMenuItem>
        {member.status !== "active" ? (
          <DropdownMenuItem onSelect={() => set("active")}>
            <UserCheck aria-hidden /> Reactivate
          </DropdownMenuItem>
        ) : null}
        {member.status === "active" ? (
          <ConfirmDialog
            title={`Suspend ${member.name}?`}
            description="They keep their history but lose access to this course and can't rejoin with a code until you reactivate them."
            confirmLabel="Suspend"
            onConfirm={() => set("suspended")}
            trigger={
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <UserX aria-hidden /> Suspend
              </DropdownMenuItem>
            }
          />
        ) : null}
        {member.status !== "removed" ? (
          <ConfirmDialog
            title={`Remove ${member.name} from the course?`}
            description="They lose access to this course. Their past attempts and results are kept. They can rejoin later with a valid code."
            confirmLabel="Remove"
            destructive
            onConfirm={() => set("removed")}
            trigger={
              <DropdownMenuItem destructive onSelect={(e) => e.preventDefault()}>
                <UserMinus aria-hidden /> Remove
              </DropdownMenuItem>
            }
          />
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const columns = [
  col.accessor("name", {
    header: "Student",
    sortFn: "text",
    cell: (info) => (
      <div>
        <Link href={`/teacher/students/${info.row.original.studentId}`} className="font-medium hover:underline">
          {info.getValue()}
        </Link>
        <p className="text-xs text-muted-foreground">{info.row.original.email}</p>
      </div>
    ),
  }),
  col.accessor("email", { header: "Email", cell: () => null, enableSorting: false }),
  col.accessor("status", {
    header: "Status",
    filterFn: "equalsString",
    cell: (info) => <Badge tone={STATUS[info.getValue()].tone}>{STATUS[info.getValue()].label}</Badge>,
  }),
  col.accessor("joinedAt", { header: "Joined", sortFn: "datetime", cell: (info) => formatDate(info.getValue(), info.row.original.timezone) }),
  col.display({ id: "actions", header: () => <span className="sr-only">Actions</span>, cell: (info) => <MemberActions member={info.row.original} /> }),
];

export function EnrollStudentDialog({ courseId }: { courseId: string }) {
  const [open, setOpen] = React.useState(false);
  const form = useForm<EnrollByEmailInput>({ resolver: zodResolver(enrollByEmailSchema), defaultValues: { courseId, email: "" } });
  const { run, pending } = useServerAction(enrollByEmailAction);
  return (
    <Dialog open={open} onOpenChange={(o) => !pending && (setOpen(o), o && form.reset({ courseId, email: "" }))}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus aria-hidden /> Enroll by email
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Enroll an existing student</DialogTitle>
          <DialogDescription>The student must already have an account. Otherwise, share an invitation code.</DialogDescription>
        </DialogHeader>
        <form
          noValidate
          className="grid gap-4"
          onSubmit={form.handleSubmit(async (v) => {
            const r = await run(v);
            applyFieldErrors(form.setError, r);
            if (r?.ok) setOpen(false);
          })}
        >
          <Field id="enroll-email" label="Student email" error={form.formState.errors.email?.message}>
            {(a) => <Input type="email" autoComplete="off" placeholder="student@example.com" {...a} {...form.register("email")} />}
          </Field>
          <DialogFooter>
            <Button type="submit" pending={pending}>
              Enroll
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MembersTable({ courseId, members, timezone }: { courseId: string; members: CourseMemberRow[]; timezone: string }) {
  return (
    <DataTable
      caption="Enrolled students"
      columns={columns}
      data={members.map((m) => ({ ...m, timezone }))}
      getRowId={(r) => r.id}
      searchPlaceholder="Search by name or email…"
      filters={[{ columnId: "status", label: "Statuses", options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })) }]}
      toolbar={<EnrollStudentDialog courseId={courseId} />}
      emptyState={
        <EmptyState
          icon={Users}
          title="No students yet"
          description="Create an invitation code on the Invitations tab and share it with your students, or enroll an existing account by email."
          action={<EnrollStudentDialog courseId={courseId} />}
        />
      }
    />
  );
}

"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, Check, Copy, KeyRound, Plus, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/shared/empty-state";
import { applyFieldErrors, useServerAction } from "@/components/forms/use-server-action";
import { inviteSchema, type InviteInput } from "@/lib/validations/courses";
import { createInviteAction, revokeInviteAction } from "../actions";
import type { CourseInviteRow } from "../queries";
import { DateTimeText, T, tNow, useFormatters, useT } from "@/lib/i18n/client";

function inviteState(invite: CourseInviteRow, now: number) {
  if (invite.revoked_at) return { label: "Revoked", tone: "neutral" as const };
  if (invite.expires_at && new Date(invite.expires_at).getTime() <= now) return { label: "Expired", tone: "neutral" as const };
  if (invite.max_uses && invite.use_count >= invite.max_uses) return { label: "Full", tone: "warning" as const };
  return { label: "Active", tone: "success" as const };
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(tNow("Code copied"));
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error(tNow("Couldn't copy automatically. Select the code and copy it manually."));
        }
      }}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Copy"}
    </Button>
  );
}

function CreateInviteDialog({ courseId, disabled }: { courseId: string; disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [code, setCode] = React.useState<string | null>(null);
  const defaults: InviteInput = { courseId, label: "", expiresInDays: "14", maxUses: "" };
  const form = useForm<InviteInput>({ resolver: zodResolver(inviteSchema), defaultValues: defaults });
  const { run, pending } = useServerAction(createInviteAction);
  const { errors } = form.formState;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (pending) return;
        setOpen(o);
        if (o) {
          setCode(null);
          form.reset(defaults);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button disabled={disabled}>
          <Plus aria-hidden /> <T>New invitation</T>
        </Button>
      </DialogTrigger>
      <DialogContent size="sm">
        {code ? (
          <>
            <DialogHeader>
              <DialogTitle><T>Share this code</T></DialogTitle>
              <DialogDescription>
                <T>For security only a fingerprint of the code is stored, so this is the only time it&apos;s shown. Copy it now.</T>
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border bg-muted px-3 py-2 text-center font-mono text-lg tracking-widest select-all">{code}</code>
              <CopyButton value={code} />
            </div>
            <p className="text-subtle"><T>Students enter it under “Join a course”. You can revoke it at any time.</T></p>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}><T>Done</T></Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle><T>New invitation code</T></DialogTitle>
              <DialogDescription><T>Set an expiry and an optional limit on how many students can use it.</T></DialogDescription>
            </DialogHeader>
            <form
              noValidate
              className="grid gap-4"
              onSubmit={form.handleSubmit(async (v) => {
                const r = await run(v);
                applyFieldErrors(form.setError, r);
                if (r?.ok) setCode(r.data.code);
              })}
            >
              <Field id="invite-label" label="Label" description="Optional, for your reference (e.g. “Section A”)." error={errors.label?.message}>
                {(a) => <Input placeholder="e.g. Section A, Morning batch" {...a} {...form.register("label")} />}
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field id="invite-expiry" label="Expires after (days)" description="Empty = never" error={errors.expiresInDays?.message}>
                  {(a) => <Input type="number" min={1} max={365} inputMode="numeric" placeholder="Never" {...a} {...form.register("expiresInDays")} />}
                </Field>
                <Field id="invite-max" label="Max uses" description="Empty = unlimited" error={errors.maxUses?.message}>
                  {(a) => <Input type="number" min={1} inputMode="numeric" placeholder="Unlimited" {...a} {...form.register("maxUses")} />}
                </Field>
              </div>
              <DialogFooter>
                <Button type="submit" pending={pending}>
                  <KeyRound aria-hidden /> <T>Generate code</T>
                </Button>
              </DialogFooter>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function InvitesPanel({
  courseId,
  invites,
  timezone,
  archived,
  now,
}: {
  courseId: string;
  invites: CourseInviteRow[];
  timezone: string;
  archived: boolean;
  now: number;
}) {
  const t = useT();
  const f = useFormatters();
  const { run } = useServerAction(revokeInviteAction);
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-subtle">
          {archived ? "This course is archived, so its codes can't be used." : "Codes are validated on the server and rate-limited against guessing."}
        </p>
        <CreateInviteDialog courseId={courseId} disabled={archived} />
      </div>
      {invites.length === 0 ? (
        <EmptyState icon={Ticket} title="No invitation codes" description="Create a code and share it with your students so they can join this course." />
      ) : (
        <ul className="surface divide-y">
          {invites.map((invite) => {
            const state = inviteState(invite, now);
            return (
              <li key={invite.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="font-medium">
                    <span className="font-mono">••••-••••-{invite.code_hint}</span>
                    {invite.label ? <span className="ml-2 text-muted-foreground">{invite.label}</span> : null}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("Used {n}", { n: invite.use_count })}
                    {invite.max_uses ? ` / ${invite.max_uses}` : ""} · {invite.expires_at ? t("Expires {when}", { when: f.dateTime(invite.expires_at, timezone) }) : t("No expiry")} · {t("Created")}{" "}
                    <DateTimeText iso={invite.created_at} timeZone={timezone} />
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={state.tone}>{state.label}</Badge>
                  {!invite.revoked_at ? (
                    <ConfirmDialog
                      title="Revoke this code?"
                      description="Students who already joined stay enrolled. Nobody new can join with this code."
                      confirmLabel="Revoke"
                      destructive
                      onConfirm={async () => (await run(invite.id))?.ok ?? false}
                      trigger={
                        <Button variant="ghost" size="sm">
                          <Ban aria-hidden /> <T>Revoke</T>
                        </Button>
                      }
                    />
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

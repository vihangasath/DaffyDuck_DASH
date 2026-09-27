"use client";
import { useState } from "react";
import { KeyRound, RotateCcw } from "lucide-react";
import { Button, Card } from "@waypoint/ui/ui";
import { PageHeader } from "@/components/shell";
import { Field, TextInput } from "@/components/kit";
import { api, useAdminMutation } from "@/lib/api";
import { useAdmin } from "@/lib/session";

export default function SettingsPage() {
  const [me] = useAdmin();
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const [confirm, setConfirm] = useState("");
  const change = useAdminMutation((x: { current: string; next: string }) => api("/auth/password", { body: x }), "Your password has been changed.");
  const reset = useAdminMutation(() => api("/admin/reset", { body: {} }), "Operations reset to the start of the demo day.");
  const mismatch = pw.again.length > 0 && pw.next !== pw.again;
  return (
    <>
      <PageHeader title="Settings" sub={me ? `Signed in as ${me.name} (${me.username})` : undefined} />
      <div className="grid max-w-3xl gap-5 p-5 lg:p-7">
        <Card className="grid gap-4 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary"><KeyRound className="size-5" /></span>
            <div>
              <h2 className="font-bold">Your password</h2>
              <p className="text-sm text-ink-2">At least 8 characters with a letter and a number.</p>
            </div>
          </div>
          <form
            className="grid gap-4 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!mismatch) change.mutate({ current: pw.current, next: pw.next }, { onSuccess: () => setPw({ current: "", next: "", again: "" }) });
            }}
          >
            <Field label="Current password"><TextInput required type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password"><TextInput required type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <Field label="New password again" hint={mismatch ? <span className="text-danger">Doesn’t match.</span> : undefined}><TextInput required type="password" autoComplete="new-password" value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} /></Field>
            <div className="sm:col-span-3"><Button type="submit" busy={change.isPending} disabled={mismatch}>Change password</Button></div>
          </form>
        </Card>

        <Card className="grid gap-4 border-danger/30 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-danger-soft text-danger"><RotateCcw className="size-5" /></span>
            <div>
              <h2 className="font-bold">Reset the demo day</h2>
              <p className="text-sm text-ink-2">Clears today’s plans, loading, deliveries, receipts, notices and exceptions and restores the seeded orders. Drivers, branches, vehicles, products, accounts and the activity log are kept.</p>
            </div>
          </div>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              reset.mutate(undefined, { onSuccess: () => setConfirm("") });
            }}
          >
            <Field label="Type RESET to confirm" className="w-48"><TextInput value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
            <Button type="submit" kind="danger" busy={reset.isPending} disabled={confirm !== "RESET"}>Reset operations</Button>
          </form>
        </Card>
      </div>
    </>
  );
}

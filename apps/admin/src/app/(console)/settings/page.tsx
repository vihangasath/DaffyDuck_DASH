"use client";
import { useState } from "react";
import { Button, Field, IndexCard, PageHeader, TextInput, Typed } from "@/components/cabinet";
import { api, usePeopleMutation } from "@/lib/api";
import { useAdmin } from "@/lib/session";

export default function SettingsPage() {
  const [me] = useAdmin();
  const [pw, setPw] = useState({ current: "", next: "", again: "" });
  const change = usePeopleMutation((x: { current: string; next: string }) => api("/auth/password", { body: x }), "Your password has been changed.");
  const mismatch = pw.again.length > 0 && pw.next !== pw.again;
  return (
    <>
      <PageHeader title="Settings" sub={me ? <>Signed in as {me.name} (<Typed>{me.username}</Typed>)</> : undefined} />
      <div className="grid max-w-3xl gap-6 px-5 lg:px-8">
        <IndexCard title="Your password">
          <p className="mb-4 text-sm text-ink-2">At least 8 characters, with a letter and a number. Other people’s passwords are set from their folder.</p>
          <form
            className="grid gap-3.5 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!mismatch) change.mutate({ current: pw.current, next: pw.next }, { onSuccess: () => setPw({ current: "", next: "", again: "" }) });
            }}
          >
            <Field label="Current password"><TextInput required type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></Field>
            <Field label="New password"><TextInput required type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></Field>
            <Field label="New password again" hint={mismatch ? <span className="text-danger">Doesn’t match the new password.</span> : undefined}>
              <TextInput required type="password" autoComplete="new-password" aria-invalid={mismatch} value={pw.again} onChange={(e) => setPw({ ...pw, again: e.target.value })} />
            </Field>
            <div className="sm:col-span-3"><Button type="submit" busy={change.isPending} disabled={mismatch}>Change password</Button></div>
          </form>
        </IndexCard>
        <p className="text-sm text-ink-2">Vehicles, depots, branches, products and the demo-day reset are managed by dispatch in the Waypoint operations app.</p>
      </div>
    </>
  );
}

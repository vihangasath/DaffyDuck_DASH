"use client";
import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { DEMO_DATE } from "@waypoint/core/reference";
import { fmtDate } from "@waypoint/core/domain/time";
import { Button, Card } from "@waypoint/ui/ui";
import { Field, TextInput } from "@waypoint/ui/kit";
import { PageHeader } from "@/components/dispatcher-shell";
import { records, useRecordsMutation } from "@/lib/records";

export default function DemoDayPage() {
  const [confirm, setConfirm] = useState("");
  const reset = useRecordsMutation(() => records("/reset", { body: {} }), "Operations reset to the start of the demo day.");
  return (
    <>
      <PageHeader title="Demo day" sub={`Waypoint runs on ${fmtDate(DEMO_DATE)} for the Tech-Triathlon walkthrough.`} />
      <div className="grid max-w-3xl gap-5 p-5 lg:p-7">
        <Card className="grid gap-4 border-danger/30 p-5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-xl bg-danger-soft text-danger"><RotateCcw className="size-5" /></span>
            <div>
              <h2 className="font-bold">Reset the demo day</h2>
              <p className="text-sm text-ink-2">Clears today’s plans, loading, deliveries, receipts, notices and exceptions for both depots and restores the seeded orders. Vehicles, branches, products, staff, logins and the activity log are kept.</p>
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

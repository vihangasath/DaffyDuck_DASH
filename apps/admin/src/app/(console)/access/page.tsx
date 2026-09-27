"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { KeyRound, KeySquare } from "lucide-react";
import { JOB_LABEL, type StaffRow } from "@waypoint/core/people";
import { cx } from "@waypoint/ui/ui";
import { Dividers, ErrorNote, JobTab, Ledger, Loading, PageHeader, SearchBox, Stamp, Typed, depotLabel, fmtWhen, matches, type Column } from "@/components/cabinet";
import { usePeople } from "@/lib/api";

type Show = "all" | "on" | "now" | "none" | "off";

export default function AccessPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Access />
    </Suspense>
  );
}

function Access() {
  const params = useSearchParams();
  const router = useRouter();
  const { data, error, isLoading } = usePeople<StaffRow[]>("/staff");
  const [q, setQ] = useState("");
  const show = (params.get("show") as Show) ?? "all";
  const all = (data ?? []).filter((s) => s.login || s.status !== "left");
  const test: Record<Show, (s: StaffRow) => boolean> = {
    all: () => true,
    on: (s) => !!s.login?.active,
    now: (s) => (s.login?.sessions ?? 0) > 0,
    none: (s) => !s.login && s.status === "active",
    off: (s) => !!s.login && !s.login.active,
  };
  const rows = all.filter((s) => test[show](s) && matches(q, s.name, s.id, s.login?.username, s.outletName));

  const columns: Column<StaffRow>[] = [
    {
      key: "who", header: "Person", sort: (s) => s.name,
      cell: (s) => (
        <span className="flex items-center gap-2.5">
          <JobTab job={s.jobRole} bare />
          <span className="min-w-0">
            <b className="block truncate font-semibold">{s.name}</b>
            <span className="text-xs text-ink-2">{JOB_LABEL[s.jobRole]} · <Typed className="text-[12px]">{s.id}</Typed></span>
          </span>
          <Stamp status={s.status} className="text-[10px]" />
        </span>
      ),
    },
    { key: "user", header: "Username", sort: (s) => s.login?.username ?? "~", cell: (s) => (s.login ? <Typed>{s.login.username}</Typed> : <span className="flex items-center gap-1.5 text-stamp-leave"><KeyRound className="size-3.5" /> No login</span>) },
    { key: "where", header: "Works at", sort: (s) => s.outletName ?? s.depotId, cell: (s) => <span className="text-ink-2">{s.jobRole === "store_manager" ? (s.outletName ?? "—") : depotLabel(s.depotId)}{s.login?.outletScope === "depot" && " · all depot branches"}</span> },
    { key: "last", header: "Last sign-in", sort: (s) => s.login?.lastLoginAt ?? "", cell: (s) => (s.login ? <span>{fmtWhen(s.login.lastLoginAt)}{s.login.sessions > 0 && <span className="text-success"> · signed in</span>}</span> : <span className="text-muted">—</span>) },
    {
      key: "state", header: "Sign-in", sort: (s) => (!s.login ? 2 : s.login.active ? 0 : 1),
      cell: (s) =>
        !s.login ? <span className="text-sm font-semibold text-cabinet">Issue login</span>
        : <span className={cx("caps text-[11px]", s.login.active ? "text-success" : "text-stamp-left")}>{s.login.active ? "On" : "Turned off"}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Sign-in access" sub="Who can sign in, and where each login lands. Logins are issued from a person’s folder, so each one belongs to one staff record." />
      <div className="grid gap-4 px-5 lg:px-8 [&>*]:min-w-0">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <Dividers<Show>
            label="Show"
            value={show}
            onChange={(v) => router.replace(v === "all" ? "/access" : `/access?show=${v}`, { scroll: false })}
            options={[
              { value: "all", label: "Everyone", n: all.length },
              { value: "on", label: "Can sign in", n: all.filter(test.on).length },
              { value: "now", label: "Signed in now", n: all.filter(test.now).length },
              { value: "none", label: "No login yet", n: all.filter(test.none).length },
              { value: "off", label: "Turned off", n: all.filter(test.off).length },
            ]}
          />
          <SearchBox q={q} onQ={setQ} placeholder="Search name, username or id" className="ml-auto w-full sm:w-72" />
        </div>
        {error ? (
          <ErrorNote>{error.message}</ErrorNote>
        ) : isLoading ? (
          <Loading />
        ) : (
          <Ledger
            label="Sign-in access"
            rows={rows}
            columns={columns}
            rowKey={(s) => s.id}
            onRowClick={(s) => router.push(`/staff?open=${s.id}&card=access`)}
            dim={(s) => !!s.login && !s.login.active}
            initialSort={{ key: "who", dir: 1 }}
            minWidth={820}
            empty={{ icon: KeySquare, title: "Nobody matches", body: "Try another tab or clear the search." }}
          />
        )}
      </div>
    </>
  );
}

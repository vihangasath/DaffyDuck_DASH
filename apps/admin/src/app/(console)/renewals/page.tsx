"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { BadgeCheck, IdCard } from "lucide-react";
import type { StaffRow } from "@waypoint/core/people";
import { cx } from "@waypoint/ui/ui";
import { Dividers, Empty, ErrorNote, Loading, PageHeader, Sheet, Stamp, Typed, daysUntil, depotLabel, dueIn, fmtDay, todayIso } from "@/components/cabinet";
import { usePeople } from "@/lib/api";

interface Due {
  s: StaffRow;
  expiry: string | null;
  days: number | null;
}

const monthKey = (d: string) => d.slice(0, 7);
const monthName = (key: string, long = false) => new Date(`${key}-01T00:00:00`).toLocaleDateString("en-GB", { month: long ? "long" : "short", year: long ? "numeric" : "2-digit" });

/** The tickler file: every driver's licence filed under the month it runs out. */
export default function Renewals() {
  const { data, error, isLoading } = usePeople<StaffRow[]>("/staff");
  const today = todayIso();

  const { files, missing } = useMemo(() => {
    const drivers: Due[] = (data ?? [])
      .filter((s) => s.jobRole === "driver" && s.status !== "left")
      .map((s) => {
        const expiry = s.driver?.licenseExpiry ?? null;
        return { s, expiry, days: expiry ? daysUntil(expiry, today) : null };
      });
    const months: { key: string; label: string; items: Due[]; alert?: boolean }[] = [{ key: "overdue", label: "Expired", items: [], alert: true }];
    const start = new Date(`${today.slice(0, 7)}-01T00:00:00`);
    for (let i = 0; i < 12; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, label: monthName(key), items: [] });
    }
    months.push({ key: "later", label: "Later", items: [] });
    for (const x of drivers) {
      if (!x.expiry) continue;
      const f = x.days! < 0 ? months[0] : (months.find((m) => m.key === monthKey(x.expiry!)) ?? months[months.length - 1]);
      f.items.push(x);
    }
    for (const m of months) m.items.sort((a, b) => (a.expiry ?? "").localeCompare(b.expiry ?? ""));
    return { files: months, missing: drivers.filter((x) => !x.expiry) };
  }, [data, today]);

  const firstDue = files.find((f) => f.items.length)?.key ?? files[1].key;
  const [pick, setPick] = useState<string | null>(null);
  const current = pick ?? firstDue;
  const file = files.find((f) => f.key === current) ?? files[1];
  const within90 = files.flatMap((f) => f.items).filter((x) => x.days != null && x.days <= 90).length;

  return (
    <>
      <PageHeader
        title="Renewals"
        sub={`Driving licences filed under the month they run out, counted from today (${fmtDay(today)}). ${within90} fall due within 90 days. A driver can’t be sent out on an expired licence.`}
      />
      <div className="grid gap-5 px-5 lg:px-8 [&>*]:min-w-0">
        {error ? (
          <ErrorNote>{error.message}</ErrorNote>
        ) : isLoading ? (
          <Loading />
        ) : (
          <>
            <div className="min-w-0 rounded-[3px] border border-line-strong bg-well pt-2 shadow-[inset_0_2px_6px_rgb(34_56_46/0.12)]">
              <Dividers
                label="Month"
                value={current}
                onChange={setPick}
                className="px-2"
                options={files.map((f) => ({ value: f.key, label: f.label, n: f.items.length, alert: f.alert }))}
              />
              <div className="bg-manila-2/40 p-3 sm:p-4">
                <h2 className="mb-3 flex items-baseline gap-2 text-lg font-bold [font-stretch:92%]">
                  {file.key === "overdue" ? "Already expired" : file.key === "later" ? "After the next twelve months" : monthName(file.key, true)}
                  <span className="text-sm font-normal text-ink-2">{file.items.length} licence{file.items.length === 1 ? "" : "s"}</span>
                </h2>
                {file.items.length === 0 ? (
                  <Sheet><Empty icon={BadgeCheck} title={file.key === "overdue" ? "No expired licences" : "Nothing filed under this month"} /></Sheet>
                ) : (
                  <ul className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                    {file.items.map((x) => <TicklerCard key={x.s.id} x={x} />)}
                  </ul>
                )}
              </div>
            </div>

            {missing.length > 0 && (
              <section aria-labelledby="missing" className="grid gap-3">
                <h2 id="missing" className="text-lg font-bold [font-stretch:92%]">No expiry on file <span className="text-sm font-normal text-ink-2">{missing.length}</span></h2>
                <Sheet>
                  <ul>
                    {missing.map((x) => (
                      <li key={x.s.id} className="border-b border-line last:border-0">
                        <Link href={`/staff?open=${x.s.id}&card=licence`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-manila-2/50">
                          <IdCard className="size-4 text-stamp-leave" />
                          <span className="flex-1 text-sm font-semibold">{x.s.name}</span>
                          <span className="text-sm text-cabinet">Record the licence</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Sheet>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function TicklerCard({ x }: { x: Due }) {
  const expired = x.days! < 0;
  const soon = x.days! <= 30;
  return (
    <li>
      <Link href={`/staff?open=${x.s.id}&card=licence`} className="group block">
        <div className="index-card transition-[box-shadow,transform] group-hover:-translate-y-0.5 group-hover:shadow-raised">
          <div className="flex h-11 items-center gap-2 border-b border-card-red/80 px-4">
            <span className="min-w-0 flex-1 truncate font-semibold">{x.s.name}</span>
            <Stamp status={x.s.status} className="text-[10px]" />
            {expired ? <span className="stamp text-[11px] text-stamp-left">Expired</span> : <span className={cx("text-xs font-semibold", soon ? "text-stamp-leave" : "text-ink-2")}>{dueIn(x.days!)}</span>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] px-4 pb-1.5 text-sm [&>*]:border-b [&>*]:border-feint/80 [&>*]:py-1.5 [&>*:nth-last-child(-n+2)]:border-0">
            <dt className="caps pr-3 text-[10.5px] leading-5 text-ink-2">Expires</dt>
            <dd><Typed className={cx(expired && "font-bold text-stamp-left")}>{fmtDay(x.expiry)}</Typed></dd>
            <dt className="caps pr-3 text-[10.5px] leading-5 text-ink-2">Licence</dt>
            <dd><Typed>{x.s.driver?.licenseNo ?? "not recorded"}</Typed>{x.s.driver?.licenseClass && <span className="text-ink-2"> · class {x.s.driver.licenseClass}</span>}</dd>
            <dt className="caps pr-3 text-[10.5px] leading-5 text-ink-2">Works at</dt>
            <dd className="text-ink-2">{depotLabel(x.s.depotId)}{x.s.driver?.vehicleId && <> · <Typed>{x.s.driver.vehicleId}</Typed></>}</dd>
          </dl>
        </div>
      </Link>
    </li>
  );
}

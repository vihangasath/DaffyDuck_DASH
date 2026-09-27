"use client";
import Link from "next/link";
import { BadgeCheck, CalendarClock, KeyRound, Plus } from "lucide-react";
import { JOB_LABEL, JOB_ROLES, type PeopleOverview, type Renewal } from "@waypoint/core/people";
import { cx } from "@waypoint/ui/ui";
import { buttonClass, Empty, ErrorNote, FolderList, JobTab, Loading, PageHeader, Sheet, Typed, depotLabel, dueIn, fmtDay } from "@/components/cabinet";
import { LogLine, collapse } from "@/components/logbook";
import { usePeople } from "@/lib/api";

export default function FrontDesk() {
  const { data, error } = usePeople<PeopleOverview>("/overview");
  if (error) return <div className="p-8"><ErrorNote>{error.message}</ErrorNote></div>;
  if (!data) return <Loading />;
  const h = data.headcount;
  const register: { label: string; n: number; href: string; alert?: boolean }[] = [
    { label: "in post", n: h.active, href: "/staff" },
    { label: "on leave", n: h.onLeave, href: "/staff?status=on_leave" },
    { label: "can’t sign in yet", n: data.noLogin.length, href: "/access?show=none" },
    { label: data.renewals.some((r) => r.days < 0) ? "licences due, some expired" : "licences due in 90 days", n: data.renewals.length, href: "/renewals", alert: data.renewals.some((r) => r.days < 0) },
  ];

  return (
    <>
      <PageHeader
        title="Front desk"
        sub={`What needs HR today, ${new Date(`${data.today}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}. Licences and leave follow the real calendar. Seeded people are synthetic demo records; anyone HR adds is real.`}
        actions={
          <Link href="/staff?new=1" className={buttonClass()}>
            <Plus className="size-4" /> Add a person
          </Link>
        }
      />
      <div className="grid gap-7 px-5 lg:px-8 [&>*]:min-w-0">
        {/* The register line: the day's counts, typed in, each one a way into its drawer. */}
        <nav aria-label="Today’s register" className="flex flex-wrap items-baseline gap-x-7 gap-y-2 border-y border-line-strong py-3">
          {register.map((r) => (
            <Link key={r.label} href={r.href} className="group flex items-baseline gap-2 underline decoration-line-strong underline-offset-[6px] hover:decoration-cabinet">
              <Typed className={cx("text-[22px] font-bold", r.alert && "text-stamp-left")}>{r.n}</Typed>
              <span className="text-[15px] text-ink-2 group-hover:text-ink">{r.label}</span>
            </Link>
          ))}
          <span className="ml-auto text-xs text-ink-2">{h.total - h.left} on the books · {h.left} left Waypoint</span>
        </nav>

        <div className="grid items-start gap-7 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
          <div className="grid gap-7">
            <section aria-labelledby="tickler" className="grid gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 id="tickler" className="text-lg font-bold [font-stretch:92%]">Licence tickler</h2>
                <span className="text-sm text-ink-2">Driving licences expiring in the next 90 days</span>
                <Link href="/renewals" className="ml-auto text-sm font-semibold text-cabinet underline-offset-4 hover:underline">Open the tickler file</Link>
              </div>
              {data.renewals.length === 0 ? (
                <Sheet><Empty icon={BadgeCheck} title="Every licence is good for 90 days or more" /></Sheet>
              ) : (
                <ul className="grid gap-3 sm:grid-cols-2">
                  {data.renewals.slice(0, 6).map((r) => <RenewalCard key={r.staffId} r={r} />)}
                </ul>
              )}
            </section>

            <section aria-labelledby="in-post" className="grid gap-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 id="in-post" className="text-lg font-bold [font-stretch:92%]">On the books, by depot area</h2>
                <span className="text-sm text-ink-2">Everyone not yet left, on leave included. Store managers count under the depot that serves their branch.</span>
              </div>
              <Sheet className="overflow-x-auto">
                <table className="w-full text-sm" aria-labelledby="in-post">
                  <thead className="bg-well text-left text-ink-2">
                    <tr>
                      <th scope="col" className="caps px-3 py-2.5 text-[11px] sm:px-4">Job</th>
                      {data.roster.map((d) => <th key={d.depot} scope="col" className="caps px-3 py-2.5 text-right text-[11px]">{d.depot === "Kandy" ? "Kandy" : "Peliyagoda"}</th>)}
                      <th scope="col" className="caps px-4 py-2.5 text-right text-[11px]">All</th>
                    </tr>
                  </thead>
                  <tbody>
                    {JOB_ROLES.map((j) => (
                      <tr key={j} className="border-t border-line">
                        <th scope="row" className="px-3 py-2 text-left font-normal sm:px-4">
                          <Link href={`/staff?job=${j}`} className="whitespace-nowrap hover:underline"><JobTab job={j} bare className="mr-2" />{JOB_LABEL[j]}s</Link>
                        </th>
                        {data.roster.map((d) => <td key={d.depot} className="px-3 py-2 text-right tabular-nums">{d.byRole[j]}</td>)}
                        <td className="px-4 py-2 text-right font-semibold tabular-nums">{data.roster.reduce((s, d) => s + d.byRole[j], 0)}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-line-strong bg-subtle">
                      <th scope="row" className="px-4 py-2 text-left font-semibold">of whom on leave</th>
                      {data.roster.map((d) => <td key={d.depot} className="px-3 py-2 text-right tabular-nums text-stamp-leave">{d.onLeave}</td>)}
                      <td className="px-4 py-2 text-right font-semibold tabular-nums text-stamp-leave">{h.onLeave}</td>
                    </tr>
                  </tbody>
                </table>
              </Sheet>
            </section>
          </div>

          <div className="grid gap-7">
            <FolderList title="Can’t sign in yet" count={data.noLogin.length}>
              {data.noLogin.length === 0 ? (
                <p className="bg-surface px-2.5 py-2 text-sm text-ink-2">Everyone in post has a login.</p>
              ) : (
                <ul className="grid gap-px overflow-hidden rounded-[2px]">
                  {data.noLogin.slice(0, 6).map((p) => (
                    <li key={p.staffId}>
                      <Link href={`/staff?open=${p.staffId}&card=access`} className="group flex min-h-7 items-center gap-2 bg-surface px-2.5 py-1.5 hover:bg-manila-2/60">
                        <JobTab job={p.jobRole} bare />
                        <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                        <span className="flex items-center gap-1 text-xs font-semibold text-cabinet"><KeyRound className="size-3.5" /> Issue login</span>
                      </Link>
                    </li>
                  ))}
                  {data.noLogin.length > 6 && (
                    <li><Link href="/access?show=none" className="block bg-surface px-2.5 py-1.5 text-sm font-semibold text-cabinet hover:underline">{data.noLogin.length - 6} more</Link></li>
                  )}
                </ul>
              )}
            </FolderList>

            <FolderList title="On leave" count={data.onLeave.length}>
              {data.onLeave.length === 0 ? (
                <p className="bg-surface px-2.5 py-2 text-sm text-ink-2">Nobody is on leave.</p>
              ) : (
                <ul className="grid gap-px overflow-hidden rounded-[2px]">
                  {data.onLeave.map((p) => (
                    <li key={p.staffId}>
                      <Link href={`/staff?open=${p.staffId}`} className="flex min-h-7 items-center gap-2 bg-surface px-2.5 py-1.5 hover:bg-manila-2/60">
                        <JobTab job={p.jobRole} bare />
                        <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                        <span className="text-xs text-ink-2">{p.leaveUntil ? <>back <Typed className="text-[12px]">{fmtDay(p.leaveUntil)}</Typed></> : "no return date"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </FolderList>

            {data.joiners.length > 0 && (
              <FolderList title="New starters, last 60 days" count={data.joiners.length}>
                <ul className="grid gap-px overflow-hidden rounded-[2px]">
                  {data.joiners.map((p) => (
                    <li key={p.staffId}>
                      <Link href={`/staff?open=${p.staffId}`} className="flex min-h-7 items-center gap-2 bg-surface px-2.5 py-1.5 hover:bg-manila-2/60">
                        <JobTab job={p.jobRole} bare />
                        <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
                        <Typed className="text-[12px] text-ink-2">{fmtDay(p.startedOn)}</Typed>
                      </Link>
                    </li>
                  ))}
                </ul>
              </FolderList>
            )}
          </div>
        </div>

        <section aria-labelledby="logbook" className="grid gap-3">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="logbook" className="text-lg font-bold [font-stretch:92%]">Logbook</h2>
            <span className="text-sm text-ink-2">
              {data.access.signedInToday} signed in today · {data.access.active} logins on · {data.access.disabled} turned off
            </span>
            <Link href="/activity" className="ml-auto text-sm font-semibold text-cabinet underline-offset-4 hover:underline">Whole log</Link>
          </div>
          <Sheet>
            {data.activity.length === 0 ? <Empty icon={CalendarClock} title="Nothing written in the log yet" /> : <ol>{collapse(data.activity).map(({ a, times }) => <LogLine key={a.id} a={a} times={times} />)}</ol>}
          </Sheet>
        </section>
      </div>
    </>
  );
}

function RenewalCard({ r }: { r: Renewal }) {
  const expired = r.days < 0;
  const urgent = r.days <= 30;
  return (
    <li className={cx(expired && "sm:col-span-2")}>
      <Link href={`/staff?open=${r.staffId}&card=licence`} className="group relative block">
        {(expired || urgent) && <span aria-hidden className={cx("absolute -top-1.5 right-5 z-10 h-4 w-3 rounded-t-[2px] shadow-[inset_0_-1px_0_rgb(0_0_0/0.2)]", expired ? "bg-stamp-left" : "bg-stamp-leave")} />}
        <div className="index-card transition-[box-shadow,transform] group-hover:-translate-y-0.5 group-hover:shadow-raised">
          <div className="flex h-11 items-center gap-2 border-b border-card-red/80 px-4">
            <span className={cx("min-w-0 flex-1 truncate font-semibold", expired && "text-[17px]")}>{r.name}</span>
            {expired ? <span className="stamp text-[11px] text-stamp-left">Expired</span> : <span className={cx("text-xs font-semibold", urgent ? "text-stamp-leave" : "text-ink-2")}>{dueIn(r.days)}</span>}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 pt-3 pb-3.5 text-sm">
            <span><span className="caps mr-1.5 text-[10.5px] text-ink-2">Expires</span><Typed className={cx(expired && "text-[15px] font-bold text-stamp-left")}>{fmtDay(r.licenseExpiry)}</Typed></span>
            <span><span className="caps mr-1.5 text-[10.5px] text-ink-2">Licence</span><Typed>{r.licenseNo ?? "not recorded"}</Typed></span>
            <span className="text-xs text-ink-2">{depotLabel(r.depotId)}</span>
          </div>
        </div>
      </Link>
    </li>
  );
}


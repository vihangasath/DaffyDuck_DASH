"use client";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Bell, CircleAlert, Info, Truck } from "lucide-react";
import type { Overview } from "@waypoint/core/admin";
import { fmtDate } from "@waypoint/core/domain/time";
import { Card, Meter, Pill, Spinner, Stat, StatStrip, cx } from "@waypoint/ui/ui";
import { PageHeader } from "@/components/shell";
import { fmtWhen } from "@/components/kit";
import { useAdminQuery } from "@/lib/api";
import { ActivityItem } from "@/components/activity";

const LEVEL = { danger: { icon: CircleAlert, cls: "bg-danger-soft text-danger" }, warning: { icon: AlertTriangle, cls: "bg-warning-soft text-warning" }, info: { icon: Info, cls: "bg-info-soft text-info" } };

export default function OverviewPage() {
  const { data, error } = useAdminQuery<Overview>("/overview");
  if (error) return <p className="p-7 text-danger">{error.message}</p>;
  if (!data) return <Spinner />;
  const c = data.counts;
  return (
    <>
      <PageHeader title="Overview" sub={`Everything Waypoint runs on, and how today is going · demo day ${fmtDate(data.demoDate)}`} />
      <div className="grid gap-5 p-5 lg:p-7">
        <StatStrip className="grid-cols-2 md:grid-cols-5">
          <Stat label="Branches" dot="primary" value={c.outlets.active} sub={`${c.outlets.total - c.outlets.active} closed · ${c.outlets.total} total`} />
          <Stat label="Vehicles available" dot="success" value={c.vehicles.available} sub={`${c.vehicles.workshop} in workshop · ${c.vehicles.total} total`} meter={{ pct: (c.vehicles.available / Math.max(1, c.vehicles.total)) * 100 }} />
          <Stat label="Drivers on duty" dot="info" value={c.drivers.active} sub={`${c.drivers.onLeave} on leave · ${c.drivers.total} total`} />
          <Stat label="Active logins" dot="chilled" value={c.users.active} sub={`${c.users.byRole.driver} drivers · ${c.users.byRole.store} stores · ${c.users.byRole.admin} admins`} />
          <Stat className="col-span-2 md:col-span-1" label="Products" dot="fresh" value={c.products.active} sub={`${c.products.total - c.products.active} withdrawn`} />
        </StatStrip>

        <div className="grid gap-5 xl:grid-cols-[1fr_400px]">
          <div className="grid content-start gap-5">
            <section className="grid gap-3">
              <h2 className="font-bold">Today’s operations</h2>
              <div className="grid gap-3 md:grid-cols-2">
                {data.today.map((d) => {
                  const pct = d.stops ? (d.delivered / d.stops) * 100 : 0;
                  return (
                    <Card key={d.depot} className="grid gap-3 p-4">
                      <div className="flex items-center gap-2">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-navy text-mint"><Truck className="size-[18px]" /></span>
                        <div className="min-w-0">
                          <div className="font-bold">{d.name}</div>
                          <div className="text-xs text-ink-2">{d.orders} orders for today</div>
                        </div>
                        <span className="ml-auto">
                          {!d.plan ? (
                            <Pill tone={d.ordersClosed ? "neutral" : "warning"} dot>{d.ordersClosed ? "Closed" : "Orders open"}</Pill>
                          ) : (
                            <Pill tone={d.plan.status === "published" ? "success" : "info"} dot>Plan v{d.plan.version} · {d.plan.status}</Pill>
                          )}
                        </span>
                      </div>
                      {d.plan && (
                        <div className="grid grid-cols-3 gap-2 text-sm">
                          <div><div className="text-xs text-ink-2">Trips</div><div className="text-lg font-bold tabular-nums">{d.plan.trips}</div></div>
                          <div><div className="text-xs text-ink-2">Deferred</div><div className={cx("text-lg font-bold tabular-nums", d.plan.deferred && "text-warning")}>{d.plan.deferred}</div></div>
                          <div><div className="text-xs text-ink-2">Exceptions</div><div className={cx("text-lg font-bold tabular-nums", d.openExceptions && "text-danger")}>{d.openExceptions}</div></div>
                        </div>
                      )}
                      <div className="grid gap-1.5">
                        <div className="flex justify-between text-xs font-semibold text-ink-2">
                          <span>Deliveries</span>
                          <span className="tabular-nums">{d.stops ? `${d.delivered} of ${d.stops}${d.failed ? ` · ${d.failed} failed` : ""}` : "Not published yet"}</span>
                        </div>
                        <Meter pct={pct} tone={pct >= 100 ? "success" : "primary"} />
                      </div>
                    </Card>
                  );
                })}
              </div>
            </section>

            <section className="grid gap-3">
              <h2 className="flex items-center gap-2 font-bold"><Bell className="size-4" /> Needs attention</h2>
              {data.alerts.length === 0 && <Card className="p-4 text-sm text-ink-2">Nothing needs your attention right now.</Card>}
              {data.alerts.map((a) => {
                const L = LEVEL[a.level];
                return (
                  <Link key={a.title} href={a.href} className="group">
                    <Card className="flex items-start gap-3 p-4 transition-[box-shadow,border-color] group-hover:border-primary/40 group-hover:shadow-raised">
                      <span className={cx("flex size-9 shrink-0 items-center justify-center rounded-lg", L.cls)}><L.icon className="size-[18px]" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{a.title}</p>
                        <p className="text-sm text-ink-2">{a.body}</p>
                      </div>
                      <ArrowRight className="mt-2 size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                    </Card>
                  </Link>
                );
              })}
            </section>
          </div>

          <Card className="grid content-start overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="font-bold">Recent activity</h2>
              <Link href="/activity" className="text-sm font-semibold text-primary">See all</Link>
            </div>
            <ol>
              {data.activity.map((a) => (
                <ActivityItem key={a.id} a={a} when={fmtWhen(a.at)} />
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}

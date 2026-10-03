"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Copy, FolderOpen, KeyRound, Plus, RefreshCw, Truck, X } from "lucide-react";
import { JOB_LABEL, JOB_ROLES, type JobRole, type PeopleLookups, type StaffRow, type StaffStatus } from "@waypoint/core/people";
import { toast } from "@waypoint/ui/toast";
import { cx } from "@waypoint/ui/ui";
import {
  Button, Dividers, Empty, ErrorNote, Field, IndexCard, JobTab, Loading, PageHeader, Rocker, SearchBox, Select, Stamp, TextInput, Typed,
  daysUntil, depotLabel, dueIn, fmtDay, fmtWhen, matches, todayIso,
} from "@/components/cabinet";
import { api, usePeople, usePeopleMutation } from "@/lib/api";
import { useAdmin } from "@/lib/session";

type StatusFilter = "current" | "on_leave" | "left" | "all";
type JobFilter = "all" | JobRole;

export default function StaffPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Directory />
    </Suspense>
  );
}

function Directory() {
  const params = useSearchParams();
  const router = useRouter();
  const { data, error, isLoading } = usePeople<StaffRow[]>("/staff");
  const [q, setQ] = useState("");
  const job = (params.get("job") as JobFilter) ?? "all";
  const status = (params.get("status") as StatusFilter) ?? "current";
  const openId = params.get("open");
  const isNew = params.get("new") === "1";

  const go = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) p.delete(k);
      else p.set(k, v);
    }
    router.replace(`/staff${p.size ? `?${p}` : ""}`, { scroll: false });
  };

  const all = data ?? [];
  const byStatus = all.filter((s) => (status === "all" ? true : status === "current" ? s.status !== "left" : s.status === status));
  const rows = byStatus
    .filter((s) => (job === "all" || s.jobRole === job) && matches(q, s.name, s.id, s.phone, s.outletName, s.login?.username, s.driver?.licenseNo, s.driver?.vehicleId))
    .sort((a, b) => a.name.localeCompare(b.name));
  const open = openId ? all.find((s) => s.id === openId) : undefined;
  const showFolder = isNew || !!open;

  return (
    <>
      <div className={cx(showFolder && "hidden lg:block")}>
        <PageHeader
          title="Staff directory"
          sub="One folder per person, in every job. Pull a folder to read or correct the record, issue a login, or record leave. Seeded people are synthetic demo records and are marked as such; anyone HR adds is real."
          actions={<Button icon={Plus} onClick={() => go({ new: "1", open: null })}>Add a person</Button>}
        />
      </div>
      <div className="grid items-start gap-6 px-5 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] 2xl:grid-cols-[420px_minmax(0,1fr)] lg:px-8">
        {/* The drawer: folders filed by name. */}
        <section aria-label="Staff folders" className={cx("grid gap-3 lg:sticky lg:top-4", showFolder && "hidden lg:grid")}>
          <SearchBox q={q} onQ={setQ} placeholder="Search name, id, phone, branch or licence" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="caps text-[11px] text-ink-2">Showing</span>
            <Select<StatusFilter>
              aria-label="Which people"
              value={status}
              onChange={(v) => go({ status: v === "current" ? null : v })}
              className="h-8 w-auto text-[13px]"
              options={[
                { value: "current", label: "Current staff" },
                { value: "on_leave", label: "On leave" },
                { value: "left", label: "Left Waypoint" },
                { value: "all", label: "Everyone on file" },
              ]}
            />
            <span className="ml-auto text-xs tabular-nums text-ink-2">{rows.length} folders</span>
          </div>
          <div className="overflow-hidden rounded-[3px] border border-line-strong bg-well shadow-[inset_0_2px_6px_rgb(34_56_46/0.12)]">
            <Dividers<JobFilter>
              label="Job"
              value={job}
              onChange={(v) => go({ job: v === "all" ? null : v })}
              className="px-2 pt-2"
              options={[{ value: "all", label: "All", n: byStatus.length }, ...JOB_ROLES.map((j) => ({ value: j, label: j === "store_manager" ? "Stores" : j === "hr_officer" ? "HR" : j === "dispatcher" ? "Dispatch" : `${JOB_LABEL[j]}s`, n: byStatus.filter((s) => s.jobRole === j).length }))]}
            />
            {error ? (
              <div className="p-3"><ErrorNote>{error.message}</ErrorNote></div>
            ) : isLoading ? (
              <div className="py-3"><Loading rows={8} /></div>
            ) : rows.length === 0 ? (
              <Empty icon={FolderOpen} title="No folders match">Try another job tab, or show everyone on file.</Empty>
            ) : (
              <ul className="max-h-[calc(100dvh-16rem)] overflow-y-auto bg-manila-2/40 p-2 lg:max-h-[calc(100dvh-15rem)]">
                {rows.map((s, i) => {
                  const letter = s.name[0].toUpperCase();
                  const guide = i === 0 || rows[i - 1].name[0].toUpperCase() !== letter;
                  return (
                    <li key={s.id}>
                      {/* A–Z guide card: a taller divider standing among the folders. */}
                      {guide && (
                        <div aria-hidden className="mt-2 mb-1 flex items-end gap-2 first:mt-0">
                          <span className="rounded-t-[3px] border border-b-0 border-line-strong bg-well px-2 pt-0.5 text-[12px] font-bold text-ink-2">{letter}</span>
                          <span className="mb-px h-px flex-1 bg-line-strong" />
                        </div>
                      )}
                      <FiledFolder s={s} on={s.id === openId} onPull={() => go({ open: s.id, new: null, card: null })} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        {/* The desk: the pulled folder. */}
        <section aria-label="Open folder" className={cx(!showFolder && "hidden lg:block")}>
          {isNew ? (
            <Folder key="new" s={null} onClose={() => go({ new: null })} onCreated={(id) => go({ new: null, open: id, card: "access" })} />
          ) : open ? (
            <Folder key={open.id} s={open} focusCard={params.get("card")} onClose={() => go({ open: null, card: null })} />
          ) : openId && data ? (
            <div className="grid gap-3 pt-6"><ErrorNote>There’s no folder {openId}.</ErrorNote></div>
          ) : (
            <div className="grid min-h-[420px] place-items-center rounded-[4px] border-2 border-dashed border-line-strong text-center">
              <div className="grid justify-items-center gap-2 px-6">
                <FolderOpen className="size-8 text-line-strong" strokeWidth={1.5} />
                <p className="font-semibold">Pull a folder from the drawer</p>
                <p className="max-w-xs text-sm text-ink-2">Choose a person to read their record, licence and sign-in access. Changes are filed when you save.</p>
              </div>
            </div>
          )}
        </section>
      </div>
    </>
  );
}

/** A folder standing in the drawer: its manila tab carries the file number. */
function FiledFolder({ s, on, onPull }: { s: StaffRow; on: boolean; onPull: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  // Arriving with a folder already pulled: show it in the drawer too.
  useEffect(() => {
    if (on) ref.current?.scrollIntoView({ block: "nearest" });
  }, [on]);
  const where = s.jobRole === "store_manager" ? (s.outletName ?? depotLabel(s.depotId)) : depotLabel(s.depotId);
  return (
    <button
      ref={ref}
      type="button"
      onClick={onPull}
      aria-current={on ? "true" : undefined}
      className={cx(
        "group relative flex w-full items-center gap-3 rounded-[3px] border-t px-2 py-2 text-left transition-[transform,background-color,box-shadow] duration-300 ease-[var(--ease-out-expo)]",
        on ? "z-10 -translate-y-0.5 border-manila-edge bg-manila shadow-raised" : "border-manila-edge/50 hover:-translate-y-px hover:bg-surface/80",
        s.status === "left" && !on && "opacity-70",
      )}
    >
      <span className={cx("shrink-0 rounded-t-[3px] border border-b-0 px-1.5 pt-0.5 font-type text-[11.5px] leading-4", on ? "border-manila-edge bg-manila-2 text-manila-ink" : "border-manila-edge/70 bg-manila/70 text-manila-ink")}>{s.id}</span>
      <JobTab job={s.jobRole} bare />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{s.name}</span>
        <span className="block truncate text-xs text-ink-2">{JOB_LABEL[s.jobRole]} · {where}</span>
      </span>
      <Stamp status={s.status} className="text-[10px]" />
    </button>
  );
}

// ── The open folder ────────────────────────────────────────────────────────────────────────────

interface Draft {
  name: string;
  jobRole: JobRole;
  depotId: "Peliyagoda" | "Kandy";
  outletId: string | null;
  phone: string;
  email: string;
  emergencyContact: string;
  status: StaffStatus;
  leaveUntil: string;
  startedOn: string;
  leftOn: string;
  licenseNo: string;
  licenseClass: string;
  licenseExpiry: string;
}

const toDraft = (s: StaffRow | null): Draft => ({
  name: s?.name ?? "", jobRole: s?.jobRole ?? "driver", depotId: s?.depotId ?? "Peliyagoda", outletId: s?.outletId ?? null,
  phone: s?.phone ?? "", email: s?.email ?? "", emergencyContact: s?.emergencyContact ?? "",
  status: s?.status ?? "active", leaveUntil: s?.leaveUntil ?? "", startedOn: s?.startedOn ?? (s ? "" : todayIso()), leftOn: s?.leftOn ?? "",
  licenseNo: s?.driver?.licenseNo ?? "", licenseClass: s?.driver?.licenseClass ?? "", licenseExpiry: s?.driver?.licenseExpiry ?? "",
});

const toBody = (d: Draft) => ({
  ...d,
  outletId: d.jobRole === "store_manager" ? d.outletId : null,
  leaveUntil: d.status === "on_leave" ? d.leaveUntil || null : null,
  leftOn: d.status === "left" ? d.leftOn || null : null,
  startedOn: d.startedOn || null,
  licenseExpiry: d.licenseExpiry || null,
});

function Folder({ s, onClose, onCreated, focusCard }: { s: StaffRow | null; onClose: () => void; onCreated?: (id: string) => void; focusCard?: string | null }) {
  const [me] = useAdmin();
  const { data: look } = usePeople<PeopleLookups>("/lookups");
  const initial = useMemo(() => toDraft(s), [s]);
  const [d, setD] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const dirty = JSON.stringify(d) !== JSON.stringify(initial);
  const self = !!s?.login && s.login.userId === me?.userId;
  const leaving = s != null && s.status !== "left" && d.status === "left";
  const root = useRef<HTMLDivElement>(null);

  // Arriving from elsewhere (a renewal, a missing login): bring that card into view.
  useEffect(() => {
    if (!focusCard) return;
    const id = requestAnimationFrame(() => {
      const el = root.current?.querySelector<HTMLElement>(`#card-${focusCard}`);
      el?.querySelector<HTMLElement>("input:not([disabled]), button:not([disabled])")?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(id);
  }, [focusCard]);

  const save = usePeopleMutation(
    (x: Draft) => (s ? api(`/people/staff/${s.id}`, { method: "PATCH", body: toBody(x) }) : api<{ id: string }>("/people/staff", { body: toBody(x) })),
    (r, x) => (s ? `${x.name}’s folder filed` : `${x.name} added as ${(r as { id: string }).id}`),
  );

  // The record changed on the server (our own save, or someone else's): follow it unless there are unfiled edits.
  const shown = useRef(initial);
  const filed = useRef(false);
  useEffect(() => {
    const prev = shown.current;
    if (prev === initial) return;
    shown.current = initial;
    const follow = filed.current;
    filed.current = false;
    setD((cur) => (follow || JSON.stringify(cur) === JSON.stringify(prev) ? initial : cur));
  }, [initial]);

  const outlets = (look?.outlets ?? []).filter((o) => o.active || o.id === d.outletId);
  const driver = d.jobRole === "driver";
  const expiryDays = d.licenseExpiry ? daysUntil(d.licenseExpiry) : null;

  return (
    <div ref={root} className="relative pt-7 lg:pt-9">
      <button type="button" onClick={onClose} className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-cabinet lg:hidden">
        <ArrowLeft className="size-4" /> Back to the drawer
      </button>
      {/* Folder tab with the file number. */}
      <div className="absolute top-0 left-6 hidden h-10 items-start rounded-t-[5px] border border-b-0 border-manila-edge bg-manila px-4 pt-2 lg:flex">
        <Typed className="text-manila-ink">{s ? s.id : "NEW RECORD"}</Typed>
      </div>
      <form
        className="@container relative animate-pull rounded-[4px] border border-manila-edge bg-manila-2 p-4 shadow-raised sm:p-6"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(d, { onSuccess: (r) => (s ? void (filed.current = true) : onCreated?.((r as { id: string }).id)) });
        }}
      >
        <header className="flex flex-wrap items-start gap-x-4 gap-y-2 pb-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-[26px] font-bold leading-tight tracking-[-0.015em] [font-stretch:92%]">{s ? s.name : d.name || "New person"}</h2>
              {s && <Stamp status={s.status} className="text-[13px]" />}
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-manila-ink">
              <JobTab job={d.jobRole} />
              <span>{d.jobRole === "store_manager" && s?.outletName ? s.outletName : depotLabel(d.depotId)}</span>
              {s?.startedOn && <span>with Waypoint since <Typed>{fmtDay(s.startedOn)}</Typed></span>}
            </p>
            {s?.synthetic && <p className="mt-1.5 text-xs text-manila-ink/85"><Typed className="text-[12px] font-bold">SYNTHETIC</Typed> demo record: not a real person. Names, phones and licences were generated for the Tech-Triathlon demo.</p>}
          </div>
          <button type="button" aria-label="File the folder back" onClick={onClose} className="ml-auto hidden rounded-[3px] p-2 text-manila-ink hover:bg-manila lg:block">
            <X className="size-5" />
          </button>
        </header>

        <div className="grid items-start gap-5 @4xl:grid-cols-2">
          <IndexCard title="Personal record" id="card-personal">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Full name" className="sm:col-span-2"><TextInput required maxLength={80} value={d.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" /></Field>
              <Field label="Phone"><TextInput typed inputMode="tel" maxLength={30} value={d.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+94 77 123 4567" /></Field>
              <Field label="Email"><TextInput type="email" maxLength={120} value={d.email} onChange={(e) => set("email", e.target.value)} placeholder="name@example.com" /></Field>
              <Field label="Emergency contact" className="sm:col-span-2" hint="Name, relationship and phone."><TextInput maxLength={120} value={d.emergencyContact} onChange={(e) => set("emergencyContact", e.target.value)} /></Field>
            </div>
          </IndexCard>

          <IndexCard title="Job and status" id="card-job">
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Job" hint={s && (s.jobRole === "driver") ? "A driver’s record stays a driver record." : undefined}>
                <Select<JobRole>
                  value={d.jobRole}
                  onChange={(v) => set("jobRole", v)}
                  disabled={self}
                  options={JOB_ROLES.filter((j) => !s || (s.jobRole === "driver") === (j === "driver")).map((j) => ({ value: j, label: JOB_LABEL[j] }))}
                />
              </Field>
              {d.jobRole === "store_manager" ? (
                <Field label="Branch" hint="The branch decides the depot.">
                  <Select required value={d.outletId ?? ""} onChange={(v) => set("outletId", v)} placeholder="Choose a branch" options={outlets.map((o) => ({ value: o.id, label: o.label }))} />
                </Field>
              ) : (
                <Field label="Depot">
                  <Select value={d.depotId} onChange={(v) => set("depotId", v)} options={(look?.depots ?? [{ id: "Peliyagoda", name: "Peliyagoda DC" }, { id: "Kandy", name: "Kandy hub" }]).map((x) => ({ value: x.id, label: x.name }))} />
                </Field>
              )}
              <Field label="Started on"><TextInput typed type="date" value={d.startedOn} onChange={(e) => set("startedOn", e.target.value)} /></Field>
              <Field label="Status">
                <Select<StaffStatus> value={d.status} onChange={(v) => set("status", v)} disabled={self} options={[{ value: "active", label: "In post" }, { value: "on_leave", label: "On leave" }, { value: "left", label: "Left Waypoint" }]} />
              </Field>
              {d.status === "on_leave" && (
                <Field label="Back on" hint="Leave blank if the return date isn’t known."><TextInput typed type="date" min={todayIso()} value={d.leaveUntil} onChange={(e) => set("leaveUntil", e.target.value)} /></Field>
              )}
              {d.status === "left" && (
                <Field label="Last day"><TextInput typed type="date" value={d.leftOn || (leaving ? todayIso() : "")} onChange={(e) => set("leftOn", e.target.value)} /></Field>
              )}
            </div>
            {leaving && (
              <p role="note" className="mt-4 border-t border-dashed border-stamp-left/50 pt-3 text-sm text-stamp-left">
                <b className="caps mr-1.5 text-[11px]">Past this point</b>
                Filing this turns off {d.name.split(" ")[0]}’s sign-in and ends every session at once{driver ? ", and gives their vehicle back to dispatch" : ""}. The record stays on file.
              </p>
            )}
            {self && <p className="mt-3 text-xs text-ink-2">This is your own record. Another HR officer changes your job or status.</p>}
          </IndexCard>

          {driver && (
            <IndexCard
              title="Driving licence"
              id="card-licence"
              aside={expiryDays != null && expiryDays <= 90 ? (expiryDays < 0 ? <span className="stamp text-[11px] text-stamp-left">Expired</span> : <span className="text-xs font-semibold text-stamp-leave">Expires {dueIn(expiryDays)}</span>) : undefined}
            >
              <div className="grid gap-3.5 sm:grid-cols-3">
                <Field label="Licence number"><TextInput typed maxLength={30} value={d.licenseNo} onChange={(e) => set("licenseNo", e.target.value.toUpperCase())} placeholder="B1234567" /></Field>
                <Field label="Class" hint="B vans · C1 trucks"><TextInput typed maxLength={10} value={d.licenseClass} onChange={(e) => set("licenseClass", e.target.value.toUpperCase())} /></Field>
                <Field label="Expires"><TextInput typed type="date" value={d.licenseExpiry} onChange={(e) => set("licenseExpiry", e.target.value)} aria-invalid={expiryDays != null && expiryDays < 0} /></Field>
              </div>
              <p className="mt-4 flex items-start gap-2 text-sm text-ink-2">
                <Truck className="mt-0.5 size-4 shrink-0" />
                <span>{s?.driver?.vehicleId ? <>Drives <Typed className="text-ink">{s.driver.vehicleId}</Typed>. Dispatch assigns vehicles in the operations app.</> : "No vehicle yet. Dispatch assigns one in the operations app."}</span>
              </p>
            </IndexCard>
          )}

          {s ? <AccessCard s={s} self={self} /> : (
            <IndexCard title="Sign-in access" id="card-access">
              <p className="text-sm text-ink-2">File the new record first. Then you can issue {d.name ? `${d.name.split(" ")[0]}’s` : "their"} login here.</p>
            </IndexCard>
          )}
        </div>

        {(dirty || !s) && (
          <footer className="sticky bottom-3 mt-5 flex animate-rise flex-wrap items-center gap-3 rounded-[3px] border border-manila-edge bg-manila px-4 py-3 shadow-float">
            <span className="text-sm font-semibold text-manila-ink">{s ? "Unfiled changes" : "New record"}</span>
            <div className="ml-auto flex gap-2">
              <Button type="button" kind="secondary" onClick={() => (s ? setD(initial) : onClose())}>{s ? "Discard" : "Cancel"}</Button>
              <Button type="submit" kind={leaving ? "danger" : "primary"} busy={save.isPending}>{s ? (leaving ? "File as left" : "File changes") : "File the new record"}</Button>
            </div>
          </footer>
        )}
      </form>
    </div>
  );
}

// ── Sign-in access card ────────────────────────────────────────────────────────────────────────

/** Readable, strong-enough temporary passwords: two words and four digits. */
const WORDS = ["river", "cargo", "mango", "harbor", "teal", "spice", "rail", "lotus", "coral", "cinnamon", "monsoon", "delta", "lagoon", "summit"];
function generate() {
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${WORDS[r[0] % WORDS.length]}-${WORDS[r[1] % WORDS.length]}-${String(r[2] % 10000).padStart(4, "0")}`;
}
const suggest = (name: string) => {
  const [first = "", ...rest] = name.toLowerCase().normalize("NFKD").replace(/[^a-z ]/g, "").split(" ").filter(Boolean);
  return `${first}${rest.length ? `.${rest[rest.length - 1][0]}` : ""}`.slice(0, 32);
};
const LANDS: Record<JobRole, string> = {
  driver: "Driver app, on the vehicle dispatch assigned",
  loader: "Dock queue and load lists",
  dispatcher: "Dispatch console",
  store_manager: "Their own branch: deliveries, codes, receipts and ordering",
  hr_officer: "Waypoint People",
};

async function copy(text: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error("Couldn’t copy. Select the text instead.");
  }
}

function AccessCard({ s, self }: { s: StaffRow; self: boolean }) {
  const [username, setUsername] = useState(() => suggest(s.name));
  const [password, setPassword] = useState(generate);
  const [newPw, setNewPw] = useState("");
  const issue = usePeopleMutation(
    () => api(`/people/staff/${s.id}/login`, { body: { username, password } }),
    `Login “${username}” issued. Share the password with ${s.name.split(" ")[0]} privately.`,
  );
  const toggle = usePeopleMutation((active: boolean) => api(`/people/logins/${s.login!.userId}`, { method: "PATCH", body: { active } }), (_, active) => (active ? "Sign-in turned back on" : "Sign-in turned off. They’ve been signed out everywhere."));
  const reset = usePeopleMutation((pw: string) => api(`/people/logins/${s.login!.userId}/password`, { body: { password: pw } }), "New password set and copied. They’ve been signed out everywhere.");

  if (!s.login) {
    return (
      <IndexCard title="Sign-in access" id="card-access" aside={<span className="caps text-[10.5px] text-stamp-leave">No login</span>}>
        {s.status === "left" ? (
          <p className="text-sm text-ink-2">{s.name.split(" ")[0]} has left Waypoint, so there’s no login to issue.</p>
        ) : (
          <div className="grid gap-3.5">
            <p className="text-sm text-ink-2">Lands on: {LANDS[s.jobRole]}.</p>
            <div className="grid gap-3.5 sm:grid-cols-2">
              <Field label="Username" hint="Lowercase letters, digits, dots or dashes."><TextInput typed value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} autoCapitalize="none" spellCheck={false} /></Field>
              <Field label="Starting password" hint="You won’t see it again after issuing.">
                <span className="flex gap-1.5">
                  <TextInput typed value={password} onChange={(e) => setPassword(e.target.value)} aria-label="Starting password" />
                  <Button type="button" kind="secondary" icon={RefreshCw} onClick={() => setPassword(generate())} aria-label="Another password" className="w-10 px-0" />
                  <Button type="button" kind="secondary" icon={Copy} onClick={() => copy(password)} aria-label="Copy password" className="w-10 px-0" />
                </span>
              </Field>
            </div>
            <div><Button type="button" icon={KeyRound} busy={issue.isPending} disabled={!username || !password} onClick={() => issue.mutate(undefined)}>Issue login</Button></div>
          </div>
        )}
      </IndexCard>
    );
  }

  const l = s.login;
  return (
    <IndexCard title="Sign-in access" id="card-access" aside={l.sessions > 0 ? <span className="caps text-[10.5px] text-success">Signed in now</span> : undefined}>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="caps pt-0.5 text-[10.5px] text-ink-2">Username</dt>
        <dd><Typed>{l.username}</Typed> <button type="button" onClick={() => copy(l.username, "Username copied")} className="ml-1 text-xs font-semibold text-cabinet hover:underline">Copy</button></dd>
        <dt className="caps pt-0.5 text-[10.5px] text-ink-2">Lands on</dt>
        <dd>{LANDS[s.jobRole]}</dd>
        <dt className="caps pt-0.5 text-[10.5px] text-ink-2">Last sign-in</dt>
        <dd>{fmtWhen(l.lastLoginAt)}{l.sessions > 0 && <span className="text-ink-2"> · {l.sessions} open session{l.sessions > 1 ? "s" : ""}</span>}</dd>
      </dl>
      <div className="mt-4 grid gap-4 border-t border-feint pt-4">
        <div className="flex flex-wrap items-center gap-3">
          <Rocker label="Sign-in" checked={l.active} on="Can sign in" off="Turned off" disabled={self || toggle.isPending || (!l.active && s.status === "left")} onChange={(v) => v !== l.active && toggle.mutate(v)} />
          <span className="text-xs text-ink-2">{self ? "You can’t turn off your own access." : l.active ? "Turning off signs them out on every device at once." : s.status === "left" ? "They’ve left Waypoint." : "They can’t sign in until you turn it back on."}</span>
        </div>
        <Field label="Set a new password" hint="Signs them out everywhere, then copies it for you to share.">
          <span className="flex gap-1.5">
            <TextInput typed value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="new password" aria-label="New password" />
            <Button type="button" kind="secondary" icon={RefreshCw} onClick={() => setNewPw(generate())} aria-label="Generate a password" className="w-10 px-0" />
            <Button type="button" kind="secondary" busy={reset.isPending} disabled={!newPw} onClick={() => reset.mutate(newPw, { onSuccess: () => (void copy(newPw, "Password copied"), setNewPw("")) })}>Set</Button>
          </span>
        </Field>
      </div>
    </IndexCard>
  );
}

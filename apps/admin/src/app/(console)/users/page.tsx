"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { Copy, KeyRound, Plus, RefreshCw, ShieldCheck, Users as UsersIcon } from "lucide-react";
import type { Lookups, UserRow } from "@waypoint/core/admin";
import type { Role } from "@waypoint/core/domain/types";
import { Button, Card, Pill, type Tone } from "@waypoint/ui/ui";
import { toast } from "@waypoint/ui/toast";
import { PageHeader } from "@/components/shell";
import { Chips, DataTable, Drawer, Field, SaveBar, Select, TextInput, Toggle, Toolbar, fmtWhen, matches, type Column } from "@/components/kit";
import { api, useAdminMutation, useAdminQuery } from "@/lib/api";
import { useAdmin } from "@/lib/session";

const ROLE: Record<Role, { label: string; tone: Tone; lands: string }> = {
  admin: { label: "Administrator", tone: "neutral", lands: "This admin console" },
  dispatcher: { label: "Dispatcher", tone: "primary", lands: "Dispatch console (Today, Plan, Live…)" },
  loader: { label: "Loader", tone: "warning", lands: "Dock queue and load lists" },
  driver: { label: "Driver", tone: "info", lands: "Driver app on their assigned vehicle" },
  store: { label: "Store manager", tone: "style", lands: "Store deliveries and ordering" },
};

interface Draft {
  username: string;
  displayName: string;
  role: Role;
  depotId: "Peliyagoda" | "Kandy" | null;
  outletId: string | null;
  outletScope: "outlet" | "depot" | null;
  driverId: string | null;
  active: boolean;
  password: string;
}

/** Readable, strong-enough temporary passwords: two words and four digits. */
const WORDS = ["river", "cargo", "mango", "harbor", "teal", "spice", "rail", "lotus", "coral", "cinnamon", "monsoon", "delta", "lagoon", "summit"];
function generate() {
  const r = new Uint32Array(3);
  crypto.getRandomValues(r);
  return `${WORDS[r[0] % WORDS.length]}-${WORDS[r[1] % WORDS.length]}-${String(r[2] % 10000).padStart(4, "0")}`;
}

export default function UsersPage() {
  return (
    <Suspense>
      <Users />
    </Suspense>
  );
}

function Users() {
  const params = useSearchParams();
  const router = useRouter();
  const { data, error, isLoading } = useAdminQuery<UserRow[]>("/users");
  const { data: look } = useAdminQuery<Lookups>("/lookups");
  const [q, setQ] = useState("");
  const [role, setRole] = useState<string>("all");
  const [editing, setEditing] = useState<UserRow | Partial<Draft> | null>(null);

  // Deep links from the Drivers page: ?open=<userId> or ?newDriver=<driverId>.
  const open = params.get("open");
  const newDriver = params.get("newDriver");
  const linked = useMemo((): UserRow | Partial<Draft> | null => {
    if (open) return data?.find((x) => x.id === open) ?? null;
    const d = newDriver ? look?.drivers.find((x) => x.id === newDriver) : undefined;
    return d ? { role: "driver", driverId: d.id, displayName: d.label.split(" · ")[0], depotId: d.depot } : null;
  }, [open, newDriver, data, look]);
  const current = editing ?? linked;
  const close = () => {
    setEditing(null);
    if (open || newDriver) router.replace("/users");
  };

  const d = data ?? [];
  const rows = data?.filter((u) => matches(q, u.username, u.displayName, u.linkedTo) && (role === "all" || (role === "disabled" ? !u.active : u.role === role)));
  const columns: Column<UserRow>[] = [
    { key: "user", header: "Account", sort: (u) => u.displayName, cell: (u) => <span><b className="block">{u.displayName}</b><span className="text-xs text-ink-2">signs in as <b className="font-semibold text-ink">{u.username}</b></span></span> },
    { key: "role", header: "Role", sort: (u) => u.role, cell: (u) => <Pill tone={ROLE[u.role].tone}>{ROLE[u.role].label}</Pill> },
    { key: "link", header: "Works on", sort: (u) => u.linkedTo, cell: (u) => u.linkedTo },
    { key: "last", header: "Last sign-in", sort: (u) => u.lastLoginAt ?? "", cell: (u) => <span className="text-sm">{fmtWhen(u.lastLoginAt)}{u.sessions > 0 && <span className="text-success"> · signed in</span>}</span> },
    { key: "status", header: "Status", sort: (u) => (u.active ? 0 : 1), cell: (u) => (u.active ? <Pill tone="success" dot>Active</Pill> : <Pill tone="danger">Disabled</Pill>) },
  ];

  return (
    <>
      <PageHeader
        title="User accounts"
        sub="Who can sign in, and where each login lands. Credentials are only ever issued from here."
        actions={<Button icon={Plus} onClick={() => setEditing({})}>Create login</Button>}
      />
      <div className="grid gap-4 p-5 lg:p-7">
        <Toolbar q={q} onQ={setQ} placeholder="Search name, username, vehicle or branch" count={rows ? `${rows.length} shown` : undefined}>
          <Chips
            value={role}
            onChange={setRole}
            options={[
              { value: "all", label: "All", n: d.length },
              ...(Object.keys(ROLE) as Role[]).map((r) => ({ value: r, label: ROLE[r].label, n: d.filter((u) => u.role === r).length })),
              { value: "disabled", label: "Disabled", n: d.filter((u) => !u.active).length },
            ]}
          />
        </Toolbar>
        <DataTable rows={rows} loading={isLoading} error={error?.message} columns={columns} rowKey={(u) => u.id} onRowClick={setEditing} dim={(u) => !u.active} initialSort={{ key: "role", dir: 1 }} minWidth={820} empty={{ icon: UsersIcon, title: "No accounts match" }} />
      </div>
      {current && <UserDrawer key={"id" in current ? (current as UserRow).id : "new"} user={"id" in current ? (current as UserRow) : null} preset={"id" in current ? {} : (current as Partial<Draft>)} onClose={close} />}
    </>
  );
}

function UserDrawer({ user, preset, onClose }: { user: UserRow | null; preset: Partial<Draft>; onClose: () => void }) {
  const [me] = useAdmin();
  const { data: look } = useAdminQuery<Lookups>("/lookups");
  const [u, setU] = useState<Draft>(() => ({
    username: user?.username ?? "", displayName: user?.displayName ?? "", role: user?.role ?? "driver", depotId: user?.depotId ?? "Peliyagoda", outletId: user?.outletId ?? null,
    outletScope: user?.outletScope ?? "outlet", driverId: user?.driverId ?? null, active: user?.active ?? true, password: user ? "" : generate(), ...preset,
  }));
  const [newPassword, setNewPassword] = useState("");
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setU((x) => ({ ...x, [k]: v }));
  const self = user?.id === me?.userId;

  const save = useAdminMutation(
    (x: Draft) => {
      const body = { ...x, password: undefined };
      return user ? api(`/admin/users/${user.id}`, { method: "PATCH", body }) : api("/admin/users", { body: { ...body, password: x.password } });
    },
    user ? `${u.displayName}’s account updated` : `Login “${u.username}” created. Share the password with ${u.displayName.split(" ")[0]} privately.`,
  );
  const reset = useAdminMutation((pw: string) => api(`/admin/users/${user!.id}/password`, { body: { password: pw } }), "Password changed. They’ve been signed out everywhere.");

  const drivers = (look?.drivers ?? []).filter((d) => !d.hasLogin || d.id === user?.driverId);
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Couldn’t copy. Select the text instead.");
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={user ? user.displayName : "Create a login"}
      sub={user ? `${ROLE[user.role].label} · created ${fmtWhen(user.createdAt)} · last sign-in ${fmtWhen(user.lastLoginAt).toLowerCase()}` : "They sign in with this username and password and land straight on their own workspace."}
      footer={<SaveBar onCancel={onClose} busy={save.isPending} label={user ? "Save changes" : "Create login"} />}
    >
      <form id="drawer-form" className="grid gap-6" onSubmit={(e) => (e.preventDefault(), save.mutate(u, { onSuccess: onClose }))}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Role" className="sm:col-span-2" hint={`Lands on: ${ROLE[u.role].lands}`}>
            <Select disabled={self} value={u.role} onChange={(v) => set("role", v)} options={(Object.keys(ROLE) as Role[]).map((r) => ({ value: r, label: ROLE[r].label }))} />
          </Field>
          {u.role === "driver" && (
            <Field label="Driver record" className="sm:col-span-2" hint="The vehicle comes from the driver record, so reassigning a vehicle never needs a new login.">
              <Select
                required
                value={u.driverId ?? ""}
                onChange={(v) => {
                  const d = look?.drivers.find((x) => x.id === v);
                  setU((x) => ({ ...x, driverId: v, displayName: x.displayName || (d?.label.split(" · ")[0] ?? "") }));
                }}
                placeholder="Choose a driver"
                options={drivers.map((d) => ({ value: d.id, label: `${d.id} · ${d.label}` }))}
              />
            </Field>
          )}
          {u.role === "store" && (
            <>
              <Field label="Branch" className="sm:col-span-2">
                <Select required value={u.outletId ?? ""} onChange={(v) => set("outletId", v)} placeholder="Choose a branch" options={(look?.outlets ?? []).filter((o) => o.active).map((o) => ({ value: o.id, label: o.label }))} />
              </Field>
              <Field label="Can see" className="sm:col-span-2">
                <Select value={u.outletScope ?? "outlet"} onChange={(v) => set("outletScope", v)} options={[{ value: "outlet", label: "Only this branch" }, { value: "depot", label: "Every branch its depot serves (area manager)" }]} />
              </Field>
            </>
          )}
          {(u.role === "dispatcher" || u.role === "loader" || u.role === "admin") && (
            <Field label="Depot" className="sm:col-span-2">
              <Select value={u.depotId ?? ""} onChange={(v) => set("depotId", v)} options={(look?.depots ?? []).map((d) => ({ value: d.id, label: d.name }))} />
            </Field>
          )}
          <Field label="Full name"><TextInput required value={u.displayName} onChange={(e) => set("displayName", e.target.value)} /></Field>
          <Field label="Username" hint="Lowercase letters, digits, dots or dashes."><TextInput required value={u.username} onChange={(e) => set("username", e.target.value.toLowerCase())} autoCapitalize="none" spellCheck={false} /></Field>
        </div>

        {!user && (
          <Card className="grid gap-2 p-4">
            <span className="flex items-center gap-2 text-sm font-bold"><KeyRound className="size-4 text-primary" /> Starting password</span>
            <div className="flex gap-2">
              <TextInput required value={u.password} onChange={(e) => set("password", e.target.value)} className="font-mono" aria-label="Starting password" />
              <Button type="button" kind="secondary" icon={RefreshCw} onClick={() => set("password", generate())} aria-label="Generate another password" />
              <Button type="button" kind="secondary" icon={Copy} onClick={() => copy(u.password)} aria-label="Copy password" />
            </div>
            <p className="text-xs text-ink-2">At least 8 characters with a letter and a number. You won’t be able to see it again after saving.</p>
          </Card>
        )}

        {user && (
          <>
            <Toggle checked={u.active} onChange={(v) => set("active", v)} label="Can sign in" sub={self ? "You can’t disable your own account." : "Disabling signs them out on every device immediately."} />
            <Card className="grid gap-2 p-4">
              <span className="flex items-center gap-2 text-sm font-bold"><ShieldCheck className="size-4 text-primary" /> Set a new password</span>
              <div className="flex gap-2">
                <TextInput value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="font-mono" aria-label="New password" />
                <Button type="button" kind="secondary" icon={RefreshCw} onClick={() => setNewPassword(generate())} aria-label="Generate a password" />
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" sm busy={reset.isPending} disabled={!newPassword} onClick={() => reset.mutate(newPassword, { onSuccess: () => void copy(newPassword) })}>Set password &amp; copy</Button>
                <span className="text-xs text-ink-2">Signs them out everywhere.</span>
              </div>
            </Card>
          </>
        )}
      </form>
    </Drawer>
  );
}

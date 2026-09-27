"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button, Logo, cx } from "@waypoint/ui/ui";
import { signIn, useAdmin } from "@/lib/session";

export default function AdminLogin() {
  const router = useRouter();
  const [user, ready] = useAdmin();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && user) router.replace("/");
  }, [ready, user, router]);

  const submit = async () => {
    if (!username.trim() || !password) return setError("Enter your administrator username and password.");
    setBusy(true);
    const r = await signIn(username.trim(), password);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.replace("/");
  };

  const field = "w-full rounded-xl border bg-surface px-3.5 py-3 text-base text-ink shadow-card transition-[border-color,box-shadow] focus:outline-none focus:ring-4";
  return (
    <main className="on-ink relative grid min-h-dvh place-items-center overflow-hidden bg-navy px-5 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(70%_50%_at_80%_0%,rgb(20_184_166/0.2),transparent_60%),radial-gradient(60%_50%_at_0%_100%,rgb(26_51_69/0.9),transparent_70%)]" />
      <div className="relative grid w-full max-w-md gap-6">
        <div className="flex items-center justify-between text-white">
          <Logo size={40} label="Waypoint" sub="Admin console" dark />
          <span className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-semibold text-mint">
            <ShieldCheck className="size-3.5" /> Administrators only
          </span>
        </div>
        <form
          className="grid gap-4 rounded-2xl bg-surface p-6 text-ink shadow-float sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div>
            <h1 className="text-[26px] font-bold tracking-tight">Sign in</h1>
            <p className="mt-1 text-sm text-ink-2">Manage drivers, branches, vehicles, depots, products and who can sign in to Waypoint.</p>
          </div>
          <label className="grid gap-1.5 text-sm font-semibold text-ink-2">
            Username
            <input
              value={username}
              onChange={(e) => (setUsername(e.target.value), setError(""))}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              className={cx(field, "border-line-strong font-normal focus:border-primary focus:ring-primary/15")}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-semibold text-ink-2">
            Password
            <span className="relative flex">
              <input
                value={password}
                onChange={(e) => (setPassword(e.target.value), setError(""))}
                type={show ? "text" : "password"}
                autoComplete="current-password"
                aria-invalid={!!error}
                aria-describedby={error ? "admin-login-error" : undefined}
                className={cx(field, "pr-12 font-normal", error ? "border-danger focus:ring-danger/15" : "border-line-strong focus:border-primary focus:ring-primary/15")}
              />
              <button type="button" onClick={() => setShow((x) => !x)} aria-label={show ? "Hide password" : "Show password"} className="absolute inset-y-0 right-1 my-1 flex w-10 items-center justify-center rounded-lg text-ink-2 hover:bg-subtle">
                {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </span>
          </label>
          {error && (
            <p id="admin-login-error" role="alert" className="rounded-xl bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <Button type="submit" big busy={busy}>
            Sign in <ArrowRight className="size-5" />
          </Button>
        </form>
        <p className="text-center text-sm text-on-ink-muted">Dispatchers, loaders, drivers and store managers sign in to the Waypoint operations app.</p>
      </div>
    </main>
  );
}

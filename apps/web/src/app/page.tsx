"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowRight, Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react";
import { Button, Logo, cx } from "@/components/ui";
import { DEMO_DATE } from "@waypoint/core/reference";
import { fmtDate } from "@waypoint/core/domain/time";
import { HOME, signIn, useSession } from "@/lib/session";

// The loop, drawn as the logo's S-route at poster scale. Coordinates are in the SVG viewBox.
const ROUTE = "M 40 40 H 470 A 50 50 0 0 1 470 140 H 90 A 50 50 0 0 0 90 240 H 520";
const W = 560;
const H = 280;
const WAYPOINTS = [
  { x: 40, y: 40, role: "Store", fact: "Orders in by the 16:00 cutoff" },
  { x: 330, y: 40, role: "Dispatcher", fact: "Every deferral has a reason" },
  { x: 390, y: 140, role: "Loader", fact: "Last stop loaded first" },
  { x: 150, y: 140, role: "Driver", fact: "Keeps working with no signal" },
  { x: 330, y: 240, role: "Store", fact: "Receipt closes the loop" },
];

const REDUCED = "(prefers-reduced-motion: reduce)";
function useReducedMotion() {
  return useSyncExternalStore(
    (on) => {
      const mq = window.matchMedia(REDUCED);
      mq.addEventListener("change", on);
      return () => mq.removeEventListener("change", on);
    },
    () => window.matchMedia(REDUCED).matches,
    () => true, // server: render the still route; the runner starts after hydration
  );
}

function Loop() {
  const reduced = useReducedMotion();
  return (
    <figure className="relative w-full max-w-[560px]" aria-label="How Waypoint connects the five steps of a delivery day">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" aria-hidden>
        <path d={ROUTE} fill="none" stroke="var(--color-navy-3)" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round" />
        <path d={ROUTE} fill="none" stroke="rgb(255 255 255 / 0.18)" strokeWidth={2} strokeDasharray="2 12" strokeLinecap="round" />
        <path d="M 508 230 L 524 240 L 508 250" fill="none" stroke="var(--color-mint)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
        {WAYPOINTS.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={15} fill="var(--color-navy)" stroke="var(--color-mint)" strokeWidth={3} />
            <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">
              {i + 1}
            </text>
          </g>
        ))}
        {!reduced && (
          <g>
            <circle r={11} fill="var(--color-mint)" opacity={0.25}>
              <animateMotion dur="9s" repeatCount="indefinite" path={ROUTE} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.25 1" />
            </circle>
            <circle r={5} fill="var(--color-mint)">
              <animateMotion dur="9s" repeatCount="indefinite" path={ROUTE} keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.45 0 0.25 1" />
            </circle>
          </g>
        )}
      </svg>
      {WAYPOINTS.map((p, i) => (
        <figcaption
          key={i}
          className="absolute w-40 -translate-x-1/2 text-center"
          style={{ left: `${(p.x / W) * 100}%`, top: `calc(${(p.y / H) * 100}% + 22px)` }}
        >
          <span className="block text-[11px] font-bold uppercase tracking-wider text-mint">{p.role}</span>
          <span className="block text-[13px] leading-snug text-white/85">{p.fact}</span>
        </figcaption>
      ))}
    </figure>
  );
}

export default function SignIn() {
  const router = useRouter();
  const [session, ready] = useSession();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<{ text: string; adminUrl?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (ready && session) router.replace(HOME[session.role]);
  }, [ready, session, router]);

  const submit = async () => {
    if (!username.trim() || !password) return setError({ text: "Enter the username and password your administrator gave you." });
    setBusy(true);
    const r = await signIn(username.trim(), password);
    setBusy(false);
    if (!r.ok) return setError({ text: r.error, adminUrl: r.adminUrl });
    router.push(HOME[r.user.role]);
  };

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      <section className="on-ink relative hidden flex-col justify-between gap-10 overflow-hidden bg-navy p-12 text-white lg:flex xl:p-14">
        {/* A faint topographic wash so the navy field has depth without decoration competing with the loop. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_60%_at_85%_0%,rgb(20_184_166/0.18),transparent_60%),radial-gradient(60%_50%_at_0%_100%,rgb(26_51_69/0.9),transparent_70%)]" />
        <div className="relative">
          <Logo size={40} label="Waypoint" sub="Fresh · Style · Tech" dark />
        </div>
        <div className="relative grid gap-10">
          <div className="max-w-xl">
            <h1 className="text-5xl font-bold leading-[1.05] tracking-[-0.03em] xl:text-6xl">
              Delivery planning that <span className="text-mint">explains itself</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-on-ink-muted">
              One system for ordering, planning, loading, delivery and receipt — so Fresh, Style and Tech share one fleet, every deferral has a reason, and drivers keep working when the signal drops.
            </p>
          </div>
          <div className="pb-14">
            <Loop />
          </div>
        </div>
        <p className="relative text-sm text-on-ink-muted">Demo day: {fmtDate(DEMO_DATE)} · one week before Christmas · Peliyagoda DC &amp; Kandy hub</p>
      </section>

      <section className="flex flex-col justify-center px-5 py-10 sm:px-12 xl:px-20">
        <div className="mx-auto grid w-full max-w-md gap-8">
          {/* Phone/tablet: the brand panel is hidden, so carry the mark and the promise here. */}
          <div className="grid gap-4 lg:hidden">
            <Logo size={36} label="Waypoint" sub="Fresh · Style · Tech" />
            <h1 className="text-3xl font-bold leading-tight tracking-tight">
              Delivery planning that <span className="text-primary">explains itself</span>
            </h1>
          </div>

          <div className="grid gap-2">
            <span className="flex size-12 items-center justify-center rounded-2xl bg-primary-soft text-primary">
              <KeyRound className="size-6" />
            </span>
            <h2 className="text-[28px] font-bold tracking-tight">Sign in</h2>
            <p className="text-[15px] leading-relaxed text-ink-2">Use the username and password your administrator gave you. You’ll go straight to your own workspace: dispatch, the dock, your run or your store.</p>
          </div>

          <form
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <label className="grid gap-1.5 text-sm font-semibold text-ink-2">
              Username
              <input
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  setError(null);
                }}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                autoFocus
                className="rounded-xl border border-line-strong bg-surface px-3.5 py-3 text-base font-normal text-ink shadow-card transition-[border-color,box-shadow] placeholder:text-muted focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-semibold text-ink-2">
              Password
              <span className="relative flex">
                <input
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  type={show ? "text" : "password"}
                  autoComplete="current-password"
                  aria-invalid={!!error}
                  aria-describedby={error ? "signin-error" : undefined}
                  className={cx(
                    "w-full rounded-xl border bg-surface py-3 pl-3.5 pr-12 text-base font-normal text-ink shadow-card transition-[border-color,box-shadow] focus:outline-none focus:ring-4",
                    error ? "border-danger focus:ring-danger/15" : "border-line-strong focus:border-primary focus:ring-primary/15",
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShow((x) => !x)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute inset-y-0 right-1 my-1 flex w-10 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-subtle hover:text-ink"
                >
                  {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </span>
            </label>
            {error && (
              <p id="signin-error" role="alert" className="rounded-xl bg-danger-soft px-3.5 py-3 text-sm font-medium text-danger">
                {error.text}
                {error.adminUrl && (
                  <a href={error.adminUrl} className="mt-1 flex items-center gap-1 font-semibold underline">
                    Open the admin console <ArrowRight className="size-4" />
                  </a>
                )}
              </p>
            )}
            <Button type="submit" big busy={busy}>
              Sign in <ArrowRight className="size-5" />
            </Button>
          </form>

          <p className="flex items-start gap-2 text-sm text-ink-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
            Forgot your password or locked out? Your Waypoint administrator can reset it from the admin console.
          </p>
        </div>
      </section>
    </main>
  );
}

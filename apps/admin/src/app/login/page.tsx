"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { Button, Field, PeopleMark, TextInput, Typed } from "@/components/cabinet";
import { signIn, useAdmin } from "@/lib/session";

export default function PeopleLogin() {
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
    if (!username.trim() || !password) return setError("Enter your HR username and password.");
    setBusy(true);
    const r = await signIn(username.trim(), password);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    router.replace("/");
  };

  return (
    <main className="grid min-h-dvh place-items-center bg-cabinet px-4 py-10">
      <div className="grid w-full max-w-[440px] gap-6">
        <div className="flex items-center gap-3 text-on-cabinet">
          <PeopleMark size={40} />
          <div className="leading-tight">
            <div className="text-[20px] font-bold [font-stretch:92%]">Waypoint People</div>
            <div className="caps text-[10.5px] text-on-cabinet-muted">Human resources · staff records and sign-in access</div>
          </div>
        </div>

        {/* A manila folder, open on the desk, with the sign-in card inside. */}
        <div className="relative pt-8">
          <div className="absolute top-0 left-5 flex h-10 items-start rounded-t-[5px] border border-b-0 border-manila-edge bg-manila px-4 pt-2">
            <span className="caps text-[11px] text-manila-ink">HR · Staff only</span>
          </div>
          <div className="relative rounded-[4px] border border-manila-edge bg-manila-2 p-4 shadow-float sm:p-5">
            <form
              className="index-card"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
            >
              <header className="flex h-11 items-center border-b border-card-red/80 px-5">
                <h1 className="caps text-[12px] text-ink-2">Sign in</h1>
              </header>
              <div className="grid gap-4 px-5 pt-4 pb-5">
                <Field label="Username">
                  <TextInput
                    typed
                    value={username}
                    onChange={(e) => (setUsername(e.target.value), setError(""))}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                  />
                </Field>
                <Field label="Password">
                  <span className="relative flex">
                    <TextInput
                      value={password}
                      onChange={(e) => (setPassword(e.target.value), setError(""))}
                      type={show ? "text" : "password"}
                      autoComplete="current-password"
                      aria-invalid={!!error}
                      aria-describedby={error ? "people-login-error" : undefined}
                      className="pr-11"
                    />
                    <button type="button" onClick={() => setShow((x) => !x)} aria-label={show ? "Hide password" : "Show password"} className="absolute inset-y-0 right-0.5 my-0.5 flex w-10 items-center justify-center rounded-[2px] text-ink-2 hover:bg-subtle">
                      {show ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                    </button>
                  </span>
                </Field>
                {error && (
                  <p id="people-login-error" role="alert" className="text-sm font-medium text-stamp-left">
                    {error}
                  </p>
                )}
                <Button type="submit" busy={busy} className="h-11 w-full text-[15px]">
                  Open the cabinet <ArrowRight className="size-4" />
                </Button>
              </div>
            </form>
          </div>
        </div>

        <p className="text-center text-sm leading-relaxed text-on-cabinet-muted">
          Dispatchers, loaders, drivers and store managers sign in to the Waypoint operations app. Locked out? Another HR officer can reset your password. Demo HR login: <Typed className="text-on-cabinet">admin</Typed>.
        </p>
      </div>
    </main>
  );
}

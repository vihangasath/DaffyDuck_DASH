"use client";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { RoleGuard } from "@/components/role-guard";
import { Logo, SyncPill } from "@/components/ui";
import { useOnline } from "@/lib/hooks";
import { signOut } from "@/lib/session";

export default function LoaderLayout({ children }: LayoutProps<"/loader">) {
  const online = useOnline();
  const router = useRouter();
  return (
    <RoleGuard role="loader">
      {(s) => (
        <div className="min-h-dvh">
          <div className="on-ink sticky top-0 z-20 flex items-center gap-3 bg-navy px-4 py-2.5 text-white sm:px-6">
            <Logo size={30} label={`${s.depot} dock`} sub={s.name} dark />
            <span className="ml-auto">
              <SyncPill state={online ? "ok" : "off"} />
            </span>
            <button
              aria-label="Sign out"
              onClick={async () => {
                await signOut();
                router.replace("/");
              }}
              className="flex size-9 items-center justify-center rounded-lg text-on-ink-muted transition-colors hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-[18px]" />
            </button>
          </div>
          <div className="mx-auto max-w-6xl">{children}</div>
        </div>
      )}
    </RoleGuard>
  );
}

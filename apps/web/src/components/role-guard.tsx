"use client";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import type { Role } from "@waypoint/core/domain/types";
import { HOME, refreshSession, useSession, type Session } from "@/lib/session";
import { Spinner } from "./ui";

/** Keeps each role on its own screens. The API enforces the same rules on every request. */
export function RoleGuard({ role, children }: { role: Role; children: (s: Session) => ReactNode }) {
  const [session, ready] = useSession();
  const router = useRouter();
  useEffect(() => {
    if (!ready) return;
    if (!session) router.replace("/");
    else if (session.role !== role) router.replace(HOME[session.role]);
  }, [ready, session, role, router]);
  // Pick up admin changes (vehicle reassigned, account disabled) once per visit.
  useEffect(() => {
    void refreshSession();
  }, []);
  if (!session || session.role !== role) return <Spinner />;
  return <>{children(session)}</>;
}

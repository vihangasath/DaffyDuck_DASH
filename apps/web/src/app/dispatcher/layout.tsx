"use client";
import { DispatcherShell } from "@/components/dispatcher-shell";
import { RoleGuard } from "@/components/role-guard";

export default function DispatcherLayout({ children }: LayoutProps<"/dispatcher">) {
  return <RoleGuard role="dispatcher">{(s) => <DispatcherShell session={s}>{children}</DispatcherShell>}</RoleGuard>;
}

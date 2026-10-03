"use client";
import { ThemeToggle } from "@/components/theme-controls";

export function DriverThemeToggle({ className }: { className?: string }) {
  return <ThemeToggle app="driver" className={className} />;
}

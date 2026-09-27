"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { Toaster } from "@waypoint/ui/toast";
import { subscribeServer } from "@/lib/api";
import { useAdmin } from "@/lib/session";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false, staleTime: 10_000 } } }));
  const [user] = useAdmin();
  // Live: when anyone changes anything (a dispatcher publishing, a driver syncing), refresh what's on screen.
  useEffect(() => subscribeServer(() => void qc.invalidateQueries({ queryKey: ["admin"] })), [qc, user?.userId]);
  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}

"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import { subscribeServer } from "@/lib/api";
import { Toaster } from "./toast";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false } } }));

  // Any change on the server — by anyone, in any role — refreshes every open screen.
  useEffect(
    () =>
      subscribeServer(() => {
        void qc.invalidateQueries({ queryKey: ["db"] });
        void qc.invalidateQueries({ queryKey: ["records"] });
      }),
    [qc],
  );

  // Cache the app shell so the driver and loader apps open with no signal.
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  return (
    <QueryClientProvider client={qc}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}

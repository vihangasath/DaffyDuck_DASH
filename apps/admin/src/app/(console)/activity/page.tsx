"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { Activity } from "lucide-react";
import type { ActivityRow } from "@waypoint/core/admin";
import { Button, Card, Empty, Spinner } from "@waypoint/ui/ui";
import { PageHeader } from "@/components/shell";
import { ActivityItem } from "@/components/activity";
import { Chips, Toolbar, fmtWhen } from "@/components/kit";
import { api } from "@/lib/api";

export default function ActivityPage() {
  const [q, setQ] = useState("");
  const [area, setArea] = useState("all");
  const dq = useDeferredValue(q);
  const query = useInfiniteQuery({
    queryKey: ["admin", "/activity", dq, area],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<ActivityRow[]>(`/admin/activity?limit=60${pageParam ? `&before=${pageParam}` : ""}${dq ? `&q=${encodeURIComponent(dq)}` : ""}${area !== "all" ? `&area=${area}` : ""}`),
    getNextPageParam: (last) => (last.length === 60 ? last[last.length - 1].id : undefined),
  });
  const rows = query.data?.pages.flat() ?? [];
  return (
    <>
      <PageHeader title="Activity log" sub="Every change anyone makes, in any role, is recorded here with who did it and when." />
      <div className="grid gap-4 p-5 lg:p-7">
        <Toolbar q={q} onQ={setQ} placeholder="Search what happened, who, or an id">
          <Chips value={area} onChange={setArea} options={[{ value: "all", label: "Everything" }, { value: "ops", label: "Operations" }, { value: "admin", label: "Admin changes" }, { value: "auth", label: "Sign-ins" }]} />
        </Toolbar>
        {query.isLoading ? (
          <Spinner />
        ) : (
          <Card className="overflow-hidden">
            {rows.length === 0 ? (
              <Empty icon={Activity} title="Nothing recorded yet">Nothing matches that search.</Empty>
            ) : (
              <ol>
                {rows.map((a) => (
                  <ActivityItem key={a.id} a={a} when={fmtWhen(a.at)} />
                ))}
              </ol>
            )}
            {query.hasNextPage && (
              <div className="border-t border-line p-3 text-center">
                <Button kind="ghost" busy={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>Show older activity</Button>
              </div>
            )}
          </Card>
        )}
      </div>
    </>
  );
}

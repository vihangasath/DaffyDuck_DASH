"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";
import { NotebookPen } from "lucide-react";
import type { PeopleActivity } from "@waypoint/core/people";
import { Button, Dividers, Empty, ErrorNote, Loading, PageHeader, SearchBox, Sheet } from "@/components/cabinet";
import { LogLine, collapse } from "@/components/logbook";
import { api } from "@/lib/api";

type Area = "all" | "people" | "access" | "signin";

export default function ActivityPage() {
  const [q, setQ] = useState("");
  const [area, setArea] = useState<Area>("all");
  const dq = useDeferredValue(q);
  const query = useInfiniteQuery({
    queryKey: ["people", "/activity", dq, area],
    initialPageParam: 0,
    queryFn: ({ pageParam }) => api<PeopleActivity[]>(`/people/activity?limit=60${pageParam ? `&before=${pageParam}` : ""}${dq ? `&q=${encodeURIComponent(dq)}` : ""}${area !== "all" ? `&area=${area}` : ""}`),
    getNextPageParam: (last) => (last.length === 60 ? last[last.length - 1].id : undefined),
  });
  const rows = query.data?.pages.flat() ?? [];
  return (
    <>
      <PageHeader title="Activity log" sub="The HR logbook: every change to a staff record, every login issued or turned off, and every sign-in, with who did it and when. Delivery operations are logged in the operations app." />
      <div className="grid gap-4 px-5 lg:px-8 [&>*]:min-w-0">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <Dividers<Area>
            label="Entries"
            value={area}
            onChange={setArea}
            options={[{ value: "all", label: "Everything" }, { value: "people", label: "Staff records" }, { value: "access", label: "Logins" }, { value: "signin", label: "Sign-ins" }]}
          />
          <SearchBox q={q} onQ={setQ} placeholder="Search what happened, who, or an id" className="ml-auto w-full sm:w-80" />
        </div>
        {query.error ? (
          <ErrorNote>{query.error.message}</ErrorNote>
        ) : query.isLoading ? (
          <Loading />
        ) : (
          <Sheet className="overflow-hidden">
            {rows.length === 0 ? (
              <Empty icon={NotebookPen} title="Nothing written here">{dq ? "Nothing matches that search." : "Entries appear as soon as anyone changes a record."}</Empty>
            ) : (
              <ol>{collapse(rows).map(({ a, times }) => <LogLine key={a.id} a={a} times={times} />)}</ol>
            )}
            {query.hasNextPage && (
              <div className="border-t border-line p-3 text-center">
                <Button kind="ghost" busy={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>Turn back a page</Button>
              </div>
            )}
          </Sheet>
        )}
      </div>
    </>
  );
}

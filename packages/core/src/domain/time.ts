/** "05:30" -> 330 minutes after midnight. */
export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** 330 -> "05:30" */
export const fmtMin = (min: number) => {
  const m = Math.round(min);
  const h = Math.floor(m / 60) % 24;
  return `${String(h).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
};

/** "09:00-11:00" -> [540, 660] */
export const parseWindow = (w: string): [number, number] => {
  const [a, b] = w.split("-");
  return [toMin(a), toMin(b)];
};

/** Whole days from one ISO date to another ("2026-10-04" → "2026-10-20" is 16; negative when `to` is earlier). */
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

/** Wall-clock time of an ISO timestamp, "06:42" (the viewer's time zone). */
export const fmtClock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", opts);

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

export const fmtDate = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-GB", opts);

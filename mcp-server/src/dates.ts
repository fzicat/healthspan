// `logged_at` is stored in UTC, but a training "day" is the athlete's local
// calendar day (this process runs in the athlete's timezone, like `today()`).
// Bounds are local midnights (DST-safe via the Date constructor), end-exclusive.
export function localDayBounds(from: string, to: string = from): { start: string; end: string } {
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  return {
    start: new Date(y1, m1 - 1, d1).toISOString(),
    end: new Date(y2, m2 - 1, d2 + 1).toISOString(),
  };
}

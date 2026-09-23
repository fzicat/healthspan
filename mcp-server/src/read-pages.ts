export type QueryResult<T> = { data: T[] | null; count: number | null; error: unknown };

/** Counts come from PostgREST, not a guessed limit+1 under a server-side cap. */
export function page<T>(result: QueryResult<T>, offset: number, limit: number) {
  if (result.error) throw result.error;
  const items = result.data ?? [];
  const total = result.count;
  const has_more = total === null ? null : offset + items.length < total;
  return { items, complete: offset === 0 && total !== null && items.length === total,
    has_more, next_offset: has_more && items.length ? offset + items.length : null,
    offset, limit, returned_count: items.length, total, consistency: "non_atomic" as const };
}

/** Bounded complete-read helper for legacy views; never used to grant authority. */
export async function readAll<T>(query: (start: number, end: number) => PromiseLike<QueryResult<T>>) {
  const items: T[] = [];
  let total: number | null = null;
  let unchanged = true;
  for (let i = 0; i < 100; i++) {
    const result = await query(items.length, items.length + 499);
    if (result.error) throw result.error;
    if (i > 0 && result.count !== total) unchanged = false;
    total = result.count;
    const batch = result.data ?? [];
    items.push(...batch);
    if (!batch.length || (total !== null && items.length >= total)) break;
  }
  return { items, complete: unchanged && total !== null && items.length === total,
    has_more: total === null ? null : items.length < total,
    next_offset: total !== null && items.length < total ? items.length : null,
    returned_count: items.length, total, consistency: "non_atomic" as const };
}

export function readTimezone() {
  const zone = process.env.HSPAN_ATHLETE_TIMEZONE ?? "America/Montreal";
  new Intl.DateTimeFormat("en", { timeZone: zone }).format();
  return zone;
}

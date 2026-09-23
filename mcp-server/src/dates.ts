// Next.js's package is CommonJS to tsx; this MCP package is ESM. Normalize the
// module namespace at that boundary, keeping one shared calendar implementation.
import * as dateModule from "../../src/lib/training-planning/dates.ts";
const dates = (dateModule as { default?: typeof dateModule }).default ?? dateModule;
export const { athleteDate, localDayBounds, validateDate, validateTimezone, addCalendarDays } = dates;

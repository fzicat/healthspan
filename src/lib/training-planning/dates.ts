// Calendar dates belong to the provisioned athlete, never the browser/server zone.
// Deployment setting must match the explicitly provisioned SQL timezone. It is
// not the browser/device zone and needs no planning-service read to save a set.
export const DEFAULT_ATHLETE_TIMEZONE = process.env.NEXT_PUBLIC_ATHLETE_TIMEZONE || 'America/Montreal'

export function validateDate(value: string): string {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('INVALID_DATE: expected YYYY-MM-DD')
    const parsed = new Date(`${value}T00:00:00.000Z`)
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
        throw new Error('INVALID_DATE: invalid calendar date')
    }
    return value
}

export function validateTimezone(timezone: string): string {
    try { new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(0)) }
    catch { throw new Error('INVALID_TIMEZONE: expected an IANA timezone') }
    return timezone
}

const formatters = new Map<string, Intl.DateTimeFormat>()
export function athleteDate(now: Date = new Date(), timezone = DEFAULT_ATHLETE_TIMEZONE): string {
    let formatter = formatters.get(timezone)
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-CA', { timeZone: validateTimezone(timezone), year: 'numeric', month: '2-digit', day: '2-digit' })
        formatters.set(timezone, formatter)
    }
    const parts = formatter.formatToParts(now)
    const part = (type: string) => parts.find(item => item.type === type)!.value
    return `${part('year')}-${part('month')}-${part('day')}`
}

export function addCalendarDays(date: string, days: number): string {
    validateDate(date)
    if (!Number.isInteger(days)) throw new Error('INVALID_DATE: calendar offset must be an integer')
    const d = new Date(`${date}T00:00:00.000Z`)
    d.setUTCDate(d.getUTCDate() + days)
    return d.toISOString().slice(0, 10)
}

// Locate the start of a local calendar date, not a fixed 24-hour interval.
// Searching instants also handles midnight DST changes without guessing offsets.
function localMidnight(date: string, timezone: string): number {
    const pivot = new Date(`${date}T00:00:00.000Z`).getTime()
    let lower = pivot - 48 * 60 * 60 * 1000
    let upper = pivot + 48 * 60 * 60 * 1000
    while (lower < upper) {
        const middle = Math.floor((lower + upper) / 2)
        if (athleteDate(new Date(middle), timezone) < date) lower = middle + 1
        else upper = middle
    }
    if (athleteDate(new Date(lower), timezone) !== date) throw new Error('INVALID_DATE: local date does not exist in timezone')
    return lower
}

export function localDayBounds(date: string, timezone = DEFAULT_ATHLETE_TIMEZONE): { start: string; end: string } {
    validateDate(date)
    validateTimezone(timezone)
    return {
        start: new Date(localMidnight(date, timezone)).toISOString(),
        end: new Date(localMidnight(addCalendarDays(date, 1), timezone)).toISOString(),
    }
}

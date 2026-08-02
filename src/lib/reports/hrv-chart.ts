export const HRV_TIMEFRAMES = ['1W', '1M', '3M', '6M', '1Y', 'All'] as const
export type HrvTimeframe = typeof HRV_TIMEFRAMES[number]

export type HrvPoint = {
    date: string
    sleepHrv: number | null
    morningHrv: number | null
}

export type HrvReadingPoint = {
    date: string
    value: number
}

export type HrvAveragePoint = {
    date: string
    average: number
    sampleCount: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function parseDate(date: string): Date {
    return new Date(`${date}T00:00:00Z`)
}

function toIsoDate(date: Date): string {
    return date.toISOString().slice(0, 10)
}

function subtractDays(anchorDate: string, days: number): string {
    const date = parseDate(anchorDate)
    date.setUTCDate(date.getUTCDate() - days)
    return toIsoDate(date)
}

function subtractMonths(anchorDate: string, months: number): string {
    const anchor = parseDate(anchorDate)
    const targetMonth = new Date(Date.UTC(
        anchor.getUTCFullYear(),
        anchor.getUTCMonth() - months,
        1
    ))
    const lastDay = new Date(Date.UTC(
        targetMonth.getUTCFullYear(),
        targetMonth.getUTCMonth() + 1,
        0
    )).getUTCDate()
    targetMonth.setUTCDate(Math.min(anchor.getUTCDate(), lastDay))
    return toIsoDate(targetMonth)
}

function subtractYears(anchorDate: string, years: number): string {
    const anchor = parseDate(anchorDate)
    const target = new Date(Date.UTC(
        anchor.getUTCFullYear() - years,
        anchor.getUTCMonth(),
        1
    ))
    const lastDay = new Date(Date.UTC(
        target.getUTCFullYear(),
        target.getUTCMonth() + 1,
        0
    )).getUTCDate()
    target.setUTCDate(Math.min(anchor.getUTCDate(), lastDay))
    return toIsoDate(target)
}

export function getHrvRangeStart(anchorDate: string, timeframe: HrvTimeframe): string | null {
    switch (timeframe) {
        case '1W':
            return subtractDays(anchorDate, 6)
        case '1M':
            return subtractMonths(anchorDate, 1)
        case '3M':
            return subtractMonths(anchorDate, 3)
        case '6M':
            return subtractMonths(anchorDate, 6)
        case '1Y':
            return subtractYears(anchorDate, 1)
        case 'All':
            return null
    }
}

export function getHrvQueryStart(displayRangeStart: string | null): string | null {
    return displayRangeStart === null ? null : subtractDays(displayRangeStart, 13)
}

export function getHrvReadings(
    points: HrvPoint[],
    field: 'sleepHrv' | 'morningHrv'
): HrvReadingPoint[] {
    return points
        .filter((point): point is HrvPoint & Record<typeof field, number> => point[field] !== null)
        .map(point => ({ date: point.date, value: point[field] }))
        .sort((a, b) => a.date.localeCompare(b.date))
}

export function calculateFourteenDayMovingAverage(
    points: HrvReadingPoint[]
): HrvAveragePoint[] {
    const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
    const result: HrvAveragePoint[] = []
    let windowStartIndex = 0
    let windowSum = 0

    for (let index = 0; index < sorted.length; index += 1) {
        const point = sorted[index]
        const pointTime = parseDate(point.date).getTime()
        const earliestIncludedTime = pointTime - (13 * DAY_MS)
        windowSum += point.value

        while (
            windowStartIndex < index
            && parseDate(sorted[windowStartIndex].date).getTime() < earliestIncludedTime
        ) {
            windowSum -= sorted[windowStartIndex].value
            windowStartIndex += 1
        }

        const sampleCount = index - windowStartIndex + 1
        result.push({
            date: point.date,
            average: windowSum / sampleCount,
            sampleCount,
        })
    }

    return result
}

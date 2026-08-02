'use client'

import { useEffect, useMemo, useState } from 'react'
import { HrvChart } from '@/components/reports/HrvChart'
import { getHrvReport } from '@/lib/api/reports'
import { getTodayDate } from '@/lib/api/daily-logs'
import {
    calculateFourteenDayMovingAverage,
    getHrvQueryStart,
    getHrvRangeStart,
    getHrvReadings,
    HRV_TIMEFRAMES,
    type HrvPoint,
    type HrvTimeframe,
} from '@/lib/reports/hrv-chart'

function formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`))
}

export default function HrvReportPage() {
    const [timeframe, setTimeframe] = useState<HrvTimeframe>('1M')
    const [today] = useState(getTodayDate)
    const [points, setPoints] = useState<HrvPoint[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [reloadToken, setReloadToken] = useState(0)

    const rangeStart = useMemo(
        () => getHrvRangeStart(today, timeframe),
        [today, timeframe]
    )
    const queryStart = useMemo(
        () => getHrvQueryStart(rangeStart),
        [rangeStart]
    )
    const displayedPoints = useMemo(
        () => rangeStart === null
            ? points
            : points.filter(point => point.date >= rangeStart),
        [points, rangeStart]
    )
    const sleepReadings = useMemo(
        () => getHrvReadings(displayedPoints, 'sleepHrv'),
        [displayedPoints]
    )
    const morningReadings = useMemo(
        () => getHrvReadings(displayedPoints, 'morningHrv'),
        [displayedPoints]
    )
    const sleepAverages = useMemo(
        () => calculateFourteenDayMovingAverage(getHrvReadings(points, 'sleepHrv')).filter(point => (
            rangeStart === null || point.date >= rangeStart
        )),
        [points, rangeStart]
    )
    const morningAverages = useMemo(
        () => calculateFourteenDayMovingAverage(getHrvReadings(points, 'morningHrv')).filter(point => (
            rangeStart === null || point.date >= rangeStart
        )),
        [points, rangeStart]
    )

    useEffect(() => {
        let isCurrent = true

        getHrvReport(queryStart, today)
            .then(data => {
                if (isCurrent) setPoints(data)
            })
            .catch(loadError => {
                console.error('Failed to load HRV report:', loadError)
                if (isCurrent) {
                    setPoints([])
                    setError('Unable to load the HRV report. Please try again.')
                }
            })
            .finally(() => {
                if (isCurrent) setIsLoading(false)
            })

        return () => {
            isCurrent = false
        }
    }, [queryStart, today, reloadToken])

    const latestSleep = sleepReadings.at(-1)
    const latestMorning = morningReadings.at(-1)
    const latestSleepAverage = sleepAverages.at(-1)
    const latestMorningAverage = morningAverages.at(-1)
    const displayedRangeStart = timeframe === 'All'
        ? displayedPoints[0]?.date ?? null
        : rangeStart
    const rangeLabel = displayedRangeStart
        ? `${formatDate(displayedRangeStart)} – ${formatDate(today)}`
        : 'All available history'
    const hasReadings = sleepReadings.length > 0 || morningReadings.length > 0

    return (
        <div aria-busy={isLoading}>
            <div className="mb-5 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-foreground">Heart rate variability</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Sleep and morning HRV readings with 14-day trends · {rangeLabel}
                    </p>
                </div>

                <div>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Timeframe
                    </span>
                    <div className="inline-flex flex-wrap rounded-lg border border-border bg-background p-1" role="group" aria-label="HRV report timeframe">
                        {HRV_TIMEFRAMES.map(option => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => {
                                    if (option === timeframe) return
                                    setIsLoading(true)
                                    setError(null)
                                    setTimeframe(option)
                                }}
                                className={`min-w-12 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                                    timeframe === option
                                        ? 'bg-primary text-background shadow-sm'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                                aria-pressed={timeframe === option}
                            >
                                {option}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {error && (
                <div className="mb-5 flex flex-col gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm text-destructive">{error}</p>
                    <button
                        type="button"
                        onClick={() => {
                            setIsLoading(true)
                            setError(null)
                            setReloadToken(token => token + 1)
                        }}
                        className="self-start rounded-lg bg-destructive px-4 py-2 text-sm font-semibold text-background sm:self-auto"
                    >
                        Retry
                    </button>
                </div>
            )}

            {isLoading ? (
                <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
                    Loading HRV report…
                </div>
            ) : !hasReadings ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center">
                    <p className="font-medium text-foreground">No HRV entries in this timeframe.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Sleep and morning HRV are recorded from the Morning Check-in page.
                    </p>
                </div>
            ) : (
                <>
                    <div className="mb-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest Sleep HRV</p>
                            <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                                <p className="text-2xl font-bold text-blue">
                                    {latestSleep?.value.toFixed(1) ?? '—'} <span className="text-sm font-medium text-muted-foreground">ms</span>
                                </p>
                                <p className="text-sm font-semibold text-blue">
                                    14-day MA {latestSleepAverage?.average.toFixed(1) ?? '—'} ms
                                </p>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {latestSleep ? formatDate(latestSleep.date) : 'No Sleep HRV reading'}
                                {latestSleepAverage && ` · ${latestSleepAverage.sampleCount} readings in window`}
                            </p>
                        </div>
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest Morning HRV</p>
                            <div className="mt-2 flex flex-wrap items-baseline gap-x-5 gap-y-1">
                                <p className="text-2xl font-bold text-purple">
                                    {latestMorning?.value.toFixed(1) ?? '—'} <span className="text-sm font-medium text-muted-foreground">ms</span>
                                </p>
                                <p className="text-sm font-semibold text-purple">
                                    14-day MA {latestMorningAverage?.average.toFixed(1) ?? '—'} ms
                                </p>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {latestMorning ? formatDate(latestMorning.date) : 'No Morning HRV reading'}
                                {latestMorningAverage && ` · ${latestMorningAverage.sampleCount} readings in window`}
                            </p>
                        </div>
                    </div>

                    <HrvChart
                        sleepReadings={sleepReadings}
                        morningReadings={morningReadings}
                        sleepAverages={sleepAverages}
                        morningAverages={morningAverages}
                    />
                    <p className="mt-3 text-xs text-muted-foreground">
                        Each moving average uses available readings from its own series in the trailing 14-calendar-day window.
                        <span className="ml-1 sm:hidden">Swipe the chart sideways to inspect the full plot.</span>
                    </p>
                </>
            )}
        </div>
    )
}

'use client'

import { useEffect, useMemo, useState } from 'react'
import { WeightChart } from '@/components/reports/WeightChart'
import { getWeightReport } from '@/lib/api/reports'
import { getTodayDate } from '@/lib/api/daily-logs'
import {
    calculateSevenDayMovingAverage,
    getWeightQueryStart,
    getWeightRangeStart,
    WEIGHT_TIMEFRAMES,
    type WeightPoint,
    type WeightTimeframe,
} from '@/lib/reports/weight-chart'

function formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`))
}

export default function WeightReportPage() {
    const [timeframe, setTimeframe] = useState<WeightTimeframe>('1M')
    const [today] = useState(getTodayDate)
    const [points, setPoints] = useState<WeightPoint[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [reloadToken, setReloadToken] = useState(0)

    const rangeStart = useMemo(
        () => getWeightRangeStart(today, timeframe),
        [today, timeframe]
    )
    const queryStart = useMemo(
        () => getWeightQueryStart(rangeStart),
        [rangeStart]
    )
    const displayedPoints = useMemo(
        () => rangeStart === null
            ? points
            : points.filter(point => point.date >= rangeStart),
        [points, rangeStart]
    )
    const averages = useMemo(
        () => calculateSevenDayMovingAverage(points).filter(point => (
            rangeStart === null || point.date >= rangeStart
        )),
        [points, rangeStart]
    )

    useEffect(() => {
        let isCurrent = true

        getWeightReport(queryStart, today)
            .then(data => {
                if (isCurrent) setPoints(data)
            })
            .catch(loadError => {
                console.error('Failed to load weight report:', loadError)
                if (isCurrent) {
                    setPoints([])
                    setError('Unable to load the weight report. Please try again.')
                }
            })
            .finally(() => {
                if (isCurrent) setIsLoading(false)
            })

        return () => {
            isCurrent = false
        }
    }, [queryStart, today, reloadToken])

    const latest = displayedPoints.at(-1)
    const latestAverage = averages.at(-1)
    const rangeChange = displayedPoints.length > 1
        ? displayedPoints[displayedPoints.length - 1].weight - displayedPoints[0].weight
        : null
    const displayedRangeStart = timeframe === 'All'
        ? displayedPoints[0]?.date ?? null
        : rangeStart
    const rangeLabel = displayedRangeStart
        ? `${formatDate(displayedRangeStart)} – ${formatDate(today)}`
        : 'All available history'

    return (
        <div aria-busy={isLoading}>
            <div className="mb-5 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-foreground">Weight</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Daily weigh-ins and your seven-day trend · {rangeLabel}
                    </p>
                </div>

                <div>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Timeframe
                    </span>
                    <div className="inline-flex flex-wrap rounded-lg border border-border bg-background p-1" role="group" aria-label="Weight report timeframe">
                        {WEIGHT_TIMEFRAMES.map(option => (
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
                    Loading weight report…
                </div>
            ) : displayedPoints.length === 0 ? (
                <div className="rounded-xl border border-border bg-card p-8 text-center">
                    <p className="font-medium text-foreground">No weight entries in this timeframe.</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Weight is recorded from the Morning Check-in page.
                    </p>
                </div>
            ) : (
                <>
                    <div className="mb-5 grid gap-3 sm:grid-cols-3">
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Latest weight</p>
                            <p className="mt-2 text-2xl font-bold text-foreground">
                                {latest?.weight.toFixed(1)} <span className="text-sm font-medium text-muted-foreground">lb</span>
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">{latest && formatDate(latest.date)}</p>
                        </div>
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">7-day average</p>
                            <p className="mt-2 text-2xl font-bold text-primary-dim">
                                {latestAverage?.average.toFixed(1)} <span className="text-sm font-medium text-muted-foreground">lb</span>
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                                {latestAverage?.sampleCount} weigh-ins in the latest 7-day window
                            </p>
                        </div>
                        <div className="rounded-xl border border-border bg-card p-4">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Change in range</p>
                            <p className={`mt-2 text-2xl font-bold ${
                                rangeChange !== null && rangeChange < 0 ? 'text-green' : 'text-foreground'
                            }`}>
                                {rangeChange === null ? '—' : `${rangeChange > 0 ? '+' : ''}${rangeChange.toFixed(1)}`}{' '}
                                {rangeChange !== null && <span className="text-sm font-medium text-muted-foreground">lb</span>}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">Across {displayedPoints.length} logged weigh-ins</p>
                        </div>
                    </div>

                    <WeightChart points={displayedPoints} averages={averages} />
                    <p className="mt-3 text-xs text-muted-foreground">
                        The moving average uses available weigh-ins from each trailing seven-calendar-day window.
                        <span className="ml-1 sm:hidden">Swipe the chart sideways to inspect the full plot.</span>
                    </p>
                </>
            )}
        </div>
    )
}

'use client'

import { useState } from 'react'
import type {
    HrvAveragePoint,
    HrvReadingPoint,
} from '@/lib/reports/hrv-chart'

const WIDTH = 1000
const HEIGHT = 400
const MARGIN = { top: 24, right: 28, bottom: 58, left: 68 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom

type HrvSeries = 'sleepReadings' | 'sleepAverage' | 'morningReadings' | 'morningAverage'

function dateTime(date: string): number {
    return new Date(`${date}T00:00:00Z`).getTime()
}

function formatAxisDate(time: number, spanDays: number): string {
    const date = new Date(time)
    return new Intl.DateTimeFormat('en-US', spanDays > 180
        ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
        : { month: 'short', day: 'numeric', timeZone: 'UTC' }
    ).format(date)
}

export function HrvChart({
    sleepReadings,
    morningReadings,
    sleepAverages,
    morningAverages,
}: {
    sleepReadings: HrvReadingPoint[]
    morningReadings: HrvReadingPoint[]
    sleepAverages: HrvAveragePoint[]
    morningAverages: HrvAveragePoint[]
}) {
    const [visibleSeries, setVisibleSeries] = useState<Record<HrvSeries, boolean>>({
        sleepReadings: true,
        sleepAverage: true,
        morningReadings: true,
        morningAverage: true,
    })
    const allDates = [
        ...sleepReadings.map(point => point.date),
        ...morningReadings.map(point => point.date),
    ].sort()

    if (allDates.length === 0) return null

    const firstTime = dateTime(allDates[0])
    const lastTime = dateTime(allDates[allDates.length - 1])
    const timeSpan = Math.max(1, lastTime - firstTime)
    const spanDays = timeSpan / (24 * 60 * 60 * 1000)
    const values = [
        ...sleepReadings.map(point => point.value),
        ...morningReadings.map(point => point.value),
        ...sleepAverages.map(point => point.average),
        ...morningAverages.map(point => point.average),
    ]
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const valueSpan = Math.max(5, rawMax - rawMin)
    const padding = Math.max(2, valueSpan * 0.15)
    const yMin = Math.max(0, Math.floor((rawMin - padding) / 5) * 5)
    const yMax = Math.ceil((rawMax + padding) / 5) * 5
    const ySpan = Math.max(5, yMax - yMin)

    const x = (date: string) => {
        if (firstTime === lastTime) return MARGIN.left + (PLOT_WIDTH / 2)
        return MARGIN.left + (((dateTime(date) - firstTime) / timeSpan) * PLOT_WIDTH)
    }
    const y = (value: number) => MARGIN.top + (((yMax - value) / ySpan) * PLOT_HEIGHT)
    const linePath = (series: Array<{ date: string; value: number }>) => series
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.date).toFixed(2)} ${y(point.value).toFixed(2)}`)
        .join(' ')

    const sleepPath = linePath(sleepReadings)
    const morningPath = linePath(morningReadings)
    const sleepAveragePath = linePath(sleepAverages.map(point => ({
        date: point.date,
        value: point.average,
    })))
    const morningAveragePath = linePath(morningAverages.map(point => ({
        date: point.date,
        value: point.average,
    })))
    const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((ySpan * index) / 4))
    const uniqueDateCount = new Set(allDates).size
    const xTickCount = uniqueDateCount === 1
        ? 1
        : Math.min(6, Math.max(2, uniqueDateCount))
    const xTicks = Array.from({ length: xTickCount }, (_, index) => (
        firstTime === lastTime
            ? firstTime
            : firstTime + ((timeSpan * index) / (xTickCount - 1))
    ))
    const toggleSeries = (series: HrvSeries) => {
        setVisibleSeries(current => ({ ...current, [series]: !current[series] }))
    }
    const allSeriesHidden = Object.values(visibleSeries).every(isVisible => !isVisible)

    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-border px-3 py-2 text-xs" aria-label="HRV chart legend">
                <button
                    type="button"
                    onClick={() => toggleSeries('sleepReadings')}
                    className={`inline-flex items-center gap-2 rounded-md px-2 py-1.5 transition-opacity ${visibleSeries.sleepReadings ? 'text-muted-foreground' : 'text-muted-foreground opacity-40 line-through'}`}
                    aria-pressed={visibleSeries.sleepReadings}
                    aria-label={`${visibleSeries.sleepReadings ? 'Hide' : 'Show'} Sleep HRV readings`}
                >
                    <span className={`h-2.5 w-2.5 rounded-full border border-blue ${visibleSeries.sleepReadings ? 'bg-blue' : 'bg-transparent'}`} aria-hidden="true" />
                    Sleep HRV
                </button>
                <button
                    type="button"
                    onClick={() => toggleSeries('sleepAverage')}
                    className={`inline-flex items-center gap-2 rounded-md px-2 py-1.5 transition-opacity ${visibleSeries.sleepAverage ? 'text-muted-foreground' : 'text-muted-foreground opacity-40 line-through'}`}
                    aria-pressed={visibleSeries.sleepAverage}
                    aria-label={`${visibleSeries.sleepAverage ? 'Hide' : 'Show'} Sleep HRV 14-day moving average`}
                >
                    <span className={`h-1 w-7 rounded-full border border-blue ${visibleSeries.sleepAverage ? 'bg-blue' : 'bg-transparent'}`} aria-hidden="true" />
                    Sleep HRV 14-day MA
                </button>
                <button
                    type="button"
                    onClick={() => toggleSeries('morningReadings')}
                    className={`inline-flex items-center gap-2 rounded-md px-2 py-1.5 transition-opacity ${visibleSeries.morningReadings ? 'text-muted-foreground' : 'text-muted-foreground opacity-40 line-through'}`}
                    aria-pressed={visibleSeries.morningReadings}
                    aria-label={`${visibleSeries.morningReadings ? 'Hide' : 'Show'} Morning HRV readings`}
                >
                    <span className={`h-2.5 w-2.5 rounded-full border border-purple ${visibleSeries.morningReadings ? 'bg-purple' : 'bg-transparent'}`} aria-hidden="true" />
                    Morning HRV
                </button>
                <button
                    type="button"
                    onClick={() => toggleSeries('morningAverage')}
                    className={`inline-flex items-center gap-2 rounded-md px-2 py-1.5 transition-opacity ${visibleSeries.morningAverage ? 'text-muted-foreground' : 'text-muted-foreground opacity-40 line-through'}`}
                    aria-pressed={visibleSeries.morningAverage}
                    aria-label={`${visibleSeries.morningAverage ? 'Hide' : 'Show'} Morning HRV 14-day moving average`}
                >
                    <span className={`h-1 w-7 rounded-full border border-purple ${visibleSeries.morningAverage ? 'bg-purple' : 'bg-transparent'}`} aria-hidden="true" />
                    Morning HRV 14-day MA
                </button>
            </div>

            {allSeriesHidden && (
                <p className="border-b border-border bg-background/30 px-4 py-3 text-center text-xs text-muted-foreground" role="status">
                    All HRV series are hidden. Select a legend item to show it again.
                </p>
            )}

            <div className="overflow-x-auto px-2 py-3">
                <svg
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    className="h-auto min-w-[700px] w-full"
                    role="img"
                    aria-labelledby="hrv-chart-title hrv-chart-description"
                >
                    <title id="hrv-chart-title">Sleep and morning HRV over time</title>
                    <desc id="hrv-chart-description">
                        Sleep and morning RMSSD readings with separate trailing 14-calendar-day moving averages.
                    </desc>

                    {yTicks.map(tick => (
                        <g key={tick}>
                            <line
                                x1={MARGIN.left}
                                x2={WIDTH - MARGIN.right}
                                y1={y(tick)}
                                y2={y(tick)}
                                stroke="var(--border)"
                                strokeWidth="1"
                            />
                            <text
                                x={MARGIN.left - 12}
                                y={y(tick) + 4}
                                fill="var(--muted-foreground)"
                                fontSize="12"
                                textAnchor="end"
                            >
                                {tick.toFixed(0)}
                            </text>
                        </g>
                    ))}

                    {xTicks.map((tick, index) => {
                        const tickX = firstTime === lastTime
                            ? MARGIN.left + (PLOT_WIDTH / 2)
                            : MARGIN.left + (((tick - firstTime) / timeSpan) * PLOT_WIDTH)
                        return (
                            <text
                                key={`${tick}-${index}`}
                                x={tickX}
                                y={HEIGHT - 20}
                                fill="var(--muted-foreground)"
                                fontSize="12"
                                textAnchor={index === 0 ? 'start' : index === xTicks.length - 1 ? 'end' : 'middle'}
                            >
                                {formatAxisDate(tick, spanDays)}
                            </text>
                        )
                    })}

                    <text
                        x="18"
                        y={MARGIN.top + (PLOT_HEIGHT / 2)}
                        fill="var(--muted-foreground)"
                        fontSize="12"
                        textAnchor="middle"
                        transform={`rotate(-90 18 ${MARGIN.top + (PLOT_HEIGHT / 2)})`}
                    >
                        HRV RMSSD (ms)
                    </text>

                    {visibleSeries.sleepReadings && sleepReadings.length > 1 && (
                        <path d={sleepPath} fill="none" stroke="var(--blue)" strokeOpacity="0.35" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    )}
                    {visibleSeries.morningReadings && morningReadings.length > 1 && (
                        <path d={morningPath} fill="none" stroke="var(--purple)" strokeOpacity="0.35" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                    )}

                    {visibleSeries.sleepReadings && sleepReadings.map(point => (
                        <circle key={point.date} cx={x(point.date)} cy={y(point.value)} r="4" fill="var(--blue)" stroke="var(--card)" strokeWidth="2">
                            <title>{point.date}: Sleep HRV {point.value.toFixed(1)} ms</title>
                        </circle>
                    ))}
                    {visibleSeries.morningReadings && morningReadings.map(point => (
                        <circle key={point.date} cx={x(point.date)} cy={y(point.value)} r="4" fill="var(--purple)" stroke="var(--card)" strokeWidth="2">
                            <title>{point.date}: Morning HRV {point.value.toFixed(1)} ms</title>
                        </circle>
                    ))}

                    {visibleSeries.sleepAverage && sleepAverages.length > 1 && (
                        <path d={sleepAveragePath} fill="none" stroke="var(--blue)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
                    )}
                    {visibleSeries.morningAverage && morningAverages.length > 1 && (
                        <path d={morningAveragePath} fill="none" stroke="var(--purple)" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" />
                    )}
                </svg>
            </div>
        </div>
    )
}

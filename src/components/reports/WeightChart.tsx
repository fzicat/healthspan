import type { WeightAveragePoint, WeightPoint } from '@/lib/reports/weight-chart'

const WIDTH = 1000
const HEIGHT = 400
const MARGIN = { top: 24, right: 28, bottom: 58, left: 68 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom

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

export function WeightChart({
    points,
    averages,
}: {
    points: WeightPoint[]
    averages: WeightAveragePoint[]
}) {
    if (points.length === 0) return null

    const firstTime = dateTime(points[0].date)
    const lastTime = dateTime(points[points.length - 1].date)
    const timeSpan = Math.max(1, lastTime - firstTime)
    const spanDays = timeSpan / (24 * 60 * 60 * 1000)
    const values = [...points.map(point => point.weight), ...averages.map(point => point.average)]
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const valueSpan = Math.max(2, rawMax - rawMin)
    const padding = Math.max(1, valueSpan * 0.15)
    const yMin = Math.floor((rawMin - padding) * 2) / 2
    const yMax = Math.ceil((rawMax + padding) * 2) / 2
    const ySpan = yMax - yMin

    const x = (date: string) => {
        if (firstTime === lastTime) return MARGIN.left + (PLOT_WIDTH / 2)
        return MARGIN.left + (((dateTime(date) - firstTime) / timeSpan) * PLOT_WIDTH)
    }
    const y = (value: number) => MARGIN.top + (((yMax - value) / ySpan) * PLOT_HEIGHT)
    const linePath = (series: Array<{ date: string; value: number }>) => series
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.date).toFixed(2)} ${y(point.value).toFixed(2)}`)
        .join(' ')

    const actualPath = linePath(points.map(point => ({ date: point.date, value: point.weight })))
    const averagePath = linePath(averages.map(point => ({ date: point.date, value: point.average })))
    const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((ySpan * index) / 4))
    const xTickCount = points.length === 1
        ? 1
        : Math.min(6, Math.max(2, points.length))
    const xTicks = Array.from({ length: xTickCount }, (_, index) => (
        firstTime === lastTime
            ? firstTime
            : firstTime + ((timeSpan * index) / (xTickCount - 1))
    ))

    return (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex flex-wrap items-center gap-5 border-b border-border px-4 py-3 text-xs text-muted-foreground" aria-label="Weight chart legend">
                <span className="inline-flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-blue" aria-hidden="true" />
                    Daily weight
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="h-1 w-7 rounded-full bg-primary-dim" aria-hidden="true" />
                    7-day moving average
                </span>
            </div>

            <div className="overflow-x-auto px-2 py-3">
                <svg
                    viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                    className="h-auto min-w-[700px] w-full"
                    role="img"
                    aria-labelledby="weight-chart-title weight-chart-description"
                >
                    <title id="weight-chart-title">Body weight over time</title>
                    <desc id="weight-chart-description">
                        Daily body weight in pounds with a seven-calendar-day moving average.
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
                                {tick.toFixed(1)}
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
                        Weight (lb)
                    </text>

                    {points.length > 1 && (
                        <path
                            d={actualPath}
                            fill="none"
                            stroke="var(--blue)"
                            strokeOpacity="0.38"
                            strokeWidth="2"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                    )}

                    {points.map(point => (
                        <circle
                            key={point.date}
                            cx={x(point.date)}
                            cy={y(point.weight)}
                            r="4"
                            fill="var(--blue)"
                            stroke="var(--card)"
                            strokeWidth="2"
                        >
                            <title>{point.date}: {point.weight.toFixed(1)} lb</title>
                        </circle>
                    ))}

                    {averages.length > 1 && (
                        <path
                            d={averagePath}
                            fill="none"
                            stroke="var(--primary-dim)"
                            strokeWidth="4"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                    )}
                </svg>
            </div>
        </div>
    )
}

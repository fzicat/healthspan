import type { BloodworkMetric } from '@/lib/reports/bloodwork-data'

const WIDTH = 1000
const HEIGHT = 390
const MARGIN = { top: 28, right: 32, bottom: 64, left: 76 }
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom

function dateTime(date: string): number {
    return new Date(`${date}T00:00:00Z`).getTime()
}

function formatDate(date: string): string {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`))
}

function accentVariable(accent: BloodworkMetric['accent']): string {
    return `var(--${accent})`
}

export function BloodworkTrendChart({
    metric,
    points,
}: {
    metric: BloodworkMetric
    points: Array<{ date: string; value: number }>
}) {
    if (points.length === 0) return null

    const firstTime = dateTime(points[0].date)
    const lastTime = dateTime(points.at(-1)?.date ?? points[0].date)
    const timeSpan = Math.max(1, lastTime - firstTime)
    const values = points.map(point => point.value)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const rawSpan = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.08, 0.1)
    const padding = rawSpan * 0.2
    const yMin = Math.max(0, rawMin - padding)
    const yMax = rawMax + padding
    const ySpan = Math.max(0.1, yMax - yMin)
    const accent = accentVariable(metric.accent)

    const x = (date: string) => {
        if (firstTime === lastTime) return MARGIN.left + (PLOT_WIDTH / 2)
        return MARGIN.left + (((dateTime(date) - firstTime) / timeSpan) * PLOT_WIDTH)
    }
    const y = (value: number) => MARGIN.top + (((yMax - value) / ySpan) * PLOT_HEIGHT)
    const linePath = points
        .map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.date).toFixed(2)} ${y(point.value).toFixed(2)}`)
        .join(' ')
    const areaPath = `${linePath} L ${x(points.at(-1)?.date ?? points[0].date).toFixed(2)} ${(HEIGHT - MARGIN.bottom).toFixed(2)} L ${x(points[0].date).toFixed(2)} ${(HEIGHT - MARGIN.bottom).toFixed(2)} Z`
    const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((ySpan * index) / 4))
    const xTickIndexes = Array.from(new Set([
        0,
        Math.round((points.length - 1) * 0.25),
        Math.round((points.length - 1) * 0.5),
        Math.round((points.length - 1) * 0.75),
        points.length - 1,
    ]))
    const gradientId = `bloodwork-gradient-${metric.key}`

    return (
        <div className="overflow-x-auto">
            <svg
                viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                className="h-auto min-w-[680px] w-full"
                role="img"
                aria-labelledby="bloodwork-chart-title bloodwork-chart-description"
            >
                <title id="bloodwork-chart-title">{metric.label} over time</title>
                <desc id="bloodwork-chart-description">
                    {points.length} recorded {metric.label} results from {formatDate(points[0].date)} through {formatDate(points.at(-1)?.date ?? points[0].date)}.
                </desc>
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={accent} stopOpacity="0.28" />
                        <stop offset="100%" stopColor={accent} stopOpacity="0.01" />
                    </linearGradient>
                </defs>

                {yTicks.map(tick => (
                    <g key={tick}>
                        <line
                            x1={MARGIN.left}
                            x2={WIDTH - MARGIN.right}
                            y1={y(tick)}
                            y2={y(tick)}
                            stroke="var(--border)"
                            strokeWidth="1"
                            strokeDasharray="4 7"
                        />
                        <text
                            x={MARGIN.left - 14}
                            y={y(tick) + 4}
                            fill="var(--muted-foreground)"
                            fontSize="12"
                            textAnchor="end"
                        >
                            {tick.toFixed(metric.decimals)}
                        </text>
                    </g>
                ))}

                {xTickIndexes.map((pointIndex, index) => {
                    const point = points[pointIndex]
                    return (
                        <text
                            key={`${point.date}-${index}`}
                            x={x(point.date)}
                            y={HEIGHT - 24}
                            fill="var(--muted-foreground)"
                            fontSize="12"
                            textAnchor={index === 0 ? 'start' : index === xTickIndexes.length - 1 ? 'end' : 'middle'}
                        >
                            {formatDate(point.date)}
                        </text>
                    )
                })}

                <text
                    x="20"
                    y={MARGIN.top + (PLOT_HEIGHT / 2)}
                    fill="var(--muted-foreground)"
                    fontSize="12"
                    textAnchor="middle"
                    transform={`rotate(-90 20 ${MARGIN.top + (PLOT_HEIGHT / 2)})`}
                >
                    {metric.unit}
                </text>

                {points.length > 1 && (
                    <>
                        <path d={areaPath} fill={`url(#${gradientId})`} />
                        <path
                            d={linePath}
                            fill="none"
                            stroke={accent}
                            strokeWidth="4"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                    </>
                )}

                {points.map((point, index) => (
                    <g key={point.date}>
                        <circle
                            cx={x(point.date)}
                            cy={y(point.value)}
                            r={index === points.length - 1 ? 7 : 5}
                            fill={index === points.length - 1 ? accent : 'var(--card)'}
                            stroke={accent}
                            strokeWidth="3"
                        >
                            <title>{point.date}: {point.value.toFixed(metric.decimals)} {metric.unit}</title>
                        </circle>
                        {index === points.length - 1 && (
                            <text
                                x={x(point.date) - 10}
                                y={Math.max(18, y(point.value) - 15)}
                                fill={accent}
                                fontSize="14"
                                fontWeight="700"
                                textAnchor="end"
                            >
                                {point.value.toFixed(metric.decimals)}
                            </text>
                        )}
                    </g>
                ))}
            </svg>
        </div>
    )
}

export function BloodworkSparkline({
    metric,
    points,
}: {
    metric: BloodworkMetric
    points: Array<{ date: string; value: number }>
}) {
    if (points.length === 0) return null

    const width = 180
    const height = 54
    const values = points.map(point => point.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const span = Math.max(max - min, 0.1)
    const path = points.map((point, index) => {
        const pointX = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width
        const pointY = 7 + (((max - point.value) / span) * (height - 14))
        return `${index === 0 ? 'M' : 'L'} ${pointX.toFixed(1)} ${pointY.toFixed(1)}`
    }).join(' ')
    const accent = accentVariable(metric.accent)

    return (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-12 w-32" aria-hidden="true">
            <path d={path} fill="none" stroke={accent} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.9" />
            <circle
                cx={points.length === 1 ? width / 2 : width}
                cy={7 + (((max - (points.at(-1)?.value ?? min)) / span) * (height - 14))}
                r="5"
                fill={accent}
            />
        </svg>
    )
}

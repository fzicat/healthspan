'use client'

import { useMemo, useState } from 'react'
import {
    BloodworkSparkline,
    BloodworkTrendChart,
} from '@/components/reports/BloodworkTrendChart'
import {
    BLOODWORK_METRICS,
    BLOODWORK_PANELS,
    formatBloodworkValue,
    getMetricPoints,
    type BloodworkCategory,
    type BloodworkMetric,
    type BloodworkMetricKey,
} from '@/lib/reports/bloodwork-data'

type CategoryFilter = 'All' | BloodworkCategory
type TimeRange = 'All' | '3Y' | '2Y' | '1Y'

const CATEGORY_FILTERS: CategoryFilter[] = ['All', 'Cardiovascular', 'Metabolic', 'Kidney']
const TIME_RANGES: TimeRange[] = ['All', '3Y', '2Y', '1Y']
const LATEST_PANEL_DATE = BLOODWORK_PANELS.at(-1)?.date ?? '2026-07-29'

const FEATURED_METRICS: Array<{
    key: BloodworkMetricKey
    change: string
    changeTone: 'positive' | 'neutral' | 'attention'
    note: string
}> = [
    {
        key: 'apob',
        change: '66% lower than Nov 2022',
        changeTone: 'positive',
        note: 'Atherogenic particle burden',
    },
    {
        key: 'ldl',
        change: '75% lower than Nov 2022',
        changeTone: 'positive',
        note: 'Calculated LDL cholesterol',
    },
    {
        key: 'hba1c',
        change: 'Stable near 5.3%',
        changeTone: 'neutral',
        note: 'Long-term glycemic marker',
    },
    {
        key: 'egfr',
        change: 'Below latest lab range',
        changeTone: 'attention',
        note: 'Creatine was not paused',
    },
]

const ACCENT_TEXT: Record<BloodworkMetric['accent'], string> = {
    orange: 'text-orange',
    red: 'text-red',
    yellow: 'text-yellow',
    aqua: 'text-aqua',
    green: 'text-green',
    purple: 'text-purple',
    blue: 'text-blue',
}

const ACCENT_BACKGROUND: Record<BloodworkMetric['accent'], string> = {
    orange: 'bg-orange',
    red: 'bg-red',
    yellow: 'bg-yellow',
    aqua: 'bg-aqua',
    green: 'bg-green',
    purple: 'bg-purple',
    blue: 'bg-blue',
}

function formatDate(date: string, includeYear = true): string {
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        ...(includeYear ? { year: 'numeric' } : {}),
        timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`))
}

function getRangeStart(range: TimeRange): string | null {
    if (range === 'All') return null

    const years = Number.parseInt(range, 10)
    const date = new Date(`${LATEST_PANEL_DATE}T00:00:00Z`)
    date.setUTCFullYear(date.getUTCFullYear() - years)
    return date.toISOString().slice(0, 10)
}

function getMetric(key: BloodworkMetricKey): BloodworkMetric {
    const metric = BLOODWORK_METRICS.find(candidate => candidate.key === key)
    if (!metric) throw new Error(`Unknown bloodwork metric: ${key}`)
    return metric
}

function getLatestValue(metric: BloodworkMetric): number | null {
    return getMetricPoints(metric.key).at(-1)?.value ?? null
}

function toneClass(tone: 'positive' | 'neutral' | 'attention'): string {
    if (tone === 'positive') return 'text-green'
    if (tone === 'attention') return 'text-yellow'
    return 'text-muted-foreground'
}

export default function BloodworkReportPage() {
    const [selectedMetricKey, setSelectedMetricKey] = useState<BloodworkMetricKey>('apob')
    const [timeRange, setTimeRange] = useState<TimeRange>('All')
    const [category, setCategory] = useState<CategoryFilter>('All')

    const selectedMetric = getMetric(selectedMetricKey)
    const rangeStart = getRangeStart(timeRange)
    const selectedPoints = useMemo(
        () => getMetricPoints(selectedMetricKey).filter(point => rangeStart === null || point.date >= rangeStart),
        [rangeStart, selectedMetricKey]
    )
    const firstPoint = selectedPoints[0]
    const latestPoint = selectedPoints.at(-1)
    const absoluteChange = firstPoint && latestPoint ? latestPoint.value - firstPoint.value : null
    const visibleMetrics = category === 'All'
        ? BLOODWORK_METRICS
        : BLOODWORK_METRICS.filter(metric => metric.category === category)
    const newestPanels = [...BLOODWORK_PANELS].reverse()

    return (
        <div className="space-y-5">
            <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 sm:p-7">
                <div className="pointer-events-none absolute -right-14 -top-20 h-64 w-64 rounded-full bg-orange/10 blur-3xl" />
                <div className="pointer-events-none absolute -bottom-24 left-1/3 h-56 w-56 rounded-full bg-aqua/10 blur-3xl" />
                <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
                    <div className="max-w-3xl">
                        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-orange/30 bg-orange/10 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-orange">
                            <span className="h-2 w-2 rounded-full bg-orange" aria-hidden="true" />
                            Static vault snapshot
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                            Bloodwork, at a glance.
                        </h2>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
                            A longitudinal view of cardiovascular, metabolic, and kidney markers built from nine archived panels. No database reads, writes, or live data calls.
                        </p>
                    </div>
                    <dl className="grid grid-cols-3 overflow-hidden rounded-xl border border-border bg-background/50 xl:min-w-[420px]">
                        <div className="border-r border-border p-4">
                            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Panels</dt>
                            <dd className="mt-1 text-2xl font-bold text-foreground">9</dd>
                        </div>
                        <div className="border-r border-border p-4">
                            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">First</dt>
                            <dd className="mt-1 text-sm font-bold text-foreground sm:text-base">Feb 2022</dd>
                        </div>
                        <div className="p-4">
                            <dt className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Latest</dt>
                            <dd className="mt-1 text-sm font-bold text-orange sm:text-base">Jul 2026</dd>
                        </div>
                    </dl>
                </div>
            </section>

            <section aria-labelledby="latest-panel-heading">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Latest panel</p>
                        <h3 id="latest-panel-heading" className="mt-1 text-xl font-semibold text-foreground">{formatDate(LATEST_PANEL_DATE)}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground">Quest Diagnostics · fasting · partial report</p>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    {FEATURED_METRICS.map(feature => {
                        const metric = getMetric(feature.key)
                        const points = getMetricPoints(feature.key)
                        const latestValue = getLatestValue(metric)
                        return (
                            <article key={feature.key} className="group overflow-hidden rounded-xl border border-border bg-card p-4 transition-colors hover:border-bg3">
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{metric.shortLabel}</p>
                                        <p className={`mt-2 text-3xl font-bold ${ACCENT_TEXT[metric.accent]}`}>
                                            {latestValue === null ? '—' : formatBloodworkValue(metric, latestValue)}
                                            <span className="ml-1.5 text-xs font-medium text-muted-foreground">{metric.unit}</span>
                                        </p>
                                    </div>
                                    <BloodworkSparkline metric={metric} points={points} />
                                </div>
                                <p className={`mt-3 text-xs font-semibold ${toneClass(feature.changeTone)}`}>{feature.change}</p>
                                <div className="mt-3 border-t border-border pt-3">
                                    <p className="text-xs text-muted-foreground">{feature.note}</p>
                                    <p className="mt-1 text-[11px] text-fg4">Latest lab reference: {metric.latestReference}</p>
                                </div>
                            </article>
                        )
                    })}
                </div>
            </section>

            <aside className="flex gap-3 rounded-xl border border-yellow/30 bg-yellow/10 p-4" aria-label="Kidney marker context">
                <svg className="mt-0.5 shrink-0 text-yellow" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                    <path d="M12 9v4" />
                    <path d="M12 17h.01" />
                    <path d="M10.3 3.7 2.2 18a2 2 0 0 0 1.8 3h16a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z" />
                </svg>
                <div>
                    <p className="text-sm font-semibold text-yellow">Interpret the July kidney markers in context</p>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Creatine supplementation was not paused before the July panel. The 130 µmol/L creatinine and creatinine-derived eGFR of 58 are therefore not perfectly like-for-like with prior panels and still warrant clinician review or repeat testing in context.
                    </p>
                </div>
            </aside>

            <section className="overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="trend-heading">
                <div className="flex flex-col gap-4 border-b border-border p-4 sm:p-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Longitudinal trends</p>
                        <h3 id="trend-heading" className="mt-1 text-xl font-semibold text-foreground">Marker explorer</h3>
                        <p className="mt-1 text-sm text-muted-foreground">Select a marker and timeframe to inspect its recorded history.</p>
                    </div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                        <label className="block">
                            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Marker</span>
                            <select
                                value={selectedMetricKey}
                                onChange={event => setSelectedMetricKey(event.target.value as BloodworkMetricKey)}
                                className="min-w-56 rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-semibold text-foreground outline-none focus:border-primary"
                            >
                                {BLOODWORK_METRICS.map(metric => (
                                    <option key={metric.key} value={metric.key}>{metric.label}</option>
                                ))}
                            </select>
                        </label>
                        <div>
                            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Timeframe</span>
                            <div className="inline-flex rounded-lg border border-border bg-background p-1" role="group" aria-label="Bloodwork chart timeframe">
                                {TIME_RANGES.map(range => (
                                    <button
                                        key={range}
                                        type="button"
                                        onClick={() => setTimeRange(range)}
                                        className={`min-w-11 rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${timeRange === range ? 'bg-primary text-background' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                                        aria-pressed={timeRange === range}
                                    >
                                        {range}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid border-b border-border sm:grid-cols-3">
                    <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Latest in range</p>
                        <p className={`mt-1 text-2xl font-bold ${ACCENT_TEXT[selectedMetric.accent]}`}>
                            {latestPoint ? formatBloodworkValue(selectedMetric, latestPoint.value) : '—'}
                            <span className="ml-1.5 text-xs font-medium text-muted-foreground">{selectedMetric.unit}</span>
                        </p>
                    </div>
                    <div className="border-b border-border p-4 sm:border-b-0 sm:border-r">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Change from first shown</p>
                        <p className="mt-1 text-2xl font-bold text-foreground">
                            {absoluteChange === null ? '—' : `${absoluteChange > 0 ? '+' : ''}${absoluteChange.toFixed(selectedMetric.decimals)}`}
                            <span className="ml-1.5 text-xs font-medium text-muted-foreground">{selectedMetric.unit}</span>
                        </p>
                    </div>
                    <div className="p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Recorded results</p>
                        <p className="mt-1 text-2xl font-bold text-foreground">{selectedPoints.length}</p>
                    </div>
                </div>

                {selectedPoints.length === 0 ? (
                    <p className="p-10 text-center text-sm text-muted-foreground">No results for this marker in the selected timeframe.</p>
                ) : (
                    <div className="p-3 sm:p-5">
                        <BloodworkTrendChart metric={selectedMetric} points={selectedPoints} />
                    </div>
                )}
            </section>

            <section className="overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="matrix-heading">
                <div className="flex flex-col gap-4 border-b border-border p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Panel history</p>
                        <h3 id="matrix-heading" className="mt-1 text-xl font-semibold text-foreground">Result matrix</h3>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter bloodwork metrics by category">
                        {CATEGORY_FILTERS.map(filter => (
                            <button
                                key={filter}
                                type="button"
                                onClick={() => setCategory(filter)}
                                className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${category === filter ? 'border-primary bg-primary text-background' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                                aria-pressed={category === filter}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                        <thead>
                            <tr className="border-b border-border bg-background/40">
                                <th className="sticky left-0 z-10 min-w-48 bg-card px-4 py-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Marker</th>
                                {newestPanels.map(panel => (
                                    <th key={panel.date} className="min-w-28 px-3 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        {formatDate(panel.date, false)}<span className="block text-[10px] text-fg4">{panel.date.slice(0, 4)}</span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {visibleMetrics.map(metric => (
                                <tr key={metric.key} className="border-b border-border/70 last:border-b-0 hover:bg-background/30">
                                    <th className="sticky left-0 z-10 bg-card px-4 py-3 font-medium text-foreground">
                                        <span className="flex items-center gap-2">
                                            <span className={`h-2 w-2 rounded-full ${ACCENT_BACKGROUND[metric.accent]}`} aria-hidden="true" />
                                            {metric.shortLabel}
                                        </span>
                                        <span className="mt-0.5 block pl-4 text-[10px] font-normal text-muted-foreground">{metric.unit}</span>
                                    </th>
                                    {newestPanels.map(panel => {
                                        const value = panel[metric.key]
                                        return (
                                            <td key={panel.date} className={`px-3 py-3 text-right tabular-nums ${typeof value === 'number' && panel.date === LATEST_PANEL_DATE ? `font-bold ${ACCENT_TEXT[metric.accent]}` : 'text-foreground'}`}>
                                                {typeof value === 'number' ? formatBloodworkValue(metric, value) : <span className="text-fg4">—</span>}
                                            </td>
                                        )
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p className="border-t border-border bg-background/30 px-4 py-3 text-xs text-muted-foreground">
                    Values are normalized to the SI units used in the vault summary. A dash means that marker was not recorded in that panel.
                </p>
            </section>

            <section aria-labelledby="notes-heading">
                <div className="mb-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Reading the history</p>
                    <h3 id="notes-heading" className="mt-1 text-xl font-semibold text-foreground">Notes from the vault</h3>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                    <details className="group rounded-xl border border-border bg-card p-4" open>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-foreground">
                            Cardiovascular markers
                            <span className="text-primary transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                        </summary>
                        <p className="mt-3 border-t border-border pt-3 text-sm leading-6 text-muted-foreground">
                            The July 2026 panel shows the lowest recorded ApoB (0.50 g/L), LDL-C (1.22 mmol/L), and total cholesterol (3.00 mmol/L) in this archive. Lp(a) was 107 nmol/L, above the latest lab reference of &lt;75 and within Quest&apos;s 75–125 moderate-risk band.
                        </p>
                    </details>
                    <details className="group rounded-xl border border-border bg-card p-4">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-foreground">
                            Glucose and inflammation
                            <span className="text-primary transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                        </summary>
                        <p className="mt-3 border-t border-border pt-3 text-sm leading-6 text-muted-foreground">
                            HbA1c has remained between 4.9% and 5.4% in recorded panels. July fasting glucose was 4.89 mmol/L and fasting insulin was 2.2 uIU/mL. hs-CRP was 1.3 mg/L, slightly above Quest&apos;s optimal threshold of 1.0 mg/L.
                        </p>
                    </details>
                    <details className="group rounded-xl border border-border bg-card p-4">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-foreground">
                            Kidney-marker context
                            <span className="text-primary transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                        </summary>
                        <p className="mt-3 border-t border-border pt-3 text-sm leading-6 text-muted-foreground">
                            July creatinine rose from 115 to approximately 130 µmol/L while eGFR moved from 64 to 58. Because creatine was continued before the July draw, this comparison is not perfectly like-for-like. The vault note recommends documenting fasting, supplements, and the last creatine dose before future panels.
                        </p>
                    </details>
                    <details className="group rounded-xl border border-border bg-card p-4">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-foreground">
                            Latest panel completeness
                            <span className="text-primary transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                        </summary>
                        <p className="mt-3 border-t border-border pt-3 text-sm leading-6 text-muted-foreground">
                            The July Quest PDF was partial when extracted on August 2, 2026. Total testosterone was still pending. CBC, liver, thyroid, urinalysis, ferritin, folate, and vitamin B12 values in that report were within the stated ranges.
                        </p>
                    </details>
                </div>
            </section>

            <footer className="rounded-xl border border-border bg-background/30 px-4 py-3 text-xs leading-5 text-muted-foreground">
                Static snapshot sourced from the Obsidian bloodworks folder and its Summary note. This report is informational and preserves the recorded lab context; it does not replace medical interpretation.
            </footer>
        </div>
    )
}

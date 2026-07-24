'use client'

import { useEffect, useMemo, useState } from 'react'
import { getWorkoutReport } from '@/lib/api/reports'
import {
    buildCalendarMonths,
    getCalendarRange,
    type CalendarMonth,
    type WorkoutReportDay,
} from '@/lib/reports/workout-calendar'

const RANGE_OPTIONS = [1, 2, 3, 4]
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getLocalToday(): string {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function formatRange(from: string, to: string): string {
    const format = (date: string, includeYear: boolean) => new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: includeYear ? 'numeric' : undefined,
        timeZone: 'UTC',
    }).format(new Date(`${date}T00:00:00Z`))

    const sameYear = from.slice(0, 4) === to.slice(0, 4)
    return `${format(from, !sameYear)} – ${format(to, true)}`
}

function MonthCalendar({
    month,
    daysByDate,
    today,
}: {
    month: CalendarMonth
    daysByDate: Map<string, WorkoutReportDay>
    today: string
}) {
    return (
        <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
                <h3 className="text-base font-semibold text-foreground">{month.label}</h3>
            </div>

            <div className="overflow-x-auto">
                <div className="min-w-[700px]">
                    <div className="grid grid-cols-7 border-b border-border bg-background/40">
                        {WEEKDAYS.map(day => (
                            <div
                                key={day}
                                className="px-2 py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                            >
                                {day}
                            </div>
                        ))}
                    </div>

                    <div className="grid grid-cols-7 gap-px bg-border">
                        {month.days.map((date, index) => {
                            if (date === null) {
                                return <div key={`blank-${index}`} className="min-h-28 bg-background/30" aria-hidden="true" />
                            }

                            const reportDay = daysByDate.get(date)
                            const isToday = date === today
                            const isFuture = date > today
                            const dayNumber = Number(date.slice(-2))

                            return (
                                <article
                                    key={date}
                                    className={`min-h-28 bg-card p-2 ${isFuture ? 'opacity-55' : ''}`}
                                    aria-label={new Intl.DateTimeFormat('en-US', {
                                        weekday: 'long',
                                        month: 'long',
                                        day: 'numeric',
                                        year: 'numeric',
                                        timeZone: 'UTC',
                                    }).format(new Date(`${date}T00:00:00Z`))}
                                >
                                    <div className="mb-2 flex h-6 items-center">
                                        <span
                                            className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                                                isToday ? 'bg-primary text-background' : 'text-muted-foreground'
                                            }`}
                                        >
                                            {dayNumber}
                                        </span>
                                    </div>

                                    <div className="space-y-1">
                                        {reportDay?.entries.map(entry => (
                                            <div
                                                key={entry.id}
                                                className={`rounded-md border-l-2 px-2 py-1.5 text-[11px] font-medium leading-tight ${
                                                    entry.kind === 'strength'
                                                        ? 'border-green bg-green/15 text-green'
                                                        : 'border-blue bg-blue/15 text-blue'
                                                }`}
                                                title={entry.text}
                                            >
                                                {entry.text}
                                            </div>
                                        ))}
                                    </div>
                                </article>
                            )
                        })}
                    </div>
                </div>
            </div>
        </section>
    )
}

export default function WorkoutReportPage() {
    const [monthCount, setMonthCount] = useState(1)
    const [today] = useState(getLocalToday)
    const [reportDays, setReportDays] = useState<WorkoutReportDay[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [reloadToken, setReloadToken] = useState(0)
    const [visibleTypes, setVisibleTypes] = useState({ strength: true, cardio: true })

    const months = useMemo(
        () => buildCalendarMonths(today, monthCount),
        [today, monthCount]
    )
    const range = useMemo(
        () => getCalendarRange(today, monthCount),
        [today, monthCount]
    )
    const daysByDate = useMemo(
        () => new Map(reportDays.map(day => [
            day.date,
            {
                ...day,
                entries: day.entries.filter(entry => visibleTypes[entry.kind]),
            },
        ])),
        [reportDays, visibleTypes]
    )

    useEffect(() => {
        let isCurrent = true

        getWorkoutReport(range.from, range.to)
            .then(days => {
                if (isCurrent) setReportDays(days)
            })
            .catch(loadError => {
                console.error('Failed to load workout report:', loadError)
                if (isCurrent) {
                    setReportDays([])
                    setError('Unable to load the workout report. Please try again.')
                }
            })
            .finally(() => {
                if (isCurrent) setIsLoading(false)
            })

        return () => {
            isCurrent = false
        }
    }, [range.from, range.to, reloadToken])

    const strengthSessions = reportDays.reduce(
        (total, day) => total + day.entries.filter(entry => entry.kind === 'strength').length,
        0
    )
    const cardioSessions = reportDays.reduce(
        (total, day) => total + day.entries.filter(entry => entry.kind === 'cardio').length,
        0
    )
    const visibleSessionCount =
        (visibleTypes.strength ? strengthSessions : 0)
        + (visibleTypes.cardio ? cardioSessions : 0)
    const visibleSessionSummary = [
        visibleTypes.strength
            ? `${strengthSessions} strength ${strengthSessions === 1 ? 'session' : 'sessions'}`
            : null,
        visibleTypes.cardio
            ? `${cardioSessions} cardio ${cardioSessions === 1 ? 'session' : 'sessions'}`
            : null,
    ].filter((summary): summary is string => summary !== null).join(' · ')

    return (
        <div aria-busy={isLoading}>
            <div className="mb-5 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <h2 className="text-xl font-semibold text-foreground">Workout calendar</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                        Logged strength and cardio sessions · {formatRange(range.from, range.to)}
                    </p>
                    {!isLoading && !error && (
                        <p className="mt-2 text-xs text-muted-foreground">
                            {visibleSessionSummary || 'No workout types selected'}
                        </p>
                    )}
                </div>

                <div>
                    <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Months displayed
                    </span>
                    <div className="inline-flex rounded-lg border border-border bg-background p-1" role="group" aria-label="Months displayed">
                        {RANGE_OPTIONS.map(option => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => {
                                    if (option === monthCount) return
                                    setIsLoading(true)
                                    setError(null)
                                    setMonthCount(option)
                                }}
                                className={`min-w-12 rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                                    monthCount === option
                                        ? 'bg-primary text-background shadow-sm'
                                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                                }`}
                                aria-pressed={monthCount === option}
                            >
                                {option}M
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mb-5 flex flex-wrap items-center gap-2 text-xs" role="group" aria-label="Calendar data filters">
                <button
                    type="button"
                    onClick={() => setVisibleTypes(types => ({ ...types, strength: !types.strength }))}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-medium transition-colors ${
                        visibleTypes.strength
                            ? 'border-green/50 bg-green/10 text-green'
                            : 'border-border bg-background text-muted-foreground opacity-65'
                    }`}
                    aria-pressed={visibleTypes.strength}
                    aria-label={`${visibleTypes.strength ? 'Hide' : 'Show'} strength sessions`}
                >
                    <span
                        className={`h-3 w-3 rounded-sm border border-green ${visibleTypes.strength ? 'bg-green' : 'bg-transparent'}`}
                        aria-hidden="true"
                    />
                    Strength
                </button>
                <button
                    type="button"
                    onClick={() => setVisibleTypes(types => ({ ...types, cardio: !types.cardio }))}
                    className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-medium transition-colors ${
                        visibleTypes.cardio
                            ? 'border-blue/50 bg-blue/10 text-blue'
                            : 'border-border bg-background text-muted-foreground opacity-65'
                    }`}
                    aria-pressed={visibleTypes.cardio}
                    aria-label={`${visibleTypes.cardio ? 'Hide' : 'Show'} cardio sessions`}
                >
                    <span
                        className={`h-3 w-3 rounded-sm border border-blue ${visibleTypes.cardio ? 'bg-blue' : 'bg-transparent'}`}
                        aria-hidden="true"
                    />
                    Cardio
                </button>
                <span className="ml-2 text-muted-foreground sm:hidden">Swipe a calendar sideways to see the full week.</span>
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
                    Loading workout report…
                </div>
            ) : (
                <>
                    {reportDays.length === 0 && !error && (
                        <div className="mb-5 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                            No logged strength or cardio sessions in this range.
                        </div>
                    )}
                    {reportDays.length > 0 && visibleSessionCount === 0 && !error && (
                        <div className="mb-5 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
                            {visibleTypes.strength || visibleTypes.cardio
                                ? 'No selected workout types were logged in this range.'
                                : 'Strength and cardio are hidden. Select a legend item to show it again.'}
                        </div>
                    )}
                    <div className="grid grid-cols-1 gap-6 2xl:grid-cols-2">
                        {months.map(month => (
                            <MonthCalendar
                                key={month.key}
                                month={month}
                                daysByDate={daysByDate}
                                today={today}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    )
}

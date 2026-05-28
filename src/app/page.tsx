'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { getDailyLog, getTodayDate } from '@/lib/api/daily-logs'
import { getCardioSessionsForDate } from '@/lib/api/cardio'
import { getWorkoutForDate } from '@/lib/api/workouts'
import { useToast } from '@/contexts/ToastContext'
import {
    DailyLog,
    CardioSessionWithExercise,
    WorkoutExerciseWithExercise,
} from '@/types/database'

function getYesterdayDate(): string {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function formatSleep(minutes: number | null): string | null {
    if (minutes === null) return null
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    if (h === 0) return `${m}m`
    if (m === 0) return `${h}h`
    return `${h}h${m}m`
}

export default function WelcomePage() {
    const [morning, setMorning] = useState<DailyLog | null>(null)
    const [evening, setEvening] = useState<DailyLog | null>(null)
    const [cardio, setCardio] = useState<CardioSessionWithExercise[]>([])
    const [lifting, setLifting] = useState<WorkoutExerciseWithExercise[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const { showToast } = useToast()

    const load = useCallback(async () => {
        setIsLoading(true)
        const today = getTodayDate()
        const yesterday = getYesterdayDate()
        try {
            const [morningLog, eveningLog, cardioSessions, workout] = await Promise.all([
                getDailyLog(today),
                getDailyLog(yesterday),
                getCardioSessionsForDate(today),
                getWorkoutForDate(today),
            ])
            setMorning(morningLog)
            setEvening(eveningLog)
            setCardio(cardioSessions)
            setLifting(workout.exercises)
        } catch {
            showToast('Failed to load summary', 'error')
        } finally {
            setIsLoading(false)
        }
    }, [showToast])

    useEffect(() => {
        load()
    }, [load])

    if (isLoading) {
        return (
            <div className="max-w-md mx-auto py-6">
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                </div>
            </div>
        )
    }

    return (
        <div className="max-w-md mx-auto py-6">
            <div className="grid grid-cols-2 gap-3 auto-rows-fr">
                <Card href="/morning" title="Morning" subtitle="Today" color="var(--yellow)">
                    <MorningSummary log={morning} />
                </Card>

                <Card href="/evening" title="Evening" subtitle="Yesterday" color="var(--purple)">
                    <EveningSummary log={evening} />
                </Card>

                <Card href="/cardio" title="Cardio" subtitle="Today" color="var(--red)">
                    <CardioSummary sessions={cardio} />
                </Card>

                <Card href="/strength" title="Strength" subtitle="Today" color="var(--aqua)">
                    <LiftingSummary exercises={lifting} />
                </Card>
            </div>
        </div>
    )
}

function Card({
    href,
    title,
    subtitle,
    color,
    children,
}: {
    href: string
    title: string
    subtitle: string
    color: string
    children: React.ReactNode
}) {
    return (
        <Link
            href={href}
            className="flex flex-col bg-card rounded-xl p-3 border hover:bg-muted transition-colors h-full"
            style={{ borderColor: color }}
        >
            <div className="flex items-baseline justify-between gap-2 mb-2 pb-1.5 border-b" style={{ borderColor: color }}>
                <h2 className="font-semibold text-base leading-tight" style={{ color }}>{title}</h2>
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{subtitle}</span>
            </div>
            <div className="flex-1">{children}</div>
        </Link>
    )
}

function Empty({ text }: { text: string }) {
    return <p className="text-xs text-muted-foreground italic">{text}</p>
}

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="text-muted-foreground truncate">{label}</span>
            <span className="font-medium tabular-nums shrink-0">{value}</span>
        </div>
    )
}

function MorningSummary({ log }: { log: DailyLog | null }) {
    if (!log) return <Empty text="Not logged yet" />
    const items: { label: string; value: string }[] = []
    if (log.weight_lbs !== null) items.push({ label: 'Weight', value: `${log.weight_lbs} lbs` })
    const sleep = formatSleep(log.sleep_duration_minutes)
    if (sleep) items.push({ label: 'Sleep', value: sleep })
    if (log.sleep_score !== null) items.push({ label: 'Score', value: `${log.sleep_score}` })
    if (log.sleep_hrv_rmssd !== null) items.push({ label: 'Sleep HRV', value: `${log.sleep_hrv_rmssd}` })
    if (log.morning_hrv_rmssd !== null) items.push({ label: 'AM HRV', value: `${log.morning_hrv_rmssd}` })

    if (items.length === 0) return <Empty text="Not logged yet" />

    return (
        <div className="space-y-0.5">
            {items.map(item => (
                <Row key={item.label} label={item.label} value={item.value} />
            ))}
        </div>
    )
}

function EveningSummary({ log }: { log: DailyLog | null }) {
    if (!log) return <Empty text="Not logged" />
    const items: { label: string; value: string }[] = []
    if (log.calories !== null) items.push({ label: 'Calories', value: `${log.calories}` })
    if (log.protein_g !== null) items.push({ label: 'Protein', value: `${log.protein_g}g` })
    if (log.carbs_g !== null) items.push({ label: 'Carbs', value: `${log.carbs_g}g` })
    if (log.fat_g !== null) items.push({ label: 'Fat', value: `${log.fat_g}g` })
    if (log.alcohol_g !== null) items.push({ label: 'Alcohol', value: `${log.alcohol_g}g` })
    if (log.steps !== null) items.push({ label: 'Steps', value: `${log.steps}` })

    if (items.length === 0) return <Empty text="Not logged" />

    return (
        <div className="space-y-0.5">
            {items.map(item => (
                <Row key={item.label} label={item.label} value={item.value} />
            ))}
        </div>
    )
}

function CardioSummary({ sessions }: { sessions: CardioSessionWithExercise[] }) {
    if (sessions.length === 0) return <Empty text="No sessions" />
    return (
        <ul className="space-y-0.5">
            {sessions.map(session => (
                <li key={session.id} className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="font-medium truncate">{session.exercises?.name ?? 'Cardio'}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0">{session.duration_minutes}m</span>
                </li>
            ))}
        </ul>
    )
}

function LiftingSummary({ exercises }: { exercises: WorkoutExerciseWithExercise[] }) {
    if (exercises.length === 0) return <Empty text="No exercises" />
    return (
        <ul className="space-y-0.5">
            {exercises.map(we => (
                <li key={we.id} className="text-xs font-medium truncate">
                    {we.exercises.name}
                </li>
            ))}
        </ul>
    )
}

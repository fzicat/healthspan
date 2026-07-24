import { createClient } from '@/lib/supabase/client'
import {
    buildWorkoutReportDays,
    type CardioSessionSummaryInput,
    type StrengthSetSummaryInput,
    type WorkoutReportDay,
} from '@/lib/reports/workout-calendar'

const PAGE_SIZE = 1000

type StrengthSetRow = {
    id: number
    logged_at: string
    exercises: {
        name: string
    }
}

type CardioSessionRow = {
    id: number
    date: string
    duration_minutes: number
    exercises: {
        name: string
    }
}

async function getStrengthSetsForRange(from: string, to: string): Promise<StrengthSetSummaryInput[]> {
    const supabase = createClient()
    const rows: StrengthSetRow[] = []

    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase
            .from('sets')
            .select('id, logged_at, exercises!inner ( name )')
            .eq('is_deleted', false)
            .eq('exercises.is_deleted', false)
            .eq('exercises.category', 'strength')
            .gte('logged_at', `${from}T00:00:00.000Z`)
            .lte('logged_at', `${to}T23:59:59.999Z`)
            .order('logged_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1)

        if (error) throw error

        const page = (data ?? []) as unknown as StrengthSetRow[]
        rows.push(...page)
        if (page.length < PAGE_SIZE) break
    }

    return rows.map(row => ({
        id: row.id,
        loggedAt: row.logged_at,
        exerciseName: row.exercises.name,
    }))
}

async function getCardioSessionsForRange(from: string, to: string): Promise<CardioSessionSummaryInput[]> {
    const supabase = createClient()
    const rows: CardioSessionRow[] = []

    for (let offset = 0; ; offset += PAGE_SIZE) {
        const { data, error } = await supabase
            .from('cardio_sessions')
            .select('id, date, duration_minutes, exercises!inner ( name )')
            .eq('is_deleted', false)
            .eq('exercises.is_deleted', false)
            .eq('exercises.category', 'cardio')
            .gte('date', from)
            .lte('date', to)
            .order('date', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + PAGE_SIZE - 1)

        if (error) throw error

        const page = (data ?? []) as unknown as CardioSessionRow[]
        rows.push(...page)
        if (page.length < PAGE_SIZE) break
    }

    return rows.map(row => ({
        id: row.id,
        date: row.date,
        durationMinutes: row.duration_minutes,
        exerciseName: row.exercises.name,
    }))
}

export async function getWorkoutReport(from: string, to: string): Promise<WorkoutReportDay[]> {
    const [strengthSets, cardioSessions] = await Promise.all([
        getStrengthSetsForRange(from, to),
        getCardioSessionsForRange(from, to),
    ])

    return buildWorkoutReportDays(strengthSets, cardioSessions)
}

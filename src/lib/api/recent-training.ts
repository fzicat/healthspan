import { createClient } from '@/lib/supabase/client'
import { addCalendarDays, athleteDate, DEFAULT_ATHLETE_TIMEZONE, localDayBounds } from '@/lib/training-planning/dates'

export interface RecentSet {
    id: number
    logged_at: string
    exercises: { name: string } | null
}
export interface RecentCardio {
    id: number
    date: string
    duration_minutes: number
    exercises: { name: string } | null
}
export interface RecentTraining {
    from: string
    through: string
    sets: RecentSet[]
    cardio: RecentCardio[]
    incomplete: boolean
    unavailable: boolean
}

// Ordinary logger tables remain readable without the optional planning RPCs.
// Each stream is bounded, with exact counts to detect server or client truncation.
export async function getRecentTraining(now = new Date()): Promise<RecentTraining> {
    const through = athleteDate(now)
    const from = addCalendarDays(through, -13)
    const supabase = createClient()
    const [sets, cardio] = await Promise.allSettled([
        supabase.from('sets').select('id, logged_at, exercises(name)', { count: 'exact' })
            .eq('is_deleted', false).gte('logged_at', localDayBounds(from, DEFAULT_ATHLETE_TIMEZONE).start)
            .lte('logged_at', now.toISOString()).order('logged_at', { ascending: false }).order('id', { ascending: false }).limit(200),
        supabase.from('cardio_sessions').select('id, date, duration_minutes, exercises(name)', { count: 'exact' })
            .eq('is_deleted', false).gte('date', from).lte('date', through).lte('logged_at', now.toISOString())
            .order('date', { ascending: false }).order('id', { ascending: false }).limit(100),
    ])
    const setResult = sets.status === 'fulfilled' && !sets.value.error ? sets.value : null
    const cardioResult = cardio.status === 'fulfilled' && !cardio.value.error ? cardio.value : null
    return {
        from, through,
        sets: (setResult?.data ?? []) as unknown as RecentSet[],
        cardio: (cardioResult?.data ?? []) as unknown as RecentCardio[],
        incomplete: !setResult || !cardioResult || setResult.count === null || cardioResult.count === null
            || setResult.count > (setResult.data?.length ?? 0) || cardioResult.count > (cardioResult.data?.length ?? 0),
        unavailable: !setResult || !cardioResult,
    }
}

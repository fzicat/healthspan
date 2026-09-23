import { athleteDate, DEFAULT_ATHLETE_TIMEZONE } from '@/lib/training-planning/dates'
import { createClient } from '@/lib/supabase/client'
import { DailyLog, DailyLogInsert } from '@/types/database'

export async function getDailyLog(date: string): Promise<DailyLog | null> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('date', date)
        .maybeSingle()

    if (error) throw error
    return data
}

export async function upsertDailyLog(
    date: string,
    fields: Omit<DailyLogInsert, 'date' | 'created_at' | 'updated_at'>
): Promise<DailyLog> {
    const supabase = createClient()
    const payload: DailyLogInsert = { date, ...fields }

    const { data, error } = await supabase
        .from('daily_logs')
        .upsert(payload, { onConflict: 'date' })
        .select()
        .single()

    if (error) throw error
    return data
}

export function getTodayDate(timezone = DEFAULT_ATHLETE_TIMEZONE): string {
    return athleteDate(new Date(), timezone)
}

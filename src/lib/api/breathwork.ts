import { createClient } from '@/lib/supabase/client'
import {
    BreathworkSession,
    BreathworkSessionInsert,
    BreathworkSessionUpdate,
} from '@/types/database'

export async function getBreathworkSessionsForDate(date: string): Promise<BreathworkSession[]> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('breathwork_sessions')
        .select('*')
        .eq('date', date)
        .eq('is_deleted', false)
        .order('time', { ascending: true, nullsFirst: false })
        .order('logged_at', { ascending: true })

    if (error) throw error
    return data ?? []
}

export async function createBreathworkSession(input: BreathworkSessionInsert): Promise<BreathworkSession> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('breathwork_sessions')
        .insert(input)
        .select()
        .single()

    if (error) throw error
    return data
}

export async function updateBreathworkSession(id: number, fields: BreathworkSessionUpdate): Promise<BreathworkSession> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('breathwork_sessions')
        .update(fields)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data
}

export async function deleteBreathworkSession(id: number): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
        .from('breathwork_sessions')
        .update({ is_deleted: true })
        .eq('id', id)

    if (error) throw error
}

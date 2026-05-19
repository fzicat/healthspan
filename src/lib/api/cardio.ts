import { createClient } from '@/lib/supabase/client'
import {
    Exercise,
    CardioSession,
    CardioSessionInsert,
    CardioSessionUpdate,
    CardioSessionWithExercise,
} from '@/types/database'

export async function getCardioTypes(): Promise<Exercise[]> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('exercises')
        .select('*')
        .eq('category', 'cardio')
        .eq('is_deleted', false)
        .order('name', { ascending: true })

    if (error) throw error
    return data ?? []
}

export async function getCardioSessionsForDate(date: string): Promise<CardioSessionWithExercise[]> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('cardio_sessions')
        .select('*, exercises ( id, name, category )')
        .eq('date', date)
        .eq('is_deleted', false)
        .order('logged_at', { ascending: true })

    if (error) throw error
    return (data ?? []) as unknown as CardioSessionWithExercise[]
}

export async function createCardioSession(input: CardioSessionInsert): Promise<CardioSession> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('cardio_sessions')
        .insert(input)
        .select()
        .single()

    if (error) throw error
    return data
}

export async function updateCardioSession(id: number, fields: CardioSessionUpdate): Promise<CardioSession> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('cardio_sessions')
        .update(fields)
        .eq('id', id)
        .select()
        .single()

    if (error) throw error
    return data
}

export async function deleteCardioSession(id: number): Promise<void> {
    const supabase = createClient()
    const { error } = await supabase
        .from('cardio_sessions')
        .update({ is_deleted: true })
        .eq('id', id)

    if (error) throw error
}

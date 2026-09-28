import { createClient } from '@/lib/supabase/client'
import { TrainingPhase } from '@/types/database'

// Read-only: phases are written by the AI coach through MCP.
export async function getTrainingPhases(): Promise<TrainingPhase[]> {
    const supabase = createClient()
    const { data, error } = await supabase
        .from('training_phases')
        .select('*')
        .order('start_date', { ascending: true, nullsFirst: false })
        .order('id', { ascending: true })

    if (error) throw error
    return data ?? []
}

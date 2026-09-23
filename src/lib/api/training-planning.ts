import { athleteDate, DEFAULT_ATHLETE_TIMEZONE } from '@/lib/training-planning/dates'
import { createClient } from '@/lib/supabase/client'

// This adapter validates the wire envelope and narrows optional display fields.
// It deliberately contains no queue, qualification, recovery or approval logic.
export type TrainingRecord = Record<string, unknown>
export function record(value: unknown): TrainingRecord {
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as TrainingRecord : {}
}
export function rows(value: unknown): TrainingRecord[] {
    return Array.isArray(value) ? value.map(record) : []
}
export function text(value: unknown, fallback = ''): string {
    return typeof value === 'string' || typeof value === 'number' ? String(value) : fallback
}
export function strings(value: unknown): string[] {
    return Array.isArray(value) ? value.map(item => text(item)).filter(Boolean) : []
}
export interface TrainingSession extends TrainingRecord {
    id: string
    revision_id: string
    slot_key: string | null
    planned_date: string
    timezone: string
    activity_kind: string
    workout_id: number | null
    snapshot: TrainingRecord
    origin: string
}
export interface TrainingContextData extends TrainingRecord {
    schema_version: 1
    status: 'ready' | 'inactive' | 'unprovisioned'
    athlete_timezone: string
    today: string
    target_date: string
    versions: { state: number; evidence: number }
    authority: TrainingRecord
    direction: TrainingRecord | null
    queue: TrainingRecord
    activity_eligibility: TrainingRecord
    recommended_today: TrainingRecord | null
    review: TrainingRecord
    evidence: TrainingRecord
    sessions: TrainingSession[]
    proposals: TrainingRecord[]
    recent_phases: TrainingRecord[]
    blocking_reasons: unknown[]
}
export interface TrainingHistory {
    revisions: TrainingRecord[]
    sessions: TrainingSession[]
    events: TrainingRecord[]
    has_more: boolean
    next_cursor: unknown
}
export class TrainingRejectedError extends Error {}
export class TrainingUnavailableError extends Error {
    constructor(message: string, public migrationMissing = false) { super(message) }
}
export function isPlanningMissing(error: unknown): boolean {
    const item = record(error)
    return ['PGRST202', 'PGRST205', '42P01', '42883'].includes(text(item.code))
}

async function rpc(name: string, input: TrainingRecord): Promise<TrainingRecord> {
    const { data, error } = await createClient().rpc(name, { p_input: input })
    if (error) {
        if (isPlanningMissing(error)) throw new TrainingUnavailableError('Training planning is not installed. Freeform logging is available.', true)
        if (error.code === 'P0001') throw new TrainingRejectedError(error.message)
        throw new Error(error.message || 'Training service unavailable')
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TrainingUnavailableError('Unsupported training response; linked actions are unavailable.')
    return data as TrainingRecord
}
export async function getTrainingContext(targetDate?: string): Promise<TrainingContextData> {
    const data = await rpc('get_training_context', targetDate ? { target_date: targetDate } : {})
    if (data.schema_version !== 1 || !['ready', 'inactive', 'unprovisioned'].includes(text(data.status))) {
        throw new TrainingUnavailableError('Unsupported training context. Logging remains available.')
    }
    if (data.status !== 'unprovisioned' && data.athlete_timezone !== DEFAULT_ATHLETE_TIMEZONE) throw new TrainingUnavailableError('Training timezone differs from this app build. Rebuild with NEXT_PUBLIC_ATHLETE_TIMEZONE matching owner setup; ordinary timestamped set saving remains available.')
    if (data.status === 'unprovisioned') return { ...data, sessions: [], proposals: [], recent_phases: [] } as unknown as TrainingContextData
    const versions = record(data.versions)
    if (typeof versions.state !== 'number' || typeof versions.evidence !== 'number') throw new TrainingUnavailableError('Incomplete training context. Refresh before a linked action.')
    return {
        ...data, sessions: rows(data.sessions), proposals: rows(data.proposals), recent_phases: rows(data.recent_phases),
        direction: data.direction ? record(data.direction) : null,
        recommended_today: data.recommended_today ? record(data.recommended_today) : null,
    } as unknown as TrainingContextData
}
export async function getTrainingHistory(input: TrainingRecord = {}): Promise<TrainingHistory> {
    const data = await rpc('get_training_history', input)
    if (!Array.isArray(data.events) || !Array.isArray(data.sessions) || !Array.isArray(data.revisions) || typeof data.has_more !== 'boolean') {
        throw new TrainingUnavailableError('Incomplete training history; no result was verified.')
    }
    return data as unknown as TrainingHistory
}
export function versionInput(context: TrainingContextData): TrainingRecord {
    return { expected_state_version: context.versions.state, expected_evidence_version: context.versions.evidence }
}
export type TrainingMutation = { name: string; input: TrainingRecord }
export function trainingMutation(name: string, input: TrainingRecord, context: TrainingContextData): TrainingMutation {
    return { name, input: { ...input, ...versionInput(context), request_id: crypto.randomUUID() } }
}
// Keep this exact mutation on uncertain transport/readback failures. Never create
// a second request key just because the first response was lost.
export async function executeTrainingMutation(mutation: TrainingMutation): Promise<TrainingRecord> {
    const result = await rpc(mutation.name, mutation.input)
    try {
        const receipt = await rpc('get_training_request', { operation: mutation.name, request_id: mutation.input.request_id, payload: mutation.input })
        const history = await getTrainingHistory(result.session_id ? { session_id: result.session_id } : result.revision_id ? { revision_id: result.revision_id } : {})
        if (receipt.event_id !== result.event_id || !history.events.some(event => event.id === result.event_id)) throw new Error('Receipt not found in exact history')
        return result
    } catch {
        // The write may have committed. Even a definitive read rejection must not
        // release this request for resubmission with a different idempotency key.
        throw new Error(`Outcome not verified. Check or retry the same request (${text(mutation.input.request_id)}); do not submit it again as a new action.`)
    }
}
export async function trainingOwner(): Promise<string | null> {
    const { data, error } = await createClient().auth.getUser()
    if (error) return null
    return data.user?.id ?? null
}

export function sessionForWorkout(context: TrainingContextData | null, workoutId: number | null): TrainingSession | null {
    if (!context || !workoutId) return null
    const matching = context.sessions.filter(session => session.workout_id === workoutId && !session.cancelled)
    return matching.length === 1 ? matching[0] : null
}
// Explicit route occurrence + frozen exercise membership, not date/name matching.
export async function resolveLoggingSession(sessionId: string, exerciseId: number): Promise<TrainingSession | null> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(sessionId)) return null
    const history = await getTrainingHistory({ session_id: sessionId })
    const session = history.sessions.find(item => item.id === sessionId)
    if (!session || session.planned_date !== athleteDate(new Date(), session.timezone)) return null
    const snapshot = record(session.snapshot)
    const exercises = rows(snapshot.exercises ?? record(snapshot.slot).exercises)
    if (!exercises.some(item => item.exercise_id === exerciseId)) return null
    if (history.has_more) return null // Ambiguous history: save unlinked, never infer.
    if (history.events.some(event => event.session_id === sessionId && event.kind === 'cancel_session')) return null
    return session
}

// Direct old-client edits must never be the fallback for a linked target. Query
// the exact FK, including archived intent; a recent context page is not proof
// that a workout is unlinked. A missing migration alone permits compatibility.
export async function assertUnlinkedWorkout(workoutId: number): Promise<void> {
    let history: TrainingHistory
    try { history = await getTrainingHistory() }
    catch (error) {
        if (error instanceof TrainingUnavailableError && error.migrationMissing) return
        throw new Error('Cannot verify workout linkage. Editing is paused; ordinary set logging still works.')
    }
    // Sessions are complete even when the separate event stream is paginated.
    if (history.sessions.some(session => session.workout_id === workoutId)) throw new Error('Plan-linked workout: use Manage linked intent for an accepted deviation or cancellation. Its frozen history cannot be replaced or deleted.')
}

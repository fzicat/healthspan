'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import Link from 'next/link'
import {
    executeTrainingMutation, getTrainingContext, getTrainingHistory, record, rows, strings, text,
    trainingMutation, trainingOwner, TrainingRejectedError, type TrainingContextData, type TrainingMutation,
    type TrainingRecord, type TrainingSession,
} from '@/lib/api/training-planning'

export const trainingButton = 'min-h-11 px-4 py-3 rounded-lg border border-border font-medium hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed'
export const trainingInput = 'w-full min-h-11 p-3 rounded-lg border border-border bg-background text-foreground'
export function human(value: unknown): string { return text(value).replaceAll('_', ' ') }

export function TrainingCard({ title, children, accent = false }: { title: string; children: ReactNode; accent?: boolean }) {
    return <section className={`rounded-xl border p-4 space-y-3 ${accent ? 'border-primary bg-primary/5' : 'border-border bg-card'}`}>
        <h2 className="font-semibold text-lg">{title}</h2>{children}
    </section>
}

// Readable labels and lists are primary; exact JSON remains a secondary export.
export function TrainingFacts({ value }: { value: unknown }) {
    if (value === null || value === undefined) return <span className="text-muted-foreground">Not recorded</span>
    if (typeof value === 'boolean') return <span>{value ? 'Yes' : 'No'}</span>
    if (typeof value !== 'object') return <span className="whitespace-pre-wrap break-words">{human(value)}</span>
    if (Array.isArray(value)) return value.length ? <ul className="space-y-2 border-l border-border pl-3">{value.map((item, index) => <li key={index}><TrainingFacts value={item} /></li>)}</ul> : <span className="text-muted-foreground">None recorded</span>
    return <dl className="space-y-2 text-sm">{Object.entries(value).map(([key, item]) => <div key={key} className="min-w-0">
        <dt className="text-muted-foreground capitalize">{human(key)}</dt><dd className="break-words"><TrainingFacts value={item} /></dd>
    </div>)}</dl>
}

export function RevisionSummary({ content }: { content: TrainingRecord }) {
    const macro = record(content.macro)
    const block = record(content.block)
    const profile = record(block.phase_profile)
    return <div className="space-y-4">
        <div><p className="text-xs uppercase tracking-wider text-primary">{text(block.key, 'Phase')}</p><h3 className="font-semibold">{text(block.purpose)}</h3><p className="text-sm mt-1">{text(macro.intent)}</p></div>
        <ul className="space-y-2">{rows(macro.priorities).map((priority, index) => <li key={index} className="border-l-2 border-primary pl-3">
            <span className="text-xs uppercase font-semibold text-primary">{human(priority.mode)}</span><p>{text(priority.capacity)}</p><p className="text-sm text-muted-foreground">{text(priority.success_criteria)}</p>
        </li>)}</ul>
        <dl className="grid grid-cols-2 gap-3 text-sm">
            <div><dt className="text-muted-foreground">Structure</dt><dd>{human(profile.split)}</dd></div>
            <div><dt className="text-muted-foreground">Emphases</dt><dd>{strings(profile.emphases).map(human).join(' · ')}</dd></div>
            <div><dt className="text-muted-foreground">Rep emphasis</dt><dd>{human(profile.rep_emphasis)}</dd></div>
            <div><dt className="text-muted-foreground">Laterality</dt><dd>{human(profile.laterality_emphasis)}</dd></div>
        </dl>
        <p className="text-sm text-muted-foreground">Window: {text(block.starts_on, 'Not specified')} → {text(block.expected_until, 'Open')}<br />Authorization: {block.authorized_through ? `through ${text(block.authorized_through)} (inclusive)` : 'No explicit end date recorded'}</p>
        <details><summary className="min-h-11 py-3 cursor-pointer font-medium">Sequence & qualification rules</summary><ol className="space-y-3">{rows(content.sequence).map(slot => <li key={text(slot.key)} className="border-t border-border pt-3"><h4 className="font-semibold">{text(slot.key)} · {human(slot.activity_kind)}</h4><p className="text-sm">{text(slot.purpose)}</p><TrainingFacts value={{ exercises: slot.exercises, qualification: slot.qualification, review_scope: slot.review_scope, load_tags: slot.load_tags }} /></li>)}</ol></details>
        <details><summary className="min-h-11 py-3 cursor-pointer font-medium">Progression, maintenance & recovery</summary><TrainingFacts value={{ progression_policy: content.progression_policy, recovery_spacing_rules: content.recovery_spacing_rules, cardio_recovery_intent: macro.cardio_recovery_intent, constraints: macro.constraints, horizon: macro.horizon }} /></details>
        <details><summary className="min-h-11 py-3 cursor-pointer font-medium">Variation, review & delegated scope</summary><TrainingFacts value={{ variation_policy: content.variation_policy, review_policy: content.review_policy, delegation: content.delegation }} /></details>
    </div>
}

export function useTrainingContext(targetDate?: string) {
    const [context, setContext] = useState<TrainingContextData | null>(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(true)
    const [ownerId, setOwnerId] = useState<string | null>(null)
    const generation = useRef(0)
    const refresh = useCallback(async () => {
        const current = ++generation.current
        setLoading(true)
        try {
            const data = await getTrainingContext(targetDate)
            if (current === generation.current) { setContext(data); setError('') }
        } catch (err) {
            if (current === generation.current) { setContext(null); setError(err instanceof Error ? err.message : 'Training unavailable') }
        } finally { if (current === generation.current) setLoading(false) }
    }, [targetDate])
    const invalidateRead = useCallback(() => { generation.current++ }, [])
    useEffect(() => { void refresh(); return invalidateRead }, [refresh, invalidateRead])
    useEffect(() => { let active = true; void trainingOwner().then(id => { if (active) setOwnerId(id) }); return () => { active = false } }, [])
    return { context, error, loading, refresh, isOwner: !!ownerId && context?.authority?.owner_user_id === ownerId }
}

export function useTrainingAction(context: TrainingContextData | null, refresh: () => Promise<void>) {
    const [busy, setBusy] = useState(false)
    const [message, setMessage] = useState('')
    const [error, setError] = useState('')
    const [pending, setPending] = useState<TrainingMutation | null>(null)
    const running = useRef(false)
    const execute = async (mutation: TrainingMutation) => {
        if (running.current) return
        running.current = true; setBusy(true); setError(''); setMessage(''); setPending(mutation)
        try {
            const result = await executeTrainingMutation(mutation)
            setPending(null)
            setMessage(`Saved and verified · ${human(result.status)} · receipt ${text(result.event_id)}`)
            await refresh()
        } catch (err) {
            if (err instanceof TrainingRejectedError) { setPending(null); await refresh() }
            setError(err instanceof Error ? err.message : 'Action not verified. Retry the same request below.')
        }
        finally { running.current = false; setBusy(false) }
    }
    const run = (name: string, input: TrainingRecord) => {
        if (!context || context.status === 'unprovisioned' || pending) return Promise.resolve()
        return execute(trainingMutation(name, input, context))
    }
    return { run, busy, message, error, pending, retry: () => pending ? execute(pending) : Promise.resolve() }
}
export type TrainingAction = ReturnType<typeof useTrainingAction>
export function ActionFeedback({ action }: { action: TrainingAction }) {
    return <div aria-live="polite" className="space-y-2 text-sm">
        {action.message && <p className="text-success">{action.message}</p>}
        {action.error && <p role="alert" className="text-warning">{action.error}</p>}
        {action.pending && !action.busy && <div className="space-y-2"><p>No new submission is allowed until this request is resolved. Retrying uses the original payload and request ID.</p><button className={trainingButton} onClick={() => void action.retry()}>Check / retry exact request</button></div>}
    </div>
}

export function SessionHistory({ session, events }: { session: TrainingSession; events: TrainingRecord[] }) {
    return <details className="border border-border rounded-lg p-3">
        <summary className="min-h-11 cursor-pointer py-2 font-medium">{session.planned_date} · {human(session.activity_kind)} · {session.slot_key || 'Supportive / attributed'}<span className="block text-xs text-muted-foreground break-all">Occurrence {session.id}</span></summary>
        <div className="space-y-4 pt-3">
            <p className="text-sm text-muted-foreground">Revision {session.revision_id} · {session.timezone} · {human(session.origin)}</p>
            <h4 className="font-semibold">Frozen intent & rules</h4>
            {['retrospective', 'report_attributed', 'unlinked'].includes(session.origin) && <p>No original prescription was stored. This is retrospective attribution, not a rewritten plan.</p>}
            <TrainingFacts value={session.snapshot} />
            <h4 className="font-semibold">Later outcome & evidence decisions</h4>
            {events.filter(event => event.session_id === session.id).map(event => <DecisionHistory key={text(event.id)} event={event} />)}
            {session.workout_id && <Link className={`${trainingButton} block text-center`} href={`/scheduled/${session.planned_date}`}>Open dated workout</Link>}
        </div>
    </details>
}
export function DecisionHistory({ event }: { event: TrainingRecord }) {
    return <article className="border-l-2 border-border pl-3 space-y-2 text-sm">
        <h4 className="font-semibold capitalize">{human(event.kind)}</h4><p className="text-xs text-muted-foreground break-words">{text(event.occurred_at)} · {typeof event.actor === 'string' ? event.actor : text(record(event.actor).kind)} · {text(event.id)}</p><TrainingFacts value={event.payload} />
    </article>
}

export function TrainingContext({ context, error, session, loading }: { context: TrainingContextData | null; error?: string; session?: TrainingSession | null; loading?: boolean }) {
    if (loading) return <p className="text-xs text-muted-foreground mb-3">Checking optional training context… Logging is available.</p>
    if (!session) return <div className="mb-3 text-xs text-muted-foreground"><Link className="inline-flex min-h-11 items-center underline" href="/training">Training dashboard</Link> · No plan link verified{error && <p>Planning unavailable; set logging is unaffected.</p>}</div>
    const snapshot = record(session.snapshot)
    const direction = record(snapshot.direction ?? snapshot.revision ?? context?.direction)
    const block = record(direction.block)
    return <div className="rounded-lg border border-border bg-card p-3 mb-3 text-sm space-y-1">
        <div className="flex justify-between gap-2"><span className="font-medium">{text(block.key, session.slot_key || session.activity_kind)}</span><Link className="inline-flex min-h-11 items-center underline text-primary" href={`/training/manage?session=${session.id}`}>Session record</Link></div>
        <p>{text(snapshot.purpose, text(record(snapshot.slot).purpose, text(block.purpose)))}</p>
        <p className="text-xs text-muted-foreground break-all">Frozen revision {session.revision_id} · intent, not completed work</p>
        {context?.review?.review_due === true && <p className="text-warning">Review due — not automatic expiry.</p>}
        <details><summary className="cursor-pointer min-h-11 py-3">Progression / maintenance & deviations</summary><TrainingFacts value={direction.progression_policy} /><SessionDecisions sessionId={session.id} /></details>
    </div>
}
function SessionDecisions({ sessionId }: { sessionId: string }) {
    const [events, setEvents] = useState<TrainingRecord[]>([])
    const [error, setError] = useState('')
    useEffect(() => { let active = true; getTrainingHistory({ session_id: sessionId }).then(data => { if (active) setEvents(data.events.filter(event => ['deviation', 'mutate_training_workout', 'cancel_session'].includes(text(event.kind)))) }).catch(() => { if (active) setError('Decision history unavailable') }); return () => { active = false } }, [sessionId])
    return <div className="space-y-3">{error && <p>{error}</p>}{events.map(event => <DecisionHistory key={text(event.id)} event={event} />)}</div>
}

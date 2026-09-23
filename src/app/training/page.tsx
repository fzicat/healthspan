'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { getTrainingHistory, record, rows, text, type TrainingContextData, type TrainingHistory, type TrainingRecord } from '@/lib/api/training-planning'
import { ActionFeedback, DecisionHistory, human, RevisionSummary, SessionHistory, TrainingCard, TrainingFacts, trainingButton, trainingInput, useTrainingAction, useTrainingContext } from '@/components/TrainingContext'
import { TrainingEvidence } from '@/components/TrainingEvidence'

export default function TrainingPage() {
    const { context, loading, error, refresh, isOwner } = useTrainingContext()
    const [tab, setTab] = useState('direction')
    return <main className="max-w-3xl mx-auto py-6 pb-20 space-y-5">
        <header className="flex items-start justify-between gap-3"><div><p className="text-xs uppercase tracking-widest text-primary mb-1">Long-term purpose · daily judgment</p><h1 className="text-2xl font-bold">Training direction</h1><p className="text-sm text-muted-foreground">Planning is optional. Your logger stays independent.</p></div><button className={trainingButton} onClick={() => void refresh()} disabled={loading}>Refresh</button></header>
        <nav aria-label="Training sections" className="flex flex-wrap gap-2 pb-1">{[['direction', 'Current'], ['proposals', 'Proposals'], ['evidence', 'Reports & clarification'], ['history', 'History']].map(([value, label]) => <button key={value} className={`${trainingButton} whitespace-nowrap ${tab === value ? 'text-primary bg-primary/10' : ''}`} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}>{label}</button>)}</nav>
        {loading && <p role="status">Reading fresh training context…</p>}
        {error && <TrainingCard title="Planning unavailable"><p role="alert">{error}</p><p className="text-sm">No cached direction authorizes changes. Ordinary online set logging remains available.</p><Link href="/strength" className={`${trainingButton} block text-center`}>Continue freeform logging</Link></TrainingCard>}
        {context && <>
            <p className="text-xs text-muted-foreground">Athlete-local date {context.today} · {context.athlete_timezone} · {context.status === 'unprovisioned' ? 'Owner setup required' : `State ${context.versions.state} / evidence ${context.versions.evidence}`}</p>
            {context.status === 'unprovisioned' ? <TrainingCard title="No owner has been provisioned"><p>An administrator must explicitly provision the athlete owner and confirm the IANA timezone before proposals can be submitted. Signing in does not claim ownership.</p><Link href="/strength" className={`${trainingButton} block text-center`}>Continue freeform logging</Link></TrainingCard> : <>
                {tab === 'direction' && <Direction context={context} refresh={refresh} isOwner={isOwner} />}
                {tab === 'proposals' && <Proposals context={context} refresh={refresh} isOwner={isOwner} />}
                {tab === 'evidence' && <TrainingCard title="Actual work & missing evidence"><p className="text-sm text-muted-foreground">Logging, qualification and queue credit are separate. Finish labels do not prove stimulus.</p><TrainingEvidence context={context} isOwner={isOwner} refresh={refresh} /></TrainingCard>}
                {tab === 'history' && <History version={context.versions.state + context.versions.evidence} />}
            </>}
        </>}
    </main>
}

function Direction({ context, refresh, isOwner }: { context: TrainingContextData; refresh: () => Promise<void>; isOwner: boolean }) {
    const direction = context.direction
    const recommendation = context.recommended_today
    const review = record(context.review)
    const evidence = record(context.evidence)
    const queue = record(context.queue)
    const todaySets = rows(evidence.sets).filter(set => text(set.local_date ?? set.date) === context.today || (set.logged_at && new Intl.DateTimeFormat('en-CA', { timeZone: context.athlete_timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(text(set.logged_at))) === context.today))
    const todayCardio = rows(evidence.cardio_sessions).filter(session => session.date === context.today)
    return <div className="space-y-5">
        <TrainingCard title="Current approved direction" accent>
            <p className="text-sm capitalize">Authority: {human(context.authority.lifecycle)}{context.authority.authorized_through ? ` · expires after ${text(context.authority.authorized_through)}` : ''}</p>
            {direction ? <><p className="text-xs text-muted-foreground break-all">Exact revision {text(context.authority.revision_id)}</p><RevisionSummary content={direction} /></> : <><p>No active direction has been established. Submit a complete proposal, review its purpose and rules, then activate the exact revision.</p><Link className={`${trainingButton} block text-center`} href="/strength">Continue freeform logging</Link></>}
        </TrainingCard>
        <div className="grid sm:grid-cols-2 gap-4">
            <TrainingCard title="Appropriate activity today">
                {recommendation && recommendation.stale !== true ? <><p className="text-xl font-semibold text-primary capitalize">{human(recommendation.activity_kind)}</p><p>{text(recommendation.reason)}</p><p className="text-sm text-muted-foreground">Revisit: {text(recommendation.revisit_on, 'See conditions')} · source {text(recommendation.source_event_id)}</p></> : <p>{recommendation?.stale === true ? 'Previous recommendation is stale. Reassess current evidence before using it.' : 'No current coaching decision recorded. A queued slot is not today’s recommendation.'}</p>}
                <p className="text-xs text-muted-foreground">Intent is not performed work. Cardio, mobility and rest do not consume a pending resistance slot unless the approved primary slot says otherwise.</p>
            </TrainingCard>
            <TrainingCard title="Pending resistance">
                <p className="text-xl font-semibold">{typeof queue.next_resistance_slot === 'object' && queue.next_resistance_slot ? text(record(queue.next_resistance_slot).key) : text(queue.next_resistance_slot, 'No resistance slot in this phase')}</p>
                <p className="text-sm">Queue: {human(queue.confidence)}</p><p className="text-sm text-muted-foreground">Next primary slot: {text(queue.next_slot_key, 'None')}</p><TrainingFacts value={{ earliest_calendar_candidate: record(context.activity_eligibility.strength).eligible_on_or_after, conditions: record(context.activity_eligibility.strength).conditions }} />
                <p className="text-xs text-muted-foreground">Earliest candidate is not automatic recovery clearance. No catch-up debt is inferred.</p>
            </TrainingCard>
        </div>
        <TrainingCard title="Eligibility & recovery conditions"><div className="grid sm:grid-cols-2 gap-3">{['strength', 'cardio', 'mobility', 'rest'].map(kind => {
            const eligibility = record(context.activity_eligibility[kind])
            return <article className="border border-border rounded-lg p-3 text-sm space-y-2" key={kind}><h3 className="font-semibold capitalize">{kind} · {eligibility.eligible === true ? 'Eligible within scope' : eligibility.eligible === false ? 'Not eligible' : 'Unknown'}</h3><TrainingFacts value={{ earliest_candidate: eligibility.eligible_on_or_after, reasons: eligibility.reasons, conditions: eligibility.conditions }} /></article>
        })}</div><p className="text-xs text-muted-foreground">Actual load includes unplanned and nonqualifying work across phases. Reservations are not performed work. Unknown activity is not proof of rest.</p>{context.blocking_reasons?.length > 0 && <><h3 className="font-semibold">Activity-specific blockers</h3><TrainingFacts value={context.blocking_reasons} /></>}</TrainingCard>
        <TrainingCard title="Today’s recorded activity"><p>{todaySets.length} actual logged sets · {todayCardio.length} actual cardio records</p><p className="text-sm text-muted-foreground">These counts are not qualifying exposures. Unlogged work remains unknown; reports are separate evidence.</p><TrainingFacts value={{ technical_completeness: evidence.complete, queue_history_complete: evidence.queue_history_complete, daily_observations: rows(evidence.daily_logs).filter(log => log.date === context.today) }} /><details><summary className="min-h-11 py-3 cursor-pointer">Actual records & unlinked work</summary><TrainingFacts value={{ sets_today: todaySets, cardio_today: todayCardio, unlinked_sets: evidence.unlinked_sets }} /></details></TrainingCard>
        <TrainingCard title="Progress toward the phase"><TrainingFacts value={queue.qualifying_exposures} /><p className="text-sm text-muted-foreground">One effective exposure per occurrence and applicable scope. Maintenance can mean successful continuation, not compulsory escalation.</p><details><summary className="min-h-11 py-3 cursor-pointer">Progression and maintenance rules</summary><TrainingFacts value={direction?.progression_policy} /></details></TrainingCard>
        <TrainingCard title={review.review_due ? 'Review due — not expiry' : 'Review checkpoints'} accent={review.review_due === true}><p className="text-sm">Original due: {text(review.original_due_on, 'No checkpoint reached')}</p><ul className="space-y-1 text-sm">{rows(review.reasons).map(reason => <li key={text(reason.event_id)}>{human(reason.reason)} · {text(reason.original_due_on)}</li>)}</ul><p className="text-sm">Last review: {human(record(record(review.last_review).payload).outcome) || 'Not recorded'}</p>{review.handling != null && <div className="text-sm"><p className="font-medium">{human(record(review.handling).kind)} · revisit {text(record(review.handling).revisit_on)}</p><p>{text(record(review.handling).reason)}</p></div>}{rows(review.open_concerns).map(concern => <p key={text(concern.id)} className="text-sm text-warning">{text(record(concern.payload).reason)} · revisit {text(record(concern.payload).revisit_on, 'Review required')}</p>)}<details><summary className="min-h-11 py-3 cursor-pointer">Exact review evidence & provenance</summary><TrainingFacts value={{ reasons: review.reasons, last_review: review.last_review, handling: review.handling, open_concerns: review.open_concerns }} /></details><p className="text-sm text-muted-foreground">Review due does not automatically expire direction or require a deload. Bounded continuation acknowledges, but does not resolve, the checkpoint.</p>{direction && <ReviewActions context={context} refresh={refresh} isOwner={isOwner} />}</TrainingCard>
        {direction && <IntentActions context={context} refresh={refresh} isOwner={isOwner} />}
        <TrainingCard title="Recent phases & transition evidence">{context.recent_phases.length ? context.recent_phases.map((phase, index) => <details key={text(phase.id, String(index))}><summary className="min-h-11 py-3 cursor-pointer">{text(record(record(phase.content).block).purpose, text(phase.id, 'Previous phase'))}</summary><TrainingFacts value={phase} /></details>) : <p className="text-sm text-muted-foreground">No previous phase outcomes recorded. No history or tolerability is invented.</p>}</TrainingCard>
        <Lifecycle context={context} refresh={refresh} isOwner={isOwner} />
    </div>
}

function Proposals({ context, refresh, isOwner }: { context: TrainingContextData; refresh: () => Promise<void>; isOwner: boolean }) {
    const action = useTrainingAction(context, refresh)
    const [draft, setDraft] = useState('')
    const [preview, setPreview] = useState<TrainingRecord | null>(null)
    const [parseError, setParseError] = useState('')
    return <div className="space-y-5"><ActionFeedback action={action} />
        <TrainingCard title="Current approved → proposed change"><p className="text-sm text-muted-foreground">Proposals grant no authority. Compare intent, retained capacities, stimulus, recovery and trade-offs; the owner activates an exact revision with an explicit starting slot.</p>{!context.proposals.length && <p>No pending proposals.</p>}{context.proposals.map(proposal => <Proposal key={text(proposal.id)} proposal={proposal} context={context} isOwner={isOwner} refresh={refresh} />)}</TrainingCard>
        <TrainingCard title="Submit a proposed revision"><p className="text-sm">Paste a complete authored revision from your coach. No sample program, dose or athlete history is prefilled.</p><details open={!context.proposals.length}><summary className="min-h-11 py-3 cursor-pointer">Advanced revision JSON editor</summary><label className="block text-sm">Complete revision content<textarea rows={12} className={`${trainingInput} font-mono text-xs`} spellCheck={false} value={draft} onChange={event => { setDraft(event.target.value); setPreview(null); setParseError('') }} /></label><button className={`${trainingButton} mt-3`} disabled={!draft.trim()} onClick={() => { try { const content = JSON.parse(draft); if (!content || Array.isArray(content) || typeof content !== 'object') throw new Error('Revision content must be an object'); setPreview(content); setParseError('') } catch (err) { setParseError(err instanceof Error ? err.message : 'Invalid JSON') } }}>Preview readable proposal</button></details>{parseError && <p role="alert" className="text-warning">{parseError}</p>}{preview && <><div className="grid md:grid-cols-2 gap-4"><div><h3 className="font-semibold mb-3">Current approved</h3>{context.direction ? <RevisionSummary content={context.direction} /> : <p>No active direction</p>}</div><div><h3 className="font-semibold mb-3 text-primary">Proposed change</h3><RevisionSummary content={preview} /></div></div><button className={`${trainingButton} w-full`} disabled={action.busy || !!action.pending} onClick={() => void action.run('propose_training_revision', { content: preview, parent_revision_id: context.authority.revision_id ?? null })}>Submit immutable proposal — not activate</button></>}</TrainingCard>
    </div>
}
function Proposal({ proposal, context, isOwner, refresh }: { proposal: TrainingRecord; context: TrainingContextData; isOwner: boolean; refresh: () => Promise<void> }) {
    const action = useTrainingAction(context, refresh)
    const [seed, setSeed] = useState('')
    const [pending, setPending] = useState('')
    const [confirmed, setConfirmed] = useState(false)
    const [rejectReason, setRejectReason] = useState('')
    const content = record(proposal.content)
    const changed = ['macro', 'block', 'sequence', 'variation_policy', 'progression_policy', 'recovery_spacing_rules', 'review_policy', 'delegation'].filter(key => JSON.stringify(context.direction?.[key]) !== JSON.stringify(content[key]))
    return <article className="border-t border-border pt-4 space-y-4">
        <p className="text-xs text-muted-foreground break-all">Proposal {text(proposal.id)} · {text(proposal.authored_at)} · {text(proposal.source)}</p>
        <p className="text-sm">Changed: {changed.map(human).join(', ') || 'No content changes'}</p>
        <div className="grid md:grid-cols-2 gap-4"><div className="rounded-lg bg-muted/30 p-3"><h3 className="font-semibold mb-3">Current approved</h3>{context.direction ? <RevisionSummary content={context.direction} /> : <p>None</p>}</div><div className="rounded-lg border border-primary/40 p-3"><h3 className="font-semibold mb-3 text-primary">Proposed change</h3><RevisionSummary content={content} /></div></div>
        <TrainingFacts value={{ transition_rationale: record(content.variation_policy).transition_rationale, previous_phase_ids: record(content.variation_policy).previous_phase_ids }} />
        <form className="space-y-3" onSubmit={event => { event.preventDefault(); void action.run('activate_training_revision', { revision_id: proposal.id, seed_slot_key: seed, pending_intent_action: pending }) }}>
            <label className="block text-sm">Explicit starting slot<select required className={trainingInput} value={seed} onChange={event => setSeed(event.target.value)}><option value="">Choose; past compliance is not inferred</option>{rows(content.sequence).map(slot => <option key={text(slot.key)} value={text(slot.key)}>{text(slot.key)} · {text(slot.purpose)}</option>)}</select></label>
            <label className="block text-sm">Existing pending intent<select required className={trainingInput} value={pending} onChange={event => setPending(event.target.value)}><option value="">Choose retain or cancel explicitly</option><option value="retain">Retain original frozen intent</option><option value="cancel">Cancel pending intent, preserving history</option></select></label>
            <label className="flex gap-3 text-sm py-3"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I reviewed this exact proposal and authorize its direction. Review dates are not authorization expiry.</label>
            <button className={`${trainingButton} w-full text-primary`} disabled={!isOwner || !confirmed || action.busy || !!action.pending}>Activate this exact revision</button>
        </form><details><summary className="min-h-11 py-3 cursor-pointer">Reject this proposal without deleting history</summary><label className="block text-sm">Rejection reason<input className={trainingInput} value={rejectReason} onChange={event => setRejectReason(event.target.value)} /></label><button className={`${trainingButton} mt-3`} disabled={!isOwner || !rejectReason.trim() || action.busy || !!action.pending} onClick={() => void action.run('record_training_decision', { kind: 'reject_revision', revision_id: proposal.id, reason: rejectReason })}>Reject proposal</button></details><ActionFeedback action={action} />
    </article>
}

function IntentActions({ context, refresh, isOwner }: { context: TrainingContextData; refresh: () => Promise<void>; isOwner: boolean }) {
    const action = useTrainingAction(context, refresh)
    const [kind, setKind] = useState('')
    const [slot, setSlot] = useState('')
    const [date, setDate] = useState(context.today)
    const [reason, setReason] = useState('')
    const [revisit, setRevisit] = useState('')
    const [duration, setDuration] = useState('')
    const [intensity, setIntensity] = useState('')
    const [error, setError] = useState('')
    const supportiveCardio = kind === 'cardio' && !slot
    const constraints = record(record(context.direction?.delegation).supportive_constraints)
    const maxMinutes = typeof constraints.cardio_max_minutes === 'number' && Number.isFinite(constraints.cardio_max_minutes) && constraints.cardio_max_minutes > 0 ? constraints.cardio_max_minutes : undefined
    const maxIntensity = typeof constraints.cardio_max_intensity === 'number' && Number.isFinite(constraints.cardio_max_intensity) && constraints.cardio_max_intensity >= 1 ? Math.min(10, constraints.cardio_max_intensity) : undefined
    const cardioBoundsMissing = maxMinutes === undefined || maxIntensity === undefined
    return <TrainingCard title="Record a dated intent"><details><summary className="min-h-11 py-3 cursor-pointer">Choose an activity within approved scope</summary><form className="space-y-3" onSubmit={event => {
        event.preventDefault()
        if (supportiveCardio && (maxMinutes === undefined || maxIntensity === undefined || !duration.trim() || !intensity.trim() || !Number.isFinite(Number(duration)) || !Number.isFinite(Number(intensity)) || Number(duration) <= 0 || Number(duration) > maxMinutes || Number(intensity) < 1 || Number(intensity) > maxIntensity)) {
            setError('Supportive cardio needs a positive duration and intensity from 1–10, both within the approved bounds.')
            return
        }
        setError('')
        void action.run('materialize_training_session', { target_date: date, activity_kind: kind, ...(slot ? { slot_key: slot } : {}), ...(supportiveCardio ? { duration_minutes: Number(duration), intensity: Number(intensity) } : {}), reason, revisit_on: revisit })
    }}>
        <p className="text-sm text-muted-foreground">The server rechecks current evidence, spacing, stop conditions and delegation. This creates intent only, never logs or exposure credit. Supportive work retains the pending resistance slot.</p>
        <label className="block text-sm">Date<input type="date" required min={context.today} className={trainingInput} value={date} onChange={event => setDate(event.target.value)} /></label>
        <label className="block text-sm">Activity<select aria-label="Activity" required className={trainingInput} value={kind} onChange={event => { setKind(event.target.value); setSlot(''); setError('') }}><option value="">Choose intentionally</option>{['strength', 'cardio', 'mobility', 'rest'].map(activity => <option key={activity} value={activity}>{human(activity)}</option>)}</select></label>
        <label className="block text-sm">Primary slot or supportive intent<select className={trainingInput} value={slot} onChange={event => { setSlot(event.target.value); setError('') }} required={kind === 'strength'}><option value="">Supportive intent (no resistance credit)</option>{rows(context.direction?.sequence).filter(item => item.activity_kind === kind).map(item => <option key={text(item.key)} value={text(item.key)}>{text(item.key)} · {text(item.purpose)}</option>)}</select></label>
        {supportiveCardio && <fieldset className="space-y-3">
            <legend className="font-medium">Supportive cardio prescription</legend>
            <p id="supportive-cardio-bounds" className="text-sm text-muted-foreground">Duration must be greater than 0 minutes; intensity uses a 1–10 scale. {cardioBoundsMissing ? 'Approved cardio bounds are missing; a revised delegation is needed before saving supportive cardio.' : `Approved maximum: ${maxMinutes} minutes and intensity ${maxIntensity}. These are limits, not a recommended dose.`}</p>
            <label className="block text-sm">Duration (minutes)<input type="number" required min={0} max={maxMinutes} step="any" aria-describedby="supportive-cardio-bounds" className={trainingInput} value={duration} onChange={event => { setDuration(event.target.value); setError('') }} /></label>
            <label className="block text-sm">Intensity (1–10)<input type="number" required min={1} max={maxIntensity ?? 10} step="any" aria-describedby="supportive-cardio-bounds" className={trainingInput} value={intensity} onChange={event => { setIntensity(event.target.value); setError('') }} /></label>
        </fieldset>}
        <label className="block text-sm">Why this fits today<textarea required rows={2} className={trainingInput} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <label className="block text-sm">Revisit on<input type="date" required className={trainingInput} value={revisit} onChange={event => setRevisit(event.target.value)} /></label>
        {!!context.target_conflict && <TrainingFacts value={context.target_conflict} />}
        {error && <p role="alert">{error}</p>}
        <button className={`${trainingButton} w-full`} disabled={!isOwner || action.busy || !!action.pending || context.authority.lifecycle !== 'active' || (supportiveCardio && cardioBoundsMissing)}>Save intent, not performed work</button>
    </form></details><ActionFeedback action={action} /></TrainingCard>
}
function ReviewActions({ context, refresh, isOwner }: { context: TrainingContextData; refresh: () => Promise<void>; isOwner: boolean }) {
    const action = useTrainingAction(context, refresh)
    const [kind, setKind] = useState('bounded_continuation')
    const [reason, setReason] = useState('')
    const [evidence, setEvidence] = useState('')
    const [date, setDate] = useState('')
    const [outcome, setOutcome] = useState('continue')
    const [nextSlot, setNextSlot] = useState('')
    const [concernCode, setConcernCode] = useState('')
    return <details><summary className="min-h-11 py-3 cursor-pointer">Record review, concern or queue correction</summary><form className="space-y-3" onSubmit={event => { event.preventDefault(); const reviewIds = rows(context.review.reasons).map(item => item.event_id ?? item.id).filter(Boolean); void action.run('record_training_decision', { kind, reason, ...(kind === 'queue_correction' ? { next_slot_key: nextSlot, evidence: { summary: evidence } } : kind === 'concern' ? { code: concernCode, activity_kinds: ['strength', 'cardio', 'mobility', 'rest'], stop: false, ...(date ? { revisit_on: date } : {}) } : { review_event_ids: reviewIds, evidence: { summary: evidence }, ...(kind === 'review' ? { outcome, next_review_on: date } : { revisit_on: date }) }) }) }}>
        <label className="block text-sm">Decision<select className={trainingInput} value={kind} onChange={event => setKind(event.target.value)}><option value="bounded_continuation">Bounded continuation (review stays due)</option><option value="review">Genuine review</option><option value="concern">Record a concern</option><option value="queue_correction">Explicit queue correction</option></select></label>
        <label className="block text-sm">Reasoning<textarea required rows={3} className={trainingInput} value={reason} onChange={event => setReason(event.target.value)} /></label>
        {kind !== 'concern' && <label className="block text-sm">Evidence, source IDs & uncertainty<textarea required rows={3} className={trainingInput} value={evidence} onChange={event => setEvidence(event.target.value)} /></label>}
        {kind === 'concern' && <label className="block text-sm">Concern code<input required className={trainingInput} value={concernCode} onChange={event => setConcernCode(event.target.value)} /></label>}
        {kind === 'review' && <label className="block text-sm">Review outcome<select className={trainingInput} value={outcome} onChange={event => setOutcome(event.target.value)}>{['continue', 'extend_expected_window', 'revise', 'pause', 'complete', 'retire'].map(item => <option key={item} value={item}>{human(item)}</option>)}</select></label>}
        {kind === 'queue_correction' ? <label className="block text-sm">Explicit next slot<select required className={trainingInput} value={nextSlot} onChange={event => setNextSlot(event.target.value)}><option value="">Choose corrected position</option>{rows(context.direction?.sequence).map(item => <option key={text(item.key)} value={text(item.key)}>{text(item.key)}</option>)}</select></label> : <label className="block text-sm">{kind === 'review' ? 'Next review checkpoint' : 'Concrete revisit date'}<input type="date" required className={trainingInput} value={date} onChange={event => setDate(event.target.value)} /></label>}
        <button className={`${trainingButton} w-full`} disabled={!isOwner || action.busy || !!action.pending}>Record attributed decision</button>
    </form><ActionFeedback action={action} /></details>
}
function Lifecycle({ context, refresh, isOwner }: { context: TrainingContextData; refresh: () => Promise<void>; isOwner: boolean }) {
    const action = useTrainingAction(context, refresh)
    const [lifecycle, setLifecycle] = useState('')
    const [reason, setReason] = useState('')
    return <details className="border border-border rounded-xl p-4"><summary className="min-h-11 py-3 cursor-pointer">Athlete authority & lifecycle</summary><p className="text-sm">Pause/archive stops new linked prescriptions, not logging. Existing authorization limits and review history remain.</p><form className="space-y-3 mt-3" onSubmit={event => { event.preventDefault(); void action.run('set_training_lifecycle', { lifecycle, reason }) }}><label className="block text-sm">Lifecycle<select className={trainingInput} required value={lifecycle} onChange={event => setLifecycle(event.target.value)}><option value="">Choose explicitly</option>{['active', 'paused', 'archived', 'inactive'].map(item => <option key={item} value={item}>{human(item)}</option>)}</select></label><label className="block text-sm">Reason<input required className={trainingInput} value={reason} onChange={event => setReason(event.target.value)} /></label><button className={`${trainingButton} w-full`} disabled={!isOwner || action.busy || !!action.pending}>Confirm lifecycle change</button></form><ActionFeedback action={action} /></details>
}
function History({ version }: { version: number }) {
    const [history, setHistory] = useState<TrainingHistory | null>(null)
    const [error, setError] = useState('')
    const [loading, setLoading] = useState(false)
    const load = useCallback(async (cursor?: unknown) => {
        setLoading(true)
        try {
            const sessionId = new URLSearchParams(window.location.search).get('session')
            const data = await getTrainingHistory({ ...(sessionId ? { session_id: sessionId } : {}), ...(cursor ? { cursor } : {}) })
            setHistory(previous => cursor && previous ? { ...data, events: [...new Map([...previous.events, ...data.events].map(item => [item.id, item])).values()] } : data)
            setError('')
        } catch (err) { setError(err instanceof Error ? err.message : 'History unavailable') }
        finally { setLoading(false) }
    }, [])
    useEffect(() => { void load() }, [load, version])
    return <TrainingCard title="Frozen intent & decision history"><p className="text-sm text-muted-foreground">Original rules and prescriptions are immutable. Later outcomes, corrections, self-reports and accepted deviations are shown separately. Copying a workout copies neither authority nor credit.</p>{error && <p role="alert">{error}</p>}{history && <>
        <h3 className="font-semibold">Revisions</h3>{history.revisions.map(revision => <details key={text(revision.id)} className="border border-border rounded-lg p-3"><summary className="min-h-11 py-2 cursor-pointer break-all">Revision {text(revision.id)} · {text(revision.authored_at)}</summary><RevisionSummary content={record(revision.content)} /></details>)}
        <h3 className="font-semibold">Occurrences</h3>{history.sessions.map(session => <SessionHistory key={session.id} session={session} events={history.events} />)}
        <h3 className="font-semibold">Decisions (newest first)</h3>{history.events.map(event => <DecisionHistory key={text(event.id)} event={event} />)}
        {!history.events.length && <p>No decisions recorded.</p>}
        {history.has_more && <button className={`${trainingButton} w-full`} disabled={loading} onClick={() => void load(history.next_cursor)}>Load earlier decisions</button>}
        <p className="text-xs text-muted-foreground">{history.has_more ? 'More decisions exist; this is not complete history yet.' : 'End of matching decision history.'}</p>
    </>}{loading && <p role="status">Loading history…</p>}</TrainingCard>
}

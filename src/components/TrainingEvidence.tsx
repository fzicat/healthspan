'use client'

import { useEffect, useState } from 'react'
import { getTrainingHistory, record, rows, strings, text, type TrainingContextData, type TrainingRecord, type TrainingSession } from '@/lib/api/training-planning'
import { ActionFeedback, human, TrainingFacts, trainingButton, trainingInput, useTrainingAction } from './TrainingContext'

function numberList(value: string): number[] {
    if (!value.trim()) return []
    const tokens = value.split(',').map(item => item.trim())
    if (tokens.some(item => !/^[1-9]\d*$/.test(item))) throw new Error('Enter positive record IDs separated by commas.')
    return [...new Set(tokens.map(Number))]
}

export function TrainingEvidence({ context, isOwner, refresh, onlySessionId }: { context: TrainingContextData; isOwner: boolean; refresh: () => Promise<void>; onlySessionId?: string }) {
    const action = useTrainingAction(context, refresh)
    const [reportSessionId, setReportSessionId] = useState(onlySessionId || '')
    const [events, setEvents] = useState<TrainingRecord[]>([])
    const [historyError, setHistoryError] = useState('')
    const [showReport, setShowReport] = useState(false)
    const [day, setDay] = useState('')
    const [dayKind, setDayKind] = useState('')
    const [dayConfirmed, setDayConfirmed] = useState(false)
    const [dayReason, setDayReason] = useState('')
    const [showAttribute, setShowAttribute] = useState(false)
    const sessions = onlySessionId ? context.sessions.filter(item => item.id === onlySessionId) : context.sessions
    const qualifiers = rows(context.evidence.pending_qualifiers).filter(item => !onlySessionId || item.session_id === onlySessionId)
    const blocked = action.busy || !!action.pending || !isOwner
    useEffect(() => {
        let active = true
        async function load() {
            try {
                const all: TrainingRecord[] = []
                let cursor: unknown = undefined
                do {
                    const history = await getTrainingHistory({ ...(onlySessionId ? { session_id: onlySessionId } : {}), ...(cursor ? { cursor } : {}) })
                    all.push(...history.events)
                    cursor = history.has_more ? history.next_cursor : null
                    if (history.has_more && !cursor) throw new Error('Incomplete report history')
                } while (cursor)
                if (active) { setEvents(all); setHistoryError('') }
            } catch { if (active) setHistoryError('Report history unavailable. Do not create a duplicate report; refresh first.') }
        }
        void load(); return () => { active = false }
    }, [onlySessionId, context.versions.state, context.versions.evidence])
    const proposedReports = events.filter(event => event.kind === 'propose_report' && !events.some(other => other.kind === 'confirm_report' && (record(other.payload).proposal_event_id === event.id || record(other.payload).corrected_proposal_event_id === event.id)))
    return <div className="space-y-4">
        <ActionFeedback action={action} />
        {!isOwner && <p className="text-sm text-muted-foreground">Athlete confirmation requires the provisioned owner account.</p>}
        {qualifiers.map((qualifier, index) => <Clarification key={`${text(qualifier.session_id)}-${index}`} qualifier={qualifier} context={context} blocked={blocked} submit={input => action.run('record_training_decision', input)} />)}
        {historyError && <p role="alert" className="text-warning text-sm">{historyError}</p>}
        {proposedReports.map(event => <ReportForm key={text(event.id)} session={sessions.find(item => item.id === event.session_id)} context={context} proposed={event} blocked={blocked} submit={input => action.run('record_training_decision', input)} />)}
        <button className={`${trainingButton} w-full`} onClick={() => setShowReport(!showReport)}>Report unlogged work</button>
        {showReport && <div className="space-y-3 border border-border p-3 rounded-lg">
            <p className="text-sm text-muted-foreground">A report is separate evidence, not logged volume. Use the same occurrence if any part was already logged or reported.</p>
            <label className="block text-sm">Occurrence<select className={trainingInput} value={reportSessionId} onChange={event => setReportSessionId(event.target.value)}><option value="">Choose the actual occurrence</option>{sessions.map(session => <option key={session.id} value={session.id}>{session.planned_date} · {session.slot_key || session.activity_kind} · {session.id}</option>)}</select></label>
            {reportSessionId && <ReportForm key={reportSessionId} session={sessions.find(item => item.id === reportSessionId)} context={context} blocked={blocked || !!historyError} submit={input => action.run('record_training_decision', input)} />}
            {!onlySessionId && <><button className={`${trainingButton} w-full`} onClick={() => setShowAttribute(!showAttribute)}>No occurrence stored? Attribute actual work</button>{showAttribute && <AttributeForm context={context} blocked={blocked || !!historyError} submit={input => action.run('record_training_decision', input)} />}</>}
        </div>}
        {!onlySessionId && <details className="border-t border-border pt-2"><summary className="min-h-11 py-3 cursor-pointer font-medium">Confirm a complete intervening day</summary><form className="space-y-3" onSubmit={event => { event.preventDefault(); void action.run('record_training_decision', { kind: 'confirm_day', date: day, non_strength: dayKind === 'non_strength', complete: true, reason: dayReason }) }}>
            <p className="text-sm text-muted-foreground">An empty log is not proof of rest. Confirm only a complete past date in {context.athlete_timezone}. Real resistance work overrides a non-strength confirmation. This does not certify recovery.</p>
            <label className="block text-sm">Completed date<input type="date" required value={day} onChange={event => setDay(event.target.value)} className={trainingInput} /></label>
            <label className="block text-sm">Actual activity<select required value={dayKind} onChange={event => setDayKind(event.target.value)} className={trainingInput}><option value="">Select</option><option value="non_strength">No strength / loaded resistance that entire day</option><option value="strength">Some strength / loaded resistance occurred</option></select></label>
            <label className="block text-sm">What did you do?<input required value={dayReason} onChange={event => setDayReason(event.target.value)} className={trainingInput} /></label>
            <label className="flex gap-3 py-3 text-sm"><input type="checkbox" checked={dayConfirmed} onChange={event => setDayConfirmed(event.target.checked)} />I confirm the entire athlete-local date has ended and this describes my actual activity.</label>
            <button className={`${trainingButton} w-full`} disabled={blocked || !dayConfirmed || day >= context.today}>Confirm day activity</button>
        </form></details>}
    </div>
}

function Clarification({ qualifier, context, blocked, submit }: { qualifier: TrainingRecord; context: TrainingContextData; blocked: boolean; submit: (input: TrainingRecord) => Promise<void> }) {
    const [selected, setSelected] = useState<number[]>([])
    const [efforts, setEfforts] = useState<Record<string, string>>({})
    const [quality, setQuality] = useState('')
    const [continuation, setContinuation] = useState('')
    const [cardio, setCardio] = useState<number[]>([])
    const [reason, setReason] = useState('')
    const [error, setError] = useState('')
    const sessionId = text(qualifier.session_id)
    const session = context.sessions.find(item => item.id === sessionId)
    const qualification = record(record(session?.snapshot.slot).qualification)
    const missing = strings(qualifier.missing_qualifiers ?? qualifier.reasons)
    const sets = rows(context.evidence.sets).filter(item => item.training_session_id === sessionId || !item.training_session_id)
    const needsEffort = missing.some(item => /effort|rir/.test(item)) || rows(qualification.anchors).some(anchor => anchor.max_rir != null)
    const needsQuality = missing.some(item => /quality/.test(item))
    const needsContinuation = missing.some(item => /continuation|date/.test(item))
    const needsCardio = missing.some(item => /cardio|association/.test(item))
    const continuationDates = continuation.split(',').map(value => value.trim()).filter(Boolean)
    const cardioRecords = rows(context.evidence.cardio_sessions).filter(item => item.date === session?.planned_date || continuationDates.includes(text(item.date)))
    const reportConflict = missing.some(item => /report.*conflict|discrepanc/.test(item))
    return <details className="rounded-lg border border-warning/50 p-3">
        <summary className="cursor-pointer min-h-11 py-2 font-medium">Session clarification needed <span className="text-xs block break-all text-muted-foreground">{sessionId}</span></summary>
        <TrainingFacts value={qualifier} />
        <form className="space-y-3 mt-3" onSubmit={event => { event.preventDefault(); setError(''); try { void submit({ kind: 'clarify_session', session_id: sessionId, set_ids: selected, reason, ...(needsEffort ? { effort_by_set: Object.fromEntries(Object.entries(efforts).filter(([id, value]) => selected.includes(Number(id)) && value !== '').map(([id, value]) => [id, Number(value)])) } : {}), ...(quality ? { quality } : {}), ...(continuationDates.length ? { continuation_dates: continuationDates } : {}), ...(needsCardio ? { cardio_session_ids: cardio.filter(id => cardioRecords.some(item => Number(item.id) === id)) } : {}) }) } catch (err) { setError(err instanceof Error ? err.message : 'Invalid records') } }}>
            <p className="text-sm">Identify the work sets for this occurrence; omit warmups. Unlinked sets are candidates, not automatic matches.</p>
            <fieldset className="space-y-2"><legend className="sr-only">Confirmed work sets</legend>{sets.map(set => <div key={text(set.id)} className="bg-muted/40 rounded-lg p-2"><label className="flex items-start gap-3 min-h-11 text-sm"><input type="checkbox" className="mt-1" checked={selected.includes(Number(set.id))} onChange={event => setSelected(previous => event.target.checked ? [...previous, Number(set.id)] : previous.filter(id => id !== set.id))} /><span>Set {text(set.id)} · {text(set.exercise_name, `exercise ${text(set.exercise_id)}`)}<br />{text(set.logged_at)} · {set.reps == null ? 'Reps unknown' : `${text(set.reps)} reps`} · {set.rir == null ? 'RIR unknown' : `${text(set.rir)} RIR`}<br />{set.training_session_id ? 'Linked' : 'Unlinked — confirm association'}</span></label>{needsEffort && selected.includes(Number(set.id)) && set.rir == null && <label className="text-sm">Actual RIR for set {text(set.id)}<input type="number" min="0" max="10" value={efforts[text(set.id)] || ''} onChange={event => setEfforts(previous => ({ ...previous, [text(set.id)]: event.target.value }))} className={trainingInput} /></label>}</div>)}</fieldset>
            {needsQuality && <label className="block text-sm">Quality achieved (exact authored criterion)<input value={quality} onChange={event => setQuality(event.target.value)} className={trainingInput} /></label>}
            {(needsContinuation || needsCardio) && <label className="block text-sm">Explicit continuation dates (YYYY-MM-DD, comma separated)<input value={continuation} onChange={event => { setContinuation(event.target.value); setCardio([]) }} className={trainingInput} /></label>}
            {needsCardio && <fieldset className="space-y-2"><legend className="font-medium">Actual logged cardio for this occurrence</legend>
                <p className="text-sm text-muted-foreground">Choose only records from this actual occurrence. Nothing is associated automatically. For another date, explicitly declare a continuation above. The server verifies dates and rejects records already used by another occurrence.</p>
                {cardioRecords.map(item => <label key={text(item.id)} className="flex items-start gap-3 min-h-11 rounded-lg bg-muted/40 p-2 text-sm"><input type="checkbox" className="mt-1" checked={cardio.includes(Number(item.id))} onChange={event => setCardio(previous => event.target.checked ? [...previous, Number(item.id)] : previous.filter(id => id !== Number(item.id)))} /><span>Cardio record {text(item.id)} · {text(item.date)} · {text(item.duration_minutes)} minutes<br />{text(item.exercise_name, `Exercise ${text(item.exercise_id)}`)} · {item.perceived_intensity == null ? 'Intensity not recorded' : `Intensity ${text(item.perceived_intensity)}/10`}{item.notes ? ` · ${text(item.notes)}` : ''}</span></label>)}
                {!cardioRecords.length && <p className="text-sm">No cardio records on the occurrence or explicitly continued dates.</p>}
            </fieldset>}
            <label className="block text-sm">Clarification<input required value={reason} onChange={event => setReason(event.target.value)} className={trainingInput} /></label>
            {error && <p role="alert">{error}</p>}
            <button className={`${trainingButton} w-full`} disabled={blocked}>Confirm missing evidence</button>
            {reportConflict && <div className="space-y-2"><p>Logs and report disagree. Preserve both sources and choose which evidence to use.</p>{['use_logs', 'use_report'].map(resolution => <button type="button" key={resolution} className={trainingButton} disabled={blocked || !reason.trim()} onClick={() => void submit({ kind: 'resolve_report', session_id: sessionId, resolution, reason })}>{human(resolution)}</button>)}</div>}
        </form>
    </details>
}

// Keep this bounded vocabulary aligned with training_tags; never infer actual load
// from the planned activity's label or preselect the authored classification.
const reportLoadTags = ['resistance', 'full_body', 'upper', 'lower', 'systemic', 'cardio', 'mobility', 'recovery']

function ReportForm({ session, context, proposed, blocked, submit }: { session?: TrainingSession; context: TrainingContextData; proposed?: TrainingRecord; blocked: boolean; submit: (input: TrainingRecord) => Promise<void> }) {
    const payload = record(proposed?.payload)
    const report = record(payload.report)
    const [draft, setDraft] = useState<TrainingRecord>(() => proposed ? report : { performed_on: session?.planned_date || '' })
    const [correcting, setCorrecting] = useState(false)
    const [loadConfirmed, setLoadConfirmed] = useState(false)
    const [checked, setChecked] = useState(false)
    const [reason, setReason] = useState(text(payload.reason))
    const snapshot = record(session?.snapshot)
    const slot = record(snapshot.slot)
    const qualification = record(slot.qualification ?? snapshot.qualification)
    const exercises = rows(snapshot.exercises ?? slot.exercises)
    const editing = !proposed || correcting
    const work = rows(draft.work)
    const loadTags = strings(draft.load_tags)
    const needsLoadConfirmation = qualification.kind === 'reported_objective' || session?.activity_kind === 'mobility' || 'load_tags' in draft
    const changed = JSON.stringify(draft) !== JSON.stringify(report)
    function update(field: string, value: unknown) {
        setChecked(false)
        if (field === 'load_tags') setLoadConfirmed(false)
        setDraft(previous => {
            const next = { ...previous }
            if (value === undefined) delete next[field]
            else next[field] = value
            return next
        })
    }
    if (!session) return <p className="text-warning">The occurrence for this report is not in the current view. Open its exact history before confirming.</p>
    const disabled = blocked || !checked || (correcting && !changed) || (needsLoadConfirmation && (!loadConfirmed || !loadTags.length))
    return <form className="space-y-3 border-l-2 border-primary pl-3" onSubmit={event => {
        event.preventDefault()
        if (disabled) return
        // An unchanged confirmation must preserve missing optional fields and all
        // proposed values. Corrections are new reports with a separate audit link.
        void submit({ kind: 'confirm_report', session_id: session.id, report: editing ? draft : report, ...(proposed ? correcting ? { corrected_proposal_event_id: proposed.id } : { proposal_event_id: proposed.id } : {}), duplicate_checked: true, reason })
    }}>
        <h3 className="font-semibold">{proposed ? correcting ? 'Correct proposed athlete report' : 'Confirm proposed athlete report' : 'Report actual unlogged work'}</h3>
        {proposed && <><TrainingFacts value={report} /><p className="text-sm text-muted-foreground">Confirm the exact proposal below, or explicitly correct it. A correction preserves the original proposal and records its reference.</p><button type="button" className={trainingButton} disabled={blocked} onClick={() => { setCorrecting(!correcting); setDraft(report); setChecked(false); setLoadConfirmed(false) }}>{correcting ? 'Keep original proposal' : 'Correct proposed report'}</button></>}
        <p className="text-xs text-muted-foreground">Occurrence {session.id}. Reports never create set rows or count as logged volume.</p>
        <TrainingFacts value={qualification} />
        {editing && <>
            <label className="block text-sm">Performed on ({context.athlete_timezone})<input type="date" required max={context.today} value={text(draft.performed_on)} onChange={event => update('performed_on', event.target.value)} className={trainingInput} /></label>
            {work.map((item, index) => <div className="rounded-lg bg-muted/40 p-3 space-y-2" key={index}>
                <label className="block text-sm">Exercise ID<select required className={trainingInput} value={text(item.exercise_id)} onChange={event => update('work', work.map((entry, i) => i === index ? { ...entry, exercise_id: Number(event.target.value) } : entry))}><option value="">Choose anchor / allowed equivalent</option>{[...new Map([...exercises, ...rows(qualification.anchors).flatMap(anchor => (Array.isArray(anchor.exercise_ids) ? anchor.exercise_ids : []).map(id => ({ exercise_id: id })))].map(exercise => [text(exercise.exercise_id), exercise])).values()].map(exercise => <option key={text(exercise.exercise_id)} value={text(exercise.exercise_id)}>{text(record(exercise).name, `Exercise ${text(exercise.exercise_id)}`)}</option>)}</select></label>
                <div className="grid grid-cols-3 gap-2">{['sets', 'reps', 'rir'].map(field => <label key={field} className="text-sm capitalize">{field}<input className={trainingInput} type="number" required={field === 'sets'} min={field === 'rir' ? '0' : '1'} max={field === 'rir' ? '10' : undefined} value={text(item[field])} onChange={event => update('work', work.map((entry, i) => i === index ? { ...entry, [field]: event.target.value === '' ? undefined : Number(event.target.value) } : entry))} /></label>)}</div>
                <button type="button" className={trainingButton} onClick={() => update('work', work.filter((_, i) => i !== index))}>Remove reported anchor</button>
            </div>)}
            {(qualification.kind === 'strength_sets' || exercises.length > 0) && <button type="button" className={trainingButton} onClick={() => update('work', [...work, {}])}>Add work performed</button>}
            {(qualification.kind === 'cardio_minutes' || 'minutes' in draft) && <label className="block text-sm">Actual minutes<input type="number" min="0" value={text(draft.minutes)} onChange={event => update('minutes', event.target.value === '' ? undefined : Number(event.target.value))} className={trainingInput} /></label>}
            {qualification.kind === 'reported_objective' && <label className="flex gap-3 py-3"><input type="checkbox" checked={draft.objective_met === true} onChange={event => update('objective_met', event.target.checked)} />I achieved the specified objective: {text(qualification.objective)}</label>}
            {(!!qualification.required_quality || 'quality' in draft) && <label className="block text-sm">Actual quality achieved<input value={text(draft.quality)} onChange={event => update('quality', event.target.value || undefined)} className={trainingInput} /></label>}
        </>}
        {needsLoadConfirmation && <fieldset className="space-y-2"><legend className="font-medium">Actual load classification</legend>
            <p className="text-sm text-muted-foreground">Select the actual load, not what the activity name suggests. Include resistance for loaded work. Authored tags (not automatically selected): {strings(session.load_tags).map(human).join(' · ') || 'None recorded'}.</p>
            {editing ? reportLoadTags.map(tag => <label key={tag} className="flex gap-3 min-h-11 items-center text-sm"><input type="checkbox" checked={loadTags.includes(tag)} onChange={event => update('load_tags', event.target.checked ? [...loadTags, tag] : loadTags.filter(value => value !== tag))} />{human(tag)}</label>) : <p className="text-sm">Proposed classification: {loadTags.map(human).join(' · ') || 'Missing — correct the proposal to classify actual load'}.</p>}
            <label className="flex items-start gap-3 py-3 text-sm"><input type="checkbox" checked={loadConfirmed} disabled={!loadTags.length} onChange={event => setLoadConfirmed(event.target.checked)} />I explicitly confirm these load classifications describe my actual work.</label>
        </fieldset>}
        <label className="block text-sm">Report / explanation<textarea required value={reason} onChange={event => setReason(event.target.value)} className={trainingInput} rows={2} /></label>
        <label className="flex items-start gap-3 py-3 text-sm"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />I confirm this describes my actual work, checked for duplicate logs/reports, and uses the same occurrence for matching evidence.</label>
        <button className={`${trainingButton} w-full`} disabled={disabled}>{correcting ? 'Confirm corrected report' : 'Confirm my report'}</button>
    </form>
}
function AttributeForm({ context, blocked, submit }: { context: TrainingContextData; blocked: boolean; submit: (input: TrainingRecord) => Promise<void> }) {
    const [slot, setSlot] = useState('')
    const [date, setDate] = useState('')
    const [ids, setIds] = useState('')
    const [reason, setReason] = useState('')
    const [checked, setChecked] = useState(false)
    const [distinct, setDistinct] = useState<string[]>([])
    const [error, setError] = useState('')
    const possibleMatches = context.sessions.filter(session => session.planned_date === date && session.slot_key)
    return <form className="space-y-3" onSubmit={event => { event.preventDefault(); try { const setIds = numberList(ids); setError(''); void submit({ kind: 'attribute_occurrence', revision_id: context.authority.revision_id, slot_key: slot, performed_on: date, set_ids: setIds, distinct_from_session_ids: distinct.filter(id => possibleMatches.some(session => session.id === id)), duplicate_checked: true, reason }) } catch (err) { setError(err instanceof Error ? err.message : 'Invalid IDs') } }}>
        <p className="text-sm text-muted-foreground">Retrospective attribution creates no original prescription. Reuse an existing occurrence for matching work or fragments. A genuinely separate same-day session needs an explicit distinction and reason.</p>
        {possibleMatches.map(session => <label key={session.id} className="flex items-start gap-3 py-3 text-sm"><input type="checkbox" checked={distinct.includes(session.id)} onChange={event => setDistinct(previous => event.target.checked ? [...previous, session.id] : previous.filter(id => id !== session.id))} />This is separate actual work, not a duplicate or continuation of {session.slot_key} ({session.id}).</label>)}
        <label className="block text-sm">Approved slot<select required className={trainingInput} value={slot} onChange={event => setSlot(event.target.value)}><option value="">Choose</option>{rows(context.direction?.sequence).map(item => <option key={text(item.key)} value={text(item.key)}>{text(item.key)} · {text(item.purpose)}</option>)}</select></label>
        <label className="block text-sm">Performed on<input type="date" required max={context.today} value={date} onChange={event => setDate(event.target.value)} className={trainingInput} /></label>
        <label className="block text-sm">Actual set IDs, if logged (comma separated)<input value={ids} onChange={event => setIds(event.target.value)} className={trainingInput} /></label>
        <label className="block text-sm">Reason<input required value={reason} onChange={event => setReason(event.target.value)} className={trainingInput} /></label>
        <label className="flex gap-3 py-3 text-sm"><input type="checkbox" checked={checked} onChange={event => setChecked(event.target.checked)} />I checked for an existing occurrence and duplicate work.</label>
        {error && <p role="alert">{error}</p>}
        <button className={`${trainingButton} w-full`} disabled={blocked || !checked || !context.direction}>Attribute actual work, then report / clarify</button>
    </form>
}

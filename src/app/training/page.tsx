'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { getRecentTraining, type RecentTraining } from '@/lib/api/recent-training'
import { getTrainingContext, record, rows, strings, text, type TrainingContextData } from '@/lib/api/training-planning'
import { athleteDate } from '@/lib/training-planning/dates'
import { TrainingCard, trainingButton, human } from '@/components/TrainingContext'

function dateLabel(date: string) {
    // A date-only value is a calendar label, not midnight in the device timezone.
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))
}

export default function TrainingPage() {
    const [context, setContext] = useState<TrainingContextData | null>(null)

    const [activity, setActivity] = useState<RecentTraining | null>(null)
    const [loading, setLoading] = useState(true)
    const [activityLoading, setActivityLoading] = useState(true)
    const [error, setError] = useState(false)
    const [activityError, setActivityError] = useState(false)
    const [read, setRead] = useState(0)
    useEffect(() => {
        let cancelled = false
        getTrainingContext().then(data => { if (!cancelled) setContext(data) })
            .catch(() => { if (!cancelled) { setContext(null); setError(true) } })
            .finally(() => { if (!cancelled) setLoading(false) })

        getRecentTraining().then(data => { if (!cancelled) setActivity(data) })
            .catch(() => { if (!cancelled) { setActivity(null); setActivityError(true) } })
            .finally(() => { if (!cancelled) setActivityLoading(false) })
        return () => { cancelled = true }
    }, [read])
    function refresh() {
        setLoading(true); setActivityLoading(true); setError(false); setActivityError(false)
        setContext(null); setActivity(null); setRead(value => value + 1)
    }
    const direction = context?.direction
    const block = record(direction?.block)
    const profile = record(block.phase_profile)
    const macro = record(direction?.macro)
    const lifecycle = text(context?.authority.lifecycle)
    const expired = !!context && !!context.authority.authorized_through && text(context.authority.authorized_through) < context.today
    const notStarted = !!context && text(block.starts_on) > context.today
    const current = !!direction && lifecycle === 'active' && !expired && !notStarted
    const state = lifecycle === 'paused' ? 'Plan paused' : !current ? notStarted ? 'Phase not started yet' : 'Plan inactive' : 'Current phase'
    const count = context?.queue.qualifying_exposures
    const progressKnown = context?.evidence.complete === true && context.evidence.queue_history_complete === true && context.queue.confidence === 'resolved' && typeof count === 'number' && Number.isInteger(count) && count >= 0
    // Activation requires the parent to be the outgoing active revision. Follow
    // that link, never the revision list's order (which also contains proposals).
    const currentRevision = context?.recent_phases.find(phase => phase.id === context.authority.revision_id)
    const previous = context?.recent_phases.find(phase => phase.id === currentRevision?.parent_revision_id)
    const previousReview = rows(previous?.outcomes).filter(event => event.kind === 'review').at(-1)

    return <div className="max-w-2xl mx-auto py-6 space-y-5 break-words">
        <header className="flex items-start justify-between gap-3">
            <div><h1 className="text-2xl font-bold">Training</h1><p className="text-sm text-muted-foreground mt-1">Your training, at a glance.</p></div>
            <button className={trainingButton} onClick={refresh} disabled={loading || activityLoading}>Refresh</button>
        </header>
        <TrainingCard title="What we did">
            {activityLoading ? <p role="status" className="text-sm text-muted-foreground">Loading recent activity…</p> : <>
                {(activityError || activity?.unavailable) && <p role="alert" className="text-sm">Some recent activity could not be loaded. Try Refresh.</p>}
                {activity && <RecentActivity activity={activity} />}
            </>}
            {previous && context && !loading && <div className="border-t border-border pt-3 text-sm space-y-1">
                <p className="text-muted-foreground">Previous phase</p>
                <p className="font-medium">{text(record(record(previous.content).block).purpose, 'Previous saved phase')}</p>
                {text(record(previousReview?.payload).reason) && <p className="text-muted-foreground line-clamp-2">{text(record(previousReview?.payload).reason)}</p>}
            </div>}
            <Link href="/report/workout" className="inline-flex min-h-11 items-center text-sm text-primary underline">Workout history</Link>
        </TrainingCard>
        <TrainingCard title="Where we are" accent={current}>
            {loading ? <p role="status" className="text-sm text-muted-foreground">Loading your plan…</p> : error ? <p role="alert">Your plan is unavailable right now.</p> : direction ? <>
                <p className="text-xs font-medium text-primary">{state}</p>
                <h3 className="text-xl font-semibold">{text(block.purpose, 'Saved training phase')}</h3>
                <div className="text-sm space-y-1">
                    {strings(profile.emphases).length > 0 && <p>Focus: {strings(profile.emphases).slice(0, 3).map(human).join(' · ')}</p>}
                    {text(profile.split) && <p className="text-muted-foreground">{human(profile.split)} structure</p>}
                    {progressKnown && <p className="text-muted-foreground">{count} {count === 1 ? 'session' : 'sessions'} counted toward this phase.</p>}
                </div>
                {!current && <p className="text-sm text-muted-foreground">{notStarted ? 'This phase is saved for later.' : 'This saved phase is not guiding new sessions.'} Your logging stays available.</p>}
            </> : <p>No active plan is saved. Establish a plan with Dozer; your training will appear here.</p>}
        </TrainingCard>
        <TrainingCard title="Where we’re going">
            {loading ? <p role="status" className="text-sm text-muted-foreground">Loading what’s next…</p> : error ? <p className="text-sm text-muted-foreground">What’s next is unavailable until your plan can be loaded.</p> : <>
                {context && current ? <Upcoming context={context} /> : <p className="text-sm">No current session recommendation while the plan is inactive.</p>}
                {current && text(macro.intent) && <div className="text-sm space-y-1"><h3 className="font-medium">Longer-term direction</h3><p className="text-muted-foreground line-clamp-3">{text(macro.intent)}</p></div>}
                <p className="text-sm text-muted-foreground">No next phase is saved.</p>
                {(context?.proposals ?? []).slice(0, 1).map(proposal => <p key={text(proposal.id)} className="text-sm text-muted-foreground">Proposed, not active: {text(record(record(proposal.content).block).purpose, 'A change to your plan')}{context && context.proposals.length > 1 ? ' (and other proposals)' : ''}.</p>)}
            </>}
        </TrainingCard>
        <footer className="text-sm text-muted-foreground space-y-2">
            <p>Coaching and decisions happen with Dozer, outside Healthspan.</p>
            <div className="flex flex-wrap gap-x-5"><Link className="inline-flex min-h-11 items-center text-primary underline" href="/strength">Log strength</Link><Link className="inline-flex min-h-11 items-center text-primary underline" href="/cardio">Log cardio</Link></div>
        </footer>
    </div>
}

function RecentActivity({ activity }: { activity: RecentTraining }) {
    const dates = [...new Set([...activity.sets.map(set => athleteDate(new Date(set.logged_at))), ...activity.cardio.map(session => session.date)])].sort().reverse().slice(0, 5)
    return <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">Recent logged activity · {dateLabel(activity.from)}–{dateLabel(activity.through)} · up to 5 days shown</p>
        {activity.incomplete && <p className="text-muted-foreground">Partial view; counts below include only the records loaded.</p>}
        {!dates.length && !activity.incomplete && <p>No activity logged in the last 14 days.</p>}
        <ul className="space-y-3">{dates.map(date => {
            const sets = activity.sets.filter(set => athleteDate(new Date(set.logged_at)) === date)
            const cardio = activity.cardio.filter(session => session.date === date)
            const names = [...new Set(sets.map(set => set.exercises?.name || 'Exercise'))]
            return <li key={date} className="border-l-2 border-border pl-3 space-y-1">
                <p className="font-medium"><time dateTime={date}>{dateLabel(date)}</time></p>
                {sets.length > 0 && <><p>{sets.length} logged {sets.length === 1 ? 'set' : 'sets'}</p><p className="text-muted-foreground">{names.slice(0, 3).join(' · ')}{names.length > 3 ? ' · more exercises' : ''}</p></>}
                {cardio.slice(0, 3).map(session => <p key={session.id} className="text-muted-foreground">{session.exercises?.name || 'Cardio'} · {session.duration_minutes} min</p>)}
                {cardio.length > 3 && <p className="text-muted-foreground">More cardio records in your log.</p>}
            </li>
        })}</ul>
    </div>
}

function Upcoming({ context }: { context: TrainingContextData }) {
    const recommendation = context.recommended_today
    const sequence = rows(context.direction?.sequence)
    const primary = context.queue.confidence === 'resolved' ? sequence.find(slot => slot.key === context.queue.next_slot_key) : undefined
    const next = context.queue.confidence === 'resolved' ? sequence.find(slot => slot.key === context.queue.next_resistance_slot) : undefined
    const currentRecommendation = recommendation?.stale === false && recommendation.target_date === context.today
    const upcoming = context.sessions.filter(session => session.origin === 'prescribed' && !session.cancelled && session.planned_date > context.today && session.revision_id === context.authority.revision_id).sort((a, b) => a.planned_date.localeCompare(b.planned_date))[0]
    const strength = record(context.activity_eligibility.strength)
    return <div className="space-y-4 text-sm">
        <div className="space-y-1"><h3 className="font-medium">Today’s recorded recommendation</h3>
            {currentRecommendation ? <><p className="text-lg font-semibold capitalize">{human(recommendation.activity_kind)}</p><p className="text-muted-foreground line-clamp-2">{text(recommendation.reason)}</p></> : <p className="text-muted-foreground">No current recommendation is saved.</p>}
        </div>
        {primary && primary.activity_kind !== 'strength' && <div className="space-y-1"><h3 className="font-medium">Next in the sequence</h3><p>{text(primary.purpose, human(primary.activity_kind))} · not a recommendation for today</p></div>}
        {next ? <div className="space-y-1"><h3 className="font-medium">Next strength session</h3><p>{text(next.purpose, 'Strength')}</p><p className="text-muted-foreground">Sequence only — not today’s clearance.{strength.eligible === false ? ' Recovery or timing still needs checking with Dozer.' : ''}</p></div> : <p className="text-muted-foreground">No next strength session is confirmed.</p>}
        {upcoming && <div className="space-y-1"><h3 className="font-medium">Upcoming · {dateLabel(upcoming.planned_date)}</h3><p>{text(record(upcoming.snapshot.slot).purpose, human(upcoming.activity_kind))} · scheduled, not completed</p>{upcoming.workout_id && <Link className="inline-flex min-h-11 items-center text-primary underline" href={`/scheduled/${upcoming.planned_date}`}>View scheduled workout</Link>}</div>}
    </div>
}

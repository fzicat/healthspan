'use client'

import { useState } from 'react'
import { type TrainingContextData, type TrainingSession, type TrainingRecord } from '@/lib/api/training-planning'
import { ActionFeedback, trainingButton, trainingInput, useTrainingAction } from './TrainingContext'

// Linked writes are explicit, version-checked transactions, not direct CRUD.
export function TrainingLinkedEditor({ context, session, refresh, isOwner }: {
    context: TrainingContextData
    session: TrainingSession
    refresh: () => Promise<void>
    isOwner: boolean
}) {
    const action = useTrainingAction(context, refresh)
    const [operation, setOperation] = useState('update_workout_exercise')
    const [argsText, setArgsText] = useState('{}')
    const [reason, setReason] = useState('')
    const [revisit, setRevisit] = useState('')
    const [error, setError] = useState('')
    const blocked = !isOwner || action.busy || !!action.pending
    return <details className="mb-4 rounded-lg border border-border p-3">
        <summary className="min-h-11 py-2 cursor-pointer font-medium">Manage linked intent</summary>
        <p className="text-sm text-muted-foreground">Original intent stays immutable. Ordinary edit, reorder, replacement and deletion are blocked for linked workouts. An accepted deviation records its reason and revisit date; cancellation retains all history and does not erase the workout.</p>
        <form className="space-y-3 mt-3" onSubmit={event => {
            event.preventDefault()
            try {
                const args: TrainingRecord = JSON.parse(argsText)
                if (!args || Array.isArray(args) || typeof args !== 'object') throw new Error('Arguments must be a JSON object.')
                setError('')
                void action.run('mutate_training_workout', {
                    operation, mode: 'linked', args: {
                        ...args,
                        ...(operation === 'create_or_update_workout' || operation === 'add_workout_exercise' ? { date: session.planned_date } : {}),
                    }, reason, revisit_on: revisit,
                })
            } catch (err) { setError(err instanceof Error ? err.message : 'Invalid arguments') }
        }}>
            <label className="block text-sm">Operation<select className={trainingInput} value={operation} onChange={event => setOperation(event.target.value)}>
                <option value="create_or_update_workout">Change name / note</option>
                <option value="add_workout_exercise">Add exercise</option>
                <option value="update_workout_exercise">Change exercise details / note</option>
                <option value="remove_workout_exercise">Remove exercise</option>
            </select></label>
            <label className="block text-sm">Exact operation arguments (JSON)<textarea className={`${trainingInput} font-mono text-xs`} rows={4} value={argsText} onChange={event => setArgsText(event.target.value)} /></label>
            <p className="text-xs text-muted-foreground">Name/note: name, note. Add: exercise_id, details, note. The session date is included only for these two operations. Update/remove: workout_exercise_id, without date; update may include details, note. The server resolves the owning workout and checks the resulting prescription.</p>
            <label className="block text-sm">Reason<input required className={trainingInput} value={reason} onChange={event => setReason(event.target.value)} /></label>
            <label className="block text-sm">Revisit on<input required type="date" className={trainingInput} value={revisit} onChange={event => setRevisit(event.target.value)} /></label>
            <button className={`${trainingButton} w-full`} disabled={blocked}>Record accepted linked deviation</button>
        </form>
        <button type="button" className={`${trainingButton} w-full mt-3`} disabled={blocked || !reason.trim()} onClick={() => {
            if (window.confirm('Cancel this linked intent while retaining its frozen history and workout?')) void action.run('record_training_decision', { kind: 'cancel_session', session_id: session.id, reason })
        }}>Cancel intent — preserve history</button>
        {error && <p role="alert">{error}</p>}
        <ActionFeedback action={action} />
    </details>
}

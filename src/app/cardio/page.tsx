'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    getCardioTypes,
    getCardioSessionsForDate,
    createCardioSession,
    updateCardioSession,
    deleteCardioSession,
} from '@/lib/api/cardio'
import { getTodayDate } from '@/lib/api/daily-logs'
import { useToast } from '@/contexts/ToastContext'
import { CardioSessionWithExercise, Exercise } from '@/types/database'

type FormState = {
    exerciseId: string
    durationMinutes: string
    heartRateAvg: string
    heartRateMax: string
    perceivedIntensity: string
}

const EMPTY_FORM: FormState = {
    exerciseId: '',
    durationMinutes: '',
    heartRateAvg: '',
    heartRateMax: '',
    perceivedIntensity: '',
}

function parseInt10(s: string): number | null {
    const trimmed = s.trim()
    if (trimmed === '') return null
    const n = Number(trimmed)
    return Number.isFinite(n) ? Math.round(n) : null
}

function shiftDate(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() + days)
    const year = dt.getFullYear()
    const month = String(dt.getMonth() + 1).padStart(2, '0')
    const day = String(dt.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export default function CardioPage() {
    const [date, setDate] = useState(getTodayDate())
    const [cardioTypes, setCardioTypes] = useState<Exercise[]>([])
    const [sessions, setSessions] = useState<CardioSessionWithExercise[]>([])
    const [form, setForm] = useState<FormState>(EMPTY_FORM)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)
    const { showToast } = useToast()

    const loadTypes = useCallback(async () => {
        try {
            const types = await getCardioTypes()
            setCardioTypes(types)
            setForm(prev => prev.exerciseId === '' && types.length > 0
                ? { ...prev, exerciseId: String(types[0].id) }
                : prev)
        } catch {
            showToast('Failed to load cardio types', 'error')
        }
    }, [showToast])

    const loadSessions = useCallback(async () => {
        setIsLoading(true)
        try {
            const data = await getCardioSessionsForDate(date)
            setSessions(data)
        } catch {
            showToast('Failed to load sessions', 'error')
        } finally {
            setIsLoading(false)
        }
    }, [date, showToast])

    useEffect(() => {
        loadTypes()
    }, [loadTypes])

    useEffect(() => {
        loadSessions()
    }, [loadSessions])

    const confirmPastDate = (): boolean => {
        if (date < getTodayDate()) {
            return window.confirm('You are about to change past data. Are you certain?')
        }
        return true
    }

    const handleAdd = async () => {
        if (!form.exerciseId) {
            showToast('Pick a cardio type', 'error')
            return
        }
        const duration = parseInt10(form.durationMinutes)
        if (duration === null || duration <= 0) {
            showToast('Duration is required', 'error')
            return
        }
        if (!confirmPastDate()) return

        setIsSaving(true)
        try {
            await createCardioSession({
                exercise_id: Number(form.exerciseId),
                date,
                duration_minutes: duration,
                heart_rate_avg: parseInt10(form.heartRateAvg),
                heart_rate_max: parseInt10(form.heartRateMax),
                perceived_intensity: parseInt10(form.perceivedIntensity),
            })
            setForm(prev => ({
                ...EMPTY_FORM,
                exerciseId: prev.exerciseId,
            }))
            showToast('Session added', 'success')
            await loadSessions()
        } catch {
            showToast('Failed to add session', 'error')
        } finally {
            setIsSaving(false)
        }
    }

    const startEdit = (session: CardioSessionWithExercise) => {
        setEditingId(session.id)
        setEditForm({
            exerciseId: String(session.exercise_id),
            durationMinutes: String(session.duration_minutes),
            heartRateAvg: session.heart_rate_avg !== null ? String(session.heart_rate_avg) : '',
            heartRateMax: session.heart_rate_max !== null ? String(session.heart_rate_max) : '',
            perceivedIntensity: session.perceived_intensity !== null ? String(session.perceived_intensity) : '',
        })
    }

    const cancelEdit = () => {
        setEditingId(null)
        setEditForm(EMPTY_FORM)
    }

    const saveEdit = async () => {
        if (editingId === null) return
        const duration = parseInt10(editForm.durationMinutes)
        if (duration === null || duration <= 0) {
            showToast('Duration is required', 'error')
            return
        }
        if (!confirmPastDate()) return

        setIsSaving(true)
        try {
            await updateCardioSession(editingId, {
                exercise_id: Number(editForm.exerciseId),
                duration_minutes: duration,
                heart_rate_avg: parseInt10(editForm.heartRateAvg),
                heart_rate_max: parseInt10(editForm.heartRateMax),
                perceived_intensity: parseInt10(editForm.perceivedIntensity),
            })
            cancelEdit()
            showToast('Session updated', 'success')
            await loadSessions()
        } catch {
            showToast('Failed to update session', 'error')
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async (id: number) => {
        if (!window.confirm('Delete this cardio session?')) return
        try {
            await deleteCardioSession(id)
            showToast('Session deleted', 'info')
            await loadSessions()
        } catch {
            showToast('Failed to delete session', 'error')
        }
    }

    const handleField = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setForm(prev => ({ ...prev, [key]: e.target.value }))
    }

    const handleEditField = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        setEditForm(prev => ({ ...prev, [key]: e.target.value }))
    }

    return (
        <div className="max-w-md mx-auto py-6">
            <h1 className="text-2xl font-bold mb-6">Cardio</h1>

            <div className="bg-card rounded-xl p-4 border border-border mb-4">
                <label className="block text-sm font-medium mb-2" htmlFor="date">Date</label>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setDate(shiftDate(date, -1))}
                        className="p-2 rounded-lg hover:bg-muted transition-colors"
                        style={{ color: 'var(--orange)' }}
                        aria-label="Previous day"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                    </button>
                    <input
                        id="date"
                        type="date"
                        value={date}
                        onChange={e => setDate(e.target.value)}
                        className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-base"
                    />
                    <button
                        type="button"
                        onClick={() => setDate(shiftDate(date, 1))}
                        className="p-2 rounded-lg hover:bg-muted transition-colors"
                        style={{ color: 'var(--orange)' }}
                        aria-label="Next day"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="9 6 15 12 9 18" />
                        </svg>
                    </button>
                </div>
            </div>

            <fieldset disabled={isSaving} className="space-y-4 mb-6">
                <div className="bg-card rounded-xl p-4 border border-border">
                    <label className="block text-sm font-medium mb-2" htmlFor="cardio-type">Type</label>
                    <select
                        id="cardio-type"
                        value={form.exerciseId}
                        onChange={handleField('exerciseId')}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-base"
                    >
                        {cardioTypes.length === 0 && <option value="">No cardio types — add one in Library</option>}
                        {cardioTypes.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                    </select>
                </div>

                <NumberField
                    label="Duration"
                    suffix="min"
                    value={form.durationMinutes}
                    onChange={handleField('durationMinutes')}
                    min={1}
                />
                <NumberField
                    label="Avg heart rate"
                    suffix="bpm"
                    value={form.heartRateAvg}
                    onChange={handleField('heartRateAvg')}
                    min={30}
                    max={250}
                />
                <NumberField
                    label="Max heart rate"
                    suffix="bpm"
                    value={form.heartRateMax}
                    onChange={handleField('heartRateMax')}
                    min={30}
                    max={250}
                />
                <NumberField
                    label="Perceived intensity (RPE)"
                    suffix="/ 10"
                    value={form.perceivedIntensity}
                    onChange={handleField('perceivedIntensity')}
                    min={1}
                    max={10}
                />

                <button
                    type="button"
                    onClick={handleAdd}
                    disabled={isSaving}
                    className="w-full bg-primary text-background font-medium rounded-xl py-3 disabled:opacity-50"
                >
                    {isSaving ? 'Saving…' : 'Add session'}
                </button>
            </fieldset>

            <h2 className="text-lg font-semibold mb-3">Sessions</h2>
            {isLoading ? (
                <div className="flex justify-center py-6">
                    <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
                </div>
            ) : sessions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No sessions logged for this day.</p>
            ) : (
                <ul className="space-y-3">
                    {sessions.map(session => (
                        <li key={session.id} className="bg-card rounded-xl p-4 border border-border">
                            {editingId === session.id ? (
                                <div className="space-y-3">
                                    <select
                                        value={editForm.exerciseId}
                                        onChange={handleEditField('exerciseId')}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-base"
                                    >
                                        {cardioTypes.map(t => (
                                            <option key={t.id} value={t.id}>{t.name}</option>
                                        ))}
                                    </select>
                                    <NumberField
                                        label="Duration"
                                        suffix="min"
                                        value={editForm.durationMinutes}
                                        onChange={handleEditField('durationMinutes')}
                                        min={1}
                                    />
                                    <NumberField
                                        label="Avg HR"
                                        suffix="bpm"
                                        value={editForm.heartRateAvg}
                                        onChange={handleEditField('heartRateAvg')}
                                        min={30}
                                        max={250}
                                    />
                                    <NumberField
                                        label="Max HR"
                                        suffix="bpm"
                                        value={editForm.heartRateMax}
                                        onChange={handleEditField('heartRateMax')}
                                        min={30}
                                        max={250}
                                    />
                                    <NumberField
                                        label="RPE"
                                        suffix="/ 10"
                                        value={editForm.perceivedIntensity}
                                        onChange={handleEditField('perceivedIntensity')}
                                        min={1}
                                        max={10}
                                    />
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={cancelEdit}
                                            className="flex-1 py-2 rounded-lg border border-border"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={saveEdit}
                                            disabled={isSaving}
                                            className="flex-1 py-2 rounded-lg bg-primary text-background font-medium disabled:opacity-50"
                                        >
                                            {isSaving ? 'Saving…' : 'Save'}
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="font-medium">{session.exercises?.name ?? 'Cardio'}</h3>
                                        <p className="text-sm text-muted-foreground">
                                            {session.duration_minutes} min
                                            {session.heart_rate_avg !== null && ` • avg ${session.heart_rate_avg}`}
                                            {session.heart_rate_max !== null && ` • max ${session.heart_rate_max}`}
                                            {session.perceived_intensity !== null && ` • RPE ${session.perceived_intensity}`}
                                        </p>
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <button
                                            type="button"
                                            onClick={() => startEdit(session)}
                                            className="p-2 rounded-lg hover:bg-muted transition-colors"
                                            aria-label="Edit session"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                            </svg>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => handleDelete(session.id)}
                                            className="p-2 rounded-lg hover:bg-muted transition-colors"
                                            aria-label="Delete session"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    )
}

function NumberField({
    label,
    suffix,
    value,
    onChange,
    min,
    max,
    step,
}: {
    label: string
    suffix?: string
    value: string
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
    min?: number
    max?: number
    step?: string
}) {
    return (
        <div className="bg-card rounded-xl p-4 border border-border">
            <label className="block text-sm font-medium mb-2">{label}</label>
            <div className="flex gap-2 items-center">
                <input
                    type="number"
                    inputMode="decimal"
                    value={value}
                    onChange={onChange}
                    min={min}
                    max={max}
                    step={step}
                    className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-base"
                />
                {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
            </div>
        </div>
    )
}

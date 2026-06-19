'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    getBreathworkSessionsForDate,
    createBreathworkSession,
    updateBreathworkSession,
    deleteBreathworkSession,
} from '@/lib/api/breathwork'
import { getTodayDate } from '@/lib/api/daily-logs'
import { useToast } from '@/contexts/ToastContext'
import { BreathworkSession, BREATHWORK_TYPES } from '@/types/database'

type FormState = {
    time: string
    durationMinutes: string
    sauna: boolean
    type: string
    heartRateEnd: string
    comments: string
}

const EMPTY_FORM: FormState = {
    time: '',
    durationMinutes: '',
    sauna: false,
    type: BREATHWORK_TYPES[0],
    heartRateEnd: '',
    comments: '',
}

function getCurrentTime(): string {
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
}

// A fresh form for logging a new session, pre-filled with the current time.
function newSessionForm(): FormState {
    return { ...EMPTY_FORM, time: getCurrentTime() }
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

function formatTime(value: string | null): string {
    if (!value) return ''
    // Supabase returns HH:MM:SS — trim to HH:MM for display
    return value.slice(0, 5)
}

export default function BreathworkPage() {
    const [date, setDate] = useState(getTodayDate())
    const [sessions, setSessions] = useState<BreathworkSession[]>([])
    const [form, setForm] = useState<FormState>(newSessionForm)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [editingId, setEditingId] = useState<number | null>(null)
    const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM)
    const { showToast } = useToast()

    const loadSessions = useCallback(async () => {
        setIsLoading(true)
        try {
            const data = await getBreathworkSessionsForDate(date)
            setSessions(data)
        } catch {
            showToast('Failed to load sessions', 'error')
        } finally {
            setIsLoading(false)
        }
    }, [date, showToast])

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
        const duration = parseInt10(form.durationMinutes)
        if (duration === null || duration <= 0) {
            showToast('Duration is required', 'error')
            return
        }
        if (!confirmPastDate()) return

        setIsSaving(true)
        try {
            await createBreathworkSession({
                date,
                time: form.time.trim() === '' ? null : form.time,
                duration_minutes: duration,
                sauna: form.sauna,
                type: form.type,
                heart_rate_end: parseInt10(form.heartRateEnd),
                comments: form.comments.trim() === '' ? null : form.comments.trim(),
            })
            setForm(newSessionForm())
            showToast('Session added', 'success')
            await loadSessions()
        } catch {
            showToast('Failed to add session', 'error')
        } finally {
            setIsSaving(false)
        }
    }

    const startEdit = (session: BreathworkSession) => {
        setEditingId(session.id)
        setEditForm({
            time: formatTime(session.time),
            durationMinutes: String(session.duration_minutes),
            sauna: session.sauna,
            type: session.type,
            heartRateEnd: session.heart_rate_end === null ? '' : String(session.heart_rate_end),
            comments: session.comments ?? '',
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
            await updateBreathworkSession(editingId, {
                time: editForm.time.trim() === '' ? null : editForm.time,
                duration_minutes: duration,
                sauna: editForm.sauna,
                type: editForm.type,
                heart_rate_end: parseInt10(editForm.heartRateEnd),
                comments: editForm.comments.trim() === '' ? null : editForm.comments.trim(),
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
        if (!window.confirm('Delete this breathwork session?')) return
        try {
            await deleteBreathworkSession(id)
            showToast('Session deleted', 'info')
            await loadSessions()
        } catch {
            showToast('Failed to delete session', 'error')
        }
    }

    return (
        <div className="max-w-md mx-auto py-6">
            <h1 className="text-2xl font-bold mb-6">Breathwork</h1>

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
                    <label className="block text-sm font-medium mb-2" htmlFor="bw-type">Type</label>
                    <select
                        id="bw-type"
                        value={form.type}
                        onChange={e => setForm(prev => ({ ...prev, type: e.target.value }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-base"
                    >
                        {BREATHWORK_TYPES.map(t => (
                            <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>

                <NumberField
                    label="Duration"
                    suffix="min"
                    value={form.durationMinutes}
                    onChange={e => setForm(prev => ({ ...prev, durationMinutes: e.target.value }))}
                    min={1}
                />

                <div className="bg-card rounded-xl p-4 border border-border">
                    <label className="flex items-center gap-3 text-sm font-medium cursor-pointer">
                        <input
                            type="checkbox"
                            checked={form.sauna}
                            onChange={e => setForm(prev => ({ ...prev, sauna: e.target.checked }))}
                            className="w-5 h-5 accent-[var(--primary)]"
                        />
                        Sauna
                    </label>
                </div>

                <NumberField
                    label="Heart rate (end of session)"
                    suffix="bpm"
                    value={form.heartRateEnd}
                    onChange={e => setForm(prev => ({ ...prev, heartRateEnd: e.target.value }))}
                    min={30}
                    max={250}
                />

                <div className="bg-card rounded-xl p-4 border border-border">
                    <label className="block text-sm font-medium mb-2" htmlFor="bw-time">Time</label>
                    <input
                        id="bw-time"
                        type="time"
                        value={form.time}
                        onChange={e => setForm(prev => ({ ...prev, time: e.target.value }))}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-base"
                    />
                </div>

                <div className="bg-card rounded-xl p-4 border border-border">
                    <label className="block text-sm font-medium mb-2" htmlFor="bw-comments">Comments</label>
                    <textarea
                        id="bw-comments"
                        value={form.comments}
                        onChange={e => setForm(prev => ({ ...prev, comments: e.target.value }))}
                        rows={3}
                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-base resize-y"
                    />
                </div>

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
                                        value={editForm.type}
                                        onChange={e => setEditForm(prev => ({ ...prev, type: e.target.value }))}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-base"
                                    >
                                        {BREATHWORK_TYPES.map(t => (
                                            <option key={t} value={t}>{t}</option>
                                        ))}
                                    </select>
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Time</label>
                                        <input
                                            type="time"
                                            value={editForm.time}
                                            onChange={e => setEditForm(prev => ({ ...prev, time: e.target.value }))}
                                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-base"
                                        />
                                    </div>
                                    <NumberField
                                        label="Duration"
                                        suffix="min"
                                        value={editForm.durationMinutes}
                                        onChange={e => setEditForm(prev => ({ ...prev, durationMinutes: e.target.value }))}
                                        min={1}
                                    />
                                    <label className="flex items-center gap-3 text-sm font-medium cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={editForm.sauna}
                                            onChange={e => setEditForm(prev => ({ ...prev, sauna: e.target.checked }))}
                                            className="w-5 h-5 accent-[var(--primary)]"
                                        />
                                        Sauna
                                    </label>
                                    <NumberField
                                        label="Heart rate (end of session)"
                                        suffix="bpm"
                                        value={editForm.heartRateEnd}
                                        onChange={e => setEditForm(prev => ({ ...prev, heartRateEnd: e.target.value }))}
                                        min={30}
                                        max={250}
                                    />
                                    <div>
                                        <label className="block text-sm font-medium mb-2">Comments</label>
                                        <textarea
                                            value={editForm.comments}
                                            onChange={e => setEditForm(prev => ({ ...prev, comments: e.target.value }))}
                                            rows={3}
                                            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-base resize-y"
                                        />
                                    </div>
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
                                        <h3 className="font-medium">{session.type}</h3>
                                        <p className="text-sm text-muted-foreground">
                                            {session.duration_minutes} min
                                            {session.time && ` • ${formatTime(session.time)}`}
                                            {session.sauna && ' • sauna'}
                                            {session.heart_rate_end !== null && ` • ${session.heart_rate_end} bpm`}
                                        </p>
                                        {session.comments && (
                                            <p className="text-sm mt-2 whitespace-pre-wrap">{session.comments}</p>
                                        )}
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

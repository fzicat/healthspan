'use client'

import { useState, useEffect, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Exercise, Set } from '@/types/database'
import { getExercise } from '@/lib/api/exercises'
import { getExerciseDetailsForDate, getAdjacentExercises } from '@/lib/api/workouts'
import {
    getSetsForExercise,
    getLastSetForExercise,
    createSet,
    updateSet,
    deleteSet
} from '@/lib/api/sets'
import { useToast } from '@/contexts/ToastContext'

interface PageProps {
    params: Promise<{ id: string }>
}

export default function ExercisePage({ params }: PageProps) {
    const { id } = use(params)
    const exerciseId = parseInt(id, 10)
    const router = useRouter()
    const { showToast } = useToast()

    const [exercise, setExercise] = useState<Exercise | null>(null)
    const [sets, setSets] = useState<Set[]>([])
    const [hasMore, setHasMore] = useState(false)
    const [page, setPage] = useState(1)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [showStopwatch, setShowStopwatch] = useState(false)
    const [editingSet, setEditingSet] = useState<Set | null>(null)
    const [exerciseDetails, setExerciseDetails] = useState<string | null>(null)
    const [adjacentExercises, setAdjacentExercises] = useState<{
        prev: { id: number; name: string } | null
        next: { id: number; name: string } | null
    }>({ prev: null, next: null })

    // Form state
    const [weight, setWeight] = useState<string>('')
    const [reps, setReps] = useState<string>('')
    const [time, setTime] = useState<string>('')
    const [distance, setDistance] = useState<string>('')
    const [rir, setRir] = useState<string>('')

    const loadExercise = useCallback(async () => {
        try {
            const data = await getExercise(exerciseId)
            if (!data) {
                showToast('Exercise not found', 'error')
                router.push('/')
                return
            }
            setExercise(data)

            // Pre-fill from last set
            const lastSet = await getLastSetForExercise(exerciseId)
            if (lastSet) {
                if (lastSet.weight !== null) setWeight(lastSet.weight.toString())
                if (lastSet.reps !== null) setReps(lastSet.reps.toString())
                if (lastSet.time !== null) setTime(lastSet.time.toString())
                if (lastSet.distance !== null) setDistance(lastSet.distance.toString())
                if (lastSet.rir !== null) setRir(lastSet.rir.toString())
            }

            // Load history
            const { sets: setsData, hasMore: more } = await getSetsForExercise(exerciseId, 1)
            setSets(setsData)
            setHasMore(more)

            // Load today's details from workout
            const today = new Date()
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
            const details = await getExerciseDetailsForDate(exerciseId, todayStr)
            setExerciseDetails(details)

            // Load adjacent exercises in today's workout
            const adjacent = await getAdjacentExercises(exerciseId, todayStr)
            setAdjacentExercises(adjacent)
        } catch {
            showToast('Failed to load exercise', 'error')
        } finally {
            setIsLoading(false)
        }
    }, [exerciseId, router, showToast])

    useEffect(() => {
        loadExercise()
    }, [loadExercise])

    const loadMoreSets = async () => {
        const nextPage = page + 1
        const { sets: moreSets, hasMore: more } = await getSetsForExercise(exerciseId, nextPage)
        setSets(prev => [...prev, ...moreSets])
        setHasMore(more)
        setPage(nextPage)
    }

    const handleSave = async () => {
        if (!exercise) return

        setIsSaving(true)
        try {
            const values = {
                weight: weight ? parseInt(weight, 10) : null,
                reps: reps ? parseInt(reps, 10) : null,
                time: time ? parseInt(time, 10) : null,
                distance: distance ? parseInt(distance, 10) : null,
                rir: rir ? parseInt(rir, 10) : null,
            }

            if (editingSet) {
                await updateSet(editingSet.id, values)
                setEditingSet(null)
                showToast('Set updated!', 'success')
            } else {
                await createSet(exerciseId, values)
                showToast('Set saved! 💪', 'success')
            }

            // Refresh history
            const { sets: setsData, hasMore: more } = await getSetsForExercise(exerciseId, 1)
            setSets(setsData)
            setHasMore(more)
            setPage(1)
        } catch {
            showToast('Failed to save set', 'error', {
                label: 'Retry',
                onClick: handleSave
            })
        } finally {
            setIsSaving(false)
        }
    }

    const handleEdit = (set: Set) => {
        setEditingSet(set)
        if (set.weight !== null) setWeight(set.weight.toString())
        else setWeight('')
        if (set.reps !== null) setReps(set.reps.toString())
        else setReps('')
        if (set.time !== null) setTime(set.time.toString())
        else setTime('')
        if (set.distance !== null) setDistance(set.distance.toString())
        else setDistance('')
        if (set.rir !== null) setRir(set.rir.toString())
        else setRir('')
    }

    const handleCancelEdit = () => {
        setEditingSet(null)
        // Restore from last set
        const lastSet = sets[0]
        if (lastSet) {
            if (lastSet.weight !== null) setWeight(lastSet.weight.toString())
            if (lastSet.reps !== null) setReps(lastSet.reps.toString())
            if (lastSet.time !== null) setTime(lastSet.time.toString())
            if (lastSet.distance !== null) setDistance(lastSet.distance.toString())
            if (lastSet.rir !== null) setRir(lastSet.rir.toString())
        }
    }

    const handleDelete = async (setId: number) => {
        try {
            await deleteSet(setId)
            setSets(prev => prev.filter(s => s.id !== setId))
            showToast('Set deleted', 'info')
        } catch {
            showToast('Failed to delete set', 'error')
        }
    }

    if (isLoading) {
        return (
            <div className="max-w-md mx-auto py-6 flex justify-center">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
        )
    }

    if (!exercise) {
        return null
    }

    const metrics = exercise.metrics

    return (
        <div className="max-w-md mx-auto py-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-2">
                <button
                    onClick={() => router.back()}
                    className="p-2 -ml-2 rounded-lg hover:bg-muted transition-colors"
                    aria-label="Go back"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
                <h1 className="text-2xl font-bold">{exercise.name}</h1>
            </div>

            {/* Exercise Details for today */}
            {exerciseDetails && (
                <p className="text-sm text-muted-foreground ml-10 -mt-1 mb-1">{exerciseDetails}</p>
            )}

            {/* Prev/Next Exercise Navigation */}
            {(adjacentExercises.prev || adjacentExercises.next) && (
                <div className="flex items-center justify-between mb-3 px-1">
                    {adjacentExercises.prev ? (
                        <Link
                            href={`/exercise/${adjacentExercises.prev.id}`}
                            className="flex items-center gap-1.5 text-sm font-medium transition-colors rounded-md px-2 py-1"
                            style={{ color: 'var(--orange)' }}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="15 18 9 12 15 6" />
                            </svg>
                            <span className="truncate max-w-[120px]">{adjacentExercises.prev.name}</span>
                        </Link>
                    ) : (
                        <span />
                    )}
                    {adjacentExercises.next ? (
                        <Link
                            href={`/exercise/${adjacentExercises.next.id}`}
                            className="flex items-center gap-1.5 text-sm font-medium transition-colors rounded-md px-2 py-1"
                            style={{ color: 'var(--orange)' }}
                        >
                            <span className="truncate max-w-[120px]">{adjacentExercises.next.name}</span>
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="9 6 15 12 9 18" />
                            </svg>
                        </Link>
                    ) : (
                        <span />
                    )}
                </div>
            )}

            {/* Input Form */}
            <div className="bg-card rounded-xl p-3 border border-border mb-4">
                {editingSet && (
                    <div className="flex items-center justify-between mb-2 pb-2 border-b border-border">
                        <span className="text-sm text-muted-foreground">Editing set</span>
                        <button
                            onClick={handleCancelEdit}
                            className="text-sm font-medium px-3 py-1 rounded-md text-background hover:opacity-90 transition-opacity"
                            style={{ backgroundColor: 'var(--destructive)' }}
                        >
                            Cancel
                        </button>
                    </div>
                )}

                <div className="space-y-2.5">
                    {metrics.weight && (
                        <div className="flex items-center gap-3">
                            <label htmlFor="weight" className="text-sm font-medium whitespace-nowrap" style={{ minWidth: '110px' }}>
                                Weight (lbs)
                            </label>
                            <div className="relative flex-1">
                                <input
                                    id="weight"
                                    type="number"
                                    inputMode="numeric"
                                    value={weight}
                                    onChange={(e) => setWeight(e.target.value)}
                                    className={`w-full px-3 py-2 rounded-lg bg-muted border border-border
                             text-foreground text-base
                             focus:outline-none focus:ring-2 focus:ring-primary${metrics.dual_implements ? ' pr-9' : ''}`}
                                    placeholder="0"
                                />
                                {metrics.dual_implements && (
                                    <span
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-help"
                                        title="Log per weight"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d3869b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="8" cy="12" r="3" />
                                            <circle cx="16" cy="12" r="3" />
                                            <line x1="11" y1="12" x2="13" y2="12" />
                                        </svg>
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {metrics.reps && (
                        <div className="flex items-center gap-3">
                            <label htmlFor="reps" className="text-sm font-medium whitespace-nowrap" style={{ minWidth: '110px' }}>
                                Reps
                            </label>
                            <div className="relative flex-1">
                                <input
                                    id="reps"
                                    type="number"
                                    inputMode="numeric"
                                    value={reps}
                                    onChange={(e) => setReps(e.target.value)}
                                    className={`w-full px-3 py-2 rounded-lg bg-muted border border-border
                             text-foreground text-base
                             focus:outline-none focus:ring-2 focus:ring-primary${metrics.unilateral ? ' pr-9' : ''}`}
                                    placeholder="0"
                                />
                                {metrics.unilateral && (
                                    <span
                                        className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-help"
                                        title="Log per side"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#83a598" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M17 18a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2" />
                                            <rect x="3" y="4" width="18" height="18" rx="2" />
                                            <circle cx="12" cy="10" r="2" />
                                            <line x1="8" y1="2" x2="8" y2="4" />
                                            <line x1="16" y1="2" x2="16" y2="4" />
                                        </svg>
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {metrics.time && (
                        <div className="flex items-center gap-3">
                            <label htmlFor="time" className="text-sm font-medium whitespace-nowrap" style={{ minWidth: '110px' }}>
                                Time (seconds)
                            </label>
                            <input
                                id="time"
                                type="number"
                                inputMode="numeric"
                                value={time}
                                onChange={(e) => setTime(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border
                         text-foreground text-base
                         focus:outline-none focus:ring-2 focus:ring-primary"
                                placeholder="0"
                            />
                        </div>
                    )}

                    {metrics.distance && (
                        <div className="flex items-center gap-3">
                            <label htmlFor="distance" className="text-sm font-medium whitespace-nowrap" style={{ minWidth: '110px' }}>
                                Distance (meters)
                            </label>
                            <input
                                id="distance"
                                type="number"
                                inputMode="numeric"
                                value={distance}
                                onChange={(e) => setDistance(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border
                         text-foreground text-base
                         focus:outline-none focus:ring-2 focus:ring-primary"
                                placeholder="0"
                            />
                        </div>
                    )}

                    {/* RIR is always available */}
                    <div className="flex items-center gap-3">
                        <label htmlFor="rir" className="text-sm font-medium whitespace-nowrap" style={{ minWidth: '110px' }}>
                            RIR (0-10)
                        </label>
                        <input
                            id="rir"
                            type="number"
                            inputMode="numeric"
                            value={rir}
                            onChange={(e) => setRir(e.target.value)}
                            min="0"
                            max="10"
                            className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border
                       text-foreground text-base
                       focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="0"
                        />
                    </div>

                    <div className="flex justify-center">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="py-2.5 px-6 rounded-lg text-foreground
                         font-semibold text-base
                         hover:opacity-90 transition-colors
                         disabled:opacity-50 disabled:cursor-not-allowed
                         active:scale-[0.98] transition-transform"
                            style={{ backgroundColor: 'var(--bg2)', border: '2px solid var(--orange)', color: 'var(--orange)' }}
                        >
                            {isSaving
                                ? 'Saving...'
                                : editingSet
                                    ? 'Update Set'
                                    : 'Save Set'
                            }
                        </button>
                    </div>
                </div>
            </div>

            {/* Set History */}
            <div>
                <h2 className="text-base font-semibold mb-2">History</h2>
                {sets.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">
                        No history yet
                    </p>
                ) : (
                    <>
                        {/* Grid header */}
                        <div
                            className="grid items-center px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border mb-0.5"
                            style={{ gridTemplateColumns: 'minmax(80px, auto) 1fr auto' }}
                        >
                            <span>Date</span>
                            <span>Metrics</span>
                            <span className="text-right">RIR</span>
                        </div>
                        <ul className="space-y-0.5">
                            {sets.map(set => {
                                const today = new Date().toLocaleDateString('en-CA')
                                const setDate = new Date(set.logged_at).toLocaleDateString('en-CA')
                                return (
                                    <SetHistoryItem
                                        key={set.id}
                                        set={set}
                                        metrics={metrics}
                                        isToday={setDate === today}
                                        onEdit={() => handleEdit(set)}
                                        onDelete={() => handleDelete(set.id)}
                                    />
                                )
                            })}
                        </ul>
                        {hasMore && (
                            <button
                                onClick={loadMoreSets}
                                className="w-full mt-4 py-3 text-primary hover:underline"
                            >
                                Load more
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* Stopwatch FAB */}
            <button
                onClick={() => setShowStopwatch(true)}
                className="fixed bottom-6 right-6 p-4 rounded-full shadow-lg transition-colors
                 active:scale-95 transition-transform z-30"
                style={{ backgroundColor: '#83a598', color: '#1d2021' }}
                aria-label="Open stopwatch"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            </button>

            {/* Stopwatch Modal */}
            {showStopwatch && (
                <StopwatchModal onClose={() => setShowStopwatch(false)} />
            )}
        </div>
    )
}

interface SetHistoryItemProps {
    set: Set
    metrics: Exercise['metrics']
    isToday: boolean
    onEdit: () => void
    onDelete: () => void
}

function SetHistoryItem({ set, metrics, isToday, onEdit, onDelete }: SetHistoryItemProps) {
    const [showActions, setShowActions] = useState(false)
    const [startX, setStartX] = useState(0)
    const [offsetX, setOffsetX] = useState(0)

    const handleTouchStart = (e: React.TouchEvent) => {
        setStartX(e.touches[0].clientX)
    }

    const handleTouchMove = (e: React.TouchEvent) => {
        const diff = startX - e.touches[0].clientX
        if (diff > 0) {
            setOffsetX(Math.min(diff, 80))
        }
    }

    const handleTouchEnd = () => {
        if (offsetX > 40) {
            setShowActions(true)
            setOffsetX(80)
        } else {
            setShowActions(false)
            setOffsetX(0)
        }
    }

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
        })
    }

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr)
        return date.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
        })
    }

    const buildMetricsParts = () => {
        const parts: string[] = []
        if (metrics.weight && set.weight !== null) parts.push(`${set.weight} lbs`)
        if (metrics.reps && set.reps !== null) parts.push(`${set.reps} reps`)
        if (metrics.time && set.time !== null) parts.push(`${set.time}s`)
        if (metrics.distance && set.distance !== null) parts.push(`${set.distance}m`)
        return parts.join(' · ')
    }

    return (
        <li className="relative overflow-hidden rounded-lg">
            {/* Delete action background */}
            <div
                className="absolute inset-y-0 right-0 w-20 bg-destructive flex items-center justify-center"
                style={{ opacity: showActions ? 1 : offsetX / 80 }}
            >
                <button
                    onClick={onDelete}
                    className="p-2"
                    aria-label="Delete set"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-background">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                </button>
            </div>

            {/* Main content - grid row */}
            <div
                className="relative grid items-center px-2 py-1.5 border-b border-border/50 transition-transform cursor-pointer"
                style={{
                    gridTemplateColumns: 'minmax(80px, auto) 1fr auto',
                    transform: `translateX(-${offsetX}px)`,
                    backgroundColor: isToday ? 'rgba(254, 128, 25, 0.10)' : 'transparent',
                }}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                onClick={() => {
                    if (!showActions) onEdit()
                    else {
                        setShowActions(false)
                        setOffsetX(0)
                    }
                }}
            >
                {/* Date column */}
                <div className="pr-3">
                    <p className="text-sm font-medium">{formatDate(set.logged_at)}</p>
                    <p className="text-xs text-muted-foreground">{formatTime(set.logged_at)}</p>
                </div>

                {/* Metrics column */}
                <p className="text-sm font-medium truncate">{buildMetricsParts()}</p>

                {/* RIR column */}
                <span className="text-sm text-muted-foreground text-right pl-3 tabular-nums">
                    {set.rir !== null ? set.rir : '—'}
                </span>
            </div>
        </li>
    )
}

interface StopwatchModalProps {
    onClose: () => void
}

function StopwatchModal({ onClose }: StopwatchModalProps) {
    const [seconds, setSeconds] = useState(0)

    // Auto-start the timer when modal opens
    useEffect(() => {
        const interval = setInterval(() => {
            setSeconds(s => s + 1)
        }, 1000)
        return () => clearInterval(interval)
    }, [])

    const formatTime = (totalSeconds: number) => {
        const mins = Math.floor(totalSeconds / 60)
        const secs = totalSeconds % 60
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-card rounded-xl p-6 w-full max-w-xs border border-border shadow-xl text-center">
                <h2 className="text-lg font-semibold mb-4">Rest Timer</h2>

                <div className="text-5xl font-mono font-bold text-primary mb-6">
                    {formatTime(seconds)}
                </div>

                <button
                    onClick={onClose}
                    className="w-full py-3 px-4 rounded-lg font-semibold transition-colors"
                    style={{ backgroundColor: '#83a598', color: '#1d2021' }}
                >
                    Close
                </button>
            </div>
        </div>
    )
}

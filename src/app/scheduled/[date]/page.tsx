'use client'

import { useState, useEffect, useCallback, useRef, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { WorkoutExerciseWithExercise, Exercise } from '@/types/database'
import {
    getWorkoutForDate,
    getOrCreateWorkout,
    updateWorkout,
    addExerciseToWorkout,
    removeExerciseFromWorkout,
    updateWorkoutExerciseDetails,
    reorderWorkoutExercises,
    deleteWorkout,
    copyWorkout
} from '@/lib/api/workouts'
import { searchExercises } from '@/lib/api/exercises'
import { useToast } from '@/contexts/ToastContext'

interface PageProps {
    params: Promise<{ date: string }>
}

function formatDateDisplay(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00')
    const options: Intl.DateTimeFormatOptions = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    }
    return date.toLocaleDateString('en-US', options)
}

function getTodayDate(): string {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export default function WorkoutEditorPage({ params }: PageProps) {
    const { date } = use(params)
    const router = useRouter()
    const { showToast } = useToast()

    const [workoutId, setWorkoutId] = useState<number | null>(null)
    const [exercises, setExercises] = useState<WorkoutExerciseWithExercise[]>([])
    const [loading, setLoading] = useState(true)
    const [isEditing, setIsEditing] = useState(false)

    // Workout name / note
    const [name, setName] = useState('')
    const [note, setNote] = useState('')
    const savedName = useRef('')
    const savedNote = useRef('')

    // Add exercise modal
    const [showAddModal, setShowAddModal] = useState(false)

    // Copy workout modal
    const [showCopyModal, setShowCopyModal] = useState(false)
    const [copyTargetDate, setCopyTargetDate] = useState('')
    const [showReplaceConfirm, setShowReplaceConfirm] = useState(false)

    // Delete confirmation modal
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

    const isToday = date === getTodayDate()

    const loadWorkout = useCallback(async () => {
        try {
            setLoading(true)
            const { workout, exercises: workoutExercises } = await getWorkoutForDate(date)
            setWorkoutId(workout?.id ?? null)
            setExercises(workoutExercises)
            setName(workout?.name ?? '')
            setNote(workout?.note ?? '')
            savedName.current = workout?.name ?? ''
            savedNote.current = workout?.note ?? ''
        } catch (error) {
            console.error('Failed to load workout:', error)
            showToast('Failed to load workout', 'error')
        } finally {
            setLoading(false)
        }
    }, [date, showToast])

    useEffect(() => {
        loadWorkout()
    }, [loadWorkout])

    // Persist workout name/note on blur. Avoids creating an empty workout when
    // there's nothing to save, and skips redundant writes when unchanged.
    async function saveMeta(field: 'name' | 'note') {
        const trimmed = (field === 'name' ? name : note).trim()
        const prev = field === 'name' ? savedName.current : savedNote.current
        if (trimmed === prev) return
        if (!workoutId && trimmed === '') return

        try {
            let currentWorkoutId = workoutId
            if (!currentWorkoutId) {
                const workout = await getOrCreateWorkout(date)
                currentWorkoutId = workout.id
                setWorkoutId(currentWorkoutId)
            }

            await updateWorkout(currentWorkoutId, {
                [field]: trimmed === '' ? null : trimmed,
            })

            if (field === 'name') savedName.current = trimmed
            else savedNote.current = trimmed
        } catch (error) {
            console.error('Failed to save workout details:', error)
            showToast('Failed to save workout details', 'error')
        }
    }

    async function handleAddExercise(exercise: Exercise) {
        try {
            let currentWorkoutId = workoutId
            if (!currentWorkoutId) {
                const workout = await getOrCreateWorkout(date)
                currentWorkoutId = workout.id
                setWorkoutId(currentWorkoutId)
            }

            await addExerciseToWorkout(currentWorkoutId, exercise.id)
            await loadWorkout()
            setShowAddModal(false)
            showToast('Exercise added!', 'success')
        } catch (error) {
            console.error('Failed to add exercise:', error)
            showToast('Failed to add exercise', 'error')
        }
    }

    async function handleRemoveExercise(workoutExerciseId: number) {
        try {
            await removeExerciseFromWorkout(workoutExerciseId)
            await loadWorkout()
        } catch (error) {
            console.error('Failed to remove exercise:', error)
            showToast('Failed to remove exercise', 'error')
        }
    }

    async function handleUpdateDetails(workoutExerciseId: number, details: string) {
        try {
            await updateWorkoutExerciseDetails(workoutExerciseId, details)
            await loadWorkout()
        } catch (error) {
            console.error('Failed to update details:', error)
            showToast('Failed to update details', 'error')
        }
    }

    async function handleReorder(fromIndex: number, toIndex: number) {
        if (!workoutId) return

        const newExercises = [...exercises]
        const [moved] = newExercises.splice(fromIndex, 1)
        newExercises.splice(toIndex, 0, moved)

        setExercises(newExercises)

        try {
            const orderedIds = newExercises.map(e => e.id)
            await reorderWorkoutExercises(workoutId, orderedIds)
        } catch (error) {
            console.error('Failed to reorder:', error)
            showToast('Failed to reorder', 'error')
            await loadWorkout()
        }
    }

    async function handleCopyWorkout() {
        if (!workoutId || !copyTargetDate) return

        try {
            const result = await copyWorkout(workoutId, copyTargetDate, false)

            if (result.status === 'conflict') {
                setShowCopyModal(false)
                setShowReplaceConfirm(true)
                return
            }

            setShowCopyModal(false)
            setCopyTargetDate('')
            showToast('Workout copied!', 'success')
            router.push(`/scheduled/${copyTargetDate}`)
        } catch (error) {
            console.error('Failed to copy workout:', error)
            showToast('Failed to copy workout', 'error')
        }
    }

    async function handleReplaceWorkout() {
        if (!workoutId || !copyTargetDate) return

        try {
            await copyWorkout(workoutId, copyTargetDate, true)
            setShowReplaceConfirm(false)
            setCopyTargetDate('')
            showToast('Workout replaced!', 'success')
            router.push(`/scheduled/${copyTargetDate}`)
        } catch (error) {
            console.error('Failed to replace workout:', error)
            showToast('Failed to replace workout', 'error')
        }
    }

    async function handleDeleteWorkout() {
        if (!workoutId) return

        try {
            await deleteWorkout(workoutId)
            setShowDeleteConfirm(false)
            showToast('Workout deleted', 'success')
            router.push('/scheduled')
        } catch (error) {
            console.error('Failed to delete workout:', error)
            showToast('Failed to delete workout', 'error')
        }
    }

    if (loading) {
        return (
            <div className="min-h-screen bg-background">
                <div className="p-4 flex items-center justify-center">
                    <div className="text-muted">Loading...</div>
                </div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-background pb-24">
            {/* Header */}
            <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between mb-2">
                    <Link
                        href="/scheduled"
                        className="p-2 rounded-lg hover:bg-muted transition-colors"
                        aria-label="Back to scheduled workouts"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M19 12H5M12 19l-7-7 7-7" />
                        </svg>
                    </Link>
                    <button
                        onClick={() => setIsEditing(!isEditing)}
                        className={`p-2 rounded-lg transition-colors ${isEditing
                            ? 'bg-primary text-background'
                            : 'hover:bg-muted'
                            }`}
                        aria-label={isEditing ? 'Done editing' : 'Edit workout'}
                    >
                        {isEditing ? (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                        )}
                    </button>
                </div>
                {isEditing ? (
                    <div className="space-y-2">
                        <div className={`text-sm font-medium ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                            {formatDateDisplay(date)}
                        </div>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            onBlur={() => saveMeta('name')}
                            placeholder="Workout name (e.g. Push Day A)"
                            className="w-full p-2 bg-background border border-border rounded-lg text-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            onBlur={() => saveMeta('note')}
                            placeholder="Workout note..."
                            rows={2}
                            className="w-full p-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                        />
                    </div>
                ) : (
                    <>
                        <h1 className="text-xl font-bold text-foreground">
                            {name || (isToday ? "Today's Workout" : formatDateDisplay(date))}
                        </h1>
                        {(name || isToday) && (
                            <div className={`text-sm font-medium mt-1 ${isToday ? 'text-primary' : 'text-muted-foreground'}`}>
                                {formatDateDisplay(date)}
                            </div>
                        )}
                        {note && (
                            <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{note}</p>
                        )}
                    </>
                )}
            </div>

            {/* Action Buttons (when editing) */}
            {isEditing && workoutId && (
                <div className="p-4 border-b border-border flex gap-3">
                    <button
                        onClick={() => setShowCopyModal(true)}
                        className="flex-1 flex items-center justify-center gap-2 p-3 border border-border rounded-lg text-foreground hover:bg-muted transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        Copy to Date
                    </button>
                    <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="flex items-center justify-center gap-2 p-3 border border-error/50 rounded-lg text-error hover:bg-error/10 transition-colors"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                        Delete
                    </button>
                </div>
            )}

            {/* Exercise List */}
            {exercises.length === 0 ? (
                <div className="p-8 text-center">
                    <div className="text-muted-foreground mb-2">No exercises in this workout.</div>
                    <div className="text-muted-foreground text-sm">Tap + to add exercises.</div>
                </div>
            ) : (
                <ul className="divide-y divide-border">
                    {exercises.map((we, index) => (
                        <ExerciseItem
                            key={we.id}
                            workoutExercise={we}
                            isEditing={isEditing}
                            index={index}
                            totalCount={exercises.length}
                            onRemove={() => handleRemoveExercise(we.id)}
                            onUpdateDetails={(details) => handleUpdateDetails(we.id, details)}
                            onMoveUp={() => handleReorder(index, index - 1)}
                            onMoveDown={() => handleReorder(index, index + 1)}
                            date={date}
                        />
                    ))}
                </ul>
            )}

            {/* FAB - Add Exercise */}
            <button
                onClick={() => setShowAddModal(true)}
                className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors"
                style={{ backgroundColor: '#fe8019', color: '#1d2021' }}
                aria-label="Add exercise"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
            </button>

            {/* Add Exercise Modal */}
            {showAddModal && (
                <AddExerciseModal
                    onClose={() => setShowAddModal(false)}
                    onSelect={handleAddExercise}
                />
            )}

            {/* Copy Workout Modal */}
            {showCopyModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-xl p-6 w-full max-w-sm shadow-xl">
                        <h2 className="text-lg font-semibold text-foreground mb-4">Copy to Date</h2>
                        <div className="mb-4">
                            <label className="block text-sm text-muted mb-2">Select Date</label>
                            <input
                                type="date"
                                value={copyTargetDate}
                                onChange={e => setCopyTargetDate(e.target.value)}
                                className="w-full p-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowCopyModal(false)
                                    setCopyTargetDate('')
                                }}
                                className="flex-1 p-3 border border-border rounded-lg text-foreground hover:bg-muted transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCopyWorkout}
                                disabled={!copyTargetDate}
                                className="flex-1 p-3 bg-primary text-background rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Copy
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Replace Confirmation Modal */}
            {showReplaceConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-xl p-6 w-full max-w-sm shadow-xl">
                        <h2 className="text-lg font-semibold text-foreground mb-2">Workout Exists</h2>
                        <p className="text-muted mb-4">
                            A workout already exists for this date. Do you want to replace it?
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowReplaceConfirm(false)
                                    setCopyTargetDate('')
                                }}
                                className="flex-1 p-3 border border-border rounded-lg text-foreground hover:bg-muted transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleReplaceWorkout}
                                className="flex-1 p-3 bg-primary text-background rounded-lg font-semibold hover:bg-primary/90 transition-colors"
                            >
                                Replace
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-xl p-6 w-full max-w-sm shadow-xl">
                        <h2 className="text-lg font-semibold text-foreground mb-2">Delete Workout</h2>
                        <p className="text-muted mb-4">
                            Are you sure you want to delete this workout? This action cannot be undone.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                className="flex-1 p-3 border border-border rounded-lg text-foreground hover:bg-muted transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleDeleteWorkout}
                                className="flex-1 p-3 bg-error text-white rounded-lg font-semibold hover:bg-error/90 transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

// Exercise Item Component
interface ExerciseItemProps {
    workoutExercise: WorkoutExerciseWithExercise
    isEditing: boolean
    index: number
    totalCount: number
    onRemove: () => void
    onUpdateDetails: (details: string) => void
    onMoveUp: () => void
    onMoveDown: () => void
    date: string
}

function ExerciseItem({
    workoutExercise,
    isEditing,
    index,
    totalCount,
    onRemove,
    onUpdateDetails,
    onMoveUp,
    onMoveDown,
    date
}: ExerciseItemProps) {
    const [editingDetails, setEditingDetails] = useState(false)
    const [details, setDetails] = useState(workoutExercise.details ?? '')

    function handleSaveDetails() {
        onUpdateDetails(details)
        setEditingDetails(false)
    }

    const exercise = workoutExercise.exercises

    if (isEditing) {
        return (
            <li className="p-4">
                <div className="flex items-center gap-3">
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-1">
                        <button
                            onClick={onMoveUp}
                            disabled={index === 0}
                            className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Move up"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M18 15l-6-6-6 6" />
                            </svg>
                        </button>
                        <button
                            onClick={onMoveDown}
                            disabled={index === totalCount - 1}
                            className="p-1 rounded hover:bg-muted disabled:opacity-30 disabled:cursor-not-allowed"
                            aria-label="Move down"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M6 9l6 6 6-6" />
                            </svg>
                        </button>
                    </div>

                    {/* Exercise info */}
                    <div className="flex-1 min-w-0">
                        <div className="font-semibold text-foreground">{exercise.name}</div>
                        {editingDetails ? (
                            <div className="mt-2 flex gap-2">
                                <input
                                    type="text"
                                    value={details}
                                    onChange={e => setDetails(e.target.value)}
                                    className="flex-1 p-2 bg-background border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                                    placeholder="Add details..."
                                    autoFocus
                                />
                                <button
                                    onClick={handleSaveDetails}
                                    className="px-3 py-1 bg-primary text-background rounded text-sm font-medium"
                                >
                                    Save
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => setEditingDetails(true)}
                                className="text-sm text-muted hover:text-foreground mt-1"
                            >
                                {workoutExercise.details || 'Add details...'}
                            </button>
                        )}
                    </div>

                    {/* Remove button */}
                    <button
                        onClick={onRemove}
                        className="p-2 text-error hover:bg-error/10 rounded transition-colors"
                        aria-label="Remove exercise"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
            </li>
        )
    }

    return (
        <li>
            <Link
                href={`/exercise/${exercise.id}?from=/scheduled/${date}`}
                className="block p-4 hover:bg-muted/50 transition-colors"
            >
                <div className="font-semibold text-foreground">{exercise.name}</div>
                {workoutExercise.details && (
                    <div className="text-sm text-muted-foreground mt-1">{workoutExercise.details}</div>
                )}
            </Link>
        </li>
    )
}

// Add Exercise Modal Component
interface AddExerciseModalProps {
    onClose: () => void
    onSelect: (exercise: Exercise) => void
}

function AddExerciseModal({ onClose, onSelect }: AddExerciseModalProps) {
    const [search, setSearch] = useState('')
    const [results, setResults] = useState<Exercise[]>([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        async function doSearch() {
            if (!search.trim()) {
                // Show MRU when no search
                setLoading(true)
                try {
                    const data = await searchExercises('')
                    setResults(data.slice(0, 8))
                } finally {
                    setLoading(false)
                }
                return
            }

            setLoading(true)
            try {
                const data = await searchExercises(search)
                setResults(data.slice(0, 8))
            } finally {
                setLoading(false)
            }
        }

        const timer = setTimeout(doSearch, 300)
        return () => clearTimeout(timer)
    }, [search])

    return (
        <div className="fixed inset-0 bg-black/50 flex items-start pt-8 justify-center z-50">
            <div className="bg-card rounded-t-xl sm:rounded-xl w-full sm:max-w-md max-h-[80vh] flex flex-col shadow-xl">
                <div className="p-4 border-b border-border flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-foreground">Add Exercise</h2>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-muted rounded-lg transition-colors"
                        aria-label="Close"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="p-4">
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search exercises..."
                        className="w-full p-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                    />
                </div>

                <div className="flex-1 overflow-y-auto">
                    {loading ? (
                        <div className="p-4 text-center text-muted">Searching...</div>
                    ) : results.length === 0 ? (
                        <div className="p-4 text-center text-muted">No exercises found</div>
                    ) : (
                        <ul className="divide-y divide-border">
                            {results.map(exercise => (
                                <li key={exercise.id}>
                                    <button
                                        onClick={() => onSelect(exercise)}
                                        className="w-full p-4 text-left hover:bg-muted transition-colors"
                                    >
                                        <div className="font-medium text-foreground">{exercise.name}</div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    )
}

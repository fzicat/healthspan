'use client'

import { useState, useEffect, useCallback } from 'react'
import { Exercise, ExerciseMetrics, ExerciseCategory } from '@/types/database'
import { getExercises, createExercise, updateExercise, deleteExercise } from '@/lib/api/exercises'
import { useToast } from '@/contexts/ToastContext'

export default function LibraryPage() {
    const [exercises, setExercises] = useState<Exercise[]>([])
    const [filteredExercises, setFilteredExercises] = useState<Exercise[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [editingExercise, setEditingExercise] = useState<Exercise | null>(null)
    const { showToast } = useToast()

    const loadExercises = useCallback(async () => {
        try {
            const data = await getExercises()
            setExercises(data)
            setFilteredExercises(data)
        } catch {
            showToast('Failed to load exercises', 'error')
        } finally {
            setIsLoading(false)
        }
    }, [showToast])

    useEffect(() => {
        loadExercises()
    }, [loadExercises])

    useEffect(() => {
        if (searchQuery.trim() === '') {
            setFilteredExercises(exercises)
        } else {
            const query = searchQuery.toLowerCase()
            setFilteredExercises(
                exercises.filter(e => e.name.toLowerCase().includes(query))
            )
        }
    }, [searchQuery, exercises])

    const handleCreateExercise = async (name: string, metrics: ExerciseMetrics, category: ExerciseCategory) => {
        try {
            await createExercise(name, metrics, category)
            await loadExercises()
            setShowCreateModal(false)
            showToast('Exercise created!', 'success')
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to create exercise', 'error')
        }
    }

    const handleUpdateExercise = async (id: number, name: string, metrics: ExerciseMetrics, category: ExerciseCategory) => {
        try {
            await updateExercise(id, { name, metrics, category })
            await loadExercises()
            setEditingExercise(null)
            showToast('Exercise updated!', 'success')
        } catch (err) {
            showToast(err instanceof Error ? err.message : 'Failed to update exercise', 'error')
        }
    }

    const handleDeleteExercise = async (id: number) => {
        try {
            await deleteExercise(id)
            await loadExercises()
            showToast('Exercise deleted', 'info')
        } catch {
            showToast('Failed to delete exercise', 'error')
        }
    }

    return (
        <div className="max-w-md mx-auto py-6">
            <div className="flex items-center justify-between mb-6">
                <h1 className="text-2xl font-bold">Exercise Library</h1>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="p-3 rounded-full bg-primary text-background
                   hover:bg-primary-dim transition-colors
                   active:scale-95 transition-transform"
                    aria-label="Create exercise"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                </button>
            </div>

            {/* Search */}
            <div className="mb-4">
                <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search exercises..."
                    className="w-full px-4 py-3 rounded-lg bg-muted border border-border
                   text-foreground placeholder:text-muted-foreground
                   focus:outline-none focus:ring-2 focus:ring-primary"
                />
            </div>

            {/* Exercise List */}
            {isLoading ? (
                <div className="flex justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
                </div>
            ) : filteredExercises.length === 0 ? (
                <div className="text-center py-12">
                    <p className="text-muted-foreground mb-4">
                        {searchQuery ? 'No exercises match your search' : 'Create your first exercise'}
                    </p>
                    {!searchQuery && (
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="px-6 py-3 rounded-lg bg-primary text-background font-semibold
                       hover:bg-primary-dim transition-colors"
                        >
                            Create Exercise
                        </button>
                    )}
                </div>
            ) : (
                <ul className="space-y-2">
                    {filteredExercises.map(exercise => (
                        <li key={exercise.id}>
                            <div className="bg-card rounded-xl p-4 border border-border flex items-center justify-between">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-medium">{exercise.name}</h3>
                                        {exercise.category === 'cardio' && (
                                            <span className="text-xs px-1.5 py-0.5 rounded border border-primary text-primary">
                                                cardio
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        {formatMetrics(exercise.metrics)}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setEditingExercise(exercise)}
                                        className="p-2 rounded-lg hover:bg-muted transition-colors"
                                        aria-label={`Edit ${exercise.name}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={() => handleDeleteExercise(exercise.id)}
                                        className="p-2 rounded-lg hover:bg-muted transition-colors"
                                        aria-label={`Delete ${exercise.name}`}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {/* Create Modal */}
            {showCreateModal && (
                <ExerciseModal
                    onClose={() => setShowCreateModal(false)}
                    onSave={handleCreateExercise}
                />
            )}

            {/* Edit Modal */}
            {editingExercise && (
                <ExerciseModal
                    exercise={editingExercise}
                    onClose={() => setEditingExercise(null)}
                    onSave={(name, metrics, category) => handleUpdateExercise(editingExercise.id, name, metrics, category)}
                />
            )}
        </div>
    )
}

function formatMetrics(metrics: ExerciseMetrics): string {
    const parts: string[] = []
    if (metrics.weight) parts.push('Weight')
    if (metrics.reps) parts.push('Reps')
    if (metrics.time) parts.push('Time')
    if (metrics.distance) parts.push('Distance')
    if (metrics.unilateral) parts.push('Unilateral')
    if (metrics.dual_implements) parts.push('Dual Weights')
    return parts.join(' • ') || 'No metrics'
}

interface ExerciseModalProps {
    exercise?: Exercise
    onClose: () => void
    onSave: (name: string, metrics: ExerciseMetrics, category: ExerciseCategory) => Promise<void>
}

function ExerciseModal({ exercise, onClose, onSave }: ExerciseModalProps) {
    const [name, setName] = useState(exercise?.name ?? '')
    const [category, setCategory] = useState<ExerciseCategory>(exercise?.category ?? 'strength')
    const [metrics, setMetrics] = useState<ExerciseMetrics>(
        exercise?.metrics ?? { weight: true, reps: true, time: false, distance: false, unilateral: false, dual_implements: false }
    )
    const [isSaving, setIsSaving] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim()) return

        setIsSaving(true)
        try {
            await onSave(name, metrics, category)
        } finally {
            setIsSaving(false)
        }
    }

    const toggleMetric = (key: keyof ExerciseMetrics) => {
        setMetrics(prev => ({ ...prev, [key]: !prev[key] }))
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-card rounded-xl p-6 w-full max-w-sm border border-border shadow-xl">
                <h2 className="text-xl font-semibold mb-4">
                    {exercise ? 'Edit Exercise' : 'Create Exercise'}
                </h2>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label htmlFor="name" className="block text-sm font-medium mb-1.5">
                            Exercise Name
                        </label>
                        <input
                            id="name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            autoFocus
                            className="w-full px-4 py-3 rounded-lg bg-muted border border-border
                       text-foreground placeholder:text-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary"
                            placeholder="e.g. Bench Press"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Category
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['strength', 'cardio'] as const).map(c => (
                                <button
                                    key={c}
                                    type="button"
                                    onClick={() => setCategory(c)}
                                    className={`
                                        px-4 py-3 rounded-lg border text-sm font-medium
                                        transition-colors capitalize
                                        ${category === c
                                            ? 'border-primary text-primary'
                                            : 'bg-muted border-border text-muted-foreground'
                                        }
                                    `}
                                    style={category === c ? { backgroundColor: 'rgba(254, 128, 25, 0.2)' } : undefined}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Metrics to track
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            {(['weight', 'reps', 'time', 'distance'] as const).map(key => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => toggleMetric(key)}
                                    className={`
                                        px-4 py-3 rounded-lg border text-sm font-medium
                                        transition-colors capitalize
                                        ${metrics[key]
                                            ? 'border-primary text-primary'
                                            : 'bg-muted border-border text-muted-foreground'
                                        }
                                    `}
                                    style={metrics[key] ? { backgroundColor: 'rgba(254, 128, 25, 0.2)' } : undefined}
                                >
                                    {key}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">
                            Volume multipliers
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                            <button
                                type="button"
                                onClick={() => toggleMetric('unilateral')}
                                className={`
                                    px-4 py-3 rounded-lg border text-sm font-medium
                                    transition-colors
                                    ${metrics.unilateral
                                        ? 'border-primary text-primary'
                                        : 'bg-muted border-border text-muted-foreground'
                                    }
                                `}
                                style={metrics.unilateral ? { backgroundColor: 'rgba(254, 128, 25, 0.2)' } : undefined}
                            >
                                Unilateral
                            </button>
                            <button
                                type="button"
                                onClick={() => toggleMetric('dual_implements')}
                                className={`
                                    px-4 py-3 rounded-lg border text-sm font-medium
                                    transition-colors
                                    ${metrics.dual_implements
                                        ? 'border-primary text-primary'
                                        : 'bg-muted border-border text-muted-foreground'
                                    }
                                `}
                                style={metrics.dual_implements ? { backgroundColor: 'rgba(254, 128, 25, 0.2)' } : undefined}
                            >
                                Dual Weights
                            </button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-2">
                            Each enabled option multiplies total volume by 2
                        </p>
                    </div>

                    <div className="flex gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="flex-1 py-3 px-4 rounded-lg font-medium transition-colors"
                            style={{ backgroundColor: '#fb4934', color: '#1d2021' }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving || !name.trim()}
                            className="flex-1 py-3 px-4 rounded-lg font-semibold transition-colors
                                disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ backgroundColor: '#b8bb26', color: '#1d2021' }}
                        >
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    )
}

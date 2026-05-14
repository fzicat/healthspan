'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { WorkoutWithPreview } from '@/types/database'
import { getAllWorkouts, getOrCreateWorkout } from '@/lib/api/workouts'
import { useToast } from '@/contexts/ToastContext'

function getTodayDate(): string {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const day = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function formatDate(dateString: string): string {
    const date = new Date(dateString + 'T00:00:00')
    const today = getTodayDate()

    if (dateString === today) {
        return 'Today'
    }

    const options: Intl.DateTimeFormatOptions = {
        weekday: 'short',
        month: 'short',
        day: 'numeric'
    }
    return date.toLocaleDateString('en-US', options)
}

export default function ScheduledWorkoutsPage() {
    const router = useRouter()
    const { showToast } = useToast()
    const [workouts, setWorkouts] = useState<WorkoutWithPreview[]>([])
    const [loading, setLoading] = useState(true)
    const [showDatePicker, setShowDatePicker] = useState(false)
    const [newDate, setNewDate] = useState('')
    const today = getTodayDate()

    const loadWorkouts = useCallback(async () => {
        try {
            setLoading(true)
            const data = await getAllWorkouts()
            setWorkouts(data)
        } catch (error) {
            console.error('Failed to load workouts:', error)
            showToast('Failed to load workouts', 'error')
        } finally {
            setLoading(false)
        }
    }, [showToast])

    useEffect(() => {
        loadWorkouts()
    }, [loadWorkouts])

    async function handleCreateWorkout() {
        if (!newDate) return

        try {
            await getOrCreateWorkout(newDate)
            setShowDatePicker(false)
            setNewDate('')
            router.push(`/scheduled/${newDate}`)
        } catch (error) {
            console.error('Failed to create workout:', error)
            showToast('Failed to create workout', 'error')
        }
    }

    function handleWorkoutClick(date: string) {
        router.push(`/scheduled/${date}`)
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
        <div className="min-h-screen bg-background pb-20">
            {/* Header */}
            <div className="p-4 border-b border-border">
                <h1 className="text-xl font-bold text-foreground">Scheduled Workouts</h1>
            </div>

            {/* Workout List */}
            {workouts.length === 0 ? (
                <div className="p-8 text-center">
                    <div className="text-muted mb-2">No scheduled workouts.</div>
                    <div className="text-muted text-sm">Tap + to create one.</div>
                </div>
            ) : (
                <ul className="divide-y divide-border">
                    {workouts.map(workout => (
                        <li key={workout.id}>
                            <button
                                onClick={() => handleWorkoutClick(workout.date)}
                                className={`w-full p-4 text-left hover:bg-muted/50 transition-colors ${workout.date === today ? 'bg-primary/10 border-l-4 border-primary' : ''
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <span className={`font-semibold ${workout.date === today ? 'text-primary' : 'text-foreground'
                                        }`}>
                                        {formatDate(workout.date)}
                                    </span>
                                    <span className="text-sm text-muted-foreground">
                                        {workout.exercise_count} {workout.exercise_count === 1 ? 'exercise' : 'exercises'}
                                    </span>
                                </div>
                                {workout.exercise_names.length > 0 && (
                                    <div className="text-sm text-muted-foreground truncate">
                                        {workout.exercise_names.join(', ')}
                                        {workout.exercise_count > 3 && '...'}
                                    </div>
                                )}
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {/* FAB - Add Workout */}
            <button
                onClick={() => setShowDatePicker(true)}
                className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-colors"
                style={{ backgroundColor: '#fe8019', color: '#1d2021' }}
                aria-label="Create new workout"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
            </button>

            {/* Date Picker Modal */}
            {showDatePicker && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-card rounded-xl p-6 w-full max-w-sm shadow-xl">
                        <h2 className="text-lg font-semibold text-foreground mb-4">Create Workout</h2>
                        <div className="mb-4">
                            <label className="block text-sm text-muted mb-2">Select Date</label>
                            <input
                                type="date"
                                value={newDate}
                                onChange={e => setNewDate(e.target.value)}
                                className="w-full p-3 bg-background border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={() => {
                                    setShowDatePicker(false)
                                    setNewDate('')
                                }}
                                className="flex-1 p-3 border border-border rounded-lg text-foreground hover:bg-muted transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateWorkout}
                                disabled={!newDate}
                                className="flex-1 p-3 bg-primary text-background rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                Create
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import { WorkoutExerciseWithExercise, Exercise } from '@/types/database'
import {
  getWorkoutForDate,
  getOrCreateWorkout,
  addExerciseToWorkout,
  removeExerciseFromWorkout,
  updateWorkoutExerciseDetails,
  reorderWorkoutExercises,
  repeatDay
} from '@/lib/api/workouts'
import { getExercises, searchExercises } from '@/lib/api/exercises'
import { useToast } from '@/contexts/ToastContext'

function getTodayDate(): string {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function TodaysWorkoutPage() {
  const [exercises, setExercises] = useState<WorkoutExerciseWithExercise[]>([])
  const [workoutId, setWorkoutId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isEditing, setIsEditing] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showRepeatModal, setShowRepeatModal] = useState(false)
  const { showToast } = useToast()

  const loadWorkout = useCallback(async () => {
    try {
      const today = getTodayDate()
      const { workout, exercises } = await getWorkoutForDate(today)
      setWorkoutId(workout?.id ?? null)
      setExercises(exercises)
    } catch {
      showToast('Failed to load workout', 'error')
    } finally {
      setIsLoading(false)
    }
  }, [showToast])

  useEffect(() => {
    loadWorkout()
  }, [loadWorkout])

  const handleAddExercise = async (exercise: Exercise) => {
    try {
      let id = workoutId
      if (!id) {
        const workout = await getOrCreateWorkout(getTodayDate())
        id = workout.id
        setWorkoutId(id)
      }
      await addExerciseToWorkout(id, exercise.id)
      await loadWorkout()
      setShowAddModal(false)
      showToast(`Added ${exercise.name}`, 'success')
    } catch {
      showToast('Failed to add exercise', 'error')
    }
  }

  const handleRemoveExercise = async (workoutExerciseId: number) => {
    try {
      await removeExerciseFromWorkout(workoutExerciseId)
      await loadWorkout()
    } catch {
      showToast('Failed to remove exercise', 'error')
    }
  }

  const handleUpdateDetails = async (workoutExerciseId: number, details: string) => {
    try {
      await updateWorkoutExerciseDetails(workoutExerciseId, details)
      await loadWorkout()
    } catch {
      showToast('Failed to update details', 'error')
    }
  }

  const handleReorder = async (fromIndex: number, toIndex: number) => {
    if (!workoutId) return

    const newExercises = [...exercises]
    const [removed] = newExercises.splice(fromIndex, 1)
    newExercises.splice(toIndex, 0, removed)
    setExercises(newExercises)

    try {
      await reorderWorkoutExercises(
        workoutId,
        newExercises.map(e => e.id)
      )
    } catch {
      showToast('Failed to reorder', 'error')
      await loadWorkout()
    }
  }

  const handleRepeatDay = async (date: string) => {
    try {
      await repeatDay(date, getTodayDate())
      await loadWorkout()
      setShowRepeatModal(false)
      showToast('Workout copied!', 'success')
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : 'Failed to repeat day',
        'error'
      )
    }
  }

  return (
    <div className="max-w-md mx-auto py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Today&apos;s Workout</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'short',
              day: 'numeric'
            })}
          </p>
        </div>
        <div className="flex gap-2">
          {exercises.length > 0 && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`p-2 rounded-lg transition-colors ${isEditing ? 'bg-primary text-background' : 'hover:bg-muted'
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
          )}
          <button
            onClick={() => setShowRepeatModal(true)}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
            aria-label="Repeat a day"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="17 1 21 5 17 9" />
              <path d="M3 11V9a4 4 0 0 1 4-4h14" />
              <polyline points="7 23 3 19 7 15" />
              <path d="M21 13v2a4 4 0 0 1-4 4H3" />
            </svg>
          </button>
        </div>
      </div>

      {/* Exercise List */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
        </div>
      ) : exercises.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">No Exercises</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-3 rounded-lg bg-primary text-background font-semibold
                     hover:bg-primary-dim transition-colors"
          >
            Add Exercise
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
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
            />
          ))}
        </ul>
      )}

      {/* FAB to add exercise */}
      <button
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-6 right-6 p-4 rounded-full shadow-lg transition-colors
                 active:scale-95 transition-transform z-30"
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

      {/* Repeat Day Modal */}
      {showRepeatModal && (
        <RepeatDayModal
          onClose={() => setShowRepeatModal(false)}
          onSelect={handleRepeatDay}
        />
      )}
    </div>
  )
}

interface ExerciseItemProps {
  workoutExercise: WorkoutExerciseWithExercise
  isEditing: boolean
  index: number
  totalCount: number
  onRemove: () => void
  onUpdateDetails: (details: string) => void
  onMoveUp: () => void
  onMoveDown: () => void
}

function ExerciseItem({
  workoutExercise,
  isEditing,
  index,
  totalCount,
  onRemove,
  onUpdateDetails,
  onMoveUp,
  onMoveDown
}: ExerciseItemProps) {
  const [editingDetails, setEditingDetails] = useState(false)
  const [details, setDetails] = useState(workoutExercise.details ?? '')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSaveDetails = () => {
    if (details !== workoutExercise.details) {
      onUpdateDetails(details)
    }
    setEditingDetails(false)
  }

  useEffect(() => {
    if (editingDetails && inputRef.current) {
      inputRef.current.focus()
    }
  }, [editingDetails])

  const content = (
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h3 className="font-semibold text-lg">{workoutExercise.exercises.name}</h3>
          {isEditing && editingDetails ? (
            <input
              ref={inputRef}
              type="text"
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              onBlur={handleSaveDetails}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveDetails()}
              className="mt-1 w-full px-2 py-1 rounded bg-muted border border-border
                       text-sm text-muted-foreground
                       focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Add details..."
            />
          ) : (
            <p
              className="text-sm text-muted-foreground mt-0.5 cursor-pointer"
              onClick={() => isEditing && setEditingDetails(true)}
            >
              {workoutExercise.details || (isEditing ? 'Tap to add details...' : '')}
            </p>
          )}
        </div>
        {isEditing && (
          <div className="flex items-center gap-1 ml-2">
            <button
              onClick={onMoveUp}
              disabled={index === 0}
              className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-30"
              aria-label="Move up"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <button
              onClick={onMoveDown}
              disabled={index === totalCount - 1}
              className="p-1.5 rounded hover:bg-muted transition-colors disabled:opacity-30"
              aria-label="Move down"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            <button
              onClick={onRemove}
              className="p-1.5 rounded hover:bg-muted transition-colors"
              aria-label="Remove"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        )}
        {!isEditing && (
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        )}
      </div>
    </div>
  )

  if (isEditing) {
    return <li>{content}</li>
  }

  return (
    <li>
      <Link href={`/exercise/${workoutExercise.exercises.id}`}>
        {content}
      </Link>
    </li>
  )
}

interface AddExerciseModalProps {
  onClose: () => void
  onSelect: (exercise: Exercise) => void
}

function AddExerciseModal({ onClose, onSelect }: AddExerciseModalProps) {
  const [query, setQuery] = useState('')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    // Load all exercises initially
    getExercises().then(data => {
      setExercises(data.slice(0, 8))
      setIsLoading(false)
    })
  }, [])

  useEffect(() => {
    if (query.trim()) {
      searchExercises(query, 3).then(data => {
        setExercises(data)
        setIsLoading(false)
      })
    } else {
      getExercises().then(data => {
        setExercises(data.slice(0, 8))
      })
    }
  }, [query])

  function handleQueryChange(value: string) {
    setQuery(value)
    if (value.trim()) {
      setIsLoading(true)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start pt-8 justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-t-xl sm:rounded-xl w-full max-w-sm 
                    max-h-[70vh] flex flex-col border border-border shadow-xl">
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Add Exercise</h2>
            <button onClick={onClose} className="p-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <input
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            placeholder="Search exercises..."
            autoFocus
            className="w-full px-4 py-3 rounded-lg bg-muted border border-border
                     text-foreground placeholder:text-muted-foreground
                     focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-2 border-primary border-t-transparent" />
            </div>
          ) : exercises.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {query ? 'No exercises found' : 'No exercises yet'}
            </p>
          ) : (
            <ul>
              {exercises.map(exercise => (
                <li key={exercise.id}>
                  <button
                    onClick={() => onSelect(exercise)}
                    className="w-full text-left px-4 py-3 rounded-lg
                             hover:bg-muted transition-colors"
                  >
                    {exercise.name}
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

interface RepeatDayModalProps {
  onClose: () => void
  onSelect: (date: string) => void
}

function RepeatDayModal({ onClose, onSelect }: RepeatDayModalProps) {
  const [date, setDate] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (date) {
      onSelect(date)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-card rounded-xl p-6 w-full max-w-sm border border-border shadow-xl">
        <h2 className="text-xl font-semibold mb-4">Repeat a Day</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Copy exercises from a previous workout day
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
            max={getTodayDate()}
            className="w-full px-4 py-3 rounded-lg bg-muted border border-border
                     text-foreground
                     focus:outline-none focus:ring-2 focus:ring-primary"
          />

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-lg border border-border
                       font-medium hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!date}
              className="flex-1 py-3 px-4 rounded-lg bg-primary text-background
                       font-semibold hover:bg-primary-dim transition-colors
                       disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Copy Workout
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

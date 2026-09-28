'use client'

import { useEffect, useState } from 'react'
import { getTrainingPhases } from '@/lib/api/training-phases'
import { Markdown } from '@/components/Markdown'
import { TrainingPhase } from '@/types/database'

function formatDate(date: string): string {
    return new Date(`${date}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function dateRange(phase: TrainingPhase): string | null {
    if (!phase.start_date && !phase.end_date) return null
    const start = phase.start_date ? formatDate(phase.start_date) : '?'
    const end = phase.end_date ? formatDate(phase.end_date) : 'open'
    return `${start} → ${end}`
}

function PhaseCard({ phase, highlight = false }: { phase: TrainingPhase; highlight?: boolean }) {
    const range = dateRange(phase)
    return (
        <article className={`bg-card rounded-xl p-4 border space-y-3 ${highlight ? 'border-primary' : 'border-border'}`}>
            <header>
                <h3 className={`text-lg font-semibold ${highlight ? 'text-primary' : ''}`}>{phase.name}</h3>
                {range && <p className="text-sm text-muted-foreground">{range}</p>}
            </header>
            {phase.goal && <Markdown text={phase.goal} />}
            {phase.outcome && (
                <div className="space-y-1">
                    <h4 className="text-sm font-medium text-muted-foreground">Outcome</h4>
                    <Markdown text={phase.outcome} />
                </div>
            )}
            {phase.plan && (
                <details className="group">
                    <summary className="cursor-pointer text-sm font-medium text-primary py-1">Plan</summary>
                    <div className="pt-2"><Markdown text={phase.plan} /></div>
                </details>
            )}
        </article>
    )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
            {children}
        </section>
    )
}

export default function TrainingPage() {
    const [phases, setPhases] = useState<TrainingPhase[] | null>(null)
    const [error, setError] = useState(false)

    useEffect(() => {
        getTrainingPhases().then(setPhases).catch(() => setError(true))
    }, [])

    if (error) {
        return (
            <div className="max-w-md mx-auto py-6">
                <h1 className="text-2xl font-bold mb-6">Training</h1>
                <p className="text-sm text-muted-foreground">Training phases could not be loaded.</p>
            </div>
        )
    }

    if (!phases) {
        return (
            <div className="flex justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
            </div>
        )
    }

    const current = phases.find(p => p.status === 'current')
    const planned = phases.filter(p => p.status === 'planned')
    const completed = phases.filter(p => p.status === 'completed').reverse()
    const empty = phases.length === 0

    return (
        <div className="max-w-md mx-auto py-6 space-y-6">
            <h1 className="text-2xl font-bold">Training</h1>
            {empty && <p className="text-sm text-muted-foreground">No training phases yet.</p>}
            {!empty && (
                <Section title="Current">
                    {current ? <PhaseCard phase={current} highlight /> : <p className="text-sm text-muted-foreground">No current phase.</p>}
                </Section>
            )}
            {planned.length > 0 && (
                <Section title="Next">
                    {planned.map(phase => <PhaseCard key={phase.id} phase={phase} />)}
                </Section>
            )}
            {completed.length > 0 && (
                <Section title="Past">
                    {completed.map(phase => <PhaseCard key={phase.id} phase={phase} />)}
                </Section>
            )}
        </div>
    )
}

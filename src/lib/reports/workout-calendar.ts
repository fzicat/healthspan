export type WorkoutEntryKind = 'strength' | 'cardio'

export type WorkoutCalendarEntry = {
    id: string
    kind: WorkoutEntryKind
    text: string
}

export type WorkoutReportDay = {
    date: string
    entries: WorkoutCalendarEntry[]
}

export type StrengthSetSummaryInput = {
    id: number
    loggedAt: string
    exerciseName: string
}

export type CardioSessionSummaryInput = {
    id: number
    date: string
    durationMinutes: number
    exerciseName: string
}

export type CalendarMonth = {
    key: string
    label: string
    days: Array<string | null>
}

const PUSH_TERMS = [
    'bench',
    'chest',
    'dip',
    'fly',
    'front raise',
    'lateral raise',
    'overhead press',
    'pec',
    'press',
    'push',
    'shoulder press',
    'skull crusher',
    'tricep',
]

const PULL_TERMS = [
    'bicep',
    'chin',
    'curl',
    'face pull',
    'lat ',
    'lat pulldown',
    'pulldown',
    'pull-up',
    'pull up',
    'pullup',
    'pullover',
    'rear delt',
    'reverse pec',
    'row',
    'shrug',
    'y-raise',
    'y raise',
]

const LEG_TERMS = [
    'calf',
    'deadlift',
    'duck squat',
    'glute',
    'hamstring',
    'hip',
    'leg',
    'lunge',
    'quad',
    'rdl',
    'romanian',
    'squat',
    'step-up',
    'step up',
    'thrust',
]

const CORE_TERMS = ['ab ', 'abs', 'carry', 'core', 'crunch', 'pallof', 'plank', 'rotation']

function includesAny(value: string, terms: string[]): boolean {
    return terms.some(term => {
        const pattern = term
            .trim()
            .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\s+/g, '\\s+')
        return new RegExp(`\\b${pattern}(?:s|es)?\\b`).test(value)
    })
}

type MovementPattern = 'push' | 'pull' | 'legs' | 'core' | 'unknown'

function classifyExercise(name: string): MovementPattern {
    const normalized = ` ${name.toLowerCase()} `

    // Precedence prevents compound names from being counted twice. For example,
    // "Chest Supported Row" and "Rear Delt Fly" are pull movements despite
    // containing push-oriented words such as "chest" or "fly".
    if (includesAny(normalized, LEG_TERMS)) return 'legs'
    if (includesAny(normalized, CORE_TERMS)) return 'core'
    if (includesAny(normalized, PULL_TERMS)) return 'pull'
    if (includesAny(normalized, PUSH_TERMS)) return 'push'
    return 'unknown'
}

export function inferStrengthSessionLabel(exerciseNames: string[]): string {
    const patterns = exerciseNames.map(classifyExercise)
    const hasLegs = patterns.includes('legs')
    const hasCore = patterns.includes('core')
    const hasPush = patterns.includes('push')
    const hasPull = patterns.includes('pull')

    if (hasLegs && (hasPush || hasPull)) return 'Full Body'
    if (hasPush && hasPull) return 'Upper'
    if (hasLegs) return 'Legs'
    if (hasPush) return 'Push'
    if (hasPull) return 'Pull'
    if (hasCore) return 'Core'
    return 'Strength'
}

export function buildWorkoutReportDays(
    strengthSets: StrengthSetSummaryInput[],
    cardioSessions: CardioSessionSummaryInput[]
): WorkoutReportDay[] {
    const strengthByDate = new Map<string, StrengthSetSummaryInput[]>()
    const cardioByDate = new Map<string, CardioSessionSummaryInput[]>()

    for (const set of strengthSets) {
        const date = set.loggedAt.slice(0, 10)
        const existing = strengthByDate.get(date) ?? []
        existing.push(set)
        strengthByDate.set(date, existing)
    }

    for (const session of cardioSessions) {
        const existing = cardioByDate.get(session.date) ?? []
        existing.push(session)
        cardioByDate.set(session.date, existing)
    }

    const dates = new Set([...strengthByDate.keys(), ...cardioByDate.keys()])

    return Array.from(dates)
        .sort((a, b) => a.localeCompare(b))
        .map(date => {
            const sets = strengthByDate.get(date) ?? []
            const cardio = cardioByDate.get(date) ?? []
            const entries: WorkoutCalendarEntry[] = []

            if (sets.length > 0) {
                const exerciseNames = Array.from(new Set(sets.map(set => set.exerciseName)))
                const label = inferStrengthSessionLabel(exerciseNames)
                entries.push({
                    id: `strength-${date}`,
                    kind: 'strength',
                    text: `${label}, ${sets.length} ${sets.length === 1 ? 'set' : 'sets'}`,
                })
            }

            for (const session of cardio) {
                entries.push({
                    id: `cardio-${session.id}`,
                    kind: 'cardio',
                    text: `${session.durationMinutes} min ${session.exerciseName}`,
                })
            }

            return { date, entries }
        })
}

function isoDate(year: number, monthIndex: number, day: number): string {
    return new Date(Date.UTC(year, monthIndex, day)).toISOString().slice(0, 10)
}

export function buildCalendarMonths(anchorDate: string, count: number): CalendarMonth[] {
    const [anchorYear, anchorMonth] = anchorDate.split('-').map(Number)
    const safeCount = Math.min(4, Math.max(1, count))
    const firstMonth = new Date(Date.UTC(anchorYear, anchorMonth - safeCount, 1))
    const months: CalendarMonth[] = []

    for (let offset = 0; offset < safeCount; offset += 1) {
        const monthDate = new Date(Date.UTC(
            firstMonth.getUTCFullYear(),
            firstMonth.getUTCMonth() + offset,
            1
        ))
        const year = monthDate.getUTCFullYear()
        const monthIndex = monthDate.getUTCMonth()
        const leadingBlanks = monthDate.getUTCDay()
        const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
        const days: Array<string | null> = Array.from({ length: leadingBlanks }, () => null)

        for (let day = 1; day <= daysInMonth; day += 1) {
            days.push(isoDate(year, monthIndex, day))
        }

        while (days.length % 7 !== 0) days.push(null)

        months.push({
            key: isoDate(year, monthIndex, 1).slice(0, 7),
            label: new Intl.DateTimeFormat('en-US', {
                month: 'long',
                year: 'numeric',
                timeZone: 'UTC',
            }).format(monthDate),
            days,
        })
    }

    return months
}

export function getCalendarRange(anchorDate: string, count: number): { from: string; to: string } {
    const months = buildCalendarMonths(anchorDate, count)
    const dates = months.flatMap(month => month.days).filter((date): date is string => date !== null)
    return { from: dates[0], to: dates[dates.length - 1] }
}

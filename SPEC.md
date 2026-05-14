# Healthspan

A simple, mobile-first web app to log exercises set-by-set. Built for quick data entry at the gym with easy recall of recent performance.

---

## Core Purpose

> **Primary goal**: Help me remember what weight I used last week for each exercise.

- Log each **set** individually (not grouping sets together)
- Quick lookup of recent history per exercise
- Simple and fast—no coaching, planning, or analytics clutter

---

## Data Model

Build a script to create tables on Supabase.

### Exercises
| Column       | Type    | Notes                                      |
|--------------|---------|-------------------------------------------|
| id           | integer | auto, pk                                   |
| name         | text    | case-insensitive unique constraint         |
| metrics      | jsonb   | e.g. `{"weight": true, "reps": true, "time": false, "distance": false, "unilateral": false, "dual_implements": false}` |
| is_deleted   | bool    | soft delete (default: false)               |
| created_at   | timestamp | auto                                     |

> **Note**: Using JSONB for metrics allows future extensibility (e.g., adding "tempo", "band_resistance") without schema migrations.

**Volume Multiplier Fields** (in `metrics` JSONB):
- `unilateral`: When true, logged volume represents one side only (total volume ×2)
- `dual_implements`: When true, logged weight is per implement (total volume ×2)

### Sets
| Column       | Type    | Notes                                      |
|--------------|---------|-------------------------------------------|
| id           | integer | auto, pk                                   |
| exercise_id  | integer | fk → exercises                            |
| logged_at    | timestamp | auto, set on save                        |
| weight       | integer | in pounds (nullable)                      |
| reps         | integer | nullable                                  |
| time         | integer | duration in seconds (nullable)            |
| distance     | integer | in meters (nullable)                      |
| rir          | integer | 0-10 (nullable)                           |
| is_deleted   | bool    | soft delete (default: false)              |

### Workouts
| Column       | Type    | Notes                                      |
|--------------|---------|-------------------------------------------|
| id           | integer | auto, pk                                   |
| date         | date    | unique                                    |

### Workouts_Exercises
| Column       | Type    | Notes                                      |
|--------------|---------|-------------------------------------------|
| id           | integer | auto, pk                                   |
| workout_id   | integer | fk → workouts                             |
| exercise_id  | integer | fk → exercises                            |
| sort_order   | integer | for drag-and-drop reordering              |
| details      | text    | freeform text, displayed as-is            |

---

## Features

### Today's Workout

- Displays the workout assigned to today's date
- Shows list of exercises with their Details text. Examples:
  - **Front Squat:** 5 sets × 2-4 reps (Rest 3m)
  - **Single Arm Dumbbell Row:** 5 sets × 2-4 reps
  - **Weighted Dips:** 5 sets × 2-4 reps. *Note: Full ROM to stretch chest.*
- If no workout exists for today: display **"No Exercises"** empty state
- Each line is tappable → opens that exercise's logging page
- **"+" button**: Opens modal with search field to log a different exercise
  - Search by name only
  - Results sorted by MRU (most recently used, global)
  - Show 10 results max in dropdown

### Exercise Page (Set Logging)

- **Input Fields** (shown based on exercise's `metrics` config):
  - Weight (number input, in lbs)
  - Reps (number input)
  - Time (number input, in seconds)
  - Distance (number input, in meters)
  - RIR (number input, 0-10)
- **Pre-fill behavior**: Fields pre-populate with values from the **last logged set for this exercise** (the "what did I do last week" use case)
- **Save button**: Instant save, no confirmation modal
  - Success: Toast "Set saved! 💪"
  - Error: Toast with retry button
- **Set History** (below the form):
  - Shows all logged sets for this exercise (excluding soft-deleted)
  - Paginated: 50 sets per page
  - Displays metrics and `logged_at` datetime for each set
  - **Swipe-to-delete** on each row (soft delete)
  - Empty state: "No history yet"
- **Edit past sets**: Tap a set to edit its values
- **Stopwatch FAB**: Opens modal with mm:ss stopwatch for rest timing
  - Has close button
  - Unrelated to logging (does not auto-fill Time field)
- **Back button**: Returns to Today's Workout

### Edit Today's Workout

- Allows user to:
  - **Add** exercises from library
  - **Remove** exercises (removes from workout, not library)
  - **Reorder** exercises via drag-and-drop
  - **Edit Details** text inline (freeform, no parsing)

### Repeat a Day

- Opens native browser date picker
- Finds all exercises logged on that date
- **Replaces** Today's Workout with those exercises (same order as originally logged)
- Auto-generates Details string summarizing logged metrics (sets × reps, weight, etc.)

### Exercise Library

- Lists all exercises (excluding soft-deleted)
- Search/filter by name
- Create new exercise:
  - Name (case-insensitive unique)
  - Checkboxes for metrics: Weight, Reps, Time, Distance
- Edit existing exercise (name, metrics)
- Delete exercise (soft delete)
- Empty state: "Create your first exercise" CTA

### Scheduled Workouts

- Accessible via hamburger menu → **"Scheduled Workouts"**
- Lists all workouts (including today's date)
- Sorted by **date ascending** (nearest date first)
- Today's workout is highlighted
- Each row displays:
  - Date
  - Exercise count
  - First 2-3 exercise names (truncated if more)

**Actions:**
- **Tap a workout**: Opens editor view for that workout
- **"+" button**: Create new workout
  - Opens date picker to select any date
  - After selecting date, opens workout editor

**Workout Editor:**
- **Add** exercises from library
- **Remove** exercises from workout
- **Reorder** via drag-and-drop (up/down arrows)
- **Edit Details** text per exercise
- **Copy to Date** button:
  - Opens date picker to select target date
  - If target date already has a workout: prompt to **Replace** or **Cancel**
- **Delete workout** button:
  - Shows confirmation modal
  - Upon confirm, removes entire workout and returns to list

**Empty State:** "No scheduled workouts. Tap + to create one."

### Settings

- Logout
- Toggle dark/light theme

---

## Tech Stack

| Layer      | Technology                         |
|------------|-----------------------------------|
| Framework  | Next.js 14+ (App Router)          |
| UI         | React, Tailwind CSS (Gruvbox theme) |
| State      | React Context + useState          |
| Database   | Supabase (PostgreSQL)             |
| Auth       | Supabase Auth (email/password)    |
| Deployment | Vercel (*.vercel.app domain)      |

---

## Development Guidelines

Use the following skills during implementation:

- **frontend-design**: For creating distinctive, production-grade UI with high design quality. Apply to all components, pages, and styling work.
- **vercel-react-best-practices**: For React and Next.js performance optimization. Apply when writing components, data fetching, and bundle optimization.

---

## Authentication

- **Single user** app (no multi-user support needed)
- **Persistent session**: 1 day expiry
- **Online required**: No offline support
  - Show error toast if no connection; user retries manually

---

## UI/UX Guidelines

### Core Principles

- **Mobile-first**: Designed for phone use at the gym
- **Large tap targets**: Easy to hit with sweaty fingers
- **Minimal taps**: Log a set in < 5 taps
- **No clutter**: Only show what's needed for logging
- **Keep it simple**: Avoid overengineering

### Input Controls

- All metrics use **number inputs** (no steppers, no custom pickers)
- Native browser date picker for Repeat a Day

### Feedback

- **Success toast**: "Set saved! 💪" after logging
- **Error toast**: With retry button on failures

### Empty States

- Today's Workout: "No Exercises"
- Exercise History: "No history yet"
- Exercise Library: "Create your first exercise"

### Theme: Gruvbox (Strict Palette)

**Dark Mode (default):**
- Background: `#282828` (dark0)
- Foreground: `#ebdbb2` (light1)
- Accent/Primary: `#fe8019` (bright_orange) or `#d65d0e` (neutral_orange)

**Light Mode (via Settings):**
- Background: `#fbf1c7` (light0)
- Foreground: `#3c3836` (dark1)

<details>
<summary>Full Gruvbox Palette Reference</summary>

```
dark0_hard  = #1d2021
dark0       = #282828
dark0_soft  = #32302f
dark1       = #3c3836
dark2       = #504945
dark3       = #665c54
dark4       = #7c6f64

light0_hard = #f9f5d7
light0      = #fbf1c7
light0_soft = #f2e5bc
light1      = #ebdbb2
light2      = #d5c4a1
light3      = #bdae93
light4      = #a89984

neutral_red    = #cc241d
neutral_green  = #98971a
neutral_yellow = #d79921
neutral_blue   = #458588
neutral_purple = #b16286
neutral_aqua   = #689d6a
neutral_orange = #d65d0e

bright_red     = #fb4934
bright_green   = #b8bb26
bright_yellow  = #fabd2f
bright_blue    = #83a598
bright_purple  = #d3869b
bright_aqua    = #8ec07c
bright_orange  = #fe8019

faded_red      = #9d0006
faded_green    = #79740e
faded_yellow   = #b57614
faded_blue     = #076678
faded_purple   = #8f3f71
faded_aqua     = #427b58
faded_orange   = #af3a03

gray           = #928374
```

</details>

### Navigation

- **Hamburger menu** with items:
  - Today's Workout
  - Scheduled Workouts
  - Exercise Library
  - Settings
- Back button follows natural browser history

---

## Data Seeding

- App starts **empty** (no pre-seeded exercises)
- User will manually populate exercise library

---

## Glossary

| Term | Definition |
|------|------------|
| Set  | Single exercise instance with metrics (weight, reps, etc.) |
| MRU  | Most Recently Used (sorting strategy for exercise search) |
| RIR  | Reps In Reserve (0-10, effort metric) |
| FAB  | Floating Action Button |

---

## Future Versions (Out of Scope for V1)

- Superset management and grouping
- "Workout journal" view (all logs for a specific date across all exercises)
- PWA / offline support

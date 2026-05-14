# Healthspan

A mobile-first web app for logging healthspan data: strength training today, with cardio, sleep, HRV, and nutrition planned next.

No social features — just fast logging with automatic recall of your last performance and clean data access for an AI fitness coach.

## Features

- **Today's Workout** — View scheduled exercises, tap to log sets, or add exercises on the fly
- **Set Logging** — Weight, reps, time, distance, and RIR (Reps In Reserve) inputs with auto-prefill from your last logged set
- **Exercise Library** — Create and manage exercises with configurable metrics (weight, reps, time, distance, unilateral, dual implements)
- **Scheduled Workouts** — Plan workouts for any date, reorder exercises via drag-and-drop, copy workouts between dates
- **Repeat a Day** — Copy a previous day's exercises into today's workout with auto-generated set summaries
- **Rest Timer** — Floating stopwatch for timing rest between sets
- **Swipe-to-Delete** — Swipe set history rows to soft-delete
- **Dark/Light Theme** — Gruvbox color palette with toggle in settings
- **PWA Support** — Installable as a standalone app with service worker and manifest

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Framework   | Next.js 16 (App Router)             |
| Language    | TypeScript                          |
| UI          | React 19, Tailwind CSS 4            |
| Database    | Supabase (PostgreSQL)               |
| Auth        | Supabase Auth (email/password)      |
| Deployment  | Vercel                              |

## Getting Started

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project

### 1. Clone the repo

```bash
git clone https://github.com/fzicat/healthspan.git
cd healthspan
```

### 2. Install dependencies

```bash
npm install
```

### 3. Set up Supabase

Create a new Supabase project and run the schema migration in the SQL Editor:

```bash
# The schema file is at:
supabase/schema.sql
```

This creates the `exercises`, `sets`, `workouts`, and `workouts_exercises` tables with Row Level Security policies for authenticated users.

### 4. Configure environment variables

Create a `.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — sign up with email/password to get started.

## Install as a PWA (mobile)

> Install prompts require HTTPS in production (localhost works for local testing).

### Android (Chrome)

1. Open Healthspan in Chrome.
2. Tap **Install app** in the address bar or from the 3-dot menu (**Install app** / **Add to Home screen**).
3. Confirm install. Healthspan opens in standalone app mode.

### iPhone (Safari)

1. Open Healthspan in Safari.
2. Tap **Share** (square with arrow).
3. Choose **Add to Home Screen** and confirm.
4. Launch Healthspan from the home screen for full-screen app behavior.

If the app was already open during a deploy, fully close and reopen it once to load the newest service worker.

## Project Structure

```
src/
├── app/
│   ├── page.tsx              # Today's Workout (home)
│   ├── layout.tsx            # Root layout with providers
│   ├── login/page.tsx        # Auth page
│   ├── exercise/[id]/page.tsx # Set logging + history
│   ├── library/page.tsx      # Exercise library CRUD
│   ├── scheduled/            # Scheduled workouts list + editor
│   │   ├── page.tsx
│   │   └── [date]/page.tsx
│   ├── settings/page.tsx     # Theme toggle + logout
│   ├── auth/callback/route.ts
│   └── globals.css           # Gruvbox theme variables
├── components/
│   ├── Navigation.tsx        # Hamburger slide-out menu
│   ├── ToastContainer.tsx    # Toast notifications
│   └── ServiceWorkerRegistrar.tsx
├── contexts/
│   ├── ThemeContext.tsx       # Dark/light theme state
│   └── ToastContext.tsx       # Toast notification state
├── lib/
│   ├── api/
│   │   ├── exercises.ts      # Exercise CRUD + search
│   │   ├── sets.ts           # Set CRUD + history
│   │   └── workouts.ts       # Workout CRUD + copy/repeat
│   └── supabase/
│       ├── client.ts         # Browser Supabase client
│       ├── server.ts         # Server Supabase client
│       └── middleware.ts     # Session refresh middleware
├── types/
│   └── database.ts           # TypeScript types for all tables
└── middleware.ts              # Next.js middleware (auth)
```

## Data Model

Four tables power the app:

- **exercises** — Name, configurable metric flags (weight/reps/time/distance/unilateral/dual), soft delete
- **sets** — Individual logged sets with nullable metrics and RIR, linked to an exercise
- **workouts** — A date (unique) representing a workout day
- **workouts_exercises** — Junction table linking workouts to exercises with sort order and freeform details text

## Scripts

| Command         | Description              |
|-----------------|--------------------------|
| `npm run dev`   | Start dev server         |
| `npm run build` | Production build         |
| `npm run start` | Start production server  |
| `npm run lint`  | Run ESLint               |

## License

This project is not currently licensed for distribution.

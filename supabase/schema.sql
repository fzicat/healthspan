-- Healthspan Database Schema for Supabase
-- Run this script in the Supabase SQL Editor to create the required tables
-- Exercises table
CREATE TABLE IF NOT EXISTS exercises (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    metrics JSONB NOT NULL DEFAULT '{"weight": true, "reps": true, "time": false, "distance": false, "unilateral": false, "dual_implements": false}',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Case-insensitive unique constraint on name (only for non-deleted exercises)
CREATE UNIQUE INDEX IF NOT EXISTS exercises_name_unique ON exercises (LOWER(name))
WHERE is_deleted = FALSE;
-- Sets table
CREATE TABLE IF NOT EXISTS sets (
    id SERIAL PRIMARY KEY,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    weight INTEGER,
    reps INTEGER,
    time INTEGER,
    distance INTEGER,
    rir INTEGER CHECK (
        rir >= 0
        AND rir <= 10
    ),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);
-- Index for faster exercise history queries
CREATE INDEX IF NOT EXISTS sets_exercise_logged ON sets (exercise_id, logged_at DESC)
WHERE is_deleted = FALSE;
-- Workouts table
CREATE TABLE IF NOT EXISTS workouts (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE
);
-- Index for faster date lookups
CREATE INDEX IF NOT EXISTS workouts_date ON workouts (date);
-- Workouts_Exercises junction table
CREATE TABLE IF NOT EXISTS workouts_exercises (
    id SERIAL PRIMARY KEY,
    workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    details TEXT
);
-- Index for faster workout lookups
CREATE INDEX IF NOT EXISTS workouts_exercises_workout ON workouts_exercises (workout_id, sort_order);
-- Enable Row Level Security (RLS) for all tables
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts_exercises ENABLE ROW LEVEL SECURITY;
-- Since this is a single-user app, we'll create policies that allow authenticated users full access
-- For exercises
CREATE POLICY "Allow authenticated users full access to exercises" ON exercises FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- For sets
CREATE POLICY "Allow authenticated users full access to sets" ON sets FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- For workouts
CREATE POLICY "Allow authenticated users full access to workouts" ON workouts FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- For workouts_exercises
CREATE POLICY "Allow authenticated users full access to workouts_exercises" ON workouts_exercises FOR ALL TO authenticated USING (true) WITH CHECK (true);
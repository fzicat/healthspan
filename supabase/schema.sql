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
-- Daily logs table: one row per day, holds both morning and evening metrics.
-- All metric columns are nullable so partial entries (morning-only, evening-only) are allowed.
CREATE TABLE IF NOT EXISTS daily_logs (
    date DATE PRIMARY KEY,
    -- Morning entries
    sleep_duration_minutes INTEGER CHECK (sleep_duration_minutes >= 0),
    sleep_score INTEGER CHECK (sleep_score BETWEEN 0 AND 100),
    sleep_hrv_rmssd NUMERIC(6, 2) CHECK (sleep_hrv_rmssd >= 0),
    morning_hrv_rmssd NUMERIC(6, 2) CHECK (morning_hrv_rmssd >= 0),
    weight_lbs NUMERIC(6, 2) CHECK (weight_lbs >= 0),
    -- Evening entries
    calories INTEGER CHECK (calories >= 0),
    protein_g NUMERIC(6, 2) CHECK (protein_g >= 0),
    fat_g NUMERIC(6, 2) CHECK (fat_g >= 0),
    carbs_g NUMERIC(6, 2) CHECK (carbs_g >= 0),
    alcohol_g NUMERIC(6, 2) CHECK (alcohol_g >= 0),
    steps INTEGER CHECK (steps >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Index for range scans (most-recent-first listings)
CREATE INDEX IF NOT EXISTS daily_logs_date_desc ON daily_logs (date DESC);
-- Auto-bump updated_at on UPDATE
CREATE OR REPLACE FUNCTION daily_logs_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS daily_logs_updated_at ON daily_logs;
CREATE TRIGGER daily_logs_updated_at
    BEFORE UPDATE ON daily_logs
    FOR EACH ROW EXECUTE FUNCTION daily_logs_set_updated_at();
-- Enable Row Level Security (RLS) for all tables
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts_exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
-- Since this is a single-user app, we'll create policies that allow authenticated users full access
-- For exercises
CREATE POLICY "Allow authenticated users full access to exercises" ON exercises FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- For sets
CREATE POLICY "Allow authenticated users full access to sets" ON sets FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- For workouts
CREATE POLICY "Allow authenticated users full access to workouts" ON workouts FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- For workouts_exercises
CREATE POLICY "Allow authenticated users full access to workouts_exercises" ON workouts_exercises FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- For daily_logs
CREATE POLICY "Allow authenticated users full access to daily_logs" ON daily_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Tag exercises as strength or cardio (default strength so existing rows are unchanged)
ALTER TABLE exercises
    ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'strength'
    CHECK (category IN ('strength', 'cardio'));
-- Cardio sessions: one row per logged session (multiple per day allowed)
CREATE TABLE IF NOT EXISTS cardio_sessions (
    id SERIAL PRIMARY KEY,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    heart_rate_avg INTEGER CHECK (heart_rate_avg BETWEEN 30 AND 250),
    heart_rate_max INTEGER CHECK (heart_rate_max BETWEEN 30 AND 250),
    perceived_intensity INTEGER CHECK (perceived_intensity BETWEEN 1 AND 10),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS cardio_sessions_date ON cardio_sessions (date DESC, logged_at DESC) WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS cardio_sessions_exercise ON cardio_sessions (exercise_id, logged_at DESC) WHERE is_deleted = FALSE;
ALTER TABLE cardio_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated users full access to cardio_sessions" ON cardio_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- Seed initial cardio types (skipped if already present via LOWER(name) unique index)
INSERT INTO exercises (name, category, metrics) VALUES
    ('Zone 2',             'cardio', '{"weight": false, "reps": false, "time": true, "distance": false, "unilateral": false, "dual_implements": false}'),
    ('HIIT',               'cardio', '{"weight": false, "reps": false, "time": true, "distance": false, "unilateral": false, "dual_implements": false}'),
    ('Group Boxing Class', 'cardio', '{"weight": false, "reps": false, "time": true, "distance": false, "unilateral": false, "dual_implements": false}')
ON CONFLICT DO NOTHING;
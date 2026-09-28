# Healthspan MCP Server

A small [Model Context Protocol](https://modelcontextprotocol.io/) server that exposes your
Healthspan data (exercises, sets, workouts, daily health logs) to a local AI agent — e.g. a
Fitness Coach running inside Claude Code, Hermes, or any other MCP-capable harness.

It talks to your Supabase Postgres directly using the **service role key**. Reads cover all
data; **writes are deliberately narrow** so the agent can plan ahead without rewriting history:

- It may **create exercises** (duplicate-guarded — see below) and **create/edit workouts and
  their planned exercises for today or any future date**.
- It **cannot** edit past-dated workouts, and there is **no** tool to edit or delete exercises,
  so anything already logged stays intact.

> **Coaching agent?** Load [`COACH_PLAYBOOK.md`](./COACH_PLAYBOOK.md) as the agent's system
> prompt. It encodes the week-planning workflow (prime on recovery → plan → adjust) and the
> duplicate-prevention discipline that the per-tool descriptions don't fully convey.

### Duplicate-safe exercise creation

Strength moves have many aliases (`DB Bench Press` == `Dumbbell Chest Press`). To avoid junk
duplicates, creation is layered: a `LOWER(name)` unique index blocks exact dupes, a `pg_trgm`
trigram search (`find_similar_exercises`) surfaces near-matches, and `create_exercise` refuses
to insert when a similar exercise exists unless called with `confirm_create=true`. The agent is
expected to search first and reuse an existing `exercise_id` whenever the movement already exists.

## Setup

1. **Install dependencies** (separate from the Next.js app):

   ```bash
   cd mcp-server
   npm install
   ```

2. **Add the service role key** to the repo's `.env.local` (one level up):

   ```env
   # Already used by the Next.js app:
   NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=...

   # New — needed only by this MCP server.
   # Get it from Supabase Dashboard > Project Settings > API > service_role.
   # NEVER prefix this with NEXT_PUBLIC_ — it must stay server-side only.
   SUPABASE_SERVICE_ROLE_KEY=...
   ```

3. **Smoke test with the MCP Inspector**:

   ```bash
   npm run inspect
   ```

   Then call each tool (e.g. `search_exercises` with no args, `get_summary` with no args).

## Wiring into a harness

### Claude Code (`~/.claude/mcp.json` or project-level)

```json
{
  "mcpServers": {
    "healthspan-data": {
      "command": "npx",
      "args": [
        "-y",
        "tsx",
        "/home/hermes/projects/healthspan/mcp-server/src/index.ts"
      ]
    }
  }
}
```

The server auto-loads `../.env.local`, so you don't need to pass the secrets in `env`.

### Other harnesses (Hermes, etc.)

Same pattern — point at the `src/index.ts` entrypoint and let it speak MCP over stdio.

## Tools

| Tool | Purpose |
|---|---|
| `search_exercises({ query?, limit? })` | Resolve an exercise name to an `exercise_id`. |
| `list_recent_workouts({ limit?, before_date? })` | Workout days with their planned exercise list. |
| `get_workout_by_date({ date })` | Planned exercises + all sets logged on one day. |
| `get_exercise_history({ exercise_id, limit?, from?, to? })` | Sets for one exercise, most recent first. |
| `list_sets({ exercise_id?, from?, to?, limit? })` | Generic set query across exercises. |
| `get_summary({ from?, to? })` | Workout / set counts and per-exercise volume in a date range. |
| `get_daily_log({ date })` | Morning + evening metrics for one day (sleep, HRV, weight, nutrition, alcohol, steps). |
| `list_daily_logs({ from?, to?, limit? })` | Time-series of daily logs (most recent first) for trend analysis. |

### Write tools (today or later only)

| Tool | Purpose |
|---|---|
| `find_similar_exercises({ query, threshold?, limit? })` | Fuzzy-search existing exercises before creating one (dedup). |
| `create_exercise({ name, category?, metrics?, confirm_create? })` | Create an exercise; refuses on possible duplicates unless `confirm_create`. |
| `create_or_update_workout({ date, name?, note? })` | Create a workout for a date and/or set its name/note. |
| `add_workout_exercise({ date, exercise_id, details?, note?, sort_order? })` | Append a planned exercise (creates the workout if needed). |
| `update_workout_exercise({ workout_exercise_id, details?, note?, sort_order? })` | Edit a planned exercise. |
| `remove_workout_exercise({ workout_exercise_id })` | Remove a planned exercise. |

All tools return JSON. Soft-deleted rows (`is_deleted = true`) are excluded everywhere.
Write tools enforce a **today-or-later** date window; past-dated workouts are rejected.

### Daily-log field reference

`daily_logs` rows expose these metric columns (all nullable):

- `sleep_duration_minutes` — total sleep in minutes
- `sleep_score` — 0–100 (manual entry from Fitbit)
- `sleep_hrv_rmssd` — overnight HRV in ms RMSSD (Fitbit / Pixel Watch)
- `morning_hrv_rmssd` — morning HRV in ms RMSSD (EliteHRV + Polar H10)
- `weight_lbs` — body weight in pounds
- `calories` — total kcal for the day
- `protein_g`, `fat_g`, `carbs_g`, `alcohol_g` — grams
- `steps` — daily step count

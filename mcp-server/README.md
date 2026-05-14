# Healthspan MCP Server

A small **read-only** [Model Context Protocol](https://modelcontextprotocol.io/) server that
exposes your Healthspan data (exercises, sets, workouts) to a local AI agent —
e.g. a Fitness Coach running inside Claude Code, Hermes, or any other MCP-capable harness.

It talks to your Supabase Postgres directly using the **service role key** and only registers
read tools. There are no insert / update / delete tools, so the agent cannot mutate your log
even if asked to.

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

All tools return JSON. Soft-deleted rows (`is_deleted = true`) are excluded everywhere.

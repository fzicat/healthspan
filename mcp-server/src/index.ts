#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { z } from "zod";

import { searchExercises } from "./tools/exercises.ts";
import { getExerciseHistory, listSets } from "./tools/sets.ts";
import {
  getSummary,
  getWorkoutByDate,
  listRecentWorkouts,
} from "./tools/workouts.ts";
import { getDailyLog, listDailyLogs } from "./tools/daily-logs.ts";
import { listCardioSessions } from "./tools/cardio.ts";
import { listBreathworkSessions } from "./tools/breathwork.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__dirname, "../../.env.local") });
loadDotenv({ path: resolve(__dirname, "../../.env") });

const server = new McpServer({
  name: "healthspan-data",
  version: "0.1.0",
});

function json(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

server.registerTool(
  "search_exercises",
  {
    title: "Search exercises",
    description:
      "List exercise definitions, optionally filtered by name substring (case-insensitive). " +
      "Use this first to resolve an exercise name into an exercise_id. " +
      "Excludes soft-deleted exercises.",
    inputSchema: {
      query: z
        .string()
        .optional()
        .describe("Optional substring to match against exercise name."),
      category: z
        .enum(["strength", "cardio"])
        .optional()
        .describe("Filter by exercise category."),
      limit: z.number().int().min(1).max(200).optional(),
    },
  },
  async ({ query, category, limit }) =>
    json(await searchExercises({ query, category, limit }))
);

server.registerTool(
  "list_recent_workouts",
  {
    title: "List recent workouts",
    description:
      "Returns recent workout days (most recent first), each with the ordered list of planned exercises. " +
      "Use for a quick overview of training cadence.",
    inputSchema: {
      limit: z.number().int().min(1).max(100).optional(),
      before_date: z
        .string()
        .optional()
        .describe(
          "ISO date (YYYY-MM-DD). Only return workouts strictly before this date."
        ),
    },
  },
  async ({ limit, before_date }) =>
    json(await listRecentWorkouts({ limit, before_date }))
);

server.registerTool(
  "get_workout_by_date",
  {
    title: "Get workout by date",
    description:
      "Full detail for one workout day: the planned exercises (from workouts_exercises) plus every set logged that day.",
    inputSchema: {
      date: z
        .string()
        .describe("ISO date (YYYY-MM-DD) of the workout day."),
    },
  },
  async ({ date }) => json(await getWorkoutByDate({ date }))
);

server.registerTool(
  "get_exercise_history",
  {
    title: "Get exercise history",
    description:
      "Time-series of sets for a single exercise (most recent first). The primary lens for analyzing progression, " +
      "plateaus, deload needs. Resolve exercise_id with search_exercises first.",
    inputSchema: {
      exercise_id: z.number().int().positive(),
      limit: z.number().int().min(1).max(500).optional(),
      from: z
        .string()
        .optional()
        .describe("ISO datetime. Only include sets logged at or after this."),
      to: z
        .string()
        .optional()
        .describe("ISO datetime. Only include sets logged at or before this."),
    },
  },
  async ({ exercise_id, limit, from, to }) =>
    json(await getExerciseHistory({ exercise_id, limit, from, to }))
);

server.registerTool(
  "list_sets",
  {
    title: "List sets",
    description:
      "Generic set query across all exercises with optional filters. Each set includes the exercise name. " +
      "Prefer get_exercise_history when you already know the exercise.",
    inputSchema: {
      exercise_id: z.number().int().positive().optional(),
      from: z.string().optional().describe("ISO datetime lower bound."),
      to: z.string().optional().describe("ISO datetime upper bound."),
      limit: z.number().int().min(1).max(500).optional(),
    },
  },
  async (args) => json(await listSets(args))
);

server.registerTool(
  "get_summary",
  {
    title: "Get training summary",
    description:
      "Aggregate counts across a date range: total workouts, total sets, and sets-per-exercise tally. " +
      "Use for quick context priming at the start of a coaching session.",
    inputSchema: {
      from: z.string().optional().describe("ISO date (YYYY-MM-DD)."),
      to: z.string().optional().describe("ISO date (YYYY-MM-DD)."),
    },
  },
  async ({ from, to }) => json(await getSummary({ from, to }))
);

server.registerTool(
  "get_daily_log",
  {
    title: "Get daily log",
    description:
      "Returns the daily health log for one date: morning entries (sleep duration in minutes, " +
      "sleep score 0-100, sleep HRV RMSSD, morning HRV RMSSD, body weight in lbs) and evening entries " +
      "(calories, protein/fat/carbs/alcohol in grams, steps). Any field may be null when not logged. " +
      "Returns null if no entry exists for that date.",
    inputSchema: {
      date: z
        .string()
        .describe("ISO date (YYYY-MM-DD) of the day to fetch."),
    },
  },
  async ({ date }) => json(await getDailyLog({ date }))
);

server.registerTool(
  "list_daily_logs",
  {
    title: "List daily logs",
    description:
      "Time-series of daily health logs (most recent first). Use for trend analysis: " +
      "sleep quality, HRV (recovery), body weight, nutrition (calories/macros/alcohol in g), activity (steps). " +
      "Pair with workout data to correlate recovery markers with training load.",
    inputSchema: {
      from: z
        .string()
        .optional()
        .describe("ISO date (YYYY-MM-DD). Only include logs on or after this date."),
      to: z
        .string()
        .optional()
        .describe("ISO date (YYYY-MM-DD). Only include logs on or before this date."),
      limit: z.number().int().min(1).max(365).optional(),
    },
  },
  async ({ from, to, limit }) =>
    json(await listDailyLogs({ from, to, limit }))
);

server.registerTool(
  "list_cardio_sessions",
  {
    title: "List cardio sessions",
    description:
      "Time-series of cardio sessions (most recent first), each with the cardio exercise name. " +
      "Each session has duration_minutes, optional heart_rate_avg/max, perceived_intensity (1-10), and notes. " +
      "Filter by exercise_id (resolve via search_exercises with category='cardio') and/or date range.",
    inputSchema: {
      exercise_id: z.number().int().positive().optional(),
      from: z
        .string()
        .optional()
        .describe("ISO date (YYYY-MM-DD). Only include sessions on or after this date."),
      to: z
        .string()
        .optional()
        .describe("ISO date (YYYY-MM-DD). Only include sessions on or before this date."),
      limit: z.number().int().min(1).max(500).optional(),
    },
  },
  async (args) => json(await listCardioSessions(args))
);

server.registerTool(
  "list_breathwork_sessions",
  {
    title: "List breathwork sessions",
    description:
      "Time-series of breathwork sessions (most recent first). Each session has a type " +
      "(e.g., 'Resonance Breathing'), duration_minutes, sauna flag (true if performed in a sauna), " +
      "optional time of day, optional heart_rate_end (bpm measured at the end of the session), " +
      "and optional comments. Filter by type, sauna, and/or date range.",
    inputSchema: {
      type: z
        .string()
        .optional()
        .describe("Filter by breathwork type (e.g., 'Resonance Breathing')."),
      sauna: z
        .boolean()
        .optional()
        .describe("Filter to sessions performed in a sauna (true) or not (false)."),
      from: z
        .string()
        .optional()
        .describe("ISO date (YYYY-MM-DD). Only include sessions on or after this date."),
      to: z
        .string()
        .optional()
        .describe("ISO date (YYYY-MM-DD). Only include sessions on or before this date."),
      limit: z.number().int().min(1).max(500).optional(),
    },
  },
  async (args) => json(await listBreathworkSessions(args))
);

const transport = new StdioServerTransport();
await server.connect(transport);

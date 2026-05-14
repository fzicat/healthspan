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
      limit: z.number().int().min(1).max(200).optional(),
    },
  },
  async ({ query, limit }) => json(await searchExercises({ query, limit }))
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

const transport = new StdioServerTransport();
await server.connect(transport);

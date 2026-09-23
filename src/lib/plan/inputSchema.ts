import { z } from "zod";
import { BRIDGE_MIN_WEEKS, MAX_WEEKS, bridgeTotalWeeks } from "./periodize";
import { diffDaysISO } from "./dates";

export const raceTypeEnum = z.enum(["5k", "10k", "half", "marathon", "50k", "100k", "100mi", "custom"]);
/** Distances usable as a recent-race fitness marker (anything with a fixed length). */
export const knownRaceTypeEnum = z.enum(["5k", "10k", "half", "marathon", "50k", "100k", "100mi"]);

/** Priorities a supporting race can carry (the goal race is the A race). */
export const racePriorityEnum = z.enum(["b", "c"]);

/** How far before the goal race another race has to sit to be worth planning. */
export const MIN_RACE_LEAD_DAYS = 7;

/** Most races one plan can carry alongside the goal race. */
export const MAX_SUPPORTING_RACES = 6;

/** A B or C race inside the plan. */
export const supportingRaceSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().trim().max(60).nullish(),
    raceType: raceTypeEnum,
    customDistanceKm: z.number().positive().min(1).max(500).nullable().optional(),
    dateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
    priority: racePriorityEnum,
    goalTimeS: z.number().int().positive().max(48 * 3600).nullish(),
  })
  .superRefine((val, ctx) => {
    if (val.raceType === "custom" && !val.customDistanceKm) {
      ctx.addIssue({
        code: "custom",
        path: ["customDistanceKm"],
        message: "Enter a distance for your custom race",
      });
    }
  });

/** Canonical (metric) plan-generation input, validated on the client and server. */
export const planInputSchema = z.object({
  name: z.string().trim().max(80).optional(),
  raceType: raceTypeEnum,
  customDistanceKm: z.number().positive().min(1).max(500).nullable().optional(),
  goalTimeS: z.number().int().positive().max(48 * 3600),
  raceDateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  currentFitness: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("race"),
      raceType: knownRaceTypeEnum,
      timeS: z.number().int().positive().max(48 * 3600),
    }),
    z.object({
      mode: z.literal("estimate"),
      weeklyKm: z.number().positive().max(400),
      easyPaceSecPerKm: z.number().positive().max(1200),
    }),
  ]),
  startVolumeKm: z.number().positive().max(300),
  peakVolumeKm: z.number().positive().max(400),
  daysPerWeek: z.number().int().min(3).max(7),
  longRunDow: z.number().int().min(1).max(7),
  restDow: z.number().int().min(1).max(7).nullable().optional(),
  includeTuneups: z.boolean(),
  /** Other races in the season (B and C priority), folded into the schedule. */
  races: z.array(supportingRaceSchema).max(MAX_SUPPORTING_RACES).default([]),
  allowDoubles: z.boolean().default(false),
  includeStrength: z.boolean().default(false),
  experience: z.enum(["beginner"]).nullish(),
  continuation: z
    .object({
      prevRaceDateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
      prevRaceDistanceKm: z.number().positive().max(500),
    })
    .nullish(),
}).superRefine((val, ctx) => {
  if (val.raceType === "custom" && !val.customDistanceKm) {
    ctx.addIssue({
      code: "custom",
      path: ["customDistanceKm"],
      message: "Enter a distance for your custom race",
    });
  }
  const seenDates = new Set<string>();
  for (const race of val.races ?? []) {
    if (diffDaysISO(val.raceDateISO, race.dateISO) < MIN_RACE_LEAD_DAYS) {
      ctx.addIssue({
        code: "custom",
        path: ["races"],
        message: `Other races need to be at least ${MIN_RACE_LEAD_DAYS} days before your goal race`,
      });
    }
    if (seenDates.has(race.dateISO)) {
      ctx.addIssue({
        code: "custom",
        path: ["races"],
        message: "Two races on the same day — give each one its own date",
      });
    }
    seenDates.add(race.dateISO);
  }
  if (val.continuation) {
    const weeks = bridgeTotalWeeks(val.continuation.prevRaceDateISO, val.raceDateISO);
    if (weeks < BRIDGE_MIN_WEEKS || weeks > MAX_WEEKS) {
      ctx.addIssue({
        code: "custom",
        path: ["raceDateISO"],
        message: `Your next race must be ${BRIDGE_MIN_WEEKS} to ${MAX_WEEKS} weeks after the previous one`,
      });
    }
  }
});

export type PlanInput = z.infer<typeof planInputSchema>;

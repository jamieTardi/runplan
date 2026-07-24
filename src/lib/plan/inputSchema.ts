import { z } from "zod";

export const raceTypeEnum = z.enum(["5k", "10k", "half", "marathon", "50k", "100k", "100mi", "custom"]);
/** Distances usable as a recent-race fitness marker (anything with a fixed length). */
export const knownRaceTypeEnum = z.enum(["5k", "10k", "half", "marathon", "50k", "100k", "100mi"]);

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
  allowDoubles: z.boolean().default(false),
  includeStrength: z.boolean().default(false),
  experience: z.enum(["beginner"]).nullish(),
}).superRefine((val, ctx) => {
  if (val.raceType === "custom" && !val.customDistanceKm) {
    ctx.addIssue({
      code: "custom",
      path: ["customDistanceKm"],
      message: "Enter a distance for your custom race",
    });
  }
});

export type PlanInput = z.infer<typeof planInputSchema>;

import { z } from "zod";

export const raceTypeEnum = z.enum(["5k", "10k", "half", "marathon"]);

/** Canonical (metric) plan-generation input, validated on the client and server. */
export const planInputSchema = z.object({
  name: z.string().trim().max(80).optional(),
  raceType: raceTypeEnum,
  goalTimeS: z.number().int().positive().max(24 * 3600),
  raceDateISO: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date"),
  currentFitness: z.discriminatedUnion("mode", [
    z.object({
      mode: z.literal("race"),
      raceType: raceTypeEnum,
      timeS: z.number().int().positive().max(24 * 3600),
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
});

export type PlanInput = z.infer<typeof planInputSchema>;

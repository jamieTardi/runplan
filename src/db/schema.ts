import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name").notNull(),
  // Display-unit preference; canonical storage is always metric.
  unitPref: text("unit_pref", { enum: ["km", "mi"] }).notNull().default("km"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable(
  "sessions",
  {
    // Opaque random token stored in an httpOnly cookie.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Training plans
// ---------------------------------------------------------------------------

export const raceTypes = ["5k", "10k", "half", "marathon"] as const;
export type RaceType = (typeof raceTypes)[number];

export const phases = ["endurance", "lt", "race_prep", "taper"] as const;
export type Phase = (typeof phases)[number];

export const workoutTypes = [
  "rest",
  "recovery",
  "easy",
  "general_aerobic",
  "medium_long",
  "long",
  "marathon_pace",
  "threshold",
  "vo2",
  "intervals",
  "strides",
  "race",
] as const;
export type WorkoutType = (typeof workoutTypes)[number];

export const plans = pgTable(
  "plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    raceType: text("race_type", { enum: raceTypes }).notNull(),
    goalTimeS: integer("goal_time_s").notNull(),
    raceDate: date("race_date").notNull(),
    methodology: text("methodology").notNull().default("pfitzinger"),
    startVolumeKm: real("start_volume_km").notNull(),
    peakVolumeKm: real("peak_volume_km").notNull(),
    daysPerWeek: integer("days_per_week").notNull(),
    // ISO day of week the long run lands on (1 = Mon … 7 = Sun).
    longRunDow: integer("long_run_dow").notNull().default(7),
    goalVdot: real("goal_vdot").notNull(),
    currentVdot: real("current_vdot").notNull(),
    includeTuneups: boolean("include_tuneups").notNull().default(true),
    status: text("status", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    // Raw generator inputs, so a plan can be regenerated deterministically.
    paramsSnapshot: jsonb("params_snapshot").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("plans_user_idx").on(t.userId)],
);

export const weeks = pgTable(
  "weeks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    weekIndex: integer("week_index").notNull(),
    phase: text("phase", { enum: phases }).notNull(),
    plannedVolumeKm: real("planned_volume_km").notNull(),
    isCutback: boolean("is_cutback").notNull().default(false),
    startDate: date("start_date").notNull(),
  },
  (t) => [index("weeks_plan_idx").on(t.planId)],
);

export const workouts = pgTable(
  "workouts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    weekId: uuid("week_id")
      .notNull()
      .references(() => weeks.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    dow: integer("dow").notNull(), // 1 = Mon … 7 = Sun
    type: text("type", { enum: workoutTypes }).notNull(),
    distanceKm: real("distance_km").notNull().default(0),
    paceLowSPerKm: integer("pace_low_s_per_km"),
    paceHighSPerKm: integer("pace_high_s_per_km"),
    // Structured segments for quality sessions, e.g. reps / MP blocks.
    segments: jsonb("segments"),
    description: text("description").notNull().default(""),
    completed: boolean("completed").notNull().default(false),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    actualDistanceKm: real("actual_distance_km"),
    actualDurationS: integer("actual_duration_s"),
    notes: text("notes"),
  },
  (t) => [index("workouts_plan_idx").on(t.planId), index("workouts_week_idx").on(t.weekId)],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  plans: many(plans),
  sessions: many(sessions),
}));

export const plansRelations = relations(plans, ({ one, many }) => ({
  user: one(users, { fields: [plans.userId], references: [users.id] }),
  weeks: many(weeks),
  workouts: many(workouts),
}));

export const weeksRelations = relations(weeks, ({ one, many }) => ({
  plan: one(plans, { fields: [weeks.planId], references: [plans.id] }),
  workouts: many(workouts),
}));

export const workoutsRelations = relations(workouts, ({ one }) => ({
  plan: one(plans, { fields: [workouts.planId], references: [plans.id] }),
  week: one(weeks, { fields: [workouts.weekId], references: [weeks.id] }),
}));

export type User = typeof users.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Week = typeof weeks.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;

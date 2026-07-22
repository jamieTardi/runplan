import {
  bigint,
  boolean,
  primaryKey,
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
  // Null for SSO-only accounts (they can add a password via the reset flow).
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  // Billing: free | pro (Stripe subscription) | comp (complimentary, never expires).
  plan: text("plan", { enum: ["free", "pro", "comp"] }).notNull().default("free"),
  // For "pro": end of the paid period (+grace). Null for free/comp.
  planExpiresAt: timestamp("plan_expires_at", { withTimezone: true }),
  stripeCustomerId: text("stripe_customer_id"),
  // Admin panel access. Set via SQL only — never through the API.
  isAdmin: boolean("is_admin").notNull().default(false),
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

// Processed Stripe webhook events — dedupe on retries.
export const billingEvents = pgTable("billing_events", {
  id: text("id").primaryKey(), // Stripe event id
  type: text("type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// External identity providers (Google today; extensible to more).
export const oauthAccounts = pgTable(
  "oauth_accounts",
  {
    provider: text("provider").notNull(), // e.g. "google"
    providerUserId: text("provider_user_id").notNull(), // e.g. Google `sub`
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.provider, t.providerUserId] }),
    index("oauth_accounts_user_idx").on(t.userId),
  ],
);

// Single-use tokens for signup email verification (same shape as password reset).
export const emailVerificationTokens = pgTable(
  "email_verification_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_verification_user_idx").on(t.userId)],
);

// Single-use, short-lived tokens for the email password-reset flow. Only a
// SHA-256 hash of the token is stored; the raw value lives in the email link.
export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("password_reset_user_idx").on(t.userId)],
);

// WebAuthn credentials (passkeys) — biometric/device sign-in.
export const passkeys = pgTable(
  "passkeys",
  {
    // Credential ID as base64url, as produced by the authenticator.
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    publicKey: text("public_key").notNull(), // base64
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    transports: text("transports"), // comma-separated hints
    name: text("name").notNull().default("Passkey"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  },
  (t) => [index("passkeys_user_idx").on(t.userId)],
);

// ---------------------------------------------------------------------------
// Training plans
// ---------------------------------------------------------------------------

export const raceTypes = ["5k", "10k", "half", "marathon", "50k", "100k", "100mi", "custom"] as const;
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
    // Distance in km when raceType is "custom"; null for standard distances.
    customDistanceKm: real("custom_distance_km"),
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
    // Garmin activity this workout was completed from (set by the sync).
    garminActivityId: bigint("garmin_activity_id", { mode: "number" }),
  },
  (t) => [index("workouts_plan_idx").on(t.planId), index("workouts_week_idx").on(t.weekId)],
);

// Uploaded race-course GPX, one per plan (route + elevation, downsampled).
export const raceCourses = pgTable("race_courses", {
  planId: uuid("plan_id")
    .primaryKey()
    .references(() => plans.id, { onDelete: "cascade" }),
  name: text("name"),
  distanceM: real("distance_m").notNull(),
  elevGainM: real("elev_gain_m"),
  elevLossM: real("elev_loss_m"),
  route: jsonb("route").notNull(), // [[lat, lng], …]
  elevSeries: jsonb("elev_series").notNull(), // [{dM, elevM}, …]
  uploadedAt: timestamp("uploaded_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Garmin Connect integration
// ---------------------------------------------------------------------------

export const garminAccounts = pgTable("garmin_accounts", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  // Garmin display name, for the settings UI.
  garminUserName: text("garmin_user_name"),
  // OAuth1 + OAuth2 tokens exported by the Garmin client. The Garmin password
  // is never stored; tokens rotate in place when the client refreshes them.
  tokens: jsonb("tokens").notNull(),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Fetched-once cache of per-activity detail (laps, HR/pace series, route),
// so the workout page doesn't hit Garmin on every view.
export const garminActivityCache = pgTable("garmin_activity_cache", {
  activityId: bigint("activity_id", { mode: "number" }).primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export const garminAccountsRelations = relations(garminAccounts, ({ one }) => ({
  user: one(users, { fields: [garminAccounts.userId], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type Plan = typeof plans.$inferSelect;
export type Week = typeof weeks.$inferSelect;
export type Workout = typeof workouts.$inferSelect;
export type NewWorkout = typeof workouts.$inferInsert;
export type GarminAccount = typeof garminAccounts.$inferSelect;
export type RaceCourse = typeof raceCourses.$inferSelect;
export type Passkey = typeof passkeys.$inferSelect;

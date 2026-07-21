CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"race_type" text NOT NULL,
	"goal_time_s" integer NOT NULL,
	"race_date" date NOT NULL,
	"methodology" text DEFAULT 'pfitzinger' NOT NULL,
	"start_volume_km" real NOT NULL,
	"peak_volume_km" real NOT NULL,
	"days_per_week" integer NOT NULL,
	"long_run_dow" integer DEFAULT 7 NOT NULL,
	"goal_vdot" real NOT NULL,
	"current_vdot" real NOT NULL,
	"include_tuneups" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"params_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"name" text NOT NULL,
	"unit_pref" text DEFAULT 'km' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "weeks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"week_index" integer NOT NULL,
	"phase" text NOT NULL,
	"planned_volume_km" real NOT NULL,
	"is_cutback" boolean DEFAULT false NOT NULL,
	"start_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"week_id" uuid NOT NULL,
	"date" date NOT NULL,
	"dow" integer NOT NULL,
	"type" text NOT NULL,
	"distance_km" real DEFAULT 0 NOT NULL,
	"pace_low_s_per_km" integer,
	"pace_high_s_per_km" integer,
	"segments" jsonb,
	"description" text DEFAULT '' NOT NULL,
	"completed" boolean DEFAULT false NOT NULL,
	"completed_at" timestamp with time zone,
	"actual_distance_km" real,
	"actual_duration_s" integer,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "plans" ADD CONSTRAINT "plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weeks" ADD CONSTRAINT "weeks_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workouts" ADD CONSTRAINT "workouts_week_id_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weeks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plans_user_idx" ON "plans" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "weeks_plan_idx" ON "weeks" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "workouts_plan_idx" ON "workouts" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "workouts_week_idx" ON "workouts" USING btree ("week_id");
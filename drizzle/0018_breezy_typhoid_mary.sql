ALTER TABLE "workouts" ADD COLUMN "cross_activity" text;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "planned_duration_s" integer;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "replaced_from" jsonb;
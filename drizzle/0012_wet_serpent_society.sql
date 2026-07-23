ALTER TABLE "plans" ADD COLUMN "allow_doubles" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "session" text DEFAULT 'am' NOT NULL;
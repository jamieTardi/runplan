CREATE TABLE "garmin_activity_cache" (
	"activity_id" bigint PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workouts" ADD COLUMN "garmin_activity_id" bigint;--> statement-breakpoint
ALTER TABLE "garmin_activity_cache" ADD CONSTRAINT "garmin_activity_cache_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
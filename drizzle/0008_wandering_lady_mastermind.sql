CREATE TABLE "race_courses" (
	"plan_id" uuid PRIMARY KEY NOT NULL,
	"name" text,
	"distance_m" real NOT NULL,
	"elev_gain_m" real,
	"elev_loss_m" real,
	"route" jsonb NOT NULL,
	"elev_series" jsonb NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "race_courses" ADD CONSTRAINT "race_courses_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE cascade ON UPDATE no action;
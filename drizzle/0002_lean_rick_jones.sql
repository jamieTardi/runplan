CREATE TABLE "garmin_accounts" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"garmin_user_name" text,
	"tokens" jsonb NOT NULL,
	"last_sync_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "garmin_accounts" ADD CONSTRAINT "garmin_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
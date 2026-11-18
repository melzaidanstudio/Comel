ALTER TABLE "threads_accounts" ADD COLUMN "repliz_account_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "threads_accounts" ADD COLUMN "picture" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "threads_accounts" ADD COLUMN "is_connected" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "threads_accounts" ADD COLUMN "synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "threads_accounts" ADD COLUMN "hourly_limit" integer DEFAULT 10 NOT NULL;
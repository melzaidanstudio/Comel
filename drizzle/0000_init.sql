CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"account_id" integer,
	"trigger_id" integer,
	"kind" text NOT NULL,
	"target_code" text,
	"target_id" text,
	"target_user" text,
	"target_text" text,
	"target_url" text,
	"metrics" jsonb,
	"reply_text" text,
	"status" text NOT NULL,
	"error" text,
	"result_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personas" (
	"scope" text PRIMARY KEY NOT NULL,
	"soul" text DEFAULT '' NOT NULL,
	"memory" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "providers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'openai' NOT NULL,
	"base_url" text NOT NULL,
	"api_key" text DEFAULT '' NOT NULL,
	"model" text NOT NULL,
	"temperature" real DEFAULT 0.8 NOT NULL,
	"max_tokens" integer DEFAULT 400 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"norm" text PRIMARY KEY NOT NULL,
	"tag_id" text DEFAULT '' NOT NULL,
	"name" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"is_community" boolean DEFAULT false NOT NULL,
	"seen_count" integer DEFAULT 0 NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "threads_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"method" text DEFAULT 'api' NOT NULL,
	"access_token" text DEFAULT '' NOT NULL,
	"threads_user_id" text DEFAULT '' NOT NULL,
	"token_refreshed_at" timestamp with time zone,
	"cookies" text DEFAULT '' NOT NULL,
	"browser_engine" text DEFAULT 'chromium' NOT NULL,
	"login_engine" text DEFAULT 'lightpanda' NOT NULL,
	"scrape_with_cookies" boolean DEFAULT false NOT NULL,
	"login_username" text DEFAULT '' NOT NULL,
	"login_password_enc" text DEFAULT '' NOT NULL,
	"totp_secret_enc" text DEFAULT '' NOT NULL,
	"auto_login" boolean DEFAULT true NOT NULL,
	"last_login_attempt" timestamp with time zone,
	"login_paused" boolean DEFAULT false NOT NULL,
	"daily_limit" integer DEFAULT 50 NOT NULL,
	"provider_id" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"reply_enabled" boolean DEFAULT false NOT NULL,
	"reply_interval_minutes" integer DEFAULT 30 NOT NULL,
	"reply_per_run" integer DEFAULT 5 NOT NULL,
	"reply_scope" text DEFAULT 'both' NOT NULL,
	"reply_max_age_hours" integer DEFAULT 48 NOT NULL,
	"reply_instruction" text DEFAULT '' NOT NULL,
	"reply_dry_run" boolean DEFAULT false NOT NULL,
	"reply_active_hours" text DEFAULT '' NOT NULL,
	"next_reply_at" timestamp with time zone,
	"last_reply_status" text DEFAULT '' NOT NULL,
	"status_note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "triggers" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"account_id" integer NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"queries" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"match_expr" text DEFAULT '' NOT NULL,
	"exclude_words" text DEFAULT '' NOT NULL,
	"exclude_users" text DEFAULT '' NOT NULL,
	"include_replies" boolean DEFAULT false NOT NULL,
	"topic_tags" text DEFAULT '' NOT NULL,
	"exclude_tags" text DEFAULT '' NOT NULL,
	"tag_match" text DEFAULT 'exact' NOT NULL,
	"tag_as_source" boolean DEFAULT true NOT NULL,
	"min_likes" integer DEFAULT 0 NOT NULL,
	"min_replies" integer DEFAULT 0 NOT NULL,
	"min_reposts" integer DEFAULT 0 NOT NULL,
	"min_shares" integer DEFAULT 0 NOT NULL,
	"min_quotes" integer DEFAULT 0 NOT NULL,
	"metric_logic" text DEFAULT 'all' NOT NULL,
	"max_age_hours" integer DEFAULT 0 NOT NULL,
	"min_age_minutes" integer DEFAULT 0 NOT NULL,
	"active_hours" text DEFAULT '' NOT NULL,
	"sort_by" text DEFAULT 'engagement' NOT NULL,
	"actions_per_run" integer DEFAULT 3 NOT NULL,
	"interval_minutes" integer DEFAULT 15 NOT NULL,
	"author_cooldown_hours" integer DEFAULT 24 NOT NULL,
	"instruction" text DEFAULT '' NOT NULL,
	"provider_id" integer,
	"dry_run" boolean DEFAULT false NOT NULL,
	"next_run_at" timestamp with time zone,
	"last_run_at" timestamp with time zone,
	"last_status" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_account_id_threads_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."threads_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_trigger_id_triggers_id_fk" FOREIGN KEY ("trigger_id") REFERENCES "public"."triggers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "threads_accounts" ADD CONSTRAINT "threads_accounts_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_account_id_threads_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."threads_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_provider_id_providers_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."providers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_account_id_target_code_index" ON "actions" USING btree ("account_id","target_code");--> statement-breakpoint
CREATE INDEX "actions_account_id_created_at_index" ON "actions" USING btree ("account_id","created_at");--> statement-breakpoint
CREATE INDEX "logs_ts_index" ON "logs" USING btree ("ts");
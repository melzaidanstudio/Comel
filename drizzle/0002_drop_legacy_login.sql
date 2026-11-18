ALTER TABLE "triggers" ALTER COLUMN "author_cooldown_hours" SET DEFAULT 168;--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "method";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "access_token";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "threads_user_id";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "token_refreshed_at";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "cookies";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "browser_engine";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "login_engine";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "scrape_with_cookies";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "login_username";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "login_password_enc";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "totp_secret_enc";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "auto_login";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "last_login_attempt";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "login_paused";--> statement-breakpoint
ALTER TABLE "threads_accounts" DROP COLUMN "reply_scope";
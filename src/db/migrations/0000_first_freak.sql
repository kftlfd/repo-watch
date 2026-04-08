CREATE TABLE "repo-watch_repositories" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text NOT NULL,
	"last_seen_tag" text,
	"last_checked_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repo-watch_repositories_full_name_unique" UNIQUE("full_name")
);
--> statement-breakpoint
CREATE TABLE "repo-watch_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"repository_id" serial NOT NULL,
	"confirmed_at" timestamp,
	"removed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repo-watch_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_hash" text NOT NULL,
	"email" text NOT NULL,
	"repository_id" serial NOT NULL,
	"type" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "repo-watch_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "repo-watch_subscriptions" ADD CONSTRAINT "repo-watch_subscriptions_repository_id_repo-watch_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repo-watch_repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repo-watch_tokens" ADD CONSTRAINT "repo-watch_tokens_repository_id_repo-watch_repositories_id_fk" FOREIGN KEY ("repository_id") REFERENCES "public"."repo-watch_repositories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repositories_last_checked_at_idx" ON "repo-watch_repositories" USING btree ("last_checked_at");--> statement-breakpoint
CREATE INDEX "repositories_is_active_idx" ON "repo-watch_repositories" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "subscriptions_repository_id_idx" ON "repo-watch_subscriptions" USING btree ("repository_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_email_repository_id_active_idx" ON "repo-watch_subscriptions" USING btree ("email","repository_id") WHERE "repo-watch_subscriptions"."removed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "tokens_token_hash_idx" ON "repo-watch_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "tokens_expires_at_idx" ON "repo-watch_tokens" USING btree ("expires_at");
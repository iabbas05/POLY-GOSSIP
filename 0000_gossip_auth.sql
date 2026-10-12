CREATE TABLE IF NOT EXISTS `students` (
  `email` text PRIMARY KEY NOT NULL,
  `password_hash` text NOT NULL,
  `password_salt` text NOT NULL,
  `verified_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_tokens` (
  `id` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `purpose` text NOT NULL,
  `code_hash` text,
  `token_hash` text,
  `expires_at` integer NOT NULL,
  `attempts` integer DEFAULT 0 NOT NULL,
  `consumed_at` integer,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `auth_tokens_email_purpose_idx` ON `auth_tokens` (`email`, `purpose`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
  `token_hash` text PRIMARY KEY NOT NULL,
  `email` text NOT NULL,
  `expires_at` integer NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sessions_email_idx` ON `sessions` (`email`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `auth_limits` (
  `bucket` text PRIMARY KEY NOT NULL,
  `count` integer NOT NULL,
  `reset_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `posts` (`id` text PRIMARY KEY NOT NULL, `author_email` text NOT NULL, `tag` text NOT NULL, `body` text NOT NULL, `status` text NOT NULL DEFAULT 'published', `created_at` integer NOT NULL, `updated_at` integer NOT NULL);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `posts_status_created_idx` ON `posts` (`status`, `created_at` DESC);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `post_votes` (`post_id` text NOT NULL, `email` text NOT NULL, `created_at` integer NOT NULL, PRIMARY KEY (`post_id`, `email`));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `post_reports` (`id` text PRIMARY KEY NOT NULL, `post_id` text NOT NULL, `reporter_email` text NOT NULL, `reason` text NOT NULL, `created_at` integer NOT NULL);

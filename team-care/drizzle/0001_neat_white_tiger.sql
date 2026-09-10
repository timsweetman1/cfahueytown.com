CREATE TABLE `care_ai_budget` (
	`day` text PRIMARY KEY NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `care_requests` ADD `is_test` integer DEFAULT 0 NOT NULL;
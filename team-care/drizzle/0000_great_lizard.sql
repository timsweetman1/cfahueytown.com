CREATE TABLE `care_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`request_id` text NOT NULL,
	`at` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `care_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`created` text NOT NULL,
	`updated` text NOT NULL,
	`name` text NOT NULL,
	`contact` text NOT NULL,
	`topic` text NOT NULL,
	`timing` text NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`owner` text DEFAULT '' NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`email_state` text DEFAULT 'pending' NOT NULL,
	`email_id` text,
	`email_to` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `care_usage` (
	`day` text NOT NULL,
	`page` text NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`day`, `page`)
);

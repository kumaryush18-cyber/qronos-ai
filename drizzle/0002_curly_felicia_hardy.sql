CREATE TABLE `image_semantic_descriptions` (
	`imageHash` varchar(64) NOT NULL,
	`description` mediumtext NOT NULL,
	`provider` varchar(128),
	`model` varchar(128),
	`tokensUsed` int DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `image_semantic_descriptions_imageHash` PRIMARY KEY(`imageHash`)
);
--> statement-breakpoint
CREATE TABLE `safety_audit_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`userId` int,
	`userName` varchar(255),
	`userEmail` varchar(320),
	`model` varchar(128) NOT NULL,
	`triggerType` varchar(64) NOT NULL,
	`matchedKeywords` text,
	`userInput` mediumtext NOT NULL,
	`outputShown` mediumtext NOT NULL,
	`ipAddress` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `safety_audit_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `user_interaction_logs` (
	`id` bigint AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(255),
	`userEmail` varchar(320),
	`model` varchar(128) NOT NULL,
	`provider` varchar(128),
	`source` varchar(32) NOT NULL DEFAULT 'api',
	`userInput` mediumtext NOT NULL,
	`outputResponse` mediumtext NOT NULL,
	`ipAddress` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `user_interaction_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `account_controls` ADD `logUserMessages` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `api_keys` ADD `keyGroup` varchar(32) DEFAULT 'bundle' NOT NULL;--> statement-breakpoint
ALTER TABLE `credit_accounts` ADD `paygBalanceNanos` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `credit_accounts` ADD `codingPlanTokens` bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `model_configs` ADD `minTier` enum('free','starter','pro','max','power','ultra') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `model_configs` ADD `isPayg` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `model_configs` ADD `isBundle` boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `model_configs` ADD `isTokenPlan` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `provider_configs` ADD `supportsVision` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `provider_configs` ADD `supportsDocuments` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `tier` enum('free','starter','pro','max','power','ultra') DEFAULT 'free' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `creditsEnabled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `safety_audit_logs` ADD CONSTRAINT `safety_audit_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_interaction_logs` ADD CONSTRAINT `user_interaction_logs_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `image_semantic_descriptions_time_idx` ON `image_semantic_descriptions` (`createdAt`);--> statement-breakpoint
CREATE INDEX `safety_audit_logs_user_time_idx` ON `safety_audit_logs` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `safety_audit_logs_time_idx` ON `safety_audit_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `safety_audit_logs_trigger_idx` ON `safety_audit_logs` (`triggerType`,`createdAt`);--> statement-breakpoint
CREATE INDEX `user_interaction_logs_user_time_idx` ON `user_interaction_logs` (`userId`,`createdAt`);--> statement-breakpoint
CREATE INDEX `user_interaction_logs_time_idx` ON `user_interaction_logs` (`createdAt`);--> statement-breakpoint
CREATE INDEX `usage_events_request_id_idx` ON `usage_events` (`requestId`);
-- CreateTable
CREATE TABLE `daily_summaries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `business_date` DATE NOT NULL,
    `revenue` BIGINT NOT NULL DEFAULT 0,
    `order_count` INTEGER NOT NULL DEFAULT 0,
    `guest_count` INTEGER NOT NULL DEFAULT 0,
    `dine_in_revenue` BIGINT NOT NULL DEFAULT 0,
    `takeaway_revenue` BIGINT NOT NULL DEFAULT 0,
    `delivery_revenue` BIGINT NOT NULL DEFAULT 0,
    `discount_total` BIGINT NOT NULL DEFAULT 0,
    `void_amount` BIGINT NOT NULL DEFAULT 0,
    `cancel_count` INTEGER NOT NULL DEFAULT 0,
    `table_count` INTEGER NOT NULL DEFAULT 0,
    `session_count` INTEGER NOT NULL DEFAULT 0,
    `avg_dine_minutes` INTEGER NOT NULL DEFAULT 0,
    `channel_json` JSON NULL,
    `pay_method_json` JSON NULL,
    `hourly_json` JSON NULL,
    `top_dishes_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `daily_summaries_store_id_business_date_idx`(`store_id`, `business_date`),
    UNIQUE INDEX `daily_summaries_store_id_business_date_key`(`store_id`, `business_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cashier_shifts` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `cashier_id` BIGINT NOT NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `ended_at` DATETIME(3) NULL,
    `opening_cash` BIGINT NOT NULL DEFAULT 0,
    `closing_cash` BIGINT NULL,
    `note` VARCHAR(512) NULL,
    `summary_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `cashier_shifts_store_id_started_at_idx`(`store_id`, `started_at`),
    INDEX `cashier_shifts_cashier_id_ended_at_idx`(`cashier_id`, `ended_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `daily_summaries` ADD CONSTRAINT `daily_summaries_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashier_shifts` ADD CONSTRAINT `cashier_shifts_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cashier_shifts` ADD CONSTRAINT `cashier_shifts_cashier_id_fkey` FOREIGN KEY (`cashier_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- Partner capital: invested_total cache + capital entry ledger
ALTER TABLE `partners` ADD COLUMN `invested_total` BIGINT NOT NULL DEFAULT 0;

CREATE TABLE `partner_capital_entries` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `partner_id` BIGINT NOT NULL,
    `entry_date` DATE NOT NULL,
    `type` ENUM('initial', 'increase', 'decrease') NOT NULL,
    `amount` BIGINT NOT NULL,
    `category` ENUM('rent', 'renovation', 'equipment', 'furniture', 'deposit', 'working_capital', 'other') NOT NULL DEFAULT 'other',
    `ref_type` ENUM('asset', 'asset_event', 'ops_expense') NULL,
    `ref_id` BIGINT NULL,
    `note` VARCHAR(512) NULL,
    `created_by` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `partner_capital_entries_store_id_entry_date_idx`(`store_id`, `entry_date`),
    INDEX `partner_capital_entries_partner_id_entry_date_idx`(`partner_id`, `entry_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `partner_capital_entries` ADD CONSTRAINT `partner_capital_entries_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `partner_capital_entries` ADD CONSTRAINT `partner_capital_entries_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `partner_capital_entries` ADD CONSTRAINT `partner_capital_entries_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

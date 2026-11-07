-- CreateTable ops_expenses
CREATE TABLE `ops_expenses` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `year_month` VARCHAR(7) NOT NULL,
    `type` ENUM('water', 'electricity', 'rent', 'other') NOT NULL,
    `quantity` DECIMAL(14, 3) NULL,
    `unit` VARCHAR(32) NULL,
    `amount` BIGINT NOT NULL,
    `remark` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `ops_expenses_store_id_year_month_idx`(`store_id`, `year_month`),
    INDEX `ops_expenses_store_id_type_idx`(`store_id`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable partners
CREATE TABLE `partners` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `id_number` VARCHAR(64) NULL,
    `address` VARCHAR(255) NULL,
    `share_percent` INTEGER NOT NULL DEFAULT 0,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `remark` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `partners_store_id_status_idx`(`store_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable partner_settlements
CREATE TABLE `partner_settlements` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `partner_id` BIGINT NOT NULL,
    `settle_date` DATE NOT NULL,
    `year_month` VARCHAR(7) NOT NULL,
    `amount` BIGINT NOT NULL,
    `note` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `partner_settlements_store_id_year_month_idx`(`store_id`, `year_month`),
    INDEX `partner_settlements_partner_id_settle_date_idx`(`partner_id`, `settle_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ops_expenses` ADD CONSTRAINT `ops_expenses_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `partners` ADD CONSTRAINT `partners_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `partner_settlements` ADD CONSTRAINT `partner_settlements_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `partner_settlements` ADD CONSTRAINT `partner_settlements_partner_id_fkey` FOREIGN KEY (`partner_id`) REFERENCES `partners`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

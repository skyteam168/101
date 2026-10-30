-- DropForeignKey
ALTER TABLE `order_items` DROP FOREIGN KEY `order_items_dish_id_fkey`;

-- AlterTable
ALTER TABLE `customers` ADD COLUMN `balance` BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN `birthday` DATE NULL,
    ADD COLUMN `deleted_at` DATETIME(3) NULL,
    ADD COLUMN `member_level_id` BIGINT NULL,
    ADD COLUMN `points` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `status` ENUM('active', 'banned', 'deleted') NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE `order_items` ADD COLUMN `is_gift` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `line_discount` BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN `origin_unit_price` BIGINT NOT NULL DEFAULT 0,
    MODIFY `dish_id` BIGINT NULL;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `coupon_id` BIGINT NULL,
    ADD COLUMN `promo_snapshot` JSON NULL,
    ADD COLUMN `round_off` BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE `member_levels` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `name_zh` VARCHAR(64) NOT NULL,
    `name_vi` VARCHAR(64) NOT NULL,
    `min_points` INTEGER NOT NULL DEFAULT 0,
    `discount_percent` INTEGER NOT NULL DEFAULT 0,
    `birthday_bonus_points` INTEGER NOT NULL DEFAULT 0,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `member_levels_store_id_is_active_idx`(`store_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `points_ledgers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT NOT NULL,
    `direction` ENUM('in', 'out', 'adjust') NOT NULL,
    `amount` INTEGER NOT NULL,
    `balance_after` INTEGER NOT NULL,
    `remark` VARCHAR(255) NULL,
    `operator_id` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `points_ledgers_customer_id_created_at_idx`(`customer_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `balance_ledgers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT NOT NULL,
    `direction` ENUM('in', 'out', 'adjust') NOT NULL,
    `amount` BIGINT NOT NULL,
    `balance_after` BIGINT NOT NULL,
    `remark` VARCHAR(255) NULL,
    `operator_id` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `balance_ledgers_customer_id_created_at_idx`(`customer_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupon_templates` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `name_zh` VARCHAR(128) NOT NULL,
    `name_vi` VARCHAR(128) NOT NULL,
    `type` ENUM('amount', 'percent') NOT NULL,
    `value` BIGINT NOT NULL,
    `min_spend` BIGINT NOT NULL DEFAULT 0,
    `valid_days` INTEGER NOT NULL DEFAULT 30,
    `stackable` BOOLEAN NOT NULL DEFAULT false,
    `scope` ENUM('order', 'dish') NOT NULL DEFAULT 'order',
    `dish_ids` JSON NULL,
    `channel` ENUM('delivery', 'dine_in', 'all') NOT NULL DEFAULT 'all',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `coupon_templates_store_id_is_active_idx`(`store_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupons` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `template_id` BIGINT NOT NULL,
    `customer_id` BIGINT NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `status` ENUM('unused', 'used', 'expired') NOT NULL DEFAULT 'unused',
    `expires_at` DATETIME(3) NOT NULL,
    `used_order_id` BIGINT NULL,
    `issued_by` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `coupons_code_key`(`code`),
    INDEX `coupons_customer_id_status_idx`(`customer_id`, `status`),
    INDEX `coupons_template_id_idx`(`template_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promo_rules` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `name_zh` VARCHAR(128) NOT NULL,
    `name_vi` VARCHAR(128) NOT NULL,
    `type` ENUM('amount', 'percent') NOT NULL,
    `value` BIGINT NOT NULL,
    `min_spend` BIGINT NOT NULL DEFAULT 0,
    `scope` ENUM('order', 'dish') NOT NULL DEFAULT 'order',
    `dish_ids` JSON NULL,
    `channel` ENUM('delivery', 'dine_in', 'all') NOT NULL DEFAULT 'all',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `promo_rules_store_id_is_active_idx`(`store_id`, `is_active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `customers_status_idx` ON `customers`(`status`);

-- CreateIndex
CREATE INDEX `customers_member_level_id_idx` ON `customers`(`member_level_id`);

-- CreateIndex
CREATE INDEX `customers_phone_idx` ON `customers`(`phone`);

-- CreateIndex
CREATE INDEX `orders_coupon_id_idx` ON `orders`(`coupon_id`);

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_coupon_id_fkey` FOREIGN KEY (`coupon_id`) REFERENCES `coupons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_dish_id_fkey` FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member_levels` ADD CONSTRAINT `member_levels_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customers` ADD CONSTRAINT `customers_member_level_id_fkey` FOREIGN KEY (`member_level_id`) REFERENCES `member_levels`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `points_ledgers` ADD CONSTRAINT `points_ledgers_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `points_ledgers` ADD CONSTRAINT `points_ledgers_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `balance_ledgers` ADD CONSTRAINT `balance_ledgers_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `balance_ledgers` ADD CONSTRAINT `balance_ledgers_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupon_templates` ADD CONSTRAINT `coupon_templates_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `coupon_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `coupons` ADD CONSTRAINT `coupons_issued_by_fkey` FOREIGN KEY (`issued_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `promo_rules` ADD CONSTRAINT `promo_rules_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

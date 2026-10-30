-- AlterTable
ALTER TABLE `order_items` ADD COLUMN `combo_id` BIGINT NULL;

-- CreateTable
CREATE TABLE `combos` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `name_zh` VARCHAR(128) NOT NULL,
    `name_vi` VARCHAR(128) NOT NULL,
    `desc_zh` TEXT NULL,
    `desc_vi` TEXT NULL,
    `image` VARCHAR(512) NULL,
    `price` BIGINT NOT NULL,
    `takeaway_price` BIGINT NOT NULL,
    `status` ENUM('on', 'off') NOT NULL DEFAULT 'on',
    `sort` INTEGER NOT NULL DEFAULT 0,
    `is_dine_in` BOOLEAN NOT NULL DEFAULT true,
    `is_delivery` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `combos_store_id_status_idx`(`store_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `combo_groups` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `combo_id` BIGINT NOT NULL,
    `name_zh` VARCHAR(64) NOT NULL,
    `name_vi` VARCHAR(64) NOT NULL,
    `min_select` INTEGER NOT NULL DEFAULT 1,
    `max_select` INTEGER NOT NULL DEFAULT 1,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `combo_groups_combo_id_idx`(`combo_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `combo_group_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `group_id` BIGINT NOT NULL,
    `dish_id` BIGINT NOT NULL,
    `extra_price` BIGINT NOT NULL DEFAULT 0,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `sort` INTEGER NOT NULL DEFAULT 0,

    INDEX `combo_group_items_group_id_idx`(`group_id`),
    INDEX `combo_group_items_dish_id_idx`(`dish_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reservations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `customer_name` VARCHAR(128) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `guest_count` INTEGER NOT NULL DEFAULT 1,
    `reserve_at` DATETIME(3) NOT NULL,
    `table_id` BIGINT NULL,
    `area_id` BIGINT NULL,
    `customer_id` BIGINT NULL,
    `status` ENUM('pending', 'confirmed', 'seated', 'cancelled', 'no_show') NOT NULL DEFAULT 'pending',
    `deposit` BIGINT NOT NULL DEFAULT 0,
    `remark` VARCHAR(512) NULL,
    `created_by` BIGINT NULL,
    `seated_session_id` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `reservations_store_id_reserve_at_idx`(`store_id`, `reserve_at`),
    INDEX `reservations_store_id_status_idx`(`store_id`, `status`),
    INDEX `reservations_table_id_idx`(`table_id`),
    INDEX `reservations_customer_id_idx`(`customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `order_items_combo_id_idx` ON `order_items`(`combo_id`);

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_combo_id_fkey` FOREIGN KEY (`combo_id`) REFERENCES `combos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `combos` ADD CONSTRAINT `combos_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `combo_groups` ADD CONSTRAINT `combo_groups_combo_id_fkey` FOREIGN KEY (`combo_id`) REFERENCES `combos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `combo_group_items` ADD CONSTRAINT `combo_group_items_group_id_fkey` FOREIGN KEY (`group_id`) REFERENCES `combo_groups`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `combo_group_items` ADD CONSTRAINT `combo_group_items_dish_id_fkey` FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `tables`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_area_id_fkey` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservations` ADD CONSTRAINT `reservations_seated_session_id_fkey` FOREIGN KEY (`seated_session_id`) REFERENCES `table_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

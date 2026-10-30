-- CreateTable
CREATE TABLE `ingredients` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `name_zh` VARCHAR(128) NOT NULL,
    `name_vi` VARCHAR(128) NOT NULL,
    `kind` ENUM('vegetable', 'seasoning', 'other') NOT NULL DEFAULT 'vegetable',
    `unit` VARCHAR(32) NOT NULL DEFAULT 'kg',
    `stock_qty` DECIMAL(14, 3) NOT NULL DEFAULT 0,
    `last_cost` BIGINT NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ingredients_store_id_kind_idx`(`store_id`, `kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchases` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `business_date` DATE NOT NULL,
    `supplier` VARCHAR(128) NULL,
    `note` VARCHAR(512) NULL,
    `total_amount` BIGINT NOT NULL DEFAULT 0,
    `operator_id` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `purchases_store_id_business_date_idx`(`store_id`, `business_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `purchase_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `purchase_id` BIGINT NOT NULL,
    `ingredient_id` BIGINT NOT NULL,
    `qty` DECIMAL(14, 3) NOT NULL,
    `unit_price` BIGINT NOT NULL,
    `amount` BIGINT NOT NULL,

    INDEX `purchase_items_purchase_id_idx`(`purchase_id`),
    INDEX `purchase_items_ingredient_id_idx`(`ingredient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stocktakes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `business_date` DATE NOT NULL,
    `status` ENUM('draft', 'confirmed') NOT NULL DEFAULT 'draft',
    `note` VARCHAR(512) NULL,
    `operator_id` BIGINT NULL,
    `confirmed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `stocktakes_store_id_business_date_idx`(`store_id`, `business_date`),
    UNIQUE INDEX `stocktakes_store_id_business_date_key`(`store_id`, `business_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stocktake_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `stocktake_id` BIGINT NOT NULL,
    `ingredient_id` BIGINT NOT NULL,
    `opening_qty` DECIMAL(14, 3) NOT NULL,
    `purchased_qty` DECIMAL(14, 3) NOT NULL,
    `counted_qty` DECIMAL(14, 3) NOT NULL,
    `consumption_qty` DECIMAL(14, 3) NOT NULL,
    `unit_cost` BIGINT NOT NULL DEFAULT 0,
    `consumption_amount` BIGINT NOT NULL DEFAULT 0,

    INDEX `stocktake_items_ingredient_id_idx`(`ingredient_id`),
    UNIQUE INDEX `stocktake_items_stocktake_id_ingredient_id_key`(`stocktake_id`, `ingredient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ingredients` ADD CONSTRAINT `ingredients_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchases` ADD CONSTRAINT `purchases_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_purchase_id_fkey` FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `purchase_items` ADD CONSTRAINT `purchase_items_ingredient_id_fkey` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stocktakes` ADD CONSTRAINT `stocktakes_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stocktakes` ADD CONSTRAINT `stocktakes_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stocktake_items` ADD CONSTRAINT `stocktake_items_stocktake_id_fkey` FOREIGN KEY (`stocktake_id`) REFERENCES `stocktakes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `stocktake_items` ADD CONSTRAINT `stocktake_items_ingredient_id_fkey` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

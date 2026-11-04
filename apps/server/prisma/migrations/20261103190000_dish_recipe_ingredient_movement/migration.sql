-- CreateTable
CREATE TABLE `dish_recipes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `dish_id` BIGINT NOT NULL,
    `ingredient_id` BIGINT NOT NULL,
    `qty` DECIMAL(14, 3) NOT NULL,
    UNIQUE INDEX `dish_recipes_dish_id_ingredient_id_key`(`dish_id`, `ingredient_id`),
    INDEX `dish_recipes_ingredient_id_idx`(`ingredient_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ingredient_movements` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `ingredient_id` BIGINT NOT NULL,
    `type` ENUM('sale_deduct', 'sale_restore', 'purchase', 'stocktake_set') NOT NULL,
    `qty` DECIMAL(14, 3) NOT NULL,
    `ref_type` VARCHAR(32) NULL,
    `ref_id` VARCHAR(64) NULL,
    `note` VARCHAR(256) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `ingredient_movements_store_id_created_at_idx`(`store_id`, `created_at`),
    INDEX `ingredient_movements_ingredient_id_created_at_idx`(`ingredient_id`, `created_at`),
    INDEX `ingredient_movements_ref_type_ref_id_idx`(`ref_type`, `ref_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `dish_recipes` ADD CONSTRAINT `dish_recipes_dish_id_fkey` FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dish_recipes` ADD CONSTRAINT `dish_recipes_ingredient_id_fkey` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ingredient_movements` ADD CONSTRAINT `ingredient_movements_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ingredient_movements` ADD CONSTRAINT `ingredient_movements_ingredient_id_fkey` FOREIGN KEY (`ingredient_id`) REFERENCES `ingredients`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

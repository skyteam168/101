-- CreateTable
CREATE TABLE `order_refunds` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `order_id` BIGINT NOT NULL,
    `amount` BIGINT NOT NULL,
    `method` ENUM('cash', 'card', 'bank_transfer', 'momo', 'vnpay') NOT NULL,
    `reason` VARCHAR(512) NOT NULL,
    `operator_id` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `order_refunds_order_id_idx`(`order_id`),
    INDEX `order_refunds_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order_refunds` ADD CONSTRAINT `order_refunds_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_refunds` ADD CONSTRAINT `order_refunds_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE `orders` ADD COLUMN `courier_id` BIGINT NULL,
    ADD COLUMN `pay_method` ENUM('cash', 'card', 'bank_transfer', 'momo', 'vnpay') NULL,
    ADD COLUMN `status_timeline` JSON NULL;

-- AlterTable
ALTER TABLE `stores` ADD COLUMN `bank_transfer_qr` VARCHAR(512) NULL,
    ADD COLUMN `business_hours` JSON NULL,
    ADD COLUMN `lat` DECIMAL(10, 7) NULL,
    ADD COLUMN `lng` DECIMAL(10, 7) NULL,
    ADD COLUMN `min_order_amount` BIGINT NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX `orders_courier_id_idx` ON `orders`(`courier_id`);

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_courier_id_fkey` FOREIGN KEY (`courier_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

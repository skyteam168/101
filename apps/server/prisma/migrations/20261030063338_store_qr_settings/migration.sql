-- AlterTable
ALTER TABLE `stores` ADD COLUMN `qr_auto_open` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `qr_require_pin` BOOLEAN NOT NULL DEFAULT true;

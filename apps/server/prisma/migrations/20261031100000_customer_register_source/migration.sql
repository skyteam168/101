-- AlterTable
ALTER TABLE `customers` ADD COLUMN `register_source` ENUM('email', 'google') NOT NULL DEFAULT 'email';

-- CreateIndex
CREATE INDEX `customers_register_source_idx` ON `customers`(`register_source`);

-- Backfill: Google-only accounts
UPDATE `customers`
SET `register_source` = 'google'
WHERE `google_sub` IS NOT NULL
  AND `password_hash` IS NULL
  AND `register_source` = 'email';

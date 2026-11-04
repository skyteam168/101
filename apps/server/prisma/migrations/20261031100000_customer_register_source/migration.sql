-- Google 登录依赖：先补 google_sub，并把密码改为可空
ALTER TABLE `customers`
  ADD COLUMN `google_sub` VARCHAR(64) NULL,
  MODIFY `password_hash` VARCHAR(255) NULL;

CREATE UNIQUE INDEX `customers_google_sub_key` ON `customers`(`google_sub`);

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

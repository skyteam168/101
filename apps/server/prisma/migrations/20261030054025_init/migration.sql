-- CreateTable
CREATE TABLE `users` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NULL,
    `username` VARCHAR(64) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(128) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `lang` ENUM('zh', 'vi') NOT NULL DEFAULT 'zh',
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_username_key`(`username`),
    INDEX `users_store_id_idx`(`store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name_zh` VARCHAR(128) NOT NULL,
    `name_vi` VARCHAR(128) NOT NULL,
    `is_system` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `roles_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permissions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(128) NOT NULL,
    `name_zh` VARCHAR(128) NOT NULL,
    `name_vi` VARCHAR(128) NOT NULL,
    `type` ENUM('menu', 'button', 'api') NOT NULL,
    `parent_id` BIGINT NULL,
    `path` VARCHAR(255) NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `permissions_code_key`(`code`),
    INDEX `permissions_parent_id_idx`(`parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_roles` (
    `user_id` BIGINT NOT NULL,
    `role_id` BIGINT NOT NULL,

    PRIMARY KEY (`user_id`, `role_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `role_permissions` (
    `role_id` BIGINT NOT NULL,
    `permission_id` BIGINT NOT NULL,

    PRIMARY KEY (`role_id`, `permission_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stores` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `name_zh` VARCHAR(128) NOT NULL,
    `name_vi` VARCHAR(128) NOT NULL,
    `address` VARCHAR(255) NULL,
    `phone` VARCHAR(32) NULL,
    `service_charge_rate` DECIMAL(5, 4) NOT NULL DEFAULT 0,
    `tax_rate` DECIMAL(5, 4) NOT NULL DEFAULT 0,
    `delivery_radius_km` DECIMAL(8, 2) NOT NULL DEFAULT 5,
    `delivery_fee_rules` JSON NULL,
    `qr_order_need_confirm` BOOLEAN NOT NULL DEFAULT false,
    `business_day_cut_hour` INTEGER NOT NULL DEFAULT 4,
    `announce_lang` ENUM('zh', 'vi') NOT NULL DEFAULT 'zh',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `kitchen_stations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `name_zh` VARCHAR(64) NOT NULL,
    `name_vi` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `kitchen_stations_store_id_idx`(`store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `kitchen_station_id` BIGINT NULL,
    `name_zh` VARCHAR(128) NOT NULL,
    `name_vi` VARCHAR(128) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `categories_store_id_idx`(`store_id`),
    INDEX `categories_kitchen_station_id_idx`(`kitchen_station_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dishes` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `category_id` BIGINT NOT NULL,
    `name_zh` VARCHAR(128) NOT NULL,
    `name_vi` VARCHAR(128) NOT NULL,
    `desc_zh` TEXT NULL,
    `desc_vi` TEXT NULL,
    `image` VARCHAR(512) NULL,
    `price` BIGINT NOT NULL,
    `takeaway_price` BIGINT NOT NULL,
    `unit` VARCHAR(32) NOT NULL DEFAULT '份',
    `status` ENUM('on', 'off') NOT NULL DEFAULT 'on',
    `stock` INTEGER NULL,
    `daily_stock` INTEGER NULL,
    `sold_today` INTEGER NOT NULL DEFAULT 0,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `is_dine_in` BOOLEAN NOT NULL DEFAULT true,
    `is_delivery` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `dishes_store_id_status_idx`(`store_id`, `status`),
    INDEX `dishes_category_id_idx`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `dish_options` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `dish_id` BIGINT NOT NULL,
    `group_name_zh` VARCHAR(64) NOT NULL,
    `group_name_vi` VARCHAR(64) NOT NULL,
    `option_name_zh` VARCHAR(64) NOT NULL,
    `option_name_vi` VARCHAR(64) NOT NULL,
    `extra_price` BIGINT NOT NULL DEFAULT 0,
    `required` BOOLEAN NOT NULL DEFAULT false,
    `multi` BOOLEAN NOT NULL DEFAULT false,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `dish_options_dish_id_idx`(`dish_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `areas` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `name_zh` VARCHAR(64) NOT NULL,
    `name_vi` VARCHAR(64) NOT NULL,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `areas_store_id_idx`(`store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tables` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `area_id` BIGINT NOT NULL,
    `code` VARCHAR(32) NOT NULL,
    `seats` INTEGER NOT NULL DEFAULT 4,
    `status` ENUM('idle', 'dining', 'cleaning') NOT NULL DEFAULT 'idle',
    `qr_token` VARCHAR(64) NOT NULL,
    `current_session_id` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `tables_qr_token_key`(`qr_token`),
    UNIQUE INDEX `tables_current_session_id_key`(`current_session_id`),
    INDEX `tables_area_id_idx`(`area_id`),
    INDEX `tables_status_idx`(`status`),
    UNIQUE INDEX `tables_store_id_code_key`(`store_id`, `code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `table_sessions` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `table_id` BIGINT NOT NULL,
    `open_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `close_at` DATETIME(3) NULL,
    `guest_count` INTEGER NOT NULL DEFAULT 1,
    `pin` VARCHAR(4) NOT NULL,
    `session_token` VARCHAR(64) NOT NULL,
    `waiter_id` BIGINT NULL,
    `status` ENUM('open', 'closed') NOT NULL DEFAULT 'open',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `table_sessions_session_token_key`(`session_token`),
    INDEX `table_sessions_table_id_status_idx`(`table_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `order_no` VARCHAR(32) NOT NULL,
    `type` ENUM('dine_in', 'takeaway', 'delivery') NOT NULL,
    `source` ENUM('waiter', 'qr', 'h5', 'pos') NOT NULL,
    `table_session_id` BIGINT NULL,
    `customer_id` BIGINT NULL,
    `address_snapshot` JSON NULL,
    `status` ENUM('open', 'paid', 'cancelled', 'pending', 'accepted', 'cooking', 'delivering', 'completed', 'rejected') NOT NULL,
    `subtotal` BIGINT NOT NULL DEFAULT 0,
    `discount` BIGINT NOT NULL DEFAULT 0,
    `service_charge` BIGINT NOT NULL DEFAULT 0,
    `delivery_fee` BIGINT NOT NULL DEFAULT 0,
    `total` BIGINT NOT NULL DEFAULT 0,
    `paid_amount` BIGINT NOT NULL DEFAULT 0,
    `payment_status` ENUM('unpaid', 'partial', 'paid', 'refunded') NOT NULL DEFAULT 'unpaid',
    `remark` VARCHAR(512) NULL,
    `cancel_reason` VARCHAR(512) NULL,
    `created_by` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_order_no_key`(`order_no`),
    INDEX `orders_store_id_status_created_at_idx`(`store_id`, `status`, `created_at`),
    INDEX `orders_table_session_id_idx`(`table_session_id`),
    INDEX `orders_customer_id_idx`(`customer_id`),
    INDEX `orders_type_status_idx`(`type`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_batches` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `order_id` BIGINT NOT NULL,
    `round_no` INTEGER NOT NULL,
    `source` ENUM('waiter', 'qr', 'h5', 'pos') NOT NULL,
    `created_by` BIGINT NULL,
    `guest_nickname` VARCHAR(64) NULL,
    `print_status` ENUM('pending', 'printed', 'failed', 'need_confirm') NOT NULL DEFAULT 'pending',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `order_batches_order_id_idx`(`order_id`),
    UNIQUE INDEX `order_batches_order_id_round_no_key`(`order_id`, `round_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `order_id` BIGINT NOT NULL,
    `batch_id` BIGINT NOT NULL,
    `dish_id` BIGINT NOT NULL,
    `name_zh` VARCHAR(128) NOT NULL,
    `name_vi` VARCHAR(128) NOT NULL,
    `unit_price` BIGINT NOT NULL,
    `qty` INTEGER NOT NULL,
    `options_snapshot` JSON NULL,
    `amount` BIGINT NOT NULL,
    `status` ENUM('pending', 'cooking', 'served', 'voided') NOT NULL DEFAULT 'pending',
    `void_reason` VARCHAR(255) NULL,
    `guest_nickname` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `order_items_order_id_idx`(`order_id`),
    INDEX `order_items_batch_id_idx`(`batch_id`),
    INDEX `order_items_dish_id_idx`(`dish_id`),
    INDEX `order_items_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `order_id` BIGINT NOT NULL,
    `method` ENUM('cash', 'card', 'bank_transfer', 'momo', 'vnpay') NOT NULL,
    `amount` BIGINT NOT NULL,
    `received` BIGINT NOT NULL DEFAULT 0,
    `change` BIGINT NOT NULL DEFAULT 0,
    `operator_id` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `payments_order_id_idx`(`order_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `email` VARCHAR(128) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `name` VARCHAR(128) NULL,
    `phone` VARCHAR(32) NULL,
    `lang` ENUM('zh', 'vi') NOT NULL DEFAULT 'vi',
    `email_verified_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `customers_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `customer_addresses` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `customer_id` BIGINT NOT NULL,
    `contact_name` VARCHAR(128) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `address_text` VARCHAR(512) NOT NULL,
    `detail` VARCHAR(255) NULL,
    `lat` DECIMAL(10, 7) NULL,
    `lng` DECIMAL(10, 7) NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `customer_addresses_customer_id_idx`(`customer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `print_agents` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `secret_hash` VARCHAR(255) NOT NULL,
    `last_seen_at` DATETIME(3) NULL,
    `status` ENUM('online', 'offline') NOT NULL DEFAULT 'offline',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `print_agents_store_id_idx`(`store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `printers` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `name` VARCHAR(128) NOT NULL,
    `ip` VARCHAR(64) NOT NULL,
    `port` INTEGER NOT NULL DEFAULT 9100,
    `paper_width` INTEGER NOT NULL DEFAULT 80,
    `role` ENUM('front', 'kitchen') NOT NULL,
    `station_id` BIGINT NULL,
    `agent_id` BIGINT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `printers_store_id_idx`(`store_id`),
    INDEX `printers_agent_id_idx`(`agent_id`),
    INDEX `printers_station_id_idx`(`station_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `print_jobs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `printer_id` BIGINT NOT NULL,
    `order_id` BIGINT NULL,
    `batch_id` BIGINT NULL,
    `kind` ENUM('order_front', 'order_kitchen', 'add', 'void', 'receipt', 'cancel') NOT NULL,
    `payload` JSON NOT NULL,
    `status` ENUM('queued', 'sent', 'done', 'failed') NOT NULL DEFAULT 'queued',
    `retries` INTEGER NOT NULL DEFAULT 0,
    `error` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `print_jobs_printer_id_status_idx`(`printer_id`, `status`),
    INDEX `print_jobs_order_id_idx`(`order_id`),
    INDEX `print_jobs_status_created_at_idx`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_categories` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `name_zh` VARCHAR(128) NOT NULL,
    `name_vi` VARCHAR(128) NOT NULL,
    `depreciation_months` INTEGER NOT NULL DEFAULT 36,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `asset_categories_store_id_idx`(`store_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assets` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `asset_no` VARCHAR(64) NOT NULL,
    `category_id` BIGINT NOT NULL,
    `name_zh` VARCHAR(128) NOT NULL,
    `name_vi` VARCHAR(128) NOT NULL,
    `spec` VARCHAR(255) NULL,
    `unit` VARCHAR(32) NOT NULL DEFAULT '个',
    `location` VARCHAR(128) NULL,
    `supplier` VARCHAR(128) NULL,
    `purchase_date` DATE NULL,
    `unit_price` BIGINT NOT NULL DEFAULT 0,
    `qty_total` INTEGER NOT NULL DEFAULT 0,
    `qty_in_use` INTEGER NOT NULL DEFAULT 0,
    `qty_idle` INTEGER NOT NULL DEFAULT 0,
    `qty_repair` INTEGER NOT NULL DEFAULT 0,
    `qty_disposed` INTEGER NOT NULL DEFAULT 0,
    `warranty_until` DATE NULL,
    `photo` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `assets_asset_no_key`(`asset_no`),
    INDEX `assets_store_id_idx`(`store_id`),
    INDEX `assets_category_id_idx`(`category_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `asset_events` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `asset_id` BIGINT NOT NULL,
    `type` ENUM('in', 'assign', 'transfer', 'repair', 'repair_done', 'scrap', 'sell', 'check') NOT NULL,
    `qty` INTEGER NOT NULL DEFAULT 0,
    `amount` BIGINT NOT NULL DEFAULT 0,
    `from_location` VARCHAR(128) NULL,
    `to_location` VARCHAR(128) NULL,
    `reason` VARCHAR(512) NULL,
    `operator_id` BIGINT NULL,
    `happened_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `asset_events_asset_id_happened_at_idx`(`asset_id`, `happened_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `user_id` BIGINT NULL,
    `action` VARCHAR(64) NOT NULL,
    `target_type` VARCHAR(64) NOT NULL,
    `target_id` VARCHAR(64) NOT NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `ip` VARCHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `audit_logs_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `audit_logs_target_type_target_id_idx`(`target_type`, `target_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `permissions` ADD CONSTRAINT `permissions_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `permissions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_roles` ADD CONSTRAINT `user_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_permission_id_fkey` FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `kitchen_stations` ADD CONSTRAINT `kitchen_stations_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `categories` ADD CONSTRAINT `categories_kitchen_station_id_fkey` FOREIGN KEY (`kitchen_station_id`) REFERENCES `kitchen_stations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dishes` ADD CONSTRAINT `dishes_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dishes` ADD CONSTRAINT `dishes_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dish_options` ADD CONSTRAINT `dish_options_dish_id_fkey` FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `areas` ADD CONSTRAINT `areas_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tables` ADD CONSTRAINT `tables_area_id_fkey` FOREIGN KEY (`area_id`) REFERENCES `areas`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tables` ADD CONSTRAINT `tables_current_session_id_fkey` FOREIGN KEY (`current_session_id`) REFERENCES `table_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `table_sessions` ADD CONSTRAINT `table_sessions_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `tables`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `table_sessions` ADD CONSTRAINT `table_sessions_waiter_id_fkey` FOREIGN KEY (`waiter_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_table_session_id_fkey` FOREIGN KEY (`table_session_id`) REFERENCES `table_sessions`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_batches` ADD CONSTRAINT `order_batches_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `order_batches`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_dish_id_fkey` FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `customer_addresses` ADD CONSTRAINT `customer_addresses_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `print_agents` ADD CONSTRAINT `print_agents_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `printers` ADD CONSTRAINT `printers_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `printers` ADD CONSTRAINT `printers_station_id_fkey` FOREIGN KEY (`station_id`) REFERENCES `kitchen_stations`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `printers` ADD CONSTRAINT `printers_agent_id_fkey` FOREIGN KEY (`agent_id`) REFERENCES `print_agents`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `print_jobs` ADD CONSTRAINT `print_jobs_printer_id_fkey` FOREIGN KEY (`printer_id`) REFERENCES `printers`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `print_jobs` ADD CONSTRAINT `print_jobs_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `print_jobs` ADD CONSTRAINT `print_jobs_batch_id_fkey` FOREIGN KEY (`batch_id`) REFERENCES `order_batches`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_categories` ADD CONSTRAINT `asset_categories_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assets` ADD CONSTRAINT `assets_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `asset_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_events` ADD CONSTRAINT `asset_events_asset_id_fkey` FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `asset_events` ADD CONSTRAINT `asset_events_operator_id_fkey` FOREIGN KEY (`operator_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

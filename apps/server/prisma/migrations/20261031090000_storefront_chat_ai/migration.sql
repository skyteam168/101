-- AlterTable
ALTER TABLE `stores`
  ADD COLUMN `storefront_image` VARCHAR(512) NULL,
  ADD COLUMN `env_gallery` JSON NULL,
  ADD COLUMN `ai_settings` JSON NULL;

-- CreateTable
CREATE TABLE `chat_conversations` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `customer_id` BIGINT NOT NULL,
    `last_message_at` DATETIME(3) NULL,
    `last_preview` VARCHAR(255) NULL,
    `unread_staff` INTEGER NOT NULL DEFAULT 0,
    `unread_customer` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `chat_conversations_store_id_customer_id_key`(`store_id`, `customer_id`),
    INDEX `chat_conversations_store_id_last_message_at_idx`(`store_id`, `last_message_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_messages` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `conversation_id` BIGINT NOT NULL,
    `sender_type` VARCHAR(16) NOT NULL,
    `sender_id` BIGINT NULL,
    `content_type` VARCHAR(16) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chat_messages_conversation_id_created_at_idx`(`conversation_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `chat_conversations` ADD CONSTRAINT `chat_conversations_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_conversations` ADD CONSTRAINT `chat_conversations_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_conversation_id_fkey` FOREIGN KEY (`conversation_id`) REFERENCES `chat_conversations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

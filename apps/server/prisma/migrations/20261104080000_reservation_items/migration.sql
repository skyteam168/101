-- 预定预点菜
CREATE TABLE `reservation_items` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `reservation_id` BIGINT NOT NULL,
  `dish_id` BIGINT NULL,
  `name_zh` VARCHAR(128) NOT NULL,
  `name_vi` VARCHAR(128) NOT NULL,
  `qty` INT NOT NULL DEFAULT 1,
  `unit_price` BIGINT NOT NULL,
  `options_snapshot` JSON NULL,
  `remark` VARCHAR(255) NULL,
  `sort` INT NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `reservation_items_reservation_id_idx`(`reservation_id`),
  INDEX `reservation_items_dish_id_idx`(`dish_id`),
  CONSTRAINT `reservation_items_reservation_id_fkey`
    FOREIGN KEY (`reservation_id`) REFERENCES `reservations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `reservation_items_dish_id_fkey`
    FOREIGN KEY (`dish_id`) REFERENCES `dishes`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

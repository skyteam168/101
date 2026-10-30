-- AlterTable
ALTER TABLE `print_jobs` MODIFY `kind` ENUM('order_front', 'order_kitchen', 'add', 'void', 'receipt', 'cancel', 'delivery', 'shift') NOT NULL;

-- AlterTable
ALTER TABLE `stores` ADD COLUMN `print_split_item` BOOLEAN NOT NULL DEFAULT false;

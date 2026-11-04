-- AlterEnum: 打印任务增加退款小票类型
ALTER TABLE `print_jobs` MODIFY COLUMN `kind` ENUM('order_front', 'order_kitchen', 'add', 'void', 'receipt', 'cancel', 'delivery', 'shift', 'refund') NOT NULL;

-- AddForeignKey
ALTER TABLE `tables` ADD CONSTRAINT `tables_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

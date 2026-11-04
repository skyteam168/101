-- AlterTable
ALTER TABLE `printers`
  ADD COLUMN `connection_type` ENUM('network', 'browser_usb') NOT NULL DEFAULT 'network',
  ADD COLUMN `accept_all_tickets` BOOLEAN NOT NULL DEFAULT false;

-- Allow empty IP for browser USB printers (column already VARCHAR, default '')
ALTER TABLE `printers` MODIFY `ip` VARCHAR(64) NOT NULL DEFAULT '';

-- 云打印：connection_type 增加 cloud；ip 扩容存放 Webhook URL
ALTER TABLE `printers`
  MODIFY `connection_type` ENUM('network', 'browser_usb', 'cloud') NOT NULL DEFAULT 'network';

ALTER TABLE `printers`
  MODIFY `ip` VARCHAR(512) NOT NULL DEFAULT '';

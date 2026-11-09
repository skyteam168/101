-- AlterEnum: 增加 agent_usb（print-agent 经 Windows 队列 RAW 静默 USB 打印）
ALTER TABLE `printers` MODIFY COLUMN `connection_type` ENUM('network', 'browser_usb', 'agent_usb', 'cloud') NOT NULL DEFAULT 'network';

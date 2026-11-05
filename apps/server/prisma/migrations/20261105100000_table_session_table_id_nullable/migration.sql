-- 允许删除桌台时断开历史会话外键（会话与订单保留）
ALTER TABLE `table_sessions` MODIFY `table_id` BIGINT NULL;

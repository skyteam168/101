-- 菜品图片 URL 放宽（OSS 长路径）
ALTER TABLE `dishes` MODIFY `image` VARCHAR(2048) NULL;

-- CreateTable employees
CREATE TABLE `employees` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `user_id` BIGINT NULL,
    `name_zh` VARCHAR(128) NOT NULL,
    `name_vi` VARCHAR(128) NOT NULL,
    `phone` VARCHAR(32) NULL,
    `employment_type` ENUM('full_time', 'part_time') NOT NULL DEFAULT 'full_time',
    `status` ENUM('active', 'resigned') NOT NULL DEFAULT 'active',
    `base_salary` BIGINT NOT NULL DEFAULT 0,
    `hired_at` DATE NOT NULL,
    `resigned_at` DATE NULL,
    `remark` VARCHAR(512) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `employees_user_id_key`(`user_id`),
    INDEX `employees_store_id_status_idx`(`store_id`, `status`),
    INDEX `employees_store_id_employment_type_idx`(`store_id`, `employment_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable employee_attendance
CREATE TABLE `employee_attendance` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `employee_id` BIGINT NOT NULL,
    `work_date` DATE NOT NULL,
    `clock_in_at` DATETIME(3) NOT NULL,
    `clock_out_at` DATETIME(3) NULL,
    `work_minutes` INTEGER NOT NULL DEFAULT 0,
    `remark` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `employee_attendance_store_id_work_date_idx`(`store_id`, `work_date`),
    INDEX `employee_attendance_employee_id_work_date_idx`(`employee_id`, `work_date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable employee_payroll_runs
CREATE TABLE `employee_payroll_runs` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `year_month` VARCHAR(7) NOT NULL,
    `total_labor_cost` BIGINT NOT NULL DEFAULT 0,
    `snapshot_json` JSON NOT NULL,
    `created_by` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `employee_payroll_runs_store_id_year_month_idx`(`store_id`, `year_month`),
    UNIQUE INDEX `employee_payroll_runs_store_id_year_month_key`(`store_id`, `year_month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `employees` ADD CONSTRAINT `employees_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `employees` ADD CONSTRAINT `employees_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `employee_attendance` ADD CONSTRAINT `employee_attendance_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `employee_attendance` ADD CONSTRAINT `employee_attendance_employee_id_fkey` FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `employee_payroll_runs` ADD CONSTRAINT `employee_payroll_runs_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

import { Injectable } from '@nestjs/common';
import { EmployeeStatus, EmploymentType, Prisma } from '@prisma/client';
import { BusinessError } from '../../common/errors/business.error';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AttendanceQueryDto,
  CreateAttendanceDto,
  CreateEmployeeDto,
  EmployeeQueryDto,
  UpdateAttendanceDto,
  UpdateEmployeeDto,
} from './dto/hr.dto';
import { computeMonthLabor, computeWorkMinutes } from './hr-labor.util';

@Injectable()
export class HrService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private money(n: bigint | number) {
    return Number(n);
  }

  private ymd(d: Date): string {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private mapEmployee(e: {
    id: bigint;
    storeId: bigint;
    userId: bigint | null;
    nameZh: string;
    nameVi: string;
    phone: string | null;
    employmentType: EmploymentType;
    status: EmployeeStatus;
    baseSalary: bigint;
    hiredAt: Date;
    resignedAt: Date | null;
    remark: string | null;
    createdAt: Date;
    updatedAt: Date;
    user?: { id: bigint; username: string; displayName: string } | null;
  }) {
    return {
      id: e.id.toString(),
      storeId: e.storeId.toString(),
      userId: e.userId?.toString() ?? null,
      nameZh: e.nameZh,
      nameVi: e.nameVi,
      phone: e.phone,
      employmentType: e.employmentType,
      status: e.status,
      baseSalary: this.money(e.baseSalary),
      hiredAt: this.ymd(e.hiredAt),
      resignedAt: e.resignedAt ? this.ymd(e.resignedAt) : null,
      remark: e.remark,
      user: e.user
        ? {
            id: e.user.id.toString(),
            username: e.user.username,
            displayName: e.user.displayName,
          }
        : null,
      createdAt: e.createdAt,
      updatedAt: e.updatedAt,
    };
  }

  private mapAttendance(a: {
    id: bigint;
    storeId: bigint;
    employeeId: bigint;
    workDate: Date;
    clockInAt: Date;
    clockOutAt: Date | null;
    workMinutes: number;
    remark: string | null;
    employee?: { nameZh: string; nameVi: string } | null;
  }) {
    return {
      id: a.id.toString(),
      storeId: a.storeId.toString(),
      employeeId: a.employeeId.toString(),
      workDate: this.ymd(a.workDate),
      clockInAt: a.clockInAt.toISOString(),
      clockOutAt: a.clockOutAt?.toISOString() ?? null,
      workMinutes: a.workMinutes,
      remark: a.remark,
      employeeNameZh: a.employee?.nameZh,
      employeeNameVi: a.employee?.nameVi,
    };
  }

  async listEmployees(storeId: string, query: EmployeeQueryDto) {
    const where: Prisma.EmployeeWhereInput = { storeId: BigInt(storeId) };
    if (query.status) where.status = query.status;
    if (query.employmentType) where.employmentType = query.employmentType;
    if (query.keyword) {
      where.OR = [
        { nameZh: { contains: query.keyword } },
        { nameVi: { contains: query.keyword } },
        { phone: { contains: query.keyword } },
      ];
    }
    const rows = await this.prisma.employee.findMany({
      where,
      include: { user: { select: { id: true, username: true, displayName: true } } },
      orderBy: [{ status: 'asc' }, { hiredAt: 'desc' }],
    });
    return rows.map((r) => this.mapEmployee(r));
  }

  async createEmployee(storeId: string, dto: CreateEmployeeDto, operatorId?: string) {
    if (dto.userId) {
      const linked = await this.prisma.employee.findFirst({
        where: { userId: BigInt(dto.userId) },
      });
      if (linked) throw new BusinessError('EMPLOYEE_USER_LINKED');
    }
    const row = await this.prisma.employee.create({
      data: {
        storeId: BigInt(storeId),
        nameZh: dto.nameZh,
        nameVi: dto.nameVi,
        phone: dto.phone || null,
        employmentType: dto.employmentType || EmploymentType.full_time,
        baseSalary: BigInt(dto.baseSalary ?? 0),
        hiredAt: new Date(`${dto.hiredAt.slice(0, 10)}T00:00:00.000Z`),
        userId: dto.userId ? BigInt(dto.userId) : null,
        remark: dto.remark || null,
      },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    });
    const mapped = this.mapEmployee(row);
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'hr',
      action: 'employee.create',
      targetType: 'employee',
      targetId: mapped.id,
      after: mapped,
    });
    return mapped;
  }

  async updateEmployee(
    storeId: string,
    id: string,
    dto: UpdateEmployeeDto,
    operatorId?: string,
  ) {
    const existing = await this.prisma.employee.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('EMPLOYEE_NOT_FOUND');

    if (dto.userId) {
      const linked = await this.prisma.employee.findFirst({
        where: { userId: BigInt(dto.userId), NOT: { id: BigInt(id) } },
      });
      if (linked) throw new BusinessError('EMPLOYEE_USER_LINKED');
    }

    let status = dto.status ?? existing.status;
    let resignedAt = existing.resignedAt;
    if (dto.resignedAt !== undefined) {
      if (!dto.resignedAt) {
        resignedAt = null;
        if (status === EmployeeStatus.resigned && dto.status === undefined) {
          status = EmployeeStatus.active;
        }
      } else {
        resignedAt = new Date(`${String(dto.resignedAt).slice(0, 10)}T00:00:00.000Z`);
        if (dto.status === undefined) status = EmployeeStatus.resigned;
      }
    }
    if (status === EmployeeStatus.resigned && !resignedAt) {
      resignedAt = new Date();
      resignedAt = new Date(
        Date.UTC(resignedAt.getUTCFullYear(), resignedAt.getUTCMonth(), resignedAt.getUTCDate()),
      );
    }
    if (status === EmployeeStatus.active) resignedAt = null;

    const row = await this.prisma.employee.update({
      where: { id: BigInt(id) },
      data: {
        ...(dto.nameZh !== undefined && { nameZh: dto.nameZh }),
        ...(dto.nameVi !== undefined && { nameVi: dto.nameVi }),
        ...(dto.phone !== undefined && { phone: dto.phone || null }),
        ...(dto.employmentType !== undefined && { employmentType: dto.employmentType }),
        ...(dto.baseSalary !== undefined && { baseSalary: BigInt(dto.baseSalary) }),
        ...(dto.hiredAt !== undefined && {
          hiredAt: new Date(`${dto.hiredAt.slice(0, 10)}T00:00:00.000Z`),
        }),
        ...(dto.userId !== undefined && {
          userId: dto.userId ? BigInt(dto.userId) : null,
        }),
        ...(dto.remark !== undefined && { remark: dto.remark || null }),
        status,
        resignedAt,
      },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    });
    const mapped = this.mapEmployee(row);
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'hr',
      action: 'employee.update',
      targetType: 'employee',
      targetId: mapped.id,
      before: { id, status: existing.status },
      after: mapped,
    });
    return mapped;
  }

  async deleteEmployee(storeId: string, id: string, operatorId?: string) {
    const existing = await this.prisma.employee.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
      include: { user: { select: { id: true, username: true, displayName: true } } },
    });
    if (!existing) throw new BusinessError('EMPLOYEE_NOT_FOUND');

    // 考勤外键 ON DELETE CASCADE，事务内删除员工即可一并清掉关联考勤
    await this.prisma.employee.delete({ where: { id: BigInt(id) } });

    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'hr',
      action: 'employee.delete',
      targetType: 'employee',
      targetId: id,
      before: this.mapEmployee(existing),
    });
    return { ok: true };
  }

  async listAttendance(storeId: string, query: AttendanceQueryDto) {
    const where: Prisma.EmployeeAttendanceWhereInput = { storeId: BigInt(storeId) };
    if (query.employeeId) where.employeeId = BigInt(query.employeeId);
    if (query.month && /^\d{4}-\d{2}$/.test(query.month)) {
      const [y, m] = query.month.split('-').map(Number);
      const start = new Date(Date.UTC(y, m - 1, 1));
      const end = new Date(Date.UTC(y, m, 1));
      where.workDate = { gte: start, lt: end };
    }
    const rows = await this.prisma.employeeAttendance.findMany({
      where,
      include: { employee: { select: { nameZh: true, nameVi: true } } },
      orderBy: [{ workDate: 'desc' }, { clockInAt: 'desc' }],
      take: 200,
    });
    return rows.map((r) => this.mapAttendance(r));
  }

  async createAttendance(storeId: string, dto: CreateAttendanceDto, operatorId?: string) {
    const emp = await this.prisma.employee.findFirst({
      where: { id: BigInt(dto.employeeId), storeId: BigInt(storeId) },
    });
    if (!emp) throw new BusinessError('EMPLOYEE_NOT_FOUND');

    const clockInAt = new Date(dto.clockInAt);
    const clockOutAt = dto.clockOutAt ? new Date(dto.clockOutAt) : null;
    if (clockOutAt && clockOutAt <= clockInAt) {
      throw new BusinessError('ATTENDANCE_INVALID_RANGE');
    }
    const workMinutes = computeWorkMinutes(clockInAt, clockOutAt);
    const workDate = new Date(
      Date.UTC(clockInAt.getUTCFullYear(), clockInAt.getUTCMonth(), clockInAt.getUTCDate()),
    );

    const row = await this.prisma.employeeAttendance.create({
      data: {
        storeId: BigInt(storeId),
        employeeId: BigInt(dto.employeeId),
        workDate,
        clockInAt,
        clockOutAt,
        workMinutes,
        remark: dto.remark || null,
      },
      include: { employee: { select: { nameZh: true, nameVi: true } } },
    });
    const mapped = this.mapAttendance(row);
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'hr',
      action: 'attendance.create',
      targetType: 'attendance',
      targetId: mapped.id,
      after: mapped,
    });
    return mapped;
  }

  async updateAttendance(
    storeId: string,
    id: string,
    dto: UpdateAttendanceDto,
    operatorId?: string,
  ) {
    const existing = await this.prisma.employeeAttendance.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('ATTENDANCE_NOT_FOUND');

    const clockInAt = dto.clockInAt ? new Date(dto.clockInAt) : existing.clockInAt;
    let clockOutAt = existing.clockOutAt;
    if (dto.clockOutAt !== undefined) {
      clockOutAt = dto.clockOutAt ? new Date(dto.clockOutAt) : null;
    }
    if (clockOutAt && clockOutAt <= clockInAt) {
      throw new BusinessError('ATTENDANCE_INVALID_RANGE');
    }
    const workMinutes = computeWorkMinutes(clockInAt, clockOutAt);
    const workDate = new Date(
      Date.UTC(clockInAt.getUTCFullYear(), clockInAt.getUTCMonth(), clockInAt.getUTCDate()),
    );

    const row = await this.prisma.employeeAttendance.update({
      where: { id: BigInt(id) },
      data: {
        clockInAt,
        clockOutAt,
        workMinutes,
        workDate,
        ...(dto.remark !== undefined && { remark: dto.remark || null }),
      },
      include: { employee: { select: { nameZh: true, nameVi: true } } },
    });
    const mapped = this.mapAttendance(row);
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'hr',
      action: 'attendance.update',
      targetType: 'attendance',
      targetId: mapped.id,
      after: mapped,
    });
    return mapped;
  }

  async deleteAttendance(storeId: string, id: string, operatorId?: string) {
    const existing = await this.prisma.employeeAttendance.findFirst({
      where: { id: BigInt(id), storeId: BigInt(storeId) },
    });
    if (!existing) throw new BusinessError('ATTENDANCE_NOT_FOUND');
    await this.prisma.employeeAttendance.delete({ where: { id: BigInt(id) } });
    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'hr',
      action: 'attendance.delete',
      targetType: 'attendance',
      targetId: id,
    });
    return { ok: true };
  }

  async getPayroll(storeId: string, yearMonth: string) {
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new BusinessError('INVALID_DATE');
    const row = await this.prisma.employeePayrollRun.findUnique({
      where: {
        storeId_yearMonth: { storeId: BigInt(storeId), yearMonth },
      },
    });
    if (!row) return null;
    return {
      id: row.id.toString(),
      storeId: row.storeId.toString(),
      yearMonth: row.yearMonth,
      totalLaborCost: this.money(row.totalLaborCost),
      snapshot: row.snapshotJson,
      createdBy: row.createdBy?.toString() ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  /** 预览当月人力（不落库） */
  async previewPayroll(storeId: string, yearMonth: string) {
    if (!/^\d{4}-\d{2}$/.test(yearMonth)) throw new BusinessError('INVALID_DATE');
    return this.calcPayroll(storeId, yearMonth);
  }

  private async calcPayroll(storeId: string, yearMonth: string) {
    const [y, m] = yearMonth.split('-').map(Number);
    const monthStart = new Date(Date.UTC(y, m - 1, 1));
    const monthEnd = new Date(Date.UTC(y, m, 1));

    const employees = await this.prisma.employee.findMany({
      where: {
        storeId: BigInt(storeId),
        hiredAt: { lt: monthEnd },
        OR: [{ resignedAt: null }, { resignedAt: { gte: monthStart } }],
      },
    });
    const attendances = await this.prisma.employeeAttendance.findMany({
      where: {
        storeId: BigInt(storeId),
        workDate: { gte: monthStart, lt: monthEnd },
      },
    });

    const result = computeMonthLabor(
      yearMonth,
      employees.map((e) => ({
        id: e.id.toString(),
        nameZh: e.nameZh,
        nameVi: e.nameVi,
        employmentType: e.employmentType,
        status: e.status,
        baseSalary: this.money(e.baseSalary),
        hiredAt: this.ymd(e.hiredAt),
        resignedAt: e.resignedAt ? this.ymd(e.resignedAt) : null,
      })),
      attendances.map((a) => ({
        employeeId: a.employeeId.toString(),
        workDate: this.ymd(a.workDate),
        workMinutes: a.workMinutes,
      })),
    );

    return {
      yearMonth,
      totalLaborCost: result.totalLaborCost,
      lines: result.lines,
      ruleNote:
        'full_time=月薪×在职天数/当月天数；part_time=工时(分)/60×时薪(baseSalary)；金额为越南盾整数',
    };
  }

  async runPayroll(storeId: string, yearMonth: string, operatorId?: string) {
    const calc = await this.calcPayroll(storeId, yearMonth);
    const snapshot = {
      ruleNote: calc.ruleNote,
      lines: calc.lines,
      generatedAt: new Date().toISOString(),
    };

    const row = await this.prisma.$transaction(async (tx) => {
      return tx.employeePayrollRun.upsert({
        where: {
          storeId_yearMonth: { storeId: BigInt(storeId), yearMonth },
        },
        create: {
          storeId: BigInt(storeId),
          yearMonth,
          totalLaborCost: BigInt(calc.totalLaborCost),
          snapshotJson: snapshot,
          createdBy: operatorId ? BigInt(operatorId) : null,
        },
        update: {
          totalLaborCost: BigInt(calc.totalLaborCost),
          snapshotJson: snapshot,
          createdBy: operatorId ? BigInt(operatorId) : null,
        },
      });
    });

    const mapped = {
      id: row.id.toString(),
      storeId: row.storeId.toString(),
      yearMonth: row.yearMonth,
      totalLaborCost: this.money(row.totalLaborCost),
      snapshot: row.snapshotJson,
      createdBy: row.createdBy?.toString() ?? null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };

    await this.audit.log({
      userId: operatorId,
      storeId,
      module: 'hr',
      action: 'payroll.run',
      targetType: 'payroll_run',
      targetId: mapped.id,
      after: { yearMonth, totalLaborCost: mapped.totalLaborCost },
    });
    return mapped;
  }
}

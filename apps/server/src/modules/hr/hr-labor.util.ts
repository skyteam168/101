/**
 * 人力成本计算（纯函数，便于单测）
 * - 长工：月薪按当月在职自然日 / 当月天数 分摊（整数盾，四舍五入）
 * - 兼职：工时分钟 / 60 × 时薪（baseSalary），向下取整到盾
 */

export type LaborEmployeeInput = {
  id: string;
  nameZh: string;
  nameVi: string;
  employmentType: 'full_time' | 'part_time';
  status: 'active' | 'resigned';
  baseSalary: number;
  /** YYYY-MM-DD */
  hiredAt: string;
  /** YYYY-MM-DD or null */
  resignedAt: string | null;
};

export type LaborAttendanceInput = {
  employeeId: string;
  /** YYYY-MM-DD */
  workDate: string;
  workMinutes: number;
};

export type LaborLine = {
  employeeId: string;
  nameZh: string;
  nameVi: string;
  employmentType: 'full_time' | 'part_time';
  baseSalary: number;
  activeDays: number;
  daysInMonth: number;
  workMinutes: number;
  amount: number;
  rule: string;
};

function parseYmd(ymd: string): { y: number; m: number; d: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { y, m, d };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 闭区间在职天数（与 month 相交） */
export function activeDaysInMonth(
  yearMonth: string,
  hiredAt: string,
  resignedAt: string | null,
): { activeDays: number; daysInMonth: number } {
  const [y, m] = yearMonth.split('-').map(Number);
  const dim = daysInMonth(y, m);
  const monthStart = `${yearMonth}-01`;
  const monthEnd = `${yearMonth}-${String(dim).padStart(2, '0')}`;

  const start = hiredAt > monthStart ? hiredAt : monthStart;
  let end = monthEnd;
  if (resignedAt) {
    // 离职日当天仍算在职
    end = resignedAt < monthEnd ? resignedAt : monthEnd;
  }
  if (start > end) return { activeDays: 0, daysInMonth: dim };

  const s = parseYmd(start);
  const e = parseYmd(end);
  const startUtc = Date.UTC(s.y, s.m - 1, s.d);
  const endUtc = Date.UTC(e.y, e.m - 1, e.d);
  const activeDays = Math.floor((endUtc - startUtc) / 86400000) + 1;
  return { activeDays: Math.max(0, activeDays), daysInMonth: dim };
}

export function computeWorkMinutes(clockInAt: Date, clockOutAt: Date | null | undefined): number {
  if (!clockOutAt) return 0;
  const ms = clockOutAt.getTime() - clockInAt.getTime();
  if (ms <= 0) return 0;
  return Math.floor(ms / 60000);
}

export function computeMonthLabor(
  yearMonth: string,
  employees: LaborEmployeeInput[],
  attendances: LaborAttendanceInput[],
): { totalLaborCost: number; lines: LaborLine[] } {
  const minutesByEmp = new Map<string, number>();
  for (const a of attendances) {
    if (!a.workDate.startsWith(yearMonth)) continue;
    minutesByEmp.set(a.employeeId, (minutesByEmp.get(a.employeeId) || 0) + Math.max(0, a.workMinutes));
  }

  const lines: LaborLine[] = [];
  for (const emp of employees) {
    const { activeDays, daysInMonth: dim } = activeDaysInMonth(
      yearMonth,
      emp.hiredAt,
      emp.resignedAt,
    );
    // 当月完全无在职天数则跳过
    if (activeDays <= 0) continue;

    const workMinutes = minutesByEmp.get(emp.id) || 0;
    let amount = 0;
    let rule = '';

    if (emp.employmentType === 'full_time') {
      amount = Math.round((emp.baseSalary * activeDays) / dim);
      rule = `full_time: monthly ${emp.baseSalary} × ${activeDays}/${dim}`;
    } else {
      // 兼职：仅统计在职期间内的考勤（已按 month 过滤；未进一步裁剪日）
      const hours = workMinutes / 60;
      amount = Math.floor(hours * emp.baseSalary);
      rule = `part_time: ${workMinutes}min × ${emp.baseSalary}/h`;
    }

    lines.push({
      employeeId: emp.id,
      nameZh: emp.nameZh,
      nameVi: emp.nameVi,
      employmentType: emp.employmentType,
      baseSalary: emp.baseSalary,
      activeDays,
      daysInMonth: dim,
      workMinutes,
      amount,
      rule,
    });
  }

  const totalLaborCost = lines.reduce((s, l) => s + l.amount, 0);
  return { totalLaborCost, lines };
}

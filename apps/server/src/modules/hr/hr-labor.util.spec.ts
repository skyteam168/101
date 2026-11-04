import {
  activeDaysInMonth,
  computeMonthLabor,
  computeWorkMinutes,
} from './hr-labor.util';

describe('hr-labor.util', () => {
  it('activeDaysInMonth 整月在职', () => {
    const r = activeDaysInMonth('2026-11', '2026-01-01', null);
    expect(r.daysInMonth).toBe(30);
    expect(r.activeDays).toBe(30);
  });

  it('activeDaysInMonth 月中入职与离职', () => {
    const r = activeDaysInMonth('2026-11', '2026-11-10', '2026-11-20');
    expect(r.activeDays).toBe(11);
  });

  it('computeWorkMinutes', () => {
    const inAt = new Date('2026-11-04T01:00:00.000Z');
    const outAt = new Date('2026-11-04T09:30:00.000Z');
    expect(computeWorkMinutes(inAt, outAt)).toBe(510);
    expect(computeWorkMinutes(inAt, null)).toBe(0);
  });

  it('长工按在职天数分摊月薪', () => {
    const { totalLaborCost, lines } = computeMonthLabor(
      '2026-11',
      [
        {
          id: '1',
          nameZh: '张全职',
          nameVi: 'FT',
          employmentType: 'full_time',
          status: 'active',
          baseSalary: 10_000_000,
          hiredAt: '2026-11-01',
          resignedAt: null,
        },
      ],
      [],
    );
    expect(lines[0].amount).toBe(10_000_000);
    expect(totalLaborCost).toBe(10_000_000);
  });

  it('兼职按工时×时薪', () => {
    const { totalLaborCost, lines } = computeMonthLabor(
      '2026-11',
      [
        {
          id: '2',
          nameZh: '李兼职',
          nameVi: 'PT',
          employmentType: 'part_time',
          status: 'active',
          baseSalary: 50_000,
          hiredAt: '2026-10-01',
          resignedAt: null,
        },
      ],
      [
        { employeeId: '2', workDate: '2026-11-01', workMinutes: 120 },
        { employeeId: '2', workDate: '2026-11-02', workMinutes: 180 },
      ],
    );
    // 5h * 50000
    expect(lines[0].amount).toBe(250_000);
    expect(totalLaborCost).toBe(250_000);
  });
});

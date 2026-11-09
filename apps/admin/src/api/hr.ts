import { apiDelete, apiGet, apiPatch, apiPost } from './http';

export type Employee = {
  id: string;
  nameZh: string;
  nameVi: string;
  phone: string | null;
  employmentType: 'full_time' | 'part_time';
  status: 'active' | 'resigned';
  baseSalary: number;
  hiredAt: string;
  resignedAt: string | null;
  remark: string | null;
  userId: string | null;
  user?: { id: string; username: string; displayName: string } | null;
};

export type Attendance = {
  id: string;
  employeeId: string;
  workDate: string;
  clockInAt: string;
  clockOutAt: string | null;
  workMinutes: number;
  remark: string | null;
  employeeNameZh?: string;
  employeeNameVi?: string;
};

export type PayrollLine = {
  employeeId: string;
  nameZh: string;
  nameVi: string;
  employmentType: string;
  baseSalary: number;
  activeDays: number;
  daysInMonth: number;
  workMinutes: number;
  amount: number;
  rule: string;
};

export type PayrollPreview = {
  yearMonth: string;
  totalLaborCost: number;
  lines: PayrollLine[];
  ruleNote: string;
};

export type PayrollRun = {
  id: string;
  yearMonth: string;
  totalLaborCost: number;
  snapshot: unknown;
  createdAt: string;
  updatedAt: string;
};

export const listEmployeesApi = (params?: {
  status?: string;
  employmentType?: string;
  keyword?: string;
}) => apiGet<Employee[]>('/hr/employees', params);

export const createEmployeeApi = (data: Partial<Employee> & { nameZh: string; nameVi: string; hiredAt: string }) =>
  apiPost<Employee>('/hr/employees', data);

export const updateEmployeeApi = (id: string, data: Partial<Employee>) =>
  apiPatch<Employee>(`/hr/employees/${id}`, data);

export const deleteEmployeeApi = (id: string) =>
  apiDelete<{ ok: boolean }>(`/hr/employees/${id}`);

export const listAttendanceApi = (params?: { month?: string; employeeId?: string }) =>
  apiGet<Attendance[]>('/hr/attendance', params);

export const createAttendanceApi = (data: {
  employeeId: string;
  clockInAt: string;
  clockOutAt?: string;
  remark?: string;
}) => apiPost<Attendance>('/hr/attendance', data);

export const updateAttendanceApi = (
  id: string,
  data: { clockInAt?: string; clockOutAt?: string | null; remark?: string },
) => apiPatch<Attendance>(`/hr/attendance/${id}`, data);

export const deleteAttendanceApi = (id: string) => apiDelete<{ ok: boolean }>(`/hr/attendance/${id}`);

export const previewPayrollApi = (yearMonth: string) =>
  apiGet<PayrollPreview>(`/hr/payroll/${yearMonth}/preview`);

export const getPayrollApi = (yearMonth: string) =>
  apiGet<PayrollRun | null>(`/hr/payroll/${yearMonth}`);

export const runPayrollApi = (yearMonth: string) =>
  apiPost<PayrollRun>('/hr/payroll/run', { yearMonth });

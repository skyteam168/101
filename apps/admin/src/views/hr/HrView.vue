<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatVND, localeField } from '@restaurant/shared';
import {
  createAttendanceApi,
  createEmployeeApi,
  deleteAttendanceApi,
  getPayrollApi,
  listAttendanceApi,
  listEmployeesApi,
  previewPayrollApi,
  runPayrollApi,
  updateEmployeeApi,
  type Attendance,
  type Employee,
  type PayrollPreview,
  type PayrollRun,
} from '../../api/hr';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t, locale } = useI18n();
const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

const tab = ref('employees');
const loading = ref(false);
const employees = ref<Employee[]>([]);
const attendance = ref<Attendance[]>([]);
const keyword = ref('');
const statusFilter = ref('');
const attMonth = ref(new Date().toISOString().slice(0, 7));
const payrollMonth = ref(new Date().toISOString().slice(0, 7));
const payrollPreview = ref<PayrollPreview | null>(null);
const payrollRun = ref<PayrollRun | null>(null);

const empDialog = ref(false);
const empForm = reactive({
  id: '',
  nameZh: '',
  nameVi: '',
  phone: '',
  employmentType: 'full_time' as 'full_time' | 'part_time',
  status: 'active' as 'active' | 'resigned',
  baseSalaryText: '0',
  hiredAt: new Date().toISOString().slice(0, 10),
  resignedAt: '',
  remark: '',
});

const attDialog = ref(false);
const attForm = reactive({
  employeeId: '',
  clockInAt: '',
  clockOutAt: '',
  remark: '',
});

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc.value);
}

async function loadEmployees() {
  employees.value = await listEmployeesApi({
    keyword: keyword.value || undefined,
    status: statusFilter.value || undefined,
  });
}

async function loadAttendance() {
  attendance.value = await listAttendanceApi({ month: attMonth.value });
}

async function loadPayroll() {
  payrollPreview.value = await previewPayrollApi(payrollMonth.value);
  payrollRun.value = await getPayrollApi(payrollMonth.value);
}

async function refresh() {
  loading.value = true;
  try {
    if (tab.value === 'employees') await loadEmployees();
    else if (tab.value === 'attendance') await loadAttendance();
    else await loadPayroll();
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);

function openEmp(row?: Employee) {
  empForm.id = row?.id || '';
  empForm.nameZh = row?.nameZh || '';
  empForm.nameVi = row?.nameVi || '';
  empForm.phone = row?.phone || '';
  empForm.employmentType = row?.employmentType || 'full_time';
  empForm.status = row?.status || 'active';
  empForm.baseSalaryText = formatThousands(row?.baseSalary ?? 0);
  empForm.hiredAt = row?.hiredAt || new Date().toISOString().slice(0, 10);
  empForm.resignedAt = row?.resignedAt || '';
  empForm.remark = row?.remark || '';
  empDialog.value = true;
}

async function saveEmp() {
  if (!empForm.nameZh.trim() || !empForm.nameVi.trim()) {
    ElMessage.warning(t('hr.nameRequired'));
    return;
  }
  const payload = {
    nameZh: empForm.nameZh.trim(),
    nameVi: empForm.nameVi.trim(),
    phone: empForm.phone || undefined,
    employmentType: empForm.employmentType,
    status: empForm.status,
    baseSalary: parseThousands(empForm.baseSalaryText),
    hiredAt: empForm.hiredAt,
    resignedAt: empForm.status === 'resigned' ? empForm.resignedAt || empForm.hiredAt : '',
    remark: empForm.remark || undefined,
  };
  if (empForm.id) await updateEmployeeApi(empForm.id, payload);
  else await createEmployeeApi(payload);
  ElMessage.success(t('common.saved'));
  empDialog.value = false;
  await loadEmployees();
}

function openAtt() {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const local = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  attForm.employeeId = employees.value.find((e) => e.employmentType === 'part_time')?.id || employees.value[0]?.id || '';
  attForm.clockInAt = local;
  attForm.clockOutAt = '';
  attForm.remark = '';
  if (!employees.value.length) void loadEmployees();
  attDialog.value = true;
}

async function saveAtt() {
  if (!attForm.employeeId || !attForm.clockInAt) {
    ElMessage.warning(t('hr.attendanceRequired'));
    return;
  }
  await createAttendanceApi({
    employeeId: attForm.employeeId,
    clockInAt: new Date(attForm.clockInAt).toISOString(),
    clockOutAt: attForm.clockOutAt ? new Date(attForm.clockOutAt).toISOString() : undefined,
    remark: attForm.remark || undefined,
  });
  ElMessage.success(t('common.saved'));
  attDialog.value = false;
  await loadAttendance();
}

async function removeAtt(row: Attendance) {
  await ElMessageBox.confirm(t('hr.deleteAttendanceConfirm'), t('common.confirm'));
  await deleteAttendanceApi(row.id);
  ElMessage.success(t('common.deleted'));
  await loadAttendance();
}

async function doRunPayroll() {
  await ElMessageBox.confirm(t('hr.runPayrollConfirm', { month: payrollMonth.value }), t('common.confirm'));
  await runPayrollApi(payrollMonth.value);
  ElMessage.success(t('hr.runPayrollOk'));
  await loadPayroll();
}

function typeLabel(tpe: string) {
  return t(`hr.type.${tpe}`, tpe);
}

function statusLabel(st: string) {
  return t(`hr.status.${st}`, st);
}
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="head">
      <h2>{{ t('hr.title') }}</h2>
      <p class="hint">{{ t('hr.hint') }}</p>
    </div>

    <el-tabs v-model="tab" @tab-change="refresh">
      <el-tab-pane :label="t('hr.tabEmployees')" name="employees" />
      <el-tab-pane :label="t('hr.tabAttendance')" name="attendance" />
      <el-tab-pane :label="t('hr.tabPayroll')" name="payroll" />
    </el-tabs>

    <template v-if="tab === 'employees'">
      <div class="toolbar">
        <el-input v-model="keyword" clearable :placeholder="t('hr.search')" style="width: 200px" @keyup.enter="refresh" />
        <el-select v-model="statusFilter" clearable :placeholder="t('hr.statusFilter')" style="width: 140px">
          <el-option :label="t('hr.status.active')" value="active" />
          <el-option :label="t('hr.status.resigned')" value="resigned" />
        </el-select>
        <el-button @click="refresh">{{ t('common.refresh') }}</el-button>
        <el-button type="primary" v-perm="'hr:edit'" @click="openEmp()">{{ t('hr.addEmployee') }}</el-button>
      </div>
      <el-table :data="employees" stripe>
        <el-table-column :label="t('hr.name')" min-width="140">
          <template #default="{ row }">{{ nameOf(row) }}</template>
        </el-table-column>
        <el-table-column prop="phone" :label="t('hr.phone')" width="120" />
        <el-table-column :label="t('hr.employmentType')" width="110">
          <template #default="{ row }">{{ typeLabel(row.employmentType) }}</template>
        </el-table-column>
        <el-table-column :label="t('hr.statusLabel')" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'active' ? 'success' : 'info'" size="small">
              {{ statusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('hr.salary')" width="140" align="right">
          <template #default="{ row }">
            {{ formatVND(row.baseSalary) }}
            <span class="muted">{{ row.employmentType === 'part_time' ? t('hr.perHour') : t('hr.perMonth') }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="hiredAt" :label="t('hr.hiredAt')" width="120" />
        <el-table-column prop="resignedAt" :label="t('hr.resignedAt')" width="120" />
        <el-table-column :label="t('common.actions')" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" v-perm="'hr:edit'" @click="openEmp(row)">{{ t('common.edit') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template v-else-if="tab === 'attendance'">
      <div class="toolbar">
        <el-date-picker v-model="attMonth" type="month" value-format="YYYY-MM" @change="refresh" />
        <el-button @click="refresh">{{ t('common.refresh') }}</el-button>
        <el-button type="primary" v-perm="'hr:edit'" @click="openAtt">{{ t('hr.addAttendance') }}</el-button>
      </div>
      <el-table :data="attendance" stripe>
        <el-table-column :label="t('hr.name')" min-width="120">
          <template #default="{ row }">
            {{ loc === 'vi' ? row.employeeNameVi || row.employeeNameZh : row.employeeNameZh || row.employeeNameVi }}
          </template>
        </el-table-column>
        <el-table-column prop="workDate" :label="t('hr.workDate')" width="120" />
        <el-table-column :label="t('hr.clockIn')" min-width="160">
          <template #default="{ row }">{{ new Date(row.clockInAt).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column :label="t('hr.clockOut')" min-width="160">
          <template #default="{ row }">
            {{ row.clockOutAt ? new Date(row.clockOutAt).toLocaleString() : '-' }}
          </template>
        </el-table-column>
        <el-table-column prop="workMinutes" :label="t('hr.workMinutes')" width="100" />
        <el-table-column prop="remark" :label="t('hr.remark')" min-width="120" />
        <el-table-column :label="t('common.actions')" width="100" fixed="right">
          <template #default="{ row }">
            <el-button link type="danger" v-perm="'hr:edit'" @click="removeAtt(row)">{{ t('common.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <template v-else>
      <div class="toolbar">
        <el-date-picker v-model="payrollMonth" type="month" value-format="YYYY-MM" @change="refresh" />
        <el-button @click="refresh">{{ t('common.refresh') }}</el-button>
        <el-button type="primary" v-perm="'hr:payroll'" @click="doRunPayroll">{{ t('hr.runPayroll') }}</el-button>
      </div>
      <el-alert
        v-if="payrollPreview"
        type="info"
        :closable="false"
        show-icon
        :title="t('hr.payrollTotal', { amount: formatVND(payrollPreview.totalLaborCost) })"
        :description="payrollPreview.ruleNote"
        class="mb"
      />
      <el-alert
        v-if="payrollRun"
        type="success"
        :closable="false"
        show-icon
        :title="t('hr.payrollSettled', { amount: formatVND(payrollRun.totalLaborCost) })"
        class="mb"
      />
      <el-table v-if="payrollPreview" :data="payrollPreview.lines" stripe>
        <el-table-column :label="t('hr.name')" min-width="120">
          <template #default="{ row }">{{ nameOf(row) }}</template>
        </el-table-column>
        <el-table-column :label="t('hr.employmentType')" width="100">
          <template #default="{ row }">{{ typeLabel(row.employmentType) }}</template>
        </el-table-column>
        <el-table-column :label="t('hr.activeDays')" width="120">
          <template #default="{ row }">{{ row.activeDays }}/{{ row.daysInMonth }}</template>
        </el-table-column>
        <el-table-column prop="workMinutes" :label="t('hr.workMinutes')" width="100" />
        <el-table-column :label="t('hr.amount')" width="140" align="right">
          <template #default="{ row }">{{ formatVND(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="rule" :label="t('hr.rule')" min-width="200" />
      </el-table>
    </template>

    <el-dialog v-model="empDialog" :title="empForm.id ? t('hr.editEmployee') : t('hr.addEmployee')" width="520px">
      <el-form label-width="110px">
        <el-form-item :label="t('hr.nameZh')" required>
          <el-input v-model="empForm.nameZh" />
        </el-form-item>
        <el-form-item :label="t('hr.nameVi')" required>
          <el-input v-model="empForm.nameVi" />
        </el-form-item>
        <el-form-item :label="t('hr.phone')">
          <el-input v-model="empForm.phone" />
        </el-form-item>
        <el-form-item :label="t('hr.employmentType')">
          <el-radio-group v-model="empForm.employmentType">
            <el-radio label="full_time">{{ t('hr.type.full_time') }}</el-radio>
            <el-radio label="part_time">{{ t('hr.type.part_time') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="empForm.employmentType === 'part_time' ? t('hr.hourlyWage') : t('hr.monthlySalary')">
          <el-input v-model="empForm.baseSalaryText" />
        </el-form-item>
        <el-form-item :label="t('hr.hiredAt')">
          <el-date-picker v-model="empForm.hiredAt" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item :label="t('hr.statusLabel')">
          <el-radio-group v-model="empForm.status">
            <el-radio label="active">{{ t('hr.status.active') }}</el-radio>
            <el-radio label="resigned">{{ t('hr.status.resigned') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="empForm.status === 'resigned'" :label="t('hr.resignedAt')">
          <el-date-picker v-model="empForm.resignedAt" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item :label="t('hr.remark')">
          <el-input v-model="empForm.remark" type="textarea" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="empDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveEmp">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="attDialog" :title="t('hr.addAttendance')" width="480px">
      <el-form label-width="100px">
        <el-form-item :label="t('hr.name')" required>
          <el-select v-model="attForm.employeeId" filterable style="width: 100%">
            <el-option
              v-for="e in employees"
              :key="e.id"
              :label="`${nameOf(e)} (${typeLabel(e.employmentType)})`"
              :value="e.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('hr.clockIn')" required>
          <el-date-picker v-model="attForm.clockInAt" type="datetime" value-format="YYYY-MM-DDTHH:mm" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('hr.clockOut')">
          <el-date-picker v-model="attForm.clockOutAt" type="datetime" value-format="YYYY-MM-DDTHH:mm" style="width: 100%" />
        </el-form-item>
        <el-form-item :label="t('hr.remark')">
          <el-input v-model="attForm.remark" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="attDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveAtt">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  padding: 4px 0 24px;
}
.head h2 {
  margin: 0 0 4px;
  font-size: 20px;
}
.hint {
  margin: 0 0 12px;
  color: #909399;
  font-size: 13px;
}
.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}
.muted {
  color: #909399;
  font-size: 12px;
  margin-left: 4px;
}
.mb {
  margin-bottom: 12px;
}
</style>

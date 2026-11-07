<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatVND } from '@restaurant/shared';
import {
  createCapitalEntryApi,
  createExpenseApi,
  createPartnerApi,
  createSettlementApi,
  deleteCapitalEntryApi,
  deleteExpenseApi,
  deletePartnerApi,
  deleteSettlementApi,
  getCapitalReconApi,
  getPartnerLedgerApi,
  listCapitalEntriesApi,
  listExpensesApi,
  listPartnersApi,
  listSettlementsApi,
  updateExpenseApi,
  updatePartnerApi,
  type CapitalCategory,
  type CapitalEntryType,
  type CapitalRecon,
  type CapitalRefType,
  type OpsExpense,
  type Partner,
  type PartnerCapitalEntry,
  type PartnerLedger,
  type PartnerSettlement,
} from '../../api/finance';
import { reportPeriodProfitApi, type PeriodProfit } from '../../api/report';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t } = useI18n();
const tab = ref('expenses');
const loading = ref(false);
const yearMonth = ref(new Date().toISOString().slice(0, 7));

const expenses = ref<OpsExpense[]>([]);
const partners = ref<Partner[]>([]);
const settlements = ref<PartnerSettlement[]>([]);
const capitalEntries = ref<PartnerCapitalEntry[]>([]);
const capitalRecon = ref<CapitalRecon | null>(null);
const monthProfit = ref<PeriodProfit | null>(null);

const expDialog = ref(false);
const expForm = reactive({
  id: '',
  yearMonth: yearMonth.value,
  type: 'water' as OpsExpense['type'],
  quantity: undefined as number | undefined,
  unit: '',
  amountText: '0',
  remark: '',
});

const partnerDialog = ref(false);
const partnerForm = reactive({
  id: '',
  name: '',
  idNumber: '',
  address: '',
  sharePercent: 0,
  status: 'active' as Partner['status'],
  remark: '',
  initialCapitalText: '0',
  initialCapitalDate: new Date().toISOString().slice(0, 10),
  initialCapitalCategory: 'working_capital' as CapitalCategory,
});

const capitalDialog = ref(false);
const capitalForm = reactive({
  partnerId: '',
  entryDate: new Date().toISOString().slice(0, 10),
  type: 'increase' as CapitalEntryType,
  category: 'other' as CapitalCategory,
  amountText: '0',
  refType: '' as '' | CapitalRefType,
  refId: '',
  note: '',
});

const settleDialog = ref(false);
const settleForm = reactive({
  id: '',
  partnerId: '',
  settleDate: new Date().toISOString().slice(0, 10),
  yearMonth: yearMonth.value,
  amountText: '0',
  note: '',
});

const ledgerDrawer = ref(false);
const ledger = ref<PartnerLedger | null>(null);

const CAPITAL_CATEGORIES: CapitalCategory[] = [
  'rent',
  'renovation',
  'equipment',
  'furniture',
  'deposit',
  'working_capital',
  'other',
];

async function refresh() {
  loading.value = true;
  try {
    if (tab.value === 'expenses') {
      expenses.value = await listExpensesApi({ yearMonth: yearMonth.value || undefined });
    } else if (tab.value === 'partners') {
      partners.value = await listPartnersApi();
    } else if (tab.value === 'capital') {
      capitalEntries.value = await listCapitalEntriesApi();
      capitalRecon.value = await getCapitalReconApi();
      partners.value = await listPartnersApi();
    } else if (tab.value === 'settlements') {
      settlements.value = await listSettlementsApi({ yearMonth: yearMonth.value || undefined });
      partners.value = await listPartnersApi();
    } else {
      monthProfit.value = await reportPeriodProfitApi('month', yearMonth.value);
      settlements.value = await listSettlementsApi({ yearMonth: yearMonth.value || undefined });
    }
  } finally {
    loading.value = false;
  }
}

onMounted(refresh);

function openExpense(row?: OpsExpense) {
  expForm.id = row?.id || '';
  expForm.yearMonth = row?.yearMonth || yearMonth.value;
  expForm.type = row?.type || 'water';
  expForm.quantity = row?.quantity ?? undefined;
  expForm.unit = row?.unit || '';
  expForm.amountText = formatThousands(row?.amount ?? 0);
  expForm.remark = row?.remark || '';
  expDialog.value = true;
}

async function saveExpense() {
  const payload = {
    yearMonth: expForm.yearMonth,
    type: expForm.type,
    quantity: expForm.quantity,
    unit: expForm.unit || undefined,
    amount: parseThousands(expForm.amountText),
    remark: expForm.remark || undefined,
  };
  if (expForm.id) await updateExpenseApi(expForm.id, payload);
  else await createExpenseApi(payload);
  ElMessage.success(t('common.saved'));
  expDialog.value = false;
  await refresh();
}

async function removeExpense(row: OpsExpense) {
  await ElMessageBox.confirm(t('common.confirm'), { type: 'warning' });
  await deleteExpenseApi(row.id);
  ElMessage.success(t('common.deleted'));
  await refresh();
}

function openPartner(row?: Partner) {
  partnerForm.id = row?.id || '';
  partnerForm.name = row?.name || '';
  partnerForm.idNumber = row?.idNumber || '';
  partnerForm.address = row?.address || '';
  partnerForm.sharePercent = row?.sharePercent ?? 0;
  partnerForm.status = row?.status || 'active';
  partnerForm.remark = row?.remark || '';
  partnerForm.initialCapitalText = '0';
  partnerForm.initialCapitalDate = new Date().toISOString().slice(0, 10);
  partnerForm.initialCapitalCategory = 'working_capital';
  partnerDialog.value = true;
}

async function savePartner() {
  const payload: Record<string, unknown> = {
    name: partnerForm.name,
    idNumber: partnerForm.idNumber || undefined,
    address: partnerForm.address || undefined,
    sharePercent: partnerForm.sharePercent,
    status: partnerForm.status,
    remark: partnerForm.remark || undefined,
  };
  if (!partnerForm.id) {
    const initial = parseThousands(partnerForm.initialCapitalText);
    if (initial > 0) {
      payload.initialCapital = initial;
      payload.initialCapitalDate = partnerForm.initialCapitalDate;
      payload.initialCapitalCategory = partnerForm.initialCapitalCategory;
    }
  }
  if (partnerForm.id) await updatePartnerApi(partnerForm.id, payload);
  else await createPartnerApi(payload);
  ElMessage.success(t('common.saved'));
  partnerDialog.value = false;
  await refresh();
}

async function removePartner(row: Partner) {
  await ElMessageBox.confirm(t('common.confirm'), { type: 'warning' });
  await deletePartnerApi(row.id);
  ElMessage.success(t('common.deleted'));
  await refresh();
}

async function openLedger(row: Partner) {
  ledger.value = await getPartnerLedgerApi(row.id);
  ledgerDrawer.value = true;
}

function openCapital(partnerId?: string) {
  capitalForm.partnerId = partnerId || partners.value[0]?.id || '';
  capitalForm.entryDate = new Date().toISOString().slice(0, 10);
  capitalForm.type = 'increase';
  capitalForm.category = 'other';
  capitalForm.amountText = '0';
  capitalForm.refType = '';
  capitalForm.refId = '';
  capitalForm.note = '';
  capitalDialog.value = true;
}

async function saveCapital() {
  if (!capitalForm.partnerId) {
    ElMessage.warning(t('finance.partnerRequired'));
    return;
  }
  await createCapitalEntryApi({
    partnerId: capitalForm.partnerId,
    entryDate: capitalForm.entryDate,
    type: capitalForm.type,
    category: capitalForm.category,
    amount: parseThousands(capitalForm.amountText),
    refType: capitalForm.refType || undefined,
    refId: capitalForm.refId || undefined,
    note: capitalForm.note || undefined,
  });
  ElMessage.success(t('common.saved'));
  capitalDialog.value = false;
  await refresh();
}

async function removeCapital(row: PartnerCapitalEntry) {
  await ElMessageBox.confirm(t('common.confirm'), { type: 'warning' });
  await deleteCapitalEntryApi(row.id);
  ElMessage.success(t('common.deleted'));
  await refresh();
}

function openSettle() {
  settleForm.id = '';
  settleForm.partnerId = partners.value[0]?.id || '';
  settleForm.settleDate = new Date().toISOString().slice(0, 10);
  settleForm.yearMonth = yearMonth.value;
  settleForm.amountText = '0';
  settleForm.note = '';
  settleDialog.value = true;
}

async function saveSettle() {
  await createSettlementApi({
    partnerId: settleForm.partnerId,
    settleDate: settleForm.settleDate,
    yearMonth: settleForm.yearMonth,
    amount: parseThousands(settleForm.amountText),
    note: settleForm.note || undefined,
  });
  ElMessage.success(t('common.saved'));
  settleDialog.value = false;
  await refresh();
}

async function removeSettle(row: PartnerSettlement) {
  await ElMessageBox.confirm(t('common.confirm'), { type: 'warning' });
  await deleteSettlementApi(row.id);
  ElMessage.success(t('common.deleted'));
  await refresh();
}

function shareLabel(bp: number) {
  return `${(bp / 100).toFixed(2)}%`;
}

function roiClass(n: number | undefined) {
  if (n == null) return '';
  if (n > 0) return 'roi-pos';
  if (n < 0) return 'roi-neg';
  return '';
}
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="toolbar">
      <h3>{{ t('finance.title') }}</h3>
      <el-date-picker v-model="yearMonth" type="month" value-format="YYYY-MM" @change="refresh" />
    </div>

    <el-tabs v-model="tab" @tab-change="refresh">
      <el-tab-pane :label="t('finance.expenses')" name="expenses">
        <el-button type="primary" style="margin-bottom: 10px" @click="openExpense()">
          {{ t('finance.addExpense') }}
        </el-button>
        <el-table :data="expenses" border>
          <el-table-column prop="yearMonth" :label="t('finance.yearMonth')" width="100" />
          <el-table-column :label="t('finance.type')" width="110">
            <template #default="{ row }">{{ t(`finance.expenseType.${row.type}`) }}</template>
          </el-table-column>
          <el-table-column prop="quantity" :label="t('finance.quantity')" width="100" />
          <el-table-column prop="unit" :label="t('finance.unit')" width="80" />
          <el-table-column :label="t('finance.amount')" width="140">
            <template #default="{ row }">{{ formatVND(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="remark" :label="t('common.remark')" min-width="140" />
          <el-table-column :label="t('common.actions')" width="140" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openExpense(row)">{{ t('common.edit') }}</el-button>
              <el-button link type="danger" @click="removeExpense(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('finance.partners')" name="partners">
        <el-button type="primary" style="margin-bottom: 10px" @click="openPartner()">
          {{ t('finance.addPartner') }}
        </el-button>
        <el-table :data="partners" border>
          <el-table-column prop="name" :label="t('finance.partnerName')" min-width="110" />
          <el-table-column prop="idNumber" :label="t('finance.idNumber')" width="130" />
          <el-table-column :label="t('finance.sharePercent')" width="100">
            <template #default="{ row }">{{ shareLabel(row.sharePercent) }}</template>
          </el-table-column>
          <el-table-column :label="t('finance.investedTotal')" width="140">
            <template #default="{ row }">{{ formatVND(row.investedTotal || 0) }}</template>
          </el-table-column>
          <el-table-column :label="t('finance.dividends')" width="130">
            <template #default="{ row }">{{ formatVND(row.dividends || 0) }}</template>
          </el-table-column>
          <el-table-column :label="t('finance.cashRoi')" width="130">
            <template #default="{ row }">
              <span :class="roiClass(row.cashRoi)">{{ formatVND(row.cashRoi || 0) }}</span>
            </template>
          </el-table-column>
          <el-table-column :label="t('common.status')" width="90">
            <template #default="{ row }">{{ t(`finance.partnerStatus.${row.status}`) }}</template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="220" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openLedger(row)">{{ t('finance.ledger') }}</el-button>
              <el-button link type="primary" @click="openPartner(row)">{{ t('common.edit') }}</el-button>
              <el-button link type="danger" @click="removePartner(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('finance.capital')" name="capital">
        <div v-if="capitalRecon" class="recon-cards">
          <div class="stat">
            <div class="stat-title">{{ t('finance.totalCapital') }}</div>
            <div class="stat-value">{{ formatVND(capitalRecon.totalCapital) }}</div>
          </div>
          <div class="stat">
            <div class="stat-title">{{ t('finance.assetBook') }}</div>
            <div class="stat-value">{{ formatVND(capitalRecon.assetBook) }}</div>
          </div>
          <div class="stat">
            <div class="stat-title">{{ t('finance.inventoryValue') }}</div>
            <div class="stat-value">{{ formatVND(capitalRecon.inventoryValue) }}</div>
          </div>
          <div class="stat">
            <div class="stat-title">{{ t('finance.linkedOpsExpense') }}</div>
            <div class="stat-value">{{ formatVND(capitalRecon.capitalLinkedOpsExpense) }}</div>
          </div>
          <div class="stat" :class="{ warn: capitalRecon.gap !== 0 }">
            <div class="stat-title">{{ t('finance.reconGap') }}</div>
            <div class="stat-value">{{ formatVND(capitalRecon.gap) }}</div>
          </div>
        </div>
        <p class="hint">{{ capitalRecon?.note || t('finance.reconHint') }}</p>
        <el-button type="primary" style="margin: 10px 0" @click="openCapital()">
          {{ t('finance.addCapital') }}
        </el-button>
        <el-table :data="capitalEntries" border>
          <el-table-column prop="entryDate" :label="t('finance.entryDate')" width="120" />
          <el-table-column prop="partnerName" :label="t('finance.partnerName')" min-width="110" />
          <el-table-column :label="t('finance.capitalType')" width="100">
            <template #default="{ row }">{{ t(`finance.capitalTypeMap.${row.type}`) }}</template>
          </el-table-column>
          <el-table-column :label="t('finance.capitalCategory')" width="110">
            <template #default="{ row }">{{ t(`finance.capitalCategoryMap.${row.category}`) }}</template>
          </el-table-column>
          <el-table-column :label="t('finance.amount')" width="140">
            <template #default="{ row }">{{ formatVND(row.amount) }}</template>
          </el-table-column>
          <el-table-column :label="t('finance.ref')" min-width="140">
            <template #default="{ row }">
              <span v-if="row.refType">{{ row.refType }}#{{ row.refId }}</span>
              <span v-else>—</span>
            </template>
          </el-table-column>
          <el-table-column prop="note" :label="t('common.remark')" min-width="120" />
          <el-table-column :label="t('common.actions')" width="90" fixed="right">
            <template #default="{ row }">
              <el-button link type="danger" @click="removeCapital(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('finance.settlements')" name="settlements">
        <el-button type="primary" style="margin-bottom: 10px" @click="openSettle()">
          {{ t('finance.addSettlement') }}
        </el-button>
        <el-table :data="settlements" border>
          <el-table-column prop="partnerName" :label="t('finance.partnerName')" min-width="120" />
          <el-table-column prop="settleDate" :label="t('finance.settleDate')" width="120" />
          <el-table-column prop="yearMonth" :label="t('finance.yearMonth')" width="100" />
          <el-table-column :label="t('finance.amount')" width="140">
            <template #default="{ row }">{{ formatVND(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="note" :label="t('common.remark')" min-width="140" />
          <el-table-column :label="t('common.actions')" width="100" fixed="right">
            <template #default="{ row }">
              <el-button link type="danger" @click="removeSettle(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('finance.monthlySummary')" name="summary">
        <el-row v-if="monthProfit" :gutter="12" class="cards">
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('reports.revenue') }}</div>
              <div class="stat-value">{{ formatVND(monthProfit.revenue) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('reports.purchaseCost') }}</div>
              <div class="stat-value">{{ formatVND(monthProfit.purchaseCost || 0) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('reports.laborCost') }}</div>
              <div class="stat-value">{{ formatVND(monthProfit.laborCost || 0) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('finance.opsExpense') }}</div>
              <div class="stat-value">{{ formatVND(monthProfit.opsExpense || 0) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('finance.partnerSettlements') }}</div>
              <div class="stat-value">{{ formatVND(monthProfit.partnerSettlements || 0) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat highlight">
              <div class="stat-title">{{ t('finance.remaining') }}</div>
              <div class="stat-value">
                {{ formatVND(monthProfit.remainingAfterPartners ?? monthProfit.partnerSummary?.remaining ?? 0) }}
              </div>
            </div>
          </el-col>
        </el-row>
        <p class="hint">{{ t('finance.summaryHint') }}</p>
        <el-table :data="settlements" border style="margin-top: 12px">
          <el-table-column prop="partnerName" :label="t('finance.partnerName')" />
          <el-table-column prop="settleDate" :label="t('finance.settleDate')" width="120" />
          <el-table-column :label="t('finance.amount')" width="140">
            <template #default="{ row }">{{ formatVND(row.amount) }}</template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="expDialog" :title="t('finance.expense')" width="460px">
      <el-form label-width="100px">
        <el-form-item :label="t('finance.yearMonth')">
          <el-date-picker v-model="expForm.yearMonth" type="month" value-format="YYYY-MM" />
        </el-form-item>
        <el-form-item :label="t('finance.type')">
          <el-select v-model="expForm.type">
            <el-option
              v-for="k in ['water', 'electricity', 'rent', 'other']"
              :key="k"
              :label="t(`finance.expenseType.${k}`)"
              :value="k"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('finance.quantity')">
          <el-input-number v-model="expForm.quantity" :min="0" :step="0.1" />
        </el-form-item>
        <el-form-item :label="t('finance.unit')"><el-input v-model="expForm.unit" /></el-form-item>
        <el-form-item :label="t('finance.amount')">
          <el-input
            :model-value="expForm.amountText"
            @update:model-value="(v: string) => (expForm.amountText = formatThousands(parseThousands(v)))"
          />
        </el-form-item>
        <el-form-item :label="t('common.remark')"><el-input v-model="expForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="expDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveExpense">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="partnerDialog" :title="t('finance.partner')" width="500px">
      <el-form label-width="120px">
        <el-form-item :label="t('finance.partnerName')"><el-input v-model="partnerForm.name" /></el-form-item>
        <el-form-item :label="t('finance.idNumber')"><el-input v-model="partnerForm.idNumber" /></el-form-item>
        <el-form-item :label="t('finance.address')"><el-input v-model="partnerForm.address" /></el-form-item>
        <el-form-item :label="t('finance.shareBp')">
          <el-input-number v-model="partnerForm.sharePercent" :min="0" :max="10000" :step="100" />
        </el-form-item>
        <el-form-item :label="t('common.status')">
          <el-select v-model="partnerForm.status">
            <el-option :label="t('finance.partnerStatus.active')" value="active" />
            <el-option :label="t('finance.partnerStatus.inactive')" value="inactive" />
          </el-select>
        </el-form-item>
        <template v-if="!partnerForm.id">
          <el-form-item :label="t('finance.initialCapital')">
            <el-input
              :model-value="partnerForm.initialCapitalText"
              @update:model-value="
                (v: string) => (partnerForm.initialCapitalText = formatThousands(parseThousands(v)))
              "
            />
          </el-form-item>
          <el-form-item :label="t('finance.entryDate')">
            <el-date-picker v-model="partnerForm.initialCapitalDate" type="date" value-format="YYYY-MM-DD" />
          </el-form-item>
          <el-form-item :label="t('finance.capitalCategory')">
            <el-select v-model="partnerForm.initialCapitalCategory">
              <el-option
                v-for="c in CAPITAL_CATEGORIES"
                :key="c"
                :label="t(`finance.capitalCategoryMap.${c}`)"
                :value="c"
              />
            </el-select>
          </el-form-item>
        </template>
        <el-form-item :label="t('common.remark')"><el-input v-model="partnerForm.remark" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="partnerDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="savePartner">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="capitalDialog" :title="t('finance.addCapital')" width="520px">
      <el-form label-width="120px">
        <el-form-item :label="t('finance.partnerName')">
          <el-select v-model="capitalForm.partnerId" style="width: 100%">
            <el-option v-for="p in partners" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('finance.entryDate')">
          <el-date-picker v-model="capitalForm.entryDate" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item :label="t('finance.capitalType')">
          <el-select v-model="capitalForm.type">
            <el-option :label="t('finance.capitalTypeMap.initial')" value="initial" />
            <el-option :label="t('finance.capitalTypeMap.increase')" value="increase" />
            <el-option :label="t('finance.capitalTypeMap.decrease')" value="decrease" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('finance.capitalCategory')">
          <el-select v-model="capitalForm.category">
            <el-option
              v-for="c in CAPITAL_CATEGORIES"
              :key="c"
              :label="t(`finance.capitalCategoryMap.${c}`)"
              :value="c"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('finance.amount')">
          <el-input
            :model-value="capitalForm.amountText"
            @update:model-value="(v: string) => (capitalForm.amountText = formatThousands(parseThousands(v)))"
          />
        </el-form-item>
        <el-form-item :label="t('finance.refType')">
          <el-select v-model="capitalForm.refType" clearable style="width: 100%">
            <el-option :label="t('finance.refTypeMap.asset')" value="asset" />
            <el-option :label="t('finance.refTypeMap.asset_event')" value="asset_event" />
            <el-option :label="t('finance.refTypeMap.ops_expense')" value="ops_expense" />
          </el-select>
        </el-form-item>
        <el-form-item v-if="capitalForm.refType" :label="t('finance.refId')">
          <el-input v-model="capitalForm.refId" :placeholder="t('finance.refIdHint')" />
        </el-form-item>
        <el-form-item :label="t('common.remark')"><el-input v-model="capitalForm.note" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="capitalDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveCapital">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="settleDialog" :title="t('finance.settlement')" width="460px">
      <el-form label-width="100px">
        <el-form-item :label="t('finance.partnerName')">
          <el-select v-model="settleForm.partnerId" style="width: 100%">
            <el-option v-for="p in partners" :key="p.id" :label="p.name" :value="p.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('finance.settleDate')">
          <el-date-picker v-model="settleForm.settleDate" type="date" value-format="YYYY-MM-DD" />
        </el-form-item>
        <el-form-item :label="t('finance.yearMonth')">
          <el-date-picker v-model="settleForm.yearMonth" type="month" value-format="YYYY-MM" />
        </el-form-item>
        <el-form-item :label="t('finance.amount')">
          <el-input
            :model-value="settleForm.amountText"
            @update:model-value="(v: string) => (settleForm.amountText = formatThousands(parseThousands(v)))"
          />
        </el-form-item>
        <el-form-item :label="t('common.remark')"><el-input v-model="settleForm.note" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="settleDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveSettle">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="ledgerDrawer" :title="t('finance.ledger')" size="520px">
      <template v-if="ledger">
        <div class="ledger-head">
          <h4>{{ ledger.partner.name }}</h4>
          <p>{{ shareLabel(ledger.partner.sharePercent) }}</p>
        </div>
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item :label="t('finance.investedTotal')">
            {{ formatVND(ledger.invested) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('finance.dividends')">
            {{ formatVND(ledger.dividends) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('finance.cashRoi')">
            <span :class="roiClass(ledger.cashRoi)">{{ formatVND(ledger.cashRoi) }}</span>
          </el-descriptions-item>
          <el-descriptions-item :label="t('finance.equityShare')">
            {{ formatVND(ledger.equityShare) }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('finance.equityGap')">
            <span :class="roiClass(ledger.equityGap)">{{ formatVND(ledger.equityGap) }}</span>
          </el-descriptions-item>
        </el-descriptions>
        <p class="hint">{{ ledger.note }}</p>
        <h4 class="sub-h">{{ t('finance.capital') }}</h4>
        <el-table :data="ledger.capitalEntries" size="small" border>
          <el-table-column prop="entryDate" :label="t('finance.entryDate')" width="100" />
          <el-table-column :label="t('finance.capitalType')" width="80">
            <template #default="{ row }">{{ t(`finance.capitalTypeMap.${row.type}`) }}</template>
          </el-table-column>
          <el-table-column :label="t('finance.amount')" width="120">
            <template #default="{ row }">{{ formatVND(row.amount) }}</template>
          </el-table-column>
        </el-table>
        <h4 class="sub-h">{{ t('finance.settlements') }}</h4>
        <el-table :data="ledger.settlements" size="small" border>
          <el-table-column prop="settleDate" :label="t('finance.settleDate')" width="100" />
          <el-table-column :label="t('finance.amount')" width="120">
            <template #default="{ row }">{{ formatVND(row.amount) }}</template>
          </el-table-column>
        </el-table>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.page { padding: 8px 4px 24px; }
.toolbar { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.toolbar h3 { margin: 0; }
.cards { margin-bottom: 8px; }
.recon-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
  margin-bottom: 8px;
}
.stat {
  background: #fff;
  border: 1px solid var(--mt-border, #ebeef5);
  border-radius: 10px;
  padding: 14px;
  margin-bottom: 12px;
}
.stat.highlight { border-color: #67c23a; }
.stat.warn { border-color: #e6a23c; background: #fdf6ec; }
.stat-title { color: #909399; font-size: 13px; margin-bottom: 8px; }
.stat-value { font-size: 18px; font-weight: 700; }
.hint { color: #909399; font-size: 13px; }
.roi-pos { color: #67c23a; font-weight: 600; }
.roi-neg { color: #f56c6c; font-weight: 600; }
.ledger-head { margin-bottom: 12px; }
.ledger-head h4 { margin: 0 0 4px; }
.ledger-head p { margin: 0; color: #909399; }
.sub-h { margin: 16px 0 8px; font-size: 14px; }
</style>

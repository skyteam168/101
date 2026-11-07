<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { formatVND, localeField } from '@restaurant/shared';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  GridComponent,
  LegendComponent,
  TooltipComponent,
} from 'echarts/components';
import VChart from 'vue-echarts';
import {
  closeShiftApi,
  currentShiftApi,
  exportReportApi,
  listShiftsApi,
  openShiftApi,
  printShiftApi,
  reportOverviewApi,
  reportPeriodProfitApi,
  reportTrendApi,
  type CashierShift,
  type PeriodProfit,
  type ReportOverview,
  type TrendPoint,
} from '../../api/report';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

use([CanvasRenderer, LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent]);

const { t, locale } = useI18n();
const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

const tab = ref('overview');
const loading = ref(false);
const date = ref(new Date().toISOString().slice(0, 10));
const range = reactive({ from: '', to: '' });
const month = ref(new Date().toISOString().slice(0, 7));
const profitPeriod = ref<'month' | 'quarter' | 'half' | 'year'>('month');

const overview = ref<ReportOverview | null>(null);
const trend = ref<TrendPoint[]>([]);
const monthData = ref<PeriodProfit | null>(null);

const currentShift = ref<CashierShift | null>(null);
const shifts = ref<CashierShift[]>([]);
const openCashText = ref('0');
const closeCashText = ref('0');
const shiftNote = ref('');

function dishName(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc.value);
}

function channelLabel(key: string) {
  return t(`reports.channel.${key}`, key);
}

function payLabel(key: string) {
  return t(`reports.pay.${key}`, key);
}

async function loadOverview() {
  loading.value = true;
  try {
    overview.value = await reportOverviewApi({ date: date.value });
    const from = range.from || (() => {
      const d = new Date(date.value);
      d.setDate(d.getDate() - 13);
      return d.toISOString().slice(0, 10);
    })();
    const to = range.to || date.value;
    const tr = await reportTrendApi({ from, to });
    trend.value = tr.points;
  } finally {
    loading.value = false;
  }
}

async function loadMonth() {
  loading.value = true;
  try {
    monthData.value = await reportPeriodProfitApi(profitPeriod.value, month.value);
  } finally {
    loading.value = false;
  }
}

async function loadShifts() {
  loading.value = true;
  try {
    currentShift.value = await currentShiftApi();
    shifts.value = await listShiftsApi({ limit: 40 });
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  if (tab.value === 'overview' || tab.value === 'daily') await loadOverview();
  else if (tab.value === 'month') await loadMonth();
  else await loadShifts();
}

onMounted(refresh);
watch(tab, refresh);

const lineOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: {
    top: 4,
    left: 'center',
    data: [t('reports.revenue'), t('reports.orderCount')],
  },
  grid: { left: 56, right: 48, top: 44, bottom: 36, containLabel: true },
  xAxis: { type: 'category', data: trend.value.map((p) => p.date.slice(5)), boundaryGap: true },
  yAxis: [
    { type: 'value', name: t('reports.revenue'), nameGap: 8, scale: true },
    { type: 'value', name: t('reports.orderCount'), nameGap: 8, minInterval: 1 },
  ],
  series: [
    {
      name: t('reports.revenue'),
      type: 'line',
      smooth: true,
      showSymbol: true,
      data: trend.value.map((p) => p.revenue),
    },
    {
      name: t('reports.orderCount'),
      type: 'bar',
      yAxisIndex: 1,
      barMaxWidth: 28,
      data: trend.value.map((p) => p.orderCount),
    },
  ],
}));

const channelOption = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0, left: 'center' },
  series: [
    {
      type: 'pie',
      radius: ['32%', '58%'],
      center: ['50%', '46%'],
      data: (overview.value?.channel || []).map((c) => ({
        name: channelLabel(c.key),
        value: c.amount,
      })),
    },
  ],
}));

const payOption = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0, left: 'center' },
  series: [
    {
      type: 'pie',
      radius: ['32%', '58%'],
      center: ['50%', '46%'],
      data: (overview.value?.payMethods || []).map((c) => ({
        name: payLabel(c.key),
        value: c.amount,
      })),
    },
  ],
}));

const hourlyOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 16, right: 16, top: 24, bottom: 8, containLabel: true },
  xAxis: {
    type: 'category',
    data: (overview.value?.hourly || []).map((h) => `${h.hour}:00`),
  },
  yAxis: { type: 'value' },
  series: [
    {
      type: 'bar',
      data: (overview.value?.hourly || []).map((h) => h.amount),
    },
  ],
}));

const monthLineOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 16, right: 16, top: 24, bottom: 8, containLabel: true },
  xAxis: { type: 'category', data: (monthData.value?.days || []).map((p) => p.date.slice(8)) },
  yAxis: { type: 'value' },
  series: [
    {
      type: 'line',
      smooth: true,
      areaStyle: {},
      data: (monthData.value?.days || []).map((p) => p.revenue),
    },
  ],
}));

async function doExport() {
  await exportReportApi({ date: date.value, from: range.from || undefined, to: range.to || undefined });
  ElMessage.success(t('reports.exported'));
}

async function doOpenShift() {
  currentShift.value = await openShiftApi({
    openingCash: parseThousands(openCashText.value),
    note: shiftNote.value || undefined,
  });
  ElMessage.success(t('common.saved'));
  await loadShifts();
}

async function doCloseShift() {
  if (!currentShift.value) return;
  await closeShiftApi(currentShift.value.id, {
    closingCash: parseThousands(closeCashText.value),
    note: shiftNote.value || undefined,
  });
  ElMessage.success(t('common.saved'));
  await loadShifts();
}

async function doPrint(id: string) {
  await printShiftApi(id);
  ElMessage.success(t('reports.printQueued'));
}
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="toolbar">
      <h3>{{ t('reports.title') }}</h3>
      <div class="actions">
        <el-date-picker v-model="date" type="date" value-format="YYYY-MM-DD" @change="loadOverview" />
        <el-button type="primary" @click="refresh">{{ t('common.search') }}</el-button>
        <el-button @click="doExport">{{ t('reports.export') }}</el-button>
      </div>
    </div>

    <el-tabs v-model="tab">
      <el-tab-pane :label="t('reports.overview')" name="overview">
        <el-row v-if="overview" :gutter="12" class="cards">
          <el-col :span="4" v-for="item in [
            { k: 'revenue', v: formatVND(overview.revenue) },
            { k: 'orderCount', v: String(overview.orderCount) },
            { k: 'avgTicket', v: formatVND(overview.avgTicket) },
            { k: 'dineIn', v: formatVND(overview.dineInRevenue) },
            { k: 'takeaway', v: formatVND(overview.takeawayRevenue) },
            { k: 'delivery', v: formatVND(overview.deliveryRevenue) },
          ]" :key="item.k">
            <div class="stat">
              <div class="stat-title">{{ t(`reports.${item.k}`) }}</div>
              <div class="stat-value">{{ item.v }}</div>
            </div>
          </el-col>
        </el-row>

        <el-row :gutter="12">
          <el-col :span="14">
            <div class="chart-box">
              <div class="chart-title">{{ t('reports.trend') }}</div>
              <VChart class="chart" :option="lineOption" autoresize />
            </div>
          </el-col>
          <el-col :span="10">
            <div class="chart-box">
              <div class="chart-title">{{ t('reports.hourly') }}</div>
              <VChart class="chart" :option="hourlyOption" autoresize />
            </div>
          </el-col>
        </el-row>

        <el-row :gutter="12" style="margin-top: 12px">
          <el-col :span="8">
            <div class="chart-box">
              <div class="chart-title">{{ t('reports.byChannel') }}</div>
              <VChart class="chart sm" :option="channelOption" autoresize />
            </div>
          </el-col>
          <el-col :span="8">
            <div class="chart-box">
              <div class="chart-title">{{ t('reports.byPay') }}</div>
              <VChart class="chart sm" :option="payOption" autoresize />
            </div>
          </el-col>
          <el-col :span="8">
            <div class="chart-box">
              <div class="chart-title">{{ t('reports.topDishes') }}</div>
              <el-table :data="overview?.topDishes || []" size="small" height="260">
                <el-table-column :label="t('reports.dish')" min-width="100">
                  <template #default="{ row }">{{ dishName(row) }}</template>
                </el-table-column>
                <el-table-column prop="qty" :label="t('reports.qty')" width="60" />
                <el-table-column :label="t('reports.amount')" width="110">
                  <template #default="{ row }">{{ formatVND(row.amount) }}</template>
                </el-table-column>
              </el-table>
            </div>
          </el-col>
        </el-row>

        <div class="chart-box" style="margin-top: 12px">
          <div class="chart-title">{{ t('reports.operators') }}</div>
          <el-table :data="overview?.operators || []" border size="small">
            <el-table-column prop="displayName" :label="t('reports.operator')" />
            <el-table-column prop="discountCount" :label="t('reports.discountCount')" width="100" />
            <el-table-column :label="t('reports.discountAmount')" width="130">
              <template #default="{ row }">{{ formatVND(row.discountAmount) }}</template>
            </el-table-column>
            <el-table-column prop="voidCount" :label="t('reports.voidCount')" width="90" />
            <el-table-column :label="t('reports.voidAmount')" width="130">
              <template #default="{ row }">{{ formatVND(row.voidAmount) }}</template>
            </el-table-column>
            <el-table-column prop="cancelCount" :label="t('reports.cancelCount')" width="90" />
          </el-table>
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('reports.daily')" name="daily">
        <el-descriptions v-if="overview" :column="3" border>
          <el-descriptions-item :label="t('reports.businessDate')">{{ overview.businessDate }}</el-descriptions-item>
          <el-descriptions-item :label="t('reports.cutHour')">{{ overview.cutHour }}:00</el-descriptions-item>
          <el-descriptions-item :label="t('reports.cache')">
            {{ overview.fromCache ? t('reports.fromCache') : t('reports.live') }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('reports.revenue')">{{ formatVND(overview.revenue) }}</el-descriptions-item>
          <el-descriptions-item :label="t('reports.orderCount')">{{ overview.orderCount }}</el-descriptions-item>
          <el-descriptions-item :label="t('reports.discountTotal')">{{ formatVND(overview.discountTotal) }}</el-descriptions-item>
          <el-descriptions-item :label="t('reports.voidAmount')">{{ formatVND(overview.voidAmount) }}</el-descriptions-item>
          <el-descriptions-item :label="t('reports.cancelCount')">{{ overview.cancelCount }}</el-descriptions-item>
          <el-descriptions-item :label="t('reports.dineIn')">{{ formatVND(overview.dineInRevenue) }}</el-descriptions-item>
          <el-descriptions-item :label="t('reports.takeaway')">{{ formatVND(overview.takeawayRevenue) }}</el-descriptions-item>
          <el-descriptions-item :label="t('reports.delivery')">{{ formatVND(overview.deliveryRevenue) }}</el-descriptions-item>
        </el-descriptions>
      </el-tab-pane>

      <el-tab-pane :label="t('reports.periodProfit')" name="month">
        <div class="toolbar" style="margin-bottom: 12px">
          <el-radio-group v-model="profitPeriod" @change="loadMonth">
            <el-radio-button value="month">{{ t('reports.periodMonth') }}</el-radio-button>
            <el-radio-button value="quarter">{{ t('reports.periodQuarter') }}</el-radio-button>
            <el-radio-button value="half">{{ t('reports.periodHalf') }}</el-radio-button>
            <el-radio-button value="year">{{ t('reports.periodYear') }}</el-radio-button>
          </el-radio-group>
          <el-date-picker v-model="month" type="month" value-format="YYYY-MM" @change="loadMonth" />
          <span v-if="monthData" class="period-label">{{ monthData.label }} · {{ monthData.from }} ~ {{ monthData.to }}</span>
        </div>
        <el-row v-if="monthData" :gutter="12" class="cards">
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('reports.revenue') }}</div>
              <div class="stat-value">{{ formatVND(monthData.revenue) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('reports.purchaseCost') }}</div>
              <div class="stat-value">{{ formatVND(monthData.purchaseCost || 0) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">
                {{ t('reports.laborCost') }}
                <span class="muted">
                  {{ monthData.laborCostSettled ? t('reports.laborSettled') : t('reports.laborUnset') }}
                </span>
              </div>
              <div class="stat-value">{{ formatVND(monthData.laborCost || 0) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat highlight">
              <div class="stat-title">{{ t('reports.netProfit') }}</div>
              <div class="stat-value">{{ formatVND(monthData.netProfit ?? monthData.roughGross ?? 0) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('reports.orderCount') }}</div>
              <div class="stat-value">{{ monthData.orderCount }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('reports.avgTicket') }}</div>
              <div class="stat-value">{{ formatVND(monthData.avgTicket) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('reports.stocktakeConsumption') }}</div>
              <div class="stat-value">{{ formatVND(monthData.stocktakeConsumption || 0) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('reports.inventoryValue') }}</div>
              <div class="stat-value">{{ formatVND(monthData.inventoryValue || 0) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('reports.opsExpense') }}</div>
              <div class="stat-value">{{ formatVND(monthData.opsExpense || 0) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('reports.partnerSettlements') }}</div>
              <div class="stat-value">{{ formatVND(monthData.partnerSettlements || 0) }}</div>
            </div>
          </el-col>
          <el-col :span="6">
            <div class="stat">
              <div class="stat-title">{{ t('reports.remainingAfterPartners') }}</div>
              <div class="stat-value">{{ formatVND(monthData.remainingAfterPartners ?? 0) }}</div>
            </div>
          </el-col>
        </el-row>
        <p v-if="monthData" class="cost-note">{{ t('reports.costNote') }}</p>
        <p class="cost-note">{{ t('reports.costDetailHint') }}</p>
        <p class="cost-note">{{ t('reports.partnerHint') }}</p>
        <div class="chart-box">
          <div class="chart-title">{{ t('reports.monthTrend') }}</div>
          <VChart class="chart" :option="monthLineOption" autoresize />
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('reports.shift')" name="shift">
        <el-card shadow="never" class="shift-card">
          <template v-if="!currentShift">
            <p>{{ t('reports.noOpenShift') }}</p>
            <el-form inline>
              <el-form-item :label="t('reports.openingCash')">
                <el-input
                  :model-value="openCashText"
                  @update:model-value="(v: string) => (openCashText = formatThousands(parseThousands(v)))"
                />
              </el-form-item>
              <el-form-item :label="t('reports.note')">
                <el-input v-model="shiftNote" />
              </el-form-item>
              <el-form-item>
                <el-button type="primary" @click="doOpenShift">{{ t('reports.openShift') }}</el-button>
              </el-form-item>
            </el-form>
          </template>
          <template v-else>
            <p>
              {{ t('reports.currentShift') }}：{{ currentShift.cashierName }} ·
              {{ new Date(currentShift.startedAt).toLocaleString() }}
            </p>
            <el-form inline>
              <el-form-item :label="t('reports.closingCash')">
                <el-input
                  :model-value="closeCashText"
                  @update:model-value="(v: string) => (closeCashText = formatThousands(parseThousands(v)))"
                />
              </el-form-item>
              <el-form-item :label="t('reports.note')">
                <el-input v-model="shiftNote" />
              </el-form-item>
              <el-form-item>
                <el-button type="warning" @click="doCloseShift">{{ t('reports.closeShift') }}</el-button>
              </el-form-item>
            </el-form>
          </template>
        </el-card>

        <el-table :data="shifts" border style="margin-top: 12px">
          <el-table-column prop="cashierName" :label="t('reports.operator')" width="120" />
          <el-table-column :label="t('reports.startedAt')" min-width="160">
            <template #default="{ row }">{{ new Date(row.startedAt).toLocaleString() }}</template>
          </el-table-column>
          <el-table-column :label="t('reports.endedAt')" min-width="160">
            <template #default="{ row }">
              {{ row.endedAt ? new Date(row.endedAt).toLocaleString() : '-' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('reports.openingCash')" width="120">
            <template #default="{ row }">{{ formatVND(row.openingCash) }}</template>
          </el-table-column>
          <el-table-column :label="t('reports.closingCash')" width="120">
            <template #default="{ row }">
              {{ row.closingCash != null ? formatVND(row.closingCash) : '-' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('reports.totalSales')" width="120">
            <template #default="{ row }">
              {{ row.summary?.totalSales != null ? formatVND(row.summary.totalSales) : '-' }}
            </template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="120">
            <template #default="{ row }">
              <el-button
                link
                type="primary"
                :disabled="!row.endedAt"
                @click="doPrint(row.id)"
              >
                {{ t('reports.printShift') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.page { padding: 8px 4px 24px; }
.toolbar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
.toolbar h3 { margin: 0; }
.actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.cards { margin-bottom: 12px; }
.stat { background: #f5f7fa; border-radius: 8px; padding: 12px; min-height: 72px; }
.stat.highlight { background: #ecf5ff; border: 1px solid #d9ecff; }
.stat-title { font-size: 12px; color: #909399; margin-bottom: 6px; }
.stat-title .muted { margin-left: 6px; font-weight: 400; color: #c0c4cc; }
.stat-value { font-size: 16px; font-weight: 600; word-break: break-all; }
.cost-note { font-size: 12px; color: #909399; margin: 0 0 8px; }
.period-label { font-size: 13px; color: #606266; }
.chart-box { background: #fff; border: 1px solid #ebeef5; border-radius: 8px; padding: 12px; }
.chart-title { font-weight: 600; margin-bottom: 8px; }
.chart { height: 300px; width: 100%; }
.chart.sm { height: 260px; }
.shift-card { margin-bottom: 8px; }
</style>

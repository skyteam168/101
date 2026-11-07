<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import {
  Box,
  DataAnalysis,
  Dish,
  Grid,
  List,
  Refresh,
  Setting,
  ShoppingCart,
  User,
  Van,
  WarningFilled,
  Wallet,
} from '@element-plus/icons-vue';
import { formatVND, localeField } from '@restaurant/shared';
import { use } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import VChart from 'vue-echarts';
import {
  reportOpsTodayApi,
  reportOverviewApi,
  type OpsToday,
  type ReportOverview,
} from '../api/report';
import { listFloorApi, type AreaFloor } from '../api/table';
import { useUserStore } from '../stores/user';

use([CanvasRenderer, BarChart, PieChart, GridComponent, TooltipComponent]);

const { t, locale } = useI18n();
const router = useRouter();
const userStore = useUserStore();
const loading = ref(false);
const overview = ref<ReportOverview | null>(null);
const ops = ref<OpsToday | null>(null);
const areas = ref<AreaFloor[]>([]);

const loc = () => (locale.value === 'vi-VN' ? 'vi' : 'zh');
const canReport = computed(
  () => userStore.hasPerm('report:view') || userStore.isSuperAdmin,
);

const todayLabel = computed(() => {
  const raw = ops.value?.businessDate || overview.value?.businessDate;
  if (!raw) return '';
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(locale.value === 'vi-VN' ? 'vi-VN' : 'zh-CN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
});

const tableStats = computed(() => {
  if (ops.value) {
    return {
      idle: ops.value.tables.idle,
      dining: ops.value.tables.dining,
      cleaning: ops.value.tables.cleaning,
      paidToday: ops.value.tables.paidToday,
      total:
        ops.value.tables.idle + ops.value.tables.dining + ops.value.tables.cleaning,
    };
  }
  const all = areas.value.flatMap((a) => a.tables);
  return {
    idle: all.filter((x) => x.status === 'idle').length,
    dining: all.filter((x) => x.status === 'dining').length,
    cleaning: all.filter((x) => x.status === 'cleaning').length,
    paidToday: 0,
    total: all.length,
  };
});

const occupancyRate = computed(() => {
  const total = tableStats.value.total;
  if (!total) return 0;
  return Math.round((tableStats.value.dining / total) * 100);
});

const channelItems = computed(() => [
  {
    key: 'dine_in',
    label: t('reports.channel.dine_in'),
    count: ops.value?.orderCounts.dine_in ?? 0,
    color: '#ff6a00',
  },
  {
    key: 'takeaway',
    label: t('reports.channel.takeaway'),
    count: ops.value?.orderCounts.takeaway ?? 0,
    color: '#00b578',
  },
  {
    key: 'delivery',
    label: t('reports.channel.delivery'),
    count: ops.value?.orderCounts.delivery ?? 0,
    color: '#409eff',
  },
  {
    key: 'reservation',
    label: t('dashboard.reservationToday'),
    count: ops.value?.orderCounts.reservation ?? 0,
    color: '#7b61ff',
  },
]);

const channelTotal = computed(() =>
  channelItems.value.reduce((s, i) => s + i.count, 0),
);

const channelChart = computed(() => {
  const data = channelItems.value
    .filter((i) => i.count > 0)
    .map((i) => ({ name: i.label, value: i.count, itemStyle: { color: i.color } }));
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    series: [
      {
        type: 'pie',
        radius: ['58%', '78%'],
        center: ['50%', '50%'],
        avoidLabelOverlap: true,
        label: { show: false },
        data:
          data.length > 0
            ? data
            : [{ name: '—', value: 1, itemStyle: { color: '#ebeef5' } }],
      },
    ],
  };
});

const tableChart = computed(() => ({
  grid: { left: 8, right: 8, top: 8, bottom: 8 },
  xAxis: { type: 'value', show: false, max: Math.max(tableStats.value.total, 1) },
  yAxis: { type: 'category', show: false, data: [''] },
  series: [
    {
      type: 'bar',
      stack: 't',
      barWidth: 18,
      data: [tableStats.value.dining],
      itemStyle: { color: '#ff6a00', borderRadius: [9, 0, 0, 9] },
    },
    {
      type: 'bar',
      stack: 't',
      data: [tableStats.value.cleaning],
      itemStyle: { color: '#909399' },
    },
    {
      type: 'bar',
      stack: 't',
      data: [tableStats.value.idle],
      itemStyle: { color: '#00b578', borderRadius: [0, 9, 9, 0] },
    },
  ],
}));

const alerts = computed(() => {
  const list: { key: string; label: string; count: number; path: string; tone: 'warn' | 'danger' }[] =
    [];
  const pendingDelivery = ops.value?.pendingDelivery ?? 0;
  const pendingReservation = ops.value?.pendingReservation ?? 0;
  const lowStock = ops.value?.lowStockDishes?.length ?? 0;
  if (pendingDelivery > 0) {
    list.push({
      key: 'delivery',
      label: t('dashboard.pendingDelivery'),
      count: pendingDelivery,
      path: '/delivery',
      tone: 'danger',
    });
  }
  if (pendingReservation > 0) {
    list.push({
      key: 'reservation',
      label: t('dashboard.pendingReservation'),
      count: pendingReservation,
      path: '/reservations',
      tone: 'warn',
    });
  }
  if (lowStock > 0) {
    list.push({
      key: 'stock',
      label: t('dashboard.lowStock'),
      count: lowStock,
      path: '/menu',
      tone: 'warn',
    });
  }
  if (tableStats.value.cleaning > 0) {
    list.push({
      key: 'cleaning',
      label: t('tables.statusCleaning'),
      count: tableStats.value.cleaning,
      path: '/tables',
      tone: 'warn',
    });
  }
  return list;
});

const shortcuts = computed(() =>
  [
    { path: '/tables', icon: Grid, label: t('dashboard.shortcut.tables'), color: '#00b578', perm: 'menu:table' },
    { path: '/orders', icon: List, label: t('dashboard.shortcut.orders'), color: '#7b61ff', perm: 'menu:order' },
    { path: '/menu', icon: Dish, label: t('dashboard.shortcut.menu'), color: '#00c2c7', perm: 'menu:dish' },
    { path: '/delivery', icon: Van, label: t('dashboard.shortcut.delivery'), color: '#ff6a00', perm: 'menu:delivery' },
    { path: '/inventory', icon: ShoppingCart, label: t('dashboard.shortcut.inventory'), color: '#f56c6c', perm: 'menu:inventory' },
    { path: '/reports', icon: DataAnalysis, label: t('dashboard.shortcut.reports'), color: '#409eff', perm: 'report:view' },
    { path: '/finance', icon: Wallet, label: t('dashboard.shortcut.finance'), color: '#9b59b6', perm: 'menu:finance' },
    { path: '/assets', icon: Box, label: t('dashboard.shortcut.assets'), color: '#e6a23c', perm: 'menu:asset' },
    { path: '/system/settings', icon: Setting, label: t('dashboard.shortcut.settings'), color: '#909399', perm: 'menu:system:settings' },
  ].filter((s) => userStore.hasPerm(s.perm) || userStore.isSuperAdmin),
);

const kpis = computed(() => [
  {
    key: 'revenue',
    label: t('dashboard.todayRevenue'),
    value: formatVND(overview.value?.revenue ?? 0),
    icon: DataAnalysis,
    tone: 'orange',
  },
  {
    key: 'orders',
    label: t('dashboard.todayOrders'),
    value: String(overview.value?.orderCount ?? 0),
    icon: List,
    tone: 'ink',
  },
  {
    key: 'guests',
    label: t('dashboard.todayGuests'),
    value: String(overview.value?.guestCount ?? 0),
    icon: User,
    tone: 'green',
  },
  {
    key: 'avg',
    label: t('dashboard.avgTicket'),
    value: formatVND(overview.value?.avgTicket ?? 0),
    icon: ShoppingCart,
    tone: 'amber',
  },
]);

async function load() {
  loading.value = true;
  try {
    const tasks: Promise<unknown>[] = [listFloorApi().then((r) => (areas.value = r))];
    if (canReport.value) {
      tasks.push(reportOverviewApi().then((r) => (overview.value = r)));
      tasks.push(reportOpsTodayApi().then((r) => (ops.value = r)));
    }
    await Promise.all(tasks);
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="dash" v-loading="loading">
    <header class="hero">
      <div class="hero-main">
        <p class="hero-date" v-if="todayLabel">{{ todayLabel }}</p>
        <h1 class="hero-title">
          {{ t('dashboard.welcome', { name: userStore.profile?.displayName || '' }) }}
        </h1>
        <p class="hero-sub">{{ t('dashboard.subtitle') }}</p>
      </div>
      <div class="hero-side">
        <el-button :icon="Refresh" @click="load">{{ t('dashboard.refresh') }}</el-button>
        <el-button type="primary" @click="router.push('/tables')">
          {{ t('dashboard.goTables') }}
        </el-button>
      </div>
    </header>

    <section v-if="alerts.length" class="alerts" aria-label="alerts">
      <div class="alerts-head">
        <el-icon class="alerts-ico"><WarningFilled /></el-icon>
        <span>{{ t('dashboard.needAction') }}</span>
      </div>
      <div class="alert-chips">
        <button
          v-for="a in alerts"
          :key="a.key"
          type="button"
          class="alert-chip"
          :class="a.tone"
          @click="router.push(a.path)"
        >
          <strong>{{ a.count }}</strong>
          <span>{{ a.label }}</span>
        </button>
      </div>
    </section>

    <section v-if="canReport" class="kpi-grid">
      <article v-for="k in kpis" :key="k.key" class="kpi" :class="`kpi-${k.tone}`">
        <div class="kpi-top">
          <span class="kpi-label">{{ k.label }}</span>
          <span class="kpi-ico"><el-icon :size="18"><component :is="k.icon" /></el-icon></span>
        </div>
        <div class="kpi-value">{{ k.value }}</div>
      </article>
    </section>

    <div class="main-grid">
      <section v-if="canReport" class="panel channel-panel">
        <div class="panel-head">
          <h2>{{ t('dashboard.todayByType') }}</h2>
          <span class="panel-meta">{{ t('dashboard.orderTotal', { n: channelTotal }) }}</span>
        </div>
        <div class="channel-body">
          <div class="channel-chart-wrap">
            <v-chart class="channel-chart" :option="channelChart" autoresize />
            <div class="channel-center">
              <em>{{ channelTotal }}</em>
              <span>{{ t('dashboard.todayOrders') }}</span>
            </div>
          </div>
          <ul class="channel-list">
            <li v-for="c in channelItems" :key="c.key">
              <span class="dot" :style="{ background: c.color }" />
              <span class="name">{{ c.label }}</span>
              <span class="count">{{ c.count }}</span>
              <span class="pct">
                {{ channelTotal ? Math.round((c.count / channelTotal) * 100) : 0 }}%
              </span>
            </li>
          </ul>
        </div>
      </section>

      <section class="panel table-panel">
        <div class="panel-head">
          <h2>{{ t('dashboard.tableStatus') }}</h2>
          <button type="button" class="link-btn" @click="router.push('/tables')">
            {{ t('dashboard.goTables') }}
          </button>
        </div>
        <div class="occ">
          <div class="occ-rate">
            <strong>{{ occupancyRate }}%</strong>
            <span>{{ t('dashboard.occupancy') }}</span>
          </div>
          <v-chart class="occ-bar" :option="tableChart" autoresize />
        </div>
        <div class="table-stats">
          <div class="ts">
            <span class="ts-label">{{ t('tables.statusIdle') }}</span>
            <span class="ts-value idle">{{ tableStats.idle }}</span>
          </div>
          <div class="ts">
            <span class="ts-label">{{ t('tables.statusDining') }}</span>
            <span class="ts-value dining">{{ tableStats.dining }}</span>
          </div>
          <div class="ts">
            <span class="ts-label">{{ t('tables.statusCleaning') }}</span>
            <span class="ts-value cleaning">{{ tableStats.cleaning }}</span>
          </div>
          <div class="ts">
            <span class="ts-label">{{ t('dashboard.paidToday') }}</span>
            <span class="ts-value">{{ tableStats.paidToday }}</span>
          </div>
          <div class="ts">
            <span class="ts-label">{{ t('dashboard.tableTotal') }}</span>
            <span class="ts-value">{{ tableStats.total }}</span>
          </div>
        </div>
      </section>
    </div>

    <section class="panel shortcut-panel">
      <div class="panel-head">
        <h2>{{ t('dashboard.quickOps') }}</h2>
      </div>
      <div class="shortcut-grid">
        <button
          v-for="s in shortcuts"
          :key="s.path"
          type="button"
          class="shortcut"
          @click="router.push(s.path)"
        >
          <span class="shortcut-icon" :style="{ background: `${s.color}1a`, color: s.color }">
            <el-icon :size="20"><component :is="s.icon" /></el-icon>
          </span>
          <span class="shortcut-label">{{ s.label }}</span>
        </button>
      </div>
    </section>

    <section v-if="canReport" class="panel stock-panel">
      <div class="panel-head">
        <h2>{{ t('dashboard.lowStock') }}</h2>
        <button type="button" class="link-btn" @click="router.push('/menu')">
          {{ t('dashboard.goMenu') }}
        </button>
      </div>
      <el-table
        :data="ops?.lowStockDishes || []"
        size="small"
        max-height="280"
        :empty-text="t('dashboard.lowStockEmpty')"
        class="stock-table"
      >
        <el-table-column :label="t('reports.dish')" min-width="160">
          <template #default="{ row }">
            {{ localeField(row as Record<string, unknown>, 'name', loc()) }}
          </template>
        </el-table-column>
        <el-table-column prop="stock" :label="t('dashboard.stock')" width="100" />
        <el-table-column prop="threshold" :label="t('dashboard.threshold')" width="100" />
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.dash {
  padding: 2px 2px 28px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-radius: 16px;
  background:
    linear-gradient(135deg, rgba(255, 195, 0, 0.18), rgba(255, 106, 0, 0.08) 42%, #fff 72%),
    #fff;
  border: 1px solid rgba(25, 25, 25, 0.06);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.8) inset;
}
.hero-date {
  margin: 0 0 4px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: #8c8c8c;
}
.hero-title {
  margin: 0;
  font-size: 22px;
  line-height: 1.25;
  font-weight: 800;
  color: var(--mt-black);
}
.hero-sub {
  margin: 6px 0 0;
  font-size: 13px;
  color: #737373;
  max-width: 42em;
}
.hero-side {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.alerts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 14px;
  padding: 12px 14px;
  border-radius: 14px;
  background: #fff8f0;
  border: 1px solid #ffe0c2;
}
.alerts-head {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 700;
  color: #ad6800;
}
.alerts-ico { color: #ff6a00; }
.alert-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.alert-chip {
  border: 0;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: #fff;
  font-size: 12px;
  color: #595959;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
}
.alert-chip strong {
  font-size: 14px;
  font-weight: 800;
  color: var(--mt-black);
}
.alert-chip.danger {
  background: #fff1f0;
  color: #a8071a;
}
.alert-chip.danger strong { color: #cf1322; }
.alert-chip.warn {
  background: #fff7e6;
  color: #ad6800;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.kpi {
  position: relative;
  overflow: hidden;
  border-radius: 14px;
  background: #fff;
  border: 1px solid rgba(25, 25, 25, 0.06);
  padding: 16px 16px 14px;
  min-height: 98px;
}
.kpi::before {
  content: '';
  position: absolute;
  left: 0;
  top: 14px;
  bottom: 14px;
  width: 3px;
  border-radius: 3px;
  background: #d9d9d9;
}
.kpi-orange::before { background: #ff6a00; }
.kpi-ink::before { background: #191919; }
.kpi-green::before { background: #00b578; }
.kpi-amber::before { background: #ffc300; }
.kpi-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  padding-left: 8px;
}
.kpi-label {
  font-size: 13px;
  color: #8c8c8c;
  font-weight: 600;
}
.kpi-ico {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #f5f5f5;
  color: #595959;
}
.kpi-orange .kpi-ico { background: #fff2e8; color: #ff6a00; }
.kpi-green .kpi-ico { background: #e8f8f1; color: #00b578; }
.kpi-amber .kpi-ico { background: #fff8e1; color: #c99700; }
.kpi-value {
  padding-left: 8px;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--mt-black);
  word-break: break-all;
  line-height: 1.2;
}

.main-grid {
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 12px;
}
.panel {
  background: #fff;
  border: 1px solid rgba(25, 25, 25, 0.06);
  border-radius: 16px;
  padding: 16px 18px 18px;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.panel-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 750;
  color: var(--mt-black);
}
.panel-meta {
  font-size: 12px;
  color: #8c8c8c;
  font-weight: 600;
}
.link-btn {
  border: 0;
  background: transparent;
  color: #ff6a00;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}
.link-btn:hover { opacity: 0.85; }

.channel-body {
  display: grid;
  grid-template-columns: 150px 1fr;
  gap: 8px 18px;
  align-items: center;
}
.channel-chart-wrap {
  position: relative;
  width: 150px;
  height: 150px;
}
.channel-chart { width: 150px; height: 150px; }
.channel-center {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.channel-center em {
  font-style: normal;
  font-size: 22px;
  font-weight: 800;
  color: var(--mt-black);
  line-height: 1;
}
.channel-center span {
  margin-top: 4px;
  font-size: 11px;
  color: #8c8c8c;
}
.channel-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.channel-list li {
  display: grid;
  grid-template-columns: 10px 1fr auto 42px;
  gap: 8px;
  align-items: center;
  font-size: 13px;
}
.channel-list .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.channel-list .name { color: #595959; }
.channel-list .count {
  font-weight: 800;
  color: var(--mt-black);
  font-variant-numeric: tabular-nums;
}
.channel-list .pct {
  text-align: right;
  color: #8c8c8c;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.occ {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: #fafafa;
}
.occ-rate {
  min-width: 72px;
  display: flex;
  flex-direction: column;
}
.occ-rate strong {
  font-size: 26px;
  font-weight: 800;
  color: #ff6a00;
  line-height: 1;
}
.occ-rate span {
  margin-top: 4px;
  font-size: 12px;
  color: #8c8c8c;
}
.occ-bar {
  flex: 1;
  height: 36px;
}
.table-stats {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}
.ts {
  text-align: center;
  padding: 10px 6px;
  border-radius: 12px;
  background: #fafafa;
}
.ts-label {
  display: block;
  color: #8c8c8c;
  font-size: 12px;
  margin-bottom: 6px;
}
.ts-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--mt-black);
  font-variant-numeric: tabular-nums;
}
.ts-value.idle { color: #00b578; }
.ts-value.dining { color: #ff6a00; }
.ts-value.cleaning { color: #595959; }

.shortcut-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(118px, 1fr));
  gap: 10px;
}
.shortcut {
  border: 1px solid rgba(25, 25, 25, 0.06);
  background: #fafafa;
  border-radius: 14px;
  padding: 14px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
}
.shortcut:hover {
  background: #fff;
  border-color: rgba(255, 106, 0, 0.28);
  transform: translateY(-1px);
}
.shortcut-icon {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.shortcut-label {
  font-size: 12px;
  font-weight: 700;
  color: #333;
  text-align: center;
  line-height: 1.3;
}

.stock-table {
  --el-table-header-bg-color: #fafafa;
}
.stock-panel :deep(.el-table) {
  --el-table-border-color: transparent;
}

@media (max-width: 1100px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .main-grid { grid-template-columns: 1fr; }
}
@media (max-width: 720px) {
  .hero {
    flex-direction: column;
    align-items: stretch;
  }
  .hero-side { justify-content: flex-start; }
  .channel-body { grid-template-columns: 1fr; justify-items: center; }
  .table-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .kpi-value { font-size: 18px; }
}
</style>

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
  Setting,
  ShoppingCart,
  User,
  Van,
  Wallet,
} from '@element-plus/icons-vue';
import { formatVND, localeField } from '@restaurant/shared';
import {
  reportOpsTodayApi,
  reportOverviewApi,
  type OpsToday,
  type ReportOverview,
} from '../api/report';
import { listFloorApi, type AreaFloor } from '../api/table';
import { useUserStore } from '../stores/user';

const { t, locale } = useI18n();
const router = useRouter();
const userStore = useUserStore();
const loading = ref(false);
const overview = ref<ReportOverview | null>(null);
const ops = ref<OpsToday | null>(null);
const areas = ref<AreaFloor[]>([]);

const loc = () => (locale.value === 'vi-VN' ? 'vi' : 'zh');

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

async function load() {
  loading.value = true;
  try {
    const tasks: Promise<unknown>[] = [listFloorApi().then((r) => (areas.value = r))];
    if (userStore.hasPerm('report:view') || userStore.isSuperAdmin) {
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
    <div class="welcome">
      {{ t('dashboard.welcome', { name: userStore.profile?.displayName || '' }) }}
    </div>

    <el-row :gutter="12" class="metric-row">
      <el-col :xs="12" :sm="6">
        <div class="metric m-orange">
          <div>
            <div class="metric-label">{{ t('dashboard.todayRevenue') }}</div>
            <div class="metric-value">{{ formatVND(overview?.revenue ?? 0) }}</div>
          </div>
          <el-icon class="metric-icon"><DataAnalysis /></el-icon>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="metric m-green">
          <div>
            <div class="metric-label">{{ t('dashboard.todayOrders') }}</div>
            <div class="metric-value">{{ overview?.orderCount ?? 0 }}</div>
          </div>
          <el-icon class="metric-icon"><List /></el-icon>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="metric m-yellow">
          <div>
            <div class="metric-label">{{ t('dashboard.todayGuests') }}</div>
            <div class="metric-value">{{ overview?.guestCount ?? 0 }}</div>
          </div>
          <el-icon class="metric-icon"><User /></el-icon>
        </div>
      </el-col>
      <el-col :xs="12" :sm="6">
        <div class="metric m-red">
          <div>
            <div class="metric-label">{{ t('dashboard.avgTicket') }}</div>
            <div class="metric-value">{{ formatVND(overview?.avgTicket ?? 0) }}</div>
          </div>
          <el-icon class="metric-icon"><ShoppingCart /></el-icon>
        </div>
      </el-col>
    </el-row>

    <div class="section-title">{{ t('dashboard.todayByType') }}</div>
    <el-row :gutter="12" class="metric-row">
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="mini-card">
          <div class="mini-label">{{ t('reports.channel.dine_in') }}</div>
          <div class="mini-value">{{ ops?.orderCounts.dine_in ?? 0 }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="mini-card">
          <div class="mini-label">{{ t('reports.channel.takeaway') }}</div>
          <div class="mini-value">{{ ops?.orderCounts.takeaway ?? 0 }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="mini-card">
          <div class="mini-label">{{ t('reports.channel.delivery') }}</div>
          <div class="mini-value">{{ ops?.orderCounts.delivery ?? 0 }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="mini-card">
          <div class="mini-label">{{ t('dashboard.reservationToday') }}</div>
          <div class="mini-value">{{ ops?.orderCounts.reservation ?? 0 }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="12" class="metric-row">
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="mini-card warn">
          <div class="mini-label">{{ t('dashboard.pendingDelivery') }}</div>
          <div class="mini-value">{{ ops?.pendingDelivery ?? 0 }}</div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="6">
        <el-card shadow="never" class="mini-card warn">
          <div class="mini-label">{{ t('dashboard.pendingReservation') }}</div>
          <div class="mini-value">{{ ops?.pendingReservation ?? 0 }}</div>
        </el-card>
      </el-col>
    </el-row>

    <div class="section-title">{{ t('dashboard.quickOps') }}</div>
    <el-row :gutter="12" class="shortcut-row">
      <el-col v-for="s in shortcuts" :key="s.path" :xs="12" :sm="6" :md="3">
        <button type="button" class="shortcut" @click="router.push(s.path)">
          <span class="shortcut-icon" :style="{ background: s.color }">
            <el-icon :size="22" color="#fff"><component :is="s.icon" /></el-icon>
          </span>
          <span class="shortcut-label">{{ s.label }}</span>
        </button>
      </el-col>
    </el-row>

    <div class="section-title">{{ t('dashboard.tableStatus') }}</div>
    <el-card shadow="never" class="table-card">
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
      <el-button type="primary" @click="router.push('/tables')">{{ t('dashboard.goTables') }}</el-button>
    </el-card>

    <div class="section-title">{{ t('dashboard.lowStock') }}</div>
    <el-card shadow="never" class="table-card">
      <el-table :data="ops?.lowStockDishes || []" size="small" max-height="260" empty-text="—">
        <el-table-column :label="t('reports.dish')" min-width="140">
          <template #default="{ row }">
            {{ localeField(row as Record<string, unknown>, 'name', loc()) }}
          </template>
        </el-table-column>
        <el-table-column prop="stock" :label="t('dashboard.stock')" width="90" />
        <el-table-column prop="threshold" :label="t('dashboard.threshold')" width="90" />
      </el-table>
    </el-card>

    <div class="banner">🎉 {{ t('dashboard.banner') }}</div>
  </div>
</template>

<style scoped>
.dash { padding: 4px 2px 24px; }
.welcome { font-size: 18px; font-weight: 700; margin-bottom: 14px; color: var(--mt-black); }
.metric-row { margin-bottom: 8px; }
.metric {
  border-radius: 12px;
  padding: 16px;
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-height: 92px;
  margin-bottom: 12px;
}
.m-orange { background: linear-gradient(135deg, #ff8a5c, #ff6a00); }
.m-green { background: linear-gradient(135deg, #67c23a, #00b578); }
.m-yellow { background: linear-gradient(135deg, #ffd54f, #ffc300); color: #191919; }
.m-red { background: linear-gradient(135deg, #f78989, #f56c6c); }
.metric-label { font-size: 13px; opacity: 0.92; margin-bottom: 8px; }
.metric-value { font-size: 22px; font-weight: 800; word-break: break-all; }
.metric-icon { font-size: 36px; opacity: 0.35; }
.mini-card { border-radius: 12px; margin-bottom: 12px; text-align: center; }
.mini-card.warn { border-color: #f5c6a0; }
.mini-label { color: #909399; font-size: 13px; margin-bottom: 6px; }
.mini-value { font-size: 24px; font-weight: 800; }
.section-title { margin: 16px 0 10px; font-size: 16px; font-weight: 700; }
.shortcut {
  width: 100%;
  border: 1px solid var(--mt-border);
  background: #fff;
  border-radius: 12px;
  padding: 16px 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  margin-bottom: 12px;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}
.shortcut:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.06);
}
.shortcut-icon {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.shortcut-label { font-size: 13px; font-weight: 600; color: #333; }
.table-card { border-radius: 12px; margin-bottom: 8px; }
.table-stats {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 12px;
  margin-bottom: 16px;
}
.ts { text-align: center; }
.ts-label { display: block; color: #909399; font-size: 13px; margin-bottom: 6px; }
.ts-value { font-size: 28px; font-weight: 800; }
.ts-value.idle { color: var(--mt-green); }
.ts-value.dining { color: var(--mt-orange); }
.ts-value.cleaning { color: #606266; }
.banner {
  margin-top: 16px;
  background: #fff;
  border: 1px solid var(--mt-border);
  border-radius: 12px;
  padding: 14px 16px;
  color: #666;
  font-size: 13px;
}
@media (max-width: 640px) {
  .table-stats { grid-template-columns: repeat(2, 1fr); }
}
</style>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatVND } from '@restaurant/shared';
import { listMyOrders, type DeliveryOrder } from '../../api/delivery';

const { t, locale } = useI18n();
const router = useRouter();

type OrderChannel = 'all' | 'delivery' | 'dine_in' | 'group_meal' | 'takeaway';

const orders = ref<DeliveryOrder[]>([]);
const loading = ref(true);
const activeTab = ref<OrderChannel>('all');

function resolveChannel(o: DeliveryOrder): Exclude<OrderChannel, 'all'> {
  if (o.channel === 'group_meal' || o.channel === 'dine_in' || o.channel === 'takeaway' || o.channel === 'delivery') {
    return o.channel;
  }
  const snap = (o.addressSnapshot || {}) as Record<string, unknown>;
  if (snap.groupMeal === true) return 'group_meal';
  if (o.type === 'dine_in' || o.type === 'takeaway' || o.type === 'delivery') return o.type;
  return 'delivery';
}

const filtered = computed(() => {
  if (activeTab.value === 'all') return orders.value;
  return orders.value.filter((o) => resolveChannel(o) === activeTab.value);
});

const tabCounts = computed(() => {
  const c = { all: orders.value.length, delivery: 0, dine_in: 0, group_meal: 0, takeaway: 0 };
  for (const o of orders.value) {
    const ch = resolveChannel(o);
    c[ch] += 1;
  }
  return c;
});

async function load() {
  loading.value = true;
  try {
    const res = await listMyOrders();
    orders.value = res.items;
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function statusColor(status: string): string {
  const map: Record<string, string> = {
    pending: '#ff976a',
    accepted: '#1989fa',
    cooking: '#ff976a',
    delivering: '#07c160',
    completed: '#969799',
    cancelled: '#969799',
    rejected: '#ee0a24',
    open: '#1989fa',
    paid: '#07c160',
  };
  return map[status] || '#969799';
}

function channelTagType(ch: string) {
  if (ch === 'delivery') return 'primary';
  if (ch === 'dine_in') return 'success';
  if (ch === 'group_meal') return 'warning';
  return 'default';
}

function formatOrderTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const loc = String(locale.value).startsWith('vi') ? 'vi-VN' : 'zh-CN';
  return new Intl.DateTimeFormat(loc, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d);
}
</script>

<template>
  <div class="page">
    <van-nav-bar
      :title="t('shop.order.list')"
      left-arrow
      fixed
      placeholder
      @click-left="router.back()"
    />

    <van-tabs v-model:active="activeTab" shrink sticky offset-top="46">
      <van-tab name="all" :title="`${t('shop.order.channel.all')} (${tabCounts.all})`" />
      <van-tab name="delivery" :title="`${t('shop.order.channel.delivery')} (${tabCounts.delivery})`" />
      <van-tab name="dine_in" :title="`${t('shop.order.channel.dine_in')} (${tabCounts.dine_in})`" />
      <van-tab name="group_meal" :title="`${t('shop.order.channel.group_meal')} (${tabCounts.group_meal})`" />
      <van-tab
        v-if="tabCounts.takeaway > 0"
        name="takeaway"
        :title="`${t('shop.order.channel.takeaway')} (${tabCounts.takeaway})`"
      />
    </van-tabs>

    <van-pull-refresh v-model="loading" @refresh="load">
      <van-empty v-if="!loading && !filtered.length" :description="t('shop.order.empty')" />
      <van-cell
        v-for="o in filtered"
        :key="o.id"
        is-link
        :label="formatOrderTime(o.createdAt)"
        @click="router.push({ name: 'shop-order-detail', params: { id: o.id } })"
      >
        <template #title>
          <div class="cell-title">
            <van-tag plain :type="channelTagType(resolveChannel(o))" size="medium">
              {{ t(`shop.order.channel.${resolveChannel(o)}`) }}
            </van-tag>
            <span class="order-no">{{ o.orderNo }}</span>
          </div>
        </template>
        <template #value>
          <div class="cell-value">
            <div :style="{ color: statusColor(o.status) }">
              {{ t(`shop.order.status.${o.status}`, o.status) }}
            </div>
            <div class="amount">{{ formatVND(o.total) }}</div>
          </div>
        </template>
      </van-cell>
    </van-pull-refresh>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: #f7f8fa;
}
.cell-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.order-no {
  font-size: 14px;
  color: #323233;
  font-weight: 500;
}
.cell-value {
  text-align: right;
}
.amount {
  margin-top: 2px;
  font-weight: 600;
}
</style>

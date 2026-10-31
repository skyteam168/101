<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatVND } from '@restaurant/shared';
import { listMyOrders, type DeliveryOrder } from '../../api/delivery';

const { t, locale } = useI18n();
const router = useRouter();

const orders = ref<DeliveryOrder[]>([]);
const loading = ref(true);

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
  };
  return map[status] || '#969799';
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
    <van-nav-bar :title="t('shop.order.list')" left-arrow @click-left="router.back()" />
    <van-pull-refresh v-model="loading" @refresh="load">
      <van-empty v-if="!loading && !orders.length" :description="t('shop.order.empty')" />
      <van-cell
        v-for="o in orders"
        :key="o.id"
        is-link
        :title="o.orderNo"
        :label="formatOrderTime(o.createdAt)"
        @click="router.push({ name: 'shop-order-detail', params: { id: o.id } })"
      >
        <template #value>
          <div>
            <div :style="{ color: statusColor(o.status) }">{{ t(`shop.order.status.${o.status}`, o.status) }}</div>
            <div>{{ formatVND(o.total) }}</div>
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
</style>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { io, type Socket } from 'socket.io-client';
import { Events, formatVND, isSafeMediaUrl } from '@restaurant/shared';
import { cancelOrder, getOrderDetail, type DeliveryOrder } from '../../api/delivery';
import { getCustomerToken } from '../../utils/customer-storage';

const { t } = useI18n();
const router = useRouter();
const route = useRoute();

const orderId = computed(() => String(route.params.id));
const order = ref<DeliveryOrder | null>(null);
const loading = ref(true);
const cancelling = ref(false);
let socket: Socket | null = null;

const addr = computed(() => (order.value?.addressSnapshot || {}) as Record<string, string>);

async function loadOrder() {
  loading.value = true;
  try {
    order.value = await getOrderDetail(orderId.value);
  } finally {
    loading.value = false;
  }
}

function connectSocket() {
  const token = getCustomerToken();
  if (!token) return;
  socket = io('/', {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
  });
  const refresh = (payload: { order?: { id?: string } }) => {
    if (!payload?.order?.id || String(payload.order.id) === orderId.value) {
      void loadOrder();
    }
  };
  socket.on(Events.ORDER_STATUS_CHANGED, refresh);
  socket.on(Events.DELIVERY_STATUS_CHANGED, refresh);
}

onMounted(async () => {
  await loadOrder();
  connectSocket();
});
onUnmounted(() => {
  socket?.disconnect();
  socket = null;
});

function statusColor(status: string): string {
  const map: Record<string, string> = {
    pending: '#ff976a',
    accepted: '#1989fa',
    cooking: '#ff976a',
    delivering: '#07c160',
    completed: '#07c160',
    cancelled: '#969799',
    rejected: '#ee0a24',
  };
  return map[status] ?? '#323233';
}

const canCancel = computed(() => order.value?.status === 'pending');

async function handleCancel() {
  await showConfirmDialog({
    title: t('shop.order.cancelTitle'),
    message: t('shop.order.cancelConfirm'),
  });
  cancelling.value = true;
  try {
    await cancelOrder(orderId.value, t('shop.order.customerCancel'));
    showToast(t('shop.order.cancelled'));
    await loadOrder();
  } finally {
    cancelling.value = false;
  }
}

function payMethodLabel(method?: string | null): string {
  return method === 'bank_transfer' ? t('shop.checkout.bankTransfer') : t('shop.checkout.cash');
}
</script>

<template>
  <div class="order-detail-page">
    <van-nav-bar :title="t('shop.order.detail')" left-arrow @click-left="router.back()" />
    <div v-if="loading" style="padding: 24px"><van-skeleton title :row="8" /></div>
    <template v-else-if="order">
      <div class="status-head" :style="{ background: statusColor(order.status) }">
        <div class="status-text">{{ t(`shop.order.status.${order.status}`, order.status) }}</div>
        <div class="order-no-text"># {{ order.orderNo }}</div>
      </div>
      <van-cell-group inset style="margin-top: 12px">
        <van-cell
          icon="location-o"
          :title="`${addr.contactName || ''}  ${addr.phone || ''}`"
          :label="`${addr.addressText || ''}${addr.detail ? ' ' + addr.detail : ''}`"
        />
        <div v-if="addr.landmarkPhoto && isSafeMediaUrl(addr.landmarkPhoto)" class="landmark-box">
          <div class="landmark-label">{{ t('shop.address.landmarkTitle') }}</div>
          <a :href="addr.landmarkPhoto" target="_blank" rel="noopener noreferrer">
            <img :src="addr.landmarkPhoto" class="landmark-img" alt="" />
          </a>
        </div>
      </van-cell-group>
      <van-cell-group :title="t('shop.order.timeline')" inset style="margin-top: 12px">
        <div class="timeline">
          <div v-for="(entry, idx) in order.statusTimeline" :key="idx" class="timeline-item">
            <div class="timeline-dot" />
            <div class="timeline-content">
              <div class="timeline-status">{{ t(`shop.order.status.${entry.status}`, entry.status) }}</div>
              <div class="timeline-time">{{ new Date(entry.at).toLocaleString() }}</div>
              <div v-if="entry.reason" class="timeline-note">{{ entry.reason }}</div>
            </div>
          </div>
        </div>
      </van-cell-group>
      <van-cell-group :title="t('shop.checkout.items')" inset style="margin-top: 12px">
        <van-cell
          v-for="item in order.items"
          :key="item.id"
          :title="item.nameZh"
          :value="`${formatVND(item.unitPrice)} × ${item.qty}`"
        />
      </van-cell-group>
      <van-cell-group inset style="margin-top: 12px">
        <van-cell :title="t('shop.checkout.subtotal')" :value="formatVND(order.subtotal)" />
        <van-cell :title="t('shop.checkout.deliveryFee')" :value="formatVND(order.deliveryFee)" />
        <van-cell :title="t('shop.checkout.total')" :value="formatVND(order.total)" />
        <van-cell :title="t('shop.order.payMethod')" :value="payMethodLabel(order.payMethod)" />
        <van-cell v-if="order.remark" :title="t('shop.checkout.remark')" :value="order.remark" />
      </van-cell-group>
      <div v-if="canCancel" style="padding: 16px">
        <van-button block plain type="danger" round :loading="cancelling" @click="handleCancel">
          {{ t('shop.order.cancel') }}
        </van-button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.order-detail-page {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 24px;
}
.status-head {
  color: #fff;
  padding: 24px 16px;
  text-align: center;
}
.status-text {
  font-size: 20px;
  font-weight: 600;
  margin-top: 8px;
}
.order-no-text {
  opacity: 0.85;
  margin-top: 4px;
}
.timeline {
  padding: 12px 16px;
}
.timeline-item {
  display: flex;
  gap: 12px;
  padding-bottom: 12px;
}
.timeline-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #1989fa;
  margin-top: 6px;
}
.timeline-status {
  font-weight: 600;
}
.timeline-time,
.timeline-note {
  font-size: 12px;
  color: #969799;
}
.landmark-box {
  padding: 0 16px 12px;
}
.landmark-label {
  font-size: 12px;
  color: #969799;
  margin-bottom: 6px;
}
.landmark-img {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: 8px;
  border: 1px solid #eee;
  display: block;
}
</style>

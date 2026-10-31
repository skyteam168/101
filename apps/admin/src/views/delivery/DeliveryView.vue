<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Events, formatVND, isSafeMediaUrl, localeField } from '@restaurant/shared';
import { io, type Socket } from 'socket.io-client';
import { listUsersApi, type UserRow } from '../../api/user';
import {
  acceptDeliveryApi,
  assignCourierApi,
  cancelDeliveryApi,
  completeDeliveryApi,
  cookingDeliveryApi,
  deliveringDeliveryApi,
  listDeliveryBoardApi,
  listDeliveryCustomersApi,
  rejectDeliveryApi,
  type DeliveryCustomer,
  type DeliveryOrder,
} from '../../api/delivery';
import { getAccessToken } from '../../utils/auth-storage';
import { useUserStore } from '../../stores/user';

const { t, locale } = useI18n();
const userStore = useUserStore();
const tab = ref('board');
const loading = ref(false);
const orders = ref<DeliveryOrder[]>([]);
const customers = ref<DeliveryCustomer[]>([]);
const staff = ref<UserRow[]>([]);
let socket: Socket | null = null;

const columns = [
  { status: 'pending', key: 'pending' },
  { status: 'accepted', key: 'accepted' },
  { status: 'cooking', key: 'cooking' },
  { status: 'delivering', key: 'delivering' },
  { status: 'completed', key: 'completed' },
] as const;

const byStatus = computed(() => {
  const map: Record<string, DeliveryOrder[]> = {};
  for (const c of columns) map[c.status] = [];
  map.rejected = [];
  map.cancelled = [];
  for (const o of orders.value) {
    if (!map[o.status]) map[o.status] = [];
    map[o.status].push(o);
  }
  return map;
});

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', locale.value === 'vi-VN' ? 'vi' : 'zh');
}

async function load() {
  loading.value = true;
  try {
    orders.value = await listDeliveryBoardApi();
    if (tab.value === 'customers') customers.value = await listDeliveryCustomersApi();
  } finally {
    loading.value = false;
  }
}

async function loadCustomers() {
  customers.value = await listDeliveryCustomersApi();
}

async function loadStaff() {
  try {
    const res = await listUsersApi();
    staff.value = Array.isArray(res) ? res : (res as { list?: UserRow[] }).list || [];
  } catch {
    staff.value = [];
  }
}

function onTab(name: string | number) {
  if (name === 'customers') void loadCustomers();
}

async function act(order: DeliveryOrder, action: string) {
  try {
    if (action === 'accept') await acceptDeliveryApi(order.id);
    else if (action === 'reject') {
      const { value } = await ElMessageBox.prompt(t('delivery.rejectReason'), t('delivery.reject'));
      await rejectDeliveryApi(order.id, value);
    } else if (action === 'cooking') await cookingDeliveryApi(order.id);
    else if (action === 'delivering') await deliveringDeliveryApi(order.id);
    else if (action === 'complete') await completeDeliveryApi(order.id);
    else if (action === 'cancel') {
      const { value } = await ElMessageBox.prompt(t('delivery.cancelReason'), t('common.cancel'));
      await cancelDeliveryApi(order.id, value);
    } else if (action === 'assign') {
      if (!staff.value.length) await loadStaff();
      const options = staff.value.map((u) => `${u.id}:${u.displayName}`).join('\n');
      const { value } = await ElMessageBox.prompt(
        `${t('delivery.assignHint')}\n${options}`,
        t('delivery.assign'),
      );
      const courierId = value.includes(':') ? value.split(':')[0] : value;
      await assignCourierApi(order.id, courierId.trim());
    }
    ElMessage.success(t('common.saved'));
    await load();
  } catch {
    // cancelled dialog
  }
}

function connectSocket() {
  socket?.disconnect();
  const storeId = userStore.profile?.storeId;
  if (!storeId) return;
  socket = io('/', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token: getAccessToken() },
  });
  socket.on('connect', () => socket?.emit('join', { room: `store:${storeId}:front` }));
  const refresh = () => load();
  socket.on(Events.DELIVERY_NEW, refresh);
  socket.on(Events.DELIVERY_STATUS_CHANGED, refresh);
  socket.on(Events.ORDER_STATUS_CHANGED, refresh);
}

onMounted(() => {
  load();
  loadStaff();
  connectSocket();
});
onUnmounted(() => {
  socket?.disconnect();
  socket = null;
});
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="toolbar">
      <h3>{{ t('delivery.title') }}</h3>
      <el-button @click="load">{{ t('common.search') }}</el-button>
    </div>
    <el-tabs v-model="tab" @tab-change="onTab">
      <el-tab-pane :label="t('delivery.board')" name="board">
        <div class="board">
          <div v-for="col in columns" :key="col.status" class="col">
            <div class="col-title">
              {{ t(`delivery.status.${col.key}`) }}
              <el-tag size="small" type="info">{{ byStatus[col.status]?.length || 0 }}</el-tag>
            </div>
            <div v-for="o in byStatus[col.status]" :key="o.id" class="card">
              <div class="card-hd">
                <strong>{{ o.orderNo }}</strong>
                <el-tag v-if="o.memberPriority" size="small" type="warning">{{ t('member.priority') }}</el-tag>
                <span>{{ formatVND(o.total) }}</span>
              </div>
              <div class="muted">{{ o.customer?.name || o.customer?.email }} · {{ o.customer?.phone }}</div>
              <div class="muted">
                {{ o.addressSnapshot?.addressText }}
                <span v-if="o.addressSnapshot?.distanceKm"> ({{ o.addressSnapshot.distanceKm }}km)</span>
              </div>
              <a
                v-if="
                  o.addressSnapshot?.landmarkPhoto &&
                  isSafeMediaUrl(String(o.addressSnapshot.landmarkPhoto))
                "
                :href="String(o.addressSnapshot.landmarkPhoto)"
                target="_blank"
                rel="noopener noreferrer"
                class="landmark-link"
              >
                <img :src="String(o.addressSnapshot.landmarkPhoto)" class="landmark-thumb" alt="" />
                <span>{{ t('delivery.landmarkPhoto') }}</span>
              </a>
              <ul class="items">
                <li v-for="it in o.items" :key="it.id">{{ nameOf(it) }} ×{{ it.qty }}</li>
              </ul>
              <div class="muted" v-if="o.courierName">{{ t('delivery.courier') }}: {{ o.courierName }}</div>
              <div class="actions" v-perm="'delivery:accept'">
                <el-button v-if="o.status === 'pending'" size="small" type="primary" @click="act(o, 'accept')">
                  {{ t('delivery.accept') }}
                </el-button>
                <el-button v-if="o.status === 'pending'" size="small" type="danger" @click="act(o, 'reject')">
                  {{ t('delivery.reject') }}
                </el-button>
                <el-button v-if="o.status === 'accepted'" size="small" @click="act(o, 'cooking')">
                  {{ t('delivery.cooking') }}
                </el-button>
                <el-button v-if="o.status === 'cooking'" size="small" @click="act(o, 'delivering')">
                  {{ t('delivery.delivering') }}
                </el-button>
                <el-button v-if="o.status === 'delivering'" size="small" type="success" @click="act(o, 'complete')">
                  {{ t('delivery.complete') }}
                </el-button>
                <el-button
                  v-if="['accepted', 'cooking', 'delivering'].includes(o.status)"
                  size="small"
                  @click="act(o, 'assign')"
                >
                  {{ t('delivery.assign') }}
                </el-button>
                <el-button
                  v-if="['accepted', 'cooking', 'delivering'].includes(o.status)"
                  size="small"
                  type="danger"
                  plain
                  @click="act(o, 'cancel')"
                >
                  {{ t('common.cancel') }}
                </el-button>
              </div>
            </div>
          </div>
        </div>
      </el-tab-pane>
      <el-tab-pane :label="t('delivery.customers')" name="customers">
        <el-table :data="customers" size="small" stripe>
          <el-table-column prop="email" label="Email" />
          <el-table-column prop="name" :label="t('users.displayName')" />
          <el-table-column prop="phone" :label="t('users.phone')" />
          <el-table-column prop="orderCount" :label="t('delivery.orderCount')" width="100" />
          <el-table-column prop="createdAt" :label="t('print.createdAt')" width="180" />
        </el-table>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.page {
  padding: 12px 16px 32px;
}
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
h3 {
  margin: 0;
}
.board {
  display: grid;
  grid-template-columns: repeat(5, minmax(200px, 1fr));
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
}
.col {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 8px;
  min-height: 320px;
}
.col-title {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 8px;
}
.card {
  background: #fff;
  border-radius: 8px;
  padding: 10px;
  margin-bottom: 8px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.card-hd {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
}
.muted {
  color: #909399;
  font-size: 12px;
  margin: 2px 0;
}
.landmark-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 2px;
  font-size: 12px;
  color: #e6a23c;
  text-decoration: none;
}
.landmark-thumb {
  width: 40px;
  height: 40px;
  object-fit: cover;
  border-radius: 4px;
  border: 1px solid #eee;
}
.items {
  margin: 6px 0;
  padding-left: 16px;
  font-size: 13px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
</style>

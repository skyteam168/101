<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
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
  deleteDeliveryApi,
  deliveringDeliveryApi,
  listDeliveryBoardApi,
  listDeliveryCustomersApi,
  rejectDeliveryApi,
  type DeliveryCustomer,
  type DeliveryOrder,
} from '../../api/delivery';
import { getAccessToken } from '../../utils/auth-storage';
import { useUserStore } from '../../stores/user';
import { formatDateTimeLocal } from '../../utils/datetime';

const { t, locale } = useI18n();
const router = useRouter();
const userStore = useUserStore();
const tab = ref('board');
const loading = ref(false);
const orders = ref<DeliveryOrder[]>([]);
const customers = ref<DeliveryCustomer[]>([]);
const staff = ref<UserRow[]>([]);
/** 展开菜品明细的订单 id */
const expanded = reactive<Record<string, boolean>>({});
const filters = reactive({
  keyword: '',
  status: '',
  paymentStatus: '',
  range: null as [Date, Date] | null,
});
let socket: Socket | null = null;

const columns = [
  { status: 'pending', key: 'pending' },
  { status: 'accepted', key: 'accepted' },
  { status: 'cooking', key: 'cooking' },
  { status: 'delivering', key: 'delivering' },
  { status: 'completed', key: 'completed' },
  { status: 'cancelled', key: 'cancelled' },
  { status: 'rejected', key: 'rejected' },
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

function shortNo(orderNo: string) {
  if (!orderNo) return '';
  return orderNo.length > 10 ? `…${orderNo.slice(-8)}` : orderNo;
}

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString(locale.value === 'vi-VN' ? 'vi-VN' : 'zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function itemQtyTotal(o: DeliveryOrder) {
  return (o.items || []).reduce((s, it) => s + (it.qty || 0), 0);
}

function snapshotLines(snapshot: unknown): string[] {
  if (!Array.isArray(snapshot) || !snapshot.length) return [];
  const vi = locale.value === 'vi-VN';
  const lines: string[] = [];
  for (const row of snapshot) {
    if (!row || typeof row !== 'object') continue;
    const r = row as {
      dishNameZh?: string;
      dishNameVi?: string;
      optionNameZh?: string;
      optionNameVi?: string;
      groupNameZh?: string;
      groupNameVi?: string;
    };
    const dish = vi
      ? r.dishNameVi || r.dishNameZh || r.optionNameVi || r.optionNameZh
      : r.dishNameZh || r.dishNameVi || r.optionNameZh || r.optionNameVi;
    if (!dish) continue;
    const group = vi ? r.groupNameVi || r.groupNameZh : r.groupNameZh || r.groupNameVi;
    lines.push(group ? `${group}: ${dish}` : dish);
  }
  return lines;
}

function visibleItems(o: DeliveryOrder) {
  const items = o.items || [];
  if (expanded[o.id] || items.length <= 3) return items;
  return items.slice(0, 3);
}

function toggleItems(id: string) {
  expanded[id] = !expanded[id];
}

async function load() {
  loading.value = true;
  try {
    const params: {
      status?: string;
      keyword?: string;
      from?: string;
      to?: string;
      paymentStatus?: string;
    } = {};
    if (filters.status) params.status = filters.status;
    if (filters.keyword.trim()) params.keyword = filters.keyword.trim();
    if (filters.paymentStatus) params.paymentStatus = filters.paymentStatus;
    if (filters.range?.[0]) params.from = filters.range[0].toISOString();
    if (filters.range?.[1]) params.to = filters.range[1].toISOString();
    orders.value = await listDeliveryBoardApi(params);
    if (tab.value === 'customers') customers.value = await listDeliveryCustomersApi();
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.keyword = '';
  filters.status = '';
  filters.paymentStatus = '';
  filters.range = null;
  void load();
}

async function loadCustomers() {
  customers.value = await listDeliveryCustomersApi();
}

async function loadStaff() {
  try {
    const res = await listUsersApi({ skipErrorToast: true, skipLoading: true });
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
    } else if (action === 'delete') {
      await ElMessageBox.confirm(
        t('delivery.deleteConfirm', { no: shortNo(order.orderNo) }),
        t('common.confirm'),
        {
          type: 'warning',
          confirmButtonText: t('common.confirm'),
          cancelButtonText: t('common.cancel'),
        },
      );
      await deleteDeliveryApi(order.id);
      ElMessage.success(t('common.deleted'));
      await load();
      return;
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
  // 不在挂载时拉员工列表：listUsers 需 menu:system:user，店长仅有外卖菜单时会误弹「没有权限」
  load();
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
      <span class="filter-meta">{{ t('delivery.filterResult', { n: orders.length }) }}</span>
    </div>
    <el-form :inline="true" class="filters" @submit.prevent="load">
      <el-form-item :label="t('delivery.keyword')">
        <el-input
          v-model="filters.keyword"
          clearable
          :placeholder="t('delivery.keywordPh')"
          style="width: 220px"
          @keyup.enter="load"
        />
      </el-form-item>
      <el-form-item :label="t('common.status')">
        <el-select v-model="filters.status" clearable :placeholder="t('delivery.allStatus')" style="width: 130px">
          <el-option :label="t('delivery.status.pending')" value="pending" />
          <el-option :label="t('delivery.status.accepted')" value="accepted" />
          <el-option :label="t('delivery.status.cooking')" value="cooking" />
          <el-option :label="t('delivery.status.delivering')" value="delivering" />
          <el-option :label="t('delivery.status.completed')" value="completed" />
          <el-option :label="t('delivery.status.rejected')" value="rejected" />
          <el-option :label="t('delivery.status.cancelled')" value="cancelled" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('delivery.paymentStatus')">
        <el-select
          v-model="filters.paymentStatus"
          clearable
          :placeholder="t('delivery.allPayment')"
          style="width: 130px"
        >
          <el-option :label="t('delivery.pay.unpaid')" value="unpaid" />
          <el-option :label="t('delivery.pay.partial')" value="partial" />
          <el-option :label="t('delivery.pay.paid')" value="paid" />
          <el-option :label="t('delivery.pay.refunded')" value="refunded" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('delivery.timeRange')">
        <el-date-picker
          v-model="filters.range"
          type="datetimerange"
          :start-placeholder="t('audit.from')"
          :end-placeholder="t('audit.to')"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="load">{{ t('common.search') }}</el-button>
        <el-button @click="resetFilters">{{ t('common.reset') }}</el-button>
      </el-form-item>
    </el-form>
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
                <div class="card-hd-l">
                  <strong :title="o.orderNo">{{ shortNo(o.orderNo) }}</strong>
                  <span class="time">{{ fmtTime(o.createdAt) }}</span>
                </div>
                <strong class="price">{{ formatVND(o.total) }}</strong>
              </div>
              <div class="card-meta">
                <el-tag v-if="o.memberPriority" size="small" type="warning">{{ t('member.priority') }}</el-tag>
                <el-tag size="small" type="info">{{ t(`delivery.status.${o.status}`, o.status) }}</el-tag>
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
                <li v-for="it in visibleItems(o)" :key="it.id">
                  <div>{{ nameOf(it) }} ×{{ it.qty }}</div>
                  <div v-for="(line, idx) in snapshotLines(it.optionsSnapshot)" :key="idx" class="snap">
                    · {{ line }}
                  </div>
                </li>
              </ul>
              <button
                v-if="(o.items || []).length > 3"
                type="button"
                class="expand-btn"
                @click="toggleItems(o.id)"
              >
                {{
                  expanded[o.id]
                    ? t('delivery.collapseItems')
                    : t('delivery.expandItems', { n: itemQtyTotal(o) })
                }}
              </button>
              <div class="muted count" v-else-if="o.items?.length">
                {{ t('delivery.itemCount', { n: itemQtyTotal(o) }) }}
              </div>
              <div class="muted" v-if="o.courierName">{{ t('delivery.courier') }}: {{ o.courierName }}</div>
              <div class="actions">
                <template v-if="userStore.hasPerm('delivery:accept')">
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
                </template>
                <el-button
                  v-if="
                    o.status === 'completed' &&
                    (o.paidAmount ?? 0) > 0 &&
                    (o.paymentStatus === 'paid' || o.paymentStatus === 'partial') &&
                    userStore.hasPerm('order:refund')
                  "
                  size="small"
                  type="danger"
                  plain
                  @click="router.push(`/orders/${o.id}`)"
                >
                  {{ t('order.refund') }}
                </el-button>
                <el-button
                  v-if="
                    ['completed', 'cancelled', 'rejected'].includes(o.status) &&
                    userStore.hasPerm('delivery:delete')
                  "
                  size="small"
                  type="danger"
                  @click="act(o, 'delete')"
                >
                  {{ t('common.delete') }}
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
          <el-table-column :label="t('print.createdAt')" width="180">
            <template #default="{ row }">{{ formatDateTimeLocal(row.createdAt) }}</template>
          </el-table-column>
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
  margin-bottom: 8px;
}
.filter-meta {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.filters {
  margin-bottom: 8px;
}
h3 {
  margin: 0;
}
.board {
  display: grid;
  grid-template-columns: repeat(7, minmax(220px, 1fr));
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 8px;
  align-items: start;
}
.col {
  background: #f5f7fa;
  border-radius: 8px;
  padding: 8px;
  min-height: 320px;
  max-height: calc(100vh - 220px);
  overflow-y: auto;
}
.col-title {
  display: flex;
  justify-content: space-between;
  font-weight: 600;
  margin-bottom: 8px;
  position: sticky;
  top: 0;
  background: #f5f7fa;
  z-index: 1;
  padding-bottom: 4px;
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
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 4px;
}
.card-hd-l {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.card-hd-l strong {
  word-break: break-all;
  font-size: 14px;
}
.time {
  color: #909399;
  font-size: 12px;
}
.price {
  flex-shrink: 0;
  color: #c45656;
  font-size: 14px;
  white-space: nowrap;
}
.card-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
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
  margin: 6px 0 2px;
  padding-left: 16px;
  font-size: 13px;
}
.items .snap {
  color: #909399;
  font-size: 12px;
  padding-left: 4px;
}
.expand-btn {
  border: 0;
  background: transparent;
  color: #409eff;
  font-size: 12px;
  cursor: pointer;
  padding: 0 0 4px;
}
.count {
  margin-bottom: 4px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 8px;
}
</style>

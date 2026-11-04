<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { Events, localeField } from '@restaurant/shared';
import { io, type Socket } from 'socket.io-client';
import {
  listKitchenBoardApi,
  updateKitchenItemStatusApi,
  type KitchenBoardItem,
} from '../../api/kitchen';
import { listKitchenPreordersApi, type Reservation } from '../../api/reservation';
import { listStationsApi, type Station } from '../../api/menu';
import { getAccessToken } from '../../utils/auth-storage';
import { useUserStore } from '../../stores/user';
import { formatDateTimeLocal } from '../../utils/datetime';

const { t, locale } = useI18n();
const userStore = useUserStore();
const loading = ref(false);
const acting = ref<string | null>(null);
const items = ref<KitchenBoardItem[]>([]);
const preorders = ref<Reservation[]>([]);
const stations = ref<Station[]>([]);
const stationFilter = ref('');
let socket: Socket | null = null;

const pending = computed(() => items.value.filter((i) => i.status === 'pending'));
const cooking = computed(() => items.value.filter((i) => i.status === 'cooking'));

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(
    row as unknown as Record<string, unknown>,
    'name',
    locale.value === 'vi-VN' ? 'vi' : 'zh',
  );
}

function stationOf(row: KitchenBoardItem) {
  if (!row.stationNameZh && !row.stationNameVi) return '-';
  return nameOf({ nameZh: row.stationNameZh || '', nameVi: row.stationNameVi || '' });
}

function placeLabel(row: KitchenBoardItem) {
  if (row.tableCode) return t('kitchen.table', { code: row.tableCode });
  return t('kitchen.delivery');
}

async function load() {
  loading.value = true;
  try {
    const [board, prep] = await Promise.all([
      listKitchenBoardApi(stationFilter.value || undefined),
      listKitchenPreordersApi().catch(() => [] as Reservation[]),
    ]);
    items.value = board;
    preorders.value = prep;
  } finally {
    loading.value = false;
  }
}

async function setStatus(row: KitchenBoardItem, status: 'cooking' | 'served') {
  acting.value = row.id;
  try {
    await updateKitchenItemStatusApi(row.id, status);
    ElMessage.success(t('common.saved'));
    await load();
  } catch {
    /* http 拦截器已提示 */
  } finally {
    acting.value = null;
  }
}

function connectSocket() {
  socket?.disconnect();
  const token = getAccessToken();
  if (!token) return;
  const storeId = userStore.profile?.storeId || '1';
  socket = io('/', {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token },
  });
  socket.on('connect', () => {
    socket?.emit('join', { room: `store:${storeId}:kitchen` });
    socket?.emit('join', { room: `store:${storeId}:front` });
  });
  const refresh = () => {
    void load();
  };
  socket.on(Events.ORDER_CREATED, refresh);
  socket.on(Events.ORDER_BATCH_ADDED, refresh);
  socket.on(Events.ORDER_ITEM_VOIDED, refresh);
  socket.on(Events.ORDER_ITEM_STATUS_CHANGED, refresh);
  socket.on(Events.ORDER_PAID, refresh);
  socket.on(Events.ORDER_CANCELLED, refresh);
  socket.on(Events.RESERVATION_CONFIRMED, refresh);
  socket.on(Events.RESERVATION_PREORDER_CHANGED, refresh);
}

onMounted(async () => {
  try {
    stations.value = await listStationsApi();
  } catch {
    stations.value = [];
  }
  await load();
  connectSocket();
});

onUnmounted(() => {
  socket?.disconnect();
  socket = null;
});
</script>

<template>
  <div class="kitchen" v-loading="loading">
    <div class="toolbar">
      <h2>{{ t('kitchen.title') }}</h2>
      <div class="filters">
        <el-select
          v-model="stationFilter"
          clearable
          :placeholder="t('kitchen.allStations')"
          style="width: 180px"
          @change="load"
        >
          <el-option
            v-for="s in stations"
            :key="s.id"
            :label="nameOf(s)"
            :value="s.id"
          />
        </el-select>
        <el-button @click="load">{{ t('kitchen.refresh') }}</el-button>
      </div>
    </div>

    <section v-if="preorders.length" class="preorder">
      <header>{{ t('kitchen.preorder') }} ({{ preorders.length }})</header>
      <div class="preorder-list">
        <article v-for="r in preorders" :key="r.id" class="card pre">
          <div class="title">
            {{ r.customerName }}
            <span class="meta">· {{ r.tableCode || t('kitchen.noTable') }}</span>
          </div>
          <div class="meta dim">{{ formatDateTimeLocal(r.reserveAt) }} · {{ r.phone }}</div>
          <ul class="dish-list">
            <li v-for="it in r.items || []" :key="it.id || `${it.nameZh}-${it.qty}`">
              {{ nameOf({ nameZh: it.nameZh, nameVi: it.nameVi }) }} × {{ it.qty }}
              <span v-if="it.remark" class="dim">（{{ it.remark }}）</span>
            </li>
          </ul>
        </article>
      </div>
    </section>

    <div class="board">
      <section class="col">
        <header>{{ t('kitchen.pending') }} ({{ pending.length }})</header>
        <div v-if="!pending.length" class="empty">{{ t('kitchen.empty') }}</div>
        <article v-for="row in pending" :key="row.id" class="card pending">
          <div class="title">{{ nameOf(row) }} × {{ row.qty }}</div>
          <div class="meta">
            <span>{{ placeLabel(row) }}</span>
            <span v-if="row.roundNo">{{ t('kitchen.round', { n: row.roundNo }) }}</span>
            <span>{{ stationOf(row) }}</span>
          </div>
          <div class="meta dim">{{ row.orderNo }} · {{ row.createdAt.slice(11, 16) }}</div>
          <div class="actions">
            <el-button
              type="warning"
              size="small"
              :loading="acting === row.id"
              @click="setStatus(row, 'cooking')"
            >
              {{ t('kitchen.startCook') }}
            </el-button>
            <el-button
              type="success"
              size="small"
              :loading="acting === row.id"
              @click="setStatus(row, 'served')"
            >
              {{ t('kitchen.markServed') }}
            </el-button>
          </div>
        </article>
      </section>

      <section class="col">
        <header>{{ t('kitchen.cooking') }} ({{ cooking.length }})</header>
        <div v-if="!cooking.length" class="empty">{{ t('kitchen.empty') }}</div>
        <article v-for="row in cooking" :key="row.id" class="card cooking">
          <div class="title">{{ nameOf(row) }} × {{ row.qty }}</div>
          <div class="meta">
            <span>{{ placeLabel(row) }}</span>
            <span v-if="row.roundNo">{{ t('kitchen.round', { n: row.roundNo }) }}</span>
            <span>{{ stationOf(row) }}</span>
          </div>
          <div class="meta dim">{{ row.orderNo }} · {{ row.createdAt.slice(11, 16) }}</div>
          <div class="actions">
            <el-button
              type="success"
              size="small"
              :loading="acting === row.id"
              @click="setStatus(row, 'served')"
            >
              {{ t('kitchen.markServed') }}
            </el-button>
          </div>
        </article>
      </section>
    </div>
  </div>
</template>

<style scoped>
.kitchen {
  padding: 16px 20px 32px;
  min-height: 100%;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}
.toolbar h2 {
  margin: 0;
  font-size: 20px;
}
.filters {
  display: flex;
  gap: 8px;
  align-items: center;
}
.preorder {
  background: #fff8e6;
  border: 1px solid #f5dab1;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}
.preorder header {
  font-weight: 700;
  margin-bottom: 10px;
}
.preorder-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}
.card.pre {
  border-left-color: #e6a23c;
  margin-bottom: 0;
}
.dish-list {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 13px;
}
.board {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.col {
  background: #f7f7f7;
  border-radius: 8px;
  padding: 12px;
  min-height: 420px;
}
.col header {
  font-weight: 700;
  margin-bottom: 12px;
  font-size: 15px;
}
.card {
  background: #fff;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 10px;
  border-left: 4px solid #c0c4cc;
}
.card.pending {
  border-left-color: #e6a23c;
}
.card.cooking {
  border-left-color: #409eff;
}
.title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 6px;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 13px;
  color: #606266;
  margin-bottom: 4px;
}
.meta.dim {
  color: #909399;
  font-size: 12px;
}
.actions {
  margin-top: 10px;
  display: flex;
  gap: 8px;
}
.empty {
  color: #909399;
  padding: 24px 8px;
  text-align: center;
}
@media (max-width: 900px) {
  .board {
    grid-template-columns: 1fr;
  }
}
</style>

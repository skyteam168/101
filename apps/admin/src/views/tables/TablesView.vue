<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Brush, Plus, User } from '@element-plus/icons-vue';
import { Events, formatVND, localeField } from '@restaurant/shared';
import { io, type Socket } from 'socket.io-client';
import { confirmBatchApi } from '../../api/order';
import {
  clearTableApi,
  createAreaApi,
  createTableApi,
  deleteAreaApi,
  deleteTableApi,
  exportStickersApi,
  listFloorApi,
  mergeTableApi,
  openTableApi,
  resetQrApi,
  transferTableApi,
  updateAreaApi,
  updateTableApi,
  type AreaFloor,
  type FloorTable,
} from '../../api/table';
import { getStoreSettingsApi } from '../../api/store';
import TableStickerCard from '../../components/tables/TableStickerCard.vue';
import { getAccessToken } from '../../utils/auth-storage';
import { useUserStore } from '../../stores/user';

const { t, locale } = useI18n();
const router = useRouter();
const userStore = useUserStore();
const loc = computed(() => (locale.value === 'vi-VN' ? 'vi' : 'zh'));

const loading = ref(false);
const areas = ref<AreaFloor[]>([]);
const activeArea = ref('');
const openDialog = ref(false);
const openForm = reactive({ tableId: '', code: '', guestCount: 2 });
const manageDialog = ref(false);
const areaForm = reactive({ id: '', nameZh: '', nameVi: '', sort: 0 });
const tableForm = reactive({ id: '', areaId: '', code: '', seats: 4 });
const transferDialog = ref(false);
const transferForm = reactive({ fromId: '', toId: '' });
const mergeDialog = ref(false);
const mergeForm = reactive({ targetId: '', sourceId: '' });
const stickerDialog = ref(false);
const stickerLoading = ref(false);
const stickerStore = reactive({
  nameZh: '',
  nameVi: '',
  wifiSsid: '',
  wifiPassword: '',
});

let timer: ReturnType<typeof setInterval> | null = null;
let socket: Socket | null = null;

const allTables = computed(() => areas.value.flatMap((a) => a.tables));

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc.value);
}

const currentTables = computed(() => {
  const area = areas.value.find((a) => a.id === activeArea.value);
  return area?.tables ?? [];
});

const idleTables = computed(() =>
  areas.value.flatMap((a) => a.tables).filter((t) => t.status === 'idle'),
);
const diningTables = computed(() =>
  areas.value.flatMap((a) => a.tables).filter((t) => t.status === 'dining'),
);

async function load() {
  loading.value = true;
  try {
    areas.value = await listFloorApi();
    if (!activeArea.value && areas.value.length) {
      activeArea.value = areas.value[0].id;
    }
  } finally {
    loading.value = false;
  }
}

function statusClass(status: FloorTable['status']) {
  return `tbl-${status}`;
}

function onCardClick(table: FloorTable) {
  if (table.status === 'idle') {
    if (!userStore.hasPerm('table:open')) return;
    openForm.tableId = table.id;
    openForm.code = table.code;
    openForm.guestCount = Math.min(table.seats, 4) || 2;
    openDialog.value = true;
    return;
  }
  if (table.status === 'dining') {
    router.push(`/tables/${table.id}/order`);
    return;
  }
  if (table.status === 'cleaning' && userStore.hasPerm('table:open')) {
    ElMessageBox.confirm(t('tables.clearConfirm', { code: table.code }), t('common.confirm'), {
      type: 'warning',
    }).then(async () => {
      await clearTableApi(table.id);
      ElMessage.success(t('tables.cleared'));
      await load();
    });
  }
}

async function confirmOpen() {
  await openTableApi(openForm.tableId, openForm.guestCount);
  openDialog.value = false;
  ElMessage.success(t('tables.opened'));
  await load();
  router.push(`/tables/${openForm.tableId}/order`);
}

function openManage() {
  manageDialog.value = true;
}

async function saveArea() {
  if (areaForm.id) {
    await updateAreaApi(areaForm.id, {
      nameZh: areaForm.nameZh,
      nameVi: areaForm.nameVi,
      sort: areaForm.sort,
    });
  } else {
    await createAreaApi({
      nameZh: areaForm.nameZh,
      nameVi: areaForm.nameVi,
      sort: areaForm.sort,
    });
  }
  Object.assign(areaForm, { id: '', nameZh: '', nameVi: '', sort: 0 });
  await load();
  ElMessage.success(t('common.saved'));
}

async function removeArea(id: string) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  await deleteAreaApi(id);
  await load();
}

async function saveTable() {
  if (tableForm.id) {
    await updateTableApi(tableForm.id, {
      areaId: tableForm.areaId,
      code: tableForm.code,
      seats: tableForm.seats,
    });
  } else {
    await createTableApi({
      areaId: tableForm.areaId || activeArea.value,
      code: tableForm.code,
      seats: tableForm.seats,
    });
  }
  Object.assign(tableForm, { id: '', areaId: activeArea.value, code: '', seats: 4 });
  await load();
  ElMessage.success(t('common.saved'));
}

async function removeTable(id: string) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  await deleteTableApi(id);
  await load();
}

async function doResetQr(id: string) {
  await resetQrApi(id);
  ElMessage.success(t('tables.qrReset'));
  await load();
}

async function doExport() {
  await exportStickersApi();
  ElMessage.success(t('tables.exported'));
}

async function openStickerPreview() {
  stickerDialog.value = true;
  stickerLoading.value = true;
  try {
    if (!areas.value.length) await load();
    const s = await getStoreSettingsApi();
    stickerStore.nameZh = s.nameZh;
    stickerStore.nameVi = s.nameVi;
    stickerStore.wifiSsid = s.guestWifi?.ssid || '';
    stickerStore.wifiPassword = s.guestWifi?.password || '';
  } finally {
    stickerLoading.value = false;
  }
}

async function confirmTransfer() {
  await transferTableApi(transferForm.fromId, transferForm.toId);
  transferDialog.value = false;
  ElMessage.success(t('tables.transferred'));
  await load();
}

async function confirmMerge() {
  await mergeTableApi(mergeForm.targetId, mergeForm.sourceId);
  mergeDialog.value = false;
  ElMessage.success(t('tables.merged'));
  await load();
}

async function confirmBatch(batchId: string, e: Event) {
  e.stopPropagation();
  await confirmBatchApi(batchId);
  ElMessage.success(t('tables.batchConfirmed'));
  await load();
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
  socket.on('connect', () => {
    socket?.emit('join', { room: `store:${storeId}:front` });
  });
  const refresh = () => load();
  socket.on(Events.TABLE_STATUS_CHANGED, refresh);
  // 待确认通知 / 语音由全局 useVoiceAlert 统一处理（任意页可见）
  socket.on(Events.ORDER_BATCH_ADDED, refresh);
  socket.on(Events.ORDER_CREATED, refresh);
  socket.on(Events.ORDER_PAID, refresh);
  // 呼叫/结账通知与语音由全局 useVoiceAlert 统一处理
}

onMounted(() => {
  load();
  connectSocket();
  timer = setInterval(load, 30000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  socket?.disconnect();
  socket = null;
});
</script>

<template>
  <div class="floor" v-loading="loading">
    <div class="toolbar">
      <el-tabs v-model="activeArea" class="area-tabs">
        <el-tab-pane
          v-for="a in areas"
          :key="a.id"
          :label="`${nameOf(a)} (${a.tables.length})`"
          :name="a.id"
        />
      </el-tabs>
      <div class="actions">
        <el-button v-perm="'table:open'" @click="transferDialog = true">{{ t('tables.transfer') }}</el-button>
        <el-button v-perm="'table:open'" @click="mergeDialog = true">{{ t('tables.merge') }}</el-button>
        <el-button @click="openStickerPreview">{{ t('tables.previewStickers') }}</el-button>
        <el-button @click="doExport">{{ t('tables.exportStickers') }}</el-button>
        <el-button type="primary" @click="openManage">{{ t('tables.manage') }}</el-button>
      </div>
    </div>

    <div class="status-bar">
      <span class="chip on">
        {{ t('tables.all') }}
        <b>{{ areas.flatMap((a) => a.tables).length }}</b>
      </span>
      <span class="chip idle"><i class="dot" />{{ t('tables.statusIdle') }} <b>{{ idleTables.length }}</b></span>
      <span class="chip dining"><i class="dot" />{{ t('tables.statusDining') }} <b>{{ diningTables.length }}</b></span>
      <span class="chip cleaning">
        <i class="dot" />{{ t('tables.statusCleaning') }}
        <b>{{ areas.flatMap((a) => a.tables).filter((x) => x.status === 'cleaning').length }}</b>
      </span>
    </div>

    <div class="grid">
      <button
        v-for="table in currentTables"
        :key="table.id"
        type="button"
        class="card"
        :class="statusClass(table.status)"
        @click="onCardClick(table)"
      >
        <div class="card-head">
          <div class="code">
            {{ table.code }}
            <el-badge
              v-if="table.session?.pendingConfirmCount"
              :value="table.session.pendingConfirmCount"
              class="badge"
            />
          </div>
          <div class="people">
            <el-icon><User /></el-icon>
            <span v-if="table.status === 'dining' && table.session">
              {{ table.session.guestCount }}/{{ table.seats }}
            </span>
            <span v-else>0/{{ table.seats }}</span>
          </div>
        </div>

        <div v-if="table.status === 'dining' && table.session" class="meta">
          <div class="money">{{ formatVND(table.session.total) }}</div>
          <div class="duration">{{ t('tables.duration', { m: table.session.durationMinutes }) }}</div>
          <div
            v-for="b in table.session.pendingBatches || []"
            :key="b.id"
            class="pending"
            @click.stop
          >
            <span>{{ t('tables.pendingRound', { n: b.roundNo }) }} {{ b.guestNickname || '' }}</span>
            <el-button
              v-perm="'order:create'"
              size="small"
              type="warning"
              @click="confirmBatch(b.id, $event)"
            >
              {{ t('tables.confirmBatch') }}
            </el-button>
          </div>
        </div>
        <div v-else-if="table.status === 'cleaning'" class="meta center">
          <el-icon :size="28"><Brush /></el-icon>
          <div>{{ t('tables.clickClear') }}</div>
        </div>
        <div v-else class="meta center open-hint">
          <el-icon :size="28"><Plus /></el-icon>
          <div>{{ t('tables.seats', { n: table.seats }) }}</div>
        </div>
      </button>
    </div>

    <el-dialog v-model="openDialog" :title="t('tables.openTitle', { code: openForm.code })" width="360px">
      <el-form label-width="80px">
        <el-form-item :label="t('tables.guestCount')">
          <el-input-number v-model="openForm.guestCount" :min="1" :max="99" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="openDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmOpen">{{ t('tables.open') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="transferDialog" :title="t('tables.transfer')" width="420px">
      <el-form label-width="90px">
        <el-form-item :label="t('tables.from')">
          <el-select v-model="transferForm.fromId" style="width: 100%">
            <el-option v-for="tb in diningTables" :key="tb.id" :label="tb.code" :value="tb.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('tables.to')">
          <el-select v-model="transferForm.toId" style="width: 100%">
            <el-option v-for="tb in idleTables" :key="tb.id" :label="tb.code" :value="tb.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="transferDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmTransfer">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="mergeDialog" :title="t('tables.merge')" width="420px">
      <el-form label-width="90px">
        <el-form-item :label="t('tables.mergeTarget')">
          <el-select v-model="mergeForm.targetId" style="width: 100%">
            <el-option v-for="tb in diningTables" :key="tb.id" :label="tb.code" :value="tb.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('tables.mergeSource')">
          <el-select v-model="mergeForm.sourceId" style="width: 100%">
            <el-option
              v-for="tb in diningTables.filter((x) => x.id !== mergeForm.targetId)"
              :key="tb.id"
              :label="tb.code"
              :value="tb.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="mergeDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmMerge">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog
      v-model="stickerDialog"
      :title="t('tables.stickerPreviewTitle')"
      width="920px"
      top="4vh"
      destroy-on-close
    >
      <p class="sticker-hint">{{ t('tables.stickerHint') }}</p>
      <div v-loading="stickerLoading" class="sticker-grid">
        <TableStickerCard
          v-for="tb in allTables"
          :key="tb.id"
          :store-name-zh="stickerStore.nameZh"
          :store-name-vi="stickerStore.nameVi"
          :table-code="tb.code"
          :qr-url="tb.qrUrl"
          :wifi-ssid="stickerStore.wifiSsid"
          :wifi-password="stickerStore.wifiPassword"
        />
      </div>
      <template #footer>
        <el-button @click="stickerDialog = false">{{ t('common.close') }}</el-button>
        <el-button type="primary" @click="doExport">{{ t('tables.stickerExport') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="manageDialog" :title="t('tables.manage')" width="720px">
      <el-tabs>
        <el-tab-pane :label="t('tables.areas')">
          <el-form inline>
            <el-form-item :label="t('tables.nameZh')">
              <el-input v-model="areaForm.nameZh" />
            </el-form-item>
            <el-form-item :label="t('tables.nameVi')">
              <el-input v-model="areaForm.nameVi" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveArea">{{ t('common.save') }}</el-button>
            </el-form-item>
          </el-form>
          <el-table :data="areas" size="small">
            <el-table-column prop="nameZh" :label="t('tables.nameZh')" />
            <el-table-column prop="nameVi" :label="t('tables.nameVi')" />
            <el-table-column :label="t('common.actions')" width="160">
              <template #default="{ row }">
                <el-button
                  link
                  type="primary"
                  @click="Object.assign(areaForm, { id: row.id, nameZh: row.nameZh, nameVi: row.nameVi, sort: row.sort })"
                >{{ t('common.edit') }}</el-button>
                <el-button link type="danger" @click="removeArea(row.id)">{{ t('common.delete') }}</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
        <el-tab-pane :label="t('tables.tables')">
          <el-form inline>
            <el-form-item :label="t('tables.area')">
              <el-select v-model="tableForm.areaId" style="width: 140px">
                <el-option v-for="a in areas" :key="a.id" :label="nameOf(a)" :value="a.id" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('tables.code')">
              <el-input v-model="tableForm.code" style="width: 100px" />
            </el-form-item>
            <el-form-item :label="t('tables.seatCount')">
              <el-input-number v-model="tableForm.seats" :min="1" :max="99" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" @click="saveTable">{{ t('common.save') }}</el-button>
            </el-form-item>
          </el-form>
          <el-table :data="areas.flatMap((a) => a.tables.map((tb) => ({ ...tb, areaName: nameOf(a) })))" size="small">
            <el-table-column prop="areaName" :label="t('tables.area')" width="100" />
            <el-table-column prop="code" :label="t('tables.code')" width="80" />
            <el-table-column prop="seats" :label="t('tables.seatCount')" width="80" />
            <el-table-column prop="status" :label="t('tables.status')" width="90" />
            <el-table-column :label="t('common.actions')" min-width="200">
              <template #default="{ row }">
                <el-button link type="primary" @click="doResetQr(row.id)">{{ t('tables.resetQr') }}</el-button>
                <el-button
                  link
                  @click="Object.assign(tableForm, { id: row.id, areaId: row.areaId, code: row.code, seats: row.seats })"
                >{{ t('common.edit') }}</el-button>
                <el-button link type="danger" :disabled="row.status !== 'idle'" @click="removeTable(row.id)">
                  {{ t('common.delete') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>
    </el-dialog>
  </div>
</template>

<style scoped>
.sticker-hint {
  margin: 0 0 12px;
  color: #888;
  font-size: 13px;
}
.sticker-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  max-height: 70vh;
  overflow: auto;
  padding: 4px 2px 12px;
  background: #f2f2f2;
  border-radius: 8px;
  justify-content: center;
}
.floor {
  padding: 12px 16px 24px;
}
.toolbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.area-tabs {
  flex: 1;
  min-width: 240px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 4px;
}
.status-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 4px 0 14px;
}
.chip {
  border: 1px solid #eee;
  background: #fff;
  border-radius: 999px;
  padding: 6px 12px;
  font-size: 13px;
  color: #666;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.chip b { color: #191919; }
.chip .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}
.chip.idle .dot { background: #c0c4cc; }
.chip.dining .dot { background: var(--mt-orange); }
.chip.cleaning .dot { background: #2f3542; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
}
.card {
  border: none;
  border-radius: 12px;
  padding: 0;
  text-align: left;
  cursor: pointer;
  background: #fff;
  min-height: 128px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.card:hover {
  transform: translateY(-2px);
  box-shadow: 0 8px 18px rgba(0, 0, 0, 0.08);
}
.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  font-weight: 700;
}
.card.tbl-idle .card-head { background: #f0f2f5; color: #606266; }
.card.tbl-dining .card-head { background: var(--mt-orange); color: #fff; }
.card.tbl-cleaning .card-head { background: #2f3542; color: #fff; }
.people {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  font-weight: 600;
}
.code {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: 0.02em;
}
.meta {
  padding: 12px;
  font-size: 13px;
  color: #555;
  line-height: 1.5;
  min-height: 72px;
}
.meta.center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: #909399;
}
.open-hint { color: #c0c4cc; }
.money {
  font-size: 18px;
  font-weight: 800;
  color: var(--mt-orange);
}
.duration { margin-top: 4px; color: #909399; }
.badge {
  margin-left: 6px;
  vertical-align: top;
}
.pending {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #b88230;
}
</style>

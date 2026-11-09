<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatVND, localeField } from '@restaurant/shared';
import {
  cancelReservationApi,
  confirmReservationApi,
  createReservationApi,
  deleteReservationApi,
  listReservationsApi,
  noShowReservationApi,
  seatReservationApi,
  updateReservationApi,
  type Reservation,
  type ReservationItem,
  type ReservationStatus,
} from '../../api/reservation';
import { listDishesApi, type Dish } from '../../api/menu';
import { listFloorApi, type FloorTable } from '../../api/table';
import { formatDateTimeLocal, toDatetimeLocalValue } from '../../utils/datetime';
import { formatThousands, parseThousands } from '../../utils/vnd-input';

const { t, locale } = useI18n();

const loading = ref(false);
const reservations = ref<Reservation[]>([]);
const allTables = ref<FloorTable[]>([]);
const dishes = ref<Dish[]>([]);

const filterDate = ref('');
const filterStatus = ref('');
const filterKeyword = ref('');

const dialog = ref(false);
const saving = ref(false);
const seatDialog = ref(false);
const seatId = ref('');
const seatTableId = ref('');

type FormItem = { dishId: string; qty: number };

const form = reactive({
  id: '',
  customerName: '',
  phone: '',
  guestCount: 2,
  reserveAt: '',
  tableId: '',
  status: 'pending' as ReservationStatus,
  depositText: '',
  remark: '',
  items: [] as FormItem[],
});

function dishName(d: Dish) {
  return localeField(
    d as unknown as Record<string, unknown>,
    'name',
    locale.value === 'vi-VN' ? 'vi' : 'zh',
  );
}

async function refresh() {
  loading.value = true;
  try {
    reservations.value = await listReservationsApi({
      date: filterDate.value || undefined,
      status: filterStatus.value || undefined,
      keyword: filterKeyword.value || undefined,
    });
  } finally {
    loading.value = false;
  }
}

async function loadTables() {
  if (!allTables.value.length) {
    const floors = await listFloorApi();
    allTables.value = floors.flatMap((a) => a.tables);
  }
}

async function loadDishes() {
  if (!dishes.value.length) {
    dishes.value = await listDishesApi({ status: 'on' });
  }
}

onMounted(async () => {
  await Promise.all([refresh(), loadTables(), loadDishes()]);
});

function statusTag(status: ReservationStatus) {
  const map: Record<string, 'info' | 'success' | 'warning' | 'danger'> = {
    pending: 'info',
    confirmed: 'success',
    seated: 'success',
    cancelled: 'danger',
    no_show: 'warning',
  };
  return map[status] || 'info';
}

function resetForm() {
  form.id = '';
  form.customerName = '';
  form.phone = '';
  form.guestCount = 2;
  form.reserveAt = '';
  form.tableId = '';
  form.status = 'pending';
  form.depositText = '';
  form.remark = '';
  form.items = [];
}

function openCreate() {
  resetForm();
  dialog.value = true;
}

function openEdit(row: Reservation) {
  form.id = row.id;
  form.customerName = row.customerName;
  form.phone = row.phone;
  form.guestCount = row.guestCount;
  form.reserveAt = toDatetimeLocalValue(row.reserveAt);
  form.tableId = row.tableId || '';
  form.status = row.status;
  form.depositText = formatThousands(row.deposit);
  form.remark = row.remark || '';
  form.items = (row.items || [])
    .filter((it: ReservationItem) => it.dishId)
    .map((it) => ({ dishId: it.dishId!, qty: it.qty }));
  dialog.value = true;
}

function addItemRow() {
  const first = dishes.value[0];
  if (!first) {
    ElMessage.warning(t('reservation.noDish'));
    return;
  }
  form.items.push({ dishId: first.id, qty: 1 });
}

function removeItemRow(idx: number) {
  form.items.splice(idx, 1);
}

async function save() {
  if (!form.customerName || !form.phone) {
    ElMessage.warning(t('reservation.guestRequired'));
    return;
  }
  if (!form.reserveAt) {
    ElMessage.warning(t('reservation.timeRequired'));
    return;
  }
  saving.value = true;
  try {
    const payload = {
      customerName: form.customerName,
      phone: form.phone,
      guestCount: form.guestCount,
      reserveAt: new Date(form.reserveAt).toISOString(),
      tableId: form.tableId || null,
      deposit: parseThousands(form.depositText),
      remark: form.remark || null,
      items: form.items
        .filter((it) => it.dishId && it.qty > 0)
        .map((it) => ({ dishId: it.dishId, qty: it.qty })),
    };
    if (form.id) {
      await updateReservationApi(form.id, payload);
    } else {
      await createReservationApi(payload);
    }
    ElMessage.success(t('common.saved'));
    dialog.value = false;
    await refresh();
  } finally {
    saving.value = false;
  }
}

async function doConfirm(row: Reservation) {
  await confirmReservationApi(row.id);
  ElMessage.success(t('common.saved'));
  await refresh();
}

async function doCancel(row: Reservation) {
  const { value: reason } = await ElMessageBox.prompt(
    t('reservation.cancelReason'),
    t('reservation.cancel'),
    { inputPattern: /.+/, inputErrorMessage: t('reservation.reasonRequired') },
  );
  await cancelReservationApi(row.id, reason);
  ElMessage.success(t('common.saved'));
  await refresh();
}

async function doNoShow(row: Reservation) {
  await ElMessageBox.confirm(t('reservation.confirmNoShow'), { type: 'warning' });
  await noShowReservationApi(row.id);
  ElMessage.success(t('common.saved'));
  await refresh();
}

function openSeat(row: Reservation) {
  seatId.value = row.id;
  seatTableId.value = row.tableId || '';
  seatDialog.value = true;
}

async function doSeat() {
  if (!seatTableId.value) {
    ElMessage.warning(t('reservation.tableRequired'));
    return;
  }
  const res = await seatReservationApi(seatId.value, seatTableId.value);
  ElMessage.success(
    res.orderId ? t('reservation.seatWithOrder') : t('common.saved'),
  );
  seatDialog.value = false;
  await refresh();
}

async function remove(row: Reservation) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  await deleteReservationApi(row.id);
  ElMessage.success(t('common.deleted'));
  await refresh();
}

function formatDateTime(iso: string) {
  return formatDateTimeLocal(iso);
}

function tableCode(tableId: string | null) {
  if (!tableId) return '—';
  return allTables.value.find((tb) => tb.id === tableId)?.code || tableId;
}

function itemLabel(it: ReservationItem) {
  const name =
    locale.value === 'vi-VN' ? it.nameVi || it.nameZh : it.nameZh || it.nameVi;
  return `${name} ×${it.qty}`;
}
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="head">
      <div>
        <h3>{{ t('reservation.title') }}</h3>
        <p class="sub">{{ t('reservation.subtitle') }}</p>
      </div>
      <el-button v-perm="'reservation:edit'" type="primary" @click="openCreate">
        + {{ t('reservation.add') }}
      </el-button>
    </div>

    <div class="filters">
      <el-date-picker
        v-model="filterDate"
        type="date"
        value-format="YYYY-MM-DD"
        :placeholder="t('order.filterDate')"
        style="width: 160px"
        clearable
      />
      <el-select
        v-model="filterStatus"
        :placeholder="t('order.filterStatus')"
        clearable
        style="width: 140px"
      >
        <el-option :label="t('reservation.status.pending')" value="pending" />
        <el-option :label="t('reservation.status.confirmed')" value="confirmed" />
        <el-option :label="t('reservation.status.seated')" value="seated" />
        <el-option :label="t('reservation.status.cancelled')" value="cancelled" />
        <el-option :label="t('reservation.status.no_show')" value="no_show" />
      </el-select>
      <el-input
        v-model="filterKeyword"
        :placeholder="t('common.search')"
        clearable
        style="width: 200px"
        @keyup.enter="refresh"
      />
      <el-button type="primary" @click="refresh">{{ t('common.search') }}</el-button>
    </div>

    <el-table :data="reservations" border>
      <el-table-column :label="t('reservation.guest')" width="140">
        <template #default="{ row }">
          {{ row.customerName }}
          <el-tag v-if="row.memberPriority" size="small" type="warning">{{ t('member.priority') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.phone')" width="130" prop="phone" />
      <el-table-column :label="t('reservation.guestCount')" width="80">
        <template #default="{ row }">{{ row.guestCount }}</template>
      </el-table-column>
      <el-table-column :label="t('reservation.reservedAt')" width="150">
        <template #default="{ row }">{{ formatDateTime(row.reserveAt) }}</template>
      </el-table-column>
      <el-table-column :label="t('reservation.table')" width="90">
        <template #default="{ row }">{{ tableCode(row.tableId) }}</template>
      </el-table-column>
      <el-table-column :label="t('reservation.preorder')" min-width="200" class-name="preorder-col">
        <template #default="{ row }">
          <template v-if="row.preorderCount">
            <el-tag size="small" type="warning">
              {{ t('reservation.preorderCount', { n: row.preorderCount }) }}
            </el-tag>
            <div class="preorder-lines">
              <span v-for="(it, i) in row.items || []" :key="i">{{ itemLabel(it) }}</span>
            </div>
          </template>
          <span v-else class="muted">—</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="statusTag(row.status)" size="small">
            {{ t(`reservation.status.${row.status}`) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('reservation.deposit')" width="120">
        <template #default="{ row }">{{ formatVND(row.deposit) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" min-width="280" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'pending'"
            link
            type="success"
            v-perm="'reservation:edit'"
            @click="doConfirm(row)"
          >{{ t('reservation.confirm') }}</el-button>
          <el-button
            v-if="['pending', 'confirmed'].includes(row.status)"
            link
            type="primary"
            v-perm="'reservation:edit'"
            @click="openSeat(row)"
          >{{ t('reservation.seat') }}</el-button>
          <el-button
            v-if="['pending', 'confirmed'].includes(row.status)"
            link
            type="warning"
            v-perm="'reservation:edit'"
            @click="doNoShow(row)"
          >{{ t('reservation.noShow') }}</el-button>
          <el-button
            v-if="['pending', 'confirmed'].includes(row.status)"
            link
            type="danger"
            v-perm="'reservation:edit'"
            @click="doCancel(row)"
          >{{ t('reservation.cancel') }}</el-button>
          <el-button
            link
            type="primary"
            v-perm="'reservation:view'"
            @click="openEdit(row)"
          >{{ t('common.edit') }}</el-button>
          <el-button
            link
            type="danger"
            v-perm="'reservation:edit'"
            @click="remove(row)"
          >{{ t('common.delete') }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="dialog"
      :title="form.id ? t('reservation.edit') : t('reservation.add')"
      width="640px"
    >
      <el-form label-width="100px">
        <el-form-item :label="t('reservation.guest')">
          <el-input v-model="form.customerName" />
        </el-form-item>
        <el-form-item :label="t('common.phone')">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item :label="t('reservation.guestCount')">
          <el-input-number v-model="form.guestCount" :min="1" :max="100" />
        </el-form-item>
        <el-form-item :label="t('reservation.reservedAt')">
          <el-date-picker
            v-model="form.reserveAt"
            type="datetime"
            value-format="YYYY-MM-DDTHH:mm"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('reservation.table')">
          <el-select v-model="form.tableId" clearable style="width: 100%">
            <el-option
              v-for="tb in allTables"
              :key="tb.id"
              :label="tb.code"
              :value="tb.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('reservation.deposit')">
          <el-input
            :model-value="form.depositText"
            @update:model-value="(v: string) => (form.depositText = formatThousands(parseThousands(v)))"
          />
        </el-form-item>
        <el-form-item :label="t('inventory.note')">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
        <el-form-item :label="t('reservation.preorder')">
          <div class="items-editor">
            <p class="hint">{{ t('reservation.preorderHint') }}</p>
            <div v-for="(it, idx) in form.items" :key="idx" class="item-row">
              <el-select v-model="it.dishId" filterable style="flex: 1">
                <el-option
                  v-for="d in dishes"
                  :key="d.id"
                  :label="`${dishName(d)} · ${formatVND(d.price)}`"
                  :value="d.id"
                />
              </el-select>
              <el-input-number v-model="it.qty" :min="1" :max="99" style="width: 110px" />
              <el-button link type="danger" @click="removeItemRow(idx)">{{ t('common.delete') }}</el-button>
            </div>
            <el-button size="small" @click="addItemRow">+ {{ t('reservation.addDish') }}</el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="seatDialog" :title="t('reservation.seat')" width="360px">
      <el-form label-width="80px">
        <el-form-item :label="t('reservation.table')">
          <el-select v-model="seatTableId" style="width: 100%">
            <el-option
              v-for="tb in allTables.filter((x) => x.status === 'idle')"
              :key="tb.id"
              :label="`${tb.code} (${t('tables.statusIdle')})`"
              :value="tb.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="seatDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="doSeat">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page { padding: 8px 4px 24px; }
.head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; }
.head h3 { margin: 0; }
.sub { margin: 4px 0 0; color: #888; font-size: 13px; }
.filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.preorder-lines {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 4px;
  font-size: 12px;
  color: #606266;
  white-space: normal;
  word-break: break-word;
  line-height: 1.4;
}
:deep(.preorder-col .cell) {
  overflow: visible;
  text-overflow: unset;
  white-space: normal;
  line-height: 1.4;
}
.muted { color: #c0c4cc; }
.items-editor { width: 100%; }
.item-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
.hint { margin: 0 0 8px; color: #909399; font-size: 12px; }
</style>

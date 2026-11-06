<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatVND, localeField } from '@restaurant/shared';
import {
  getOrderApi,
  refundOrderApi,
  reverseCheckoutApi,
  type Order,
} from '../../api/order';
import { printRefundTicketApi } from '../../api/print';
import { useUserStore } from '../../stores/user';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const order = ref<Order | null>(null);
const loading = ref(false);
const refundVisible = ref(false);
const refundSubmitting = ref(false);
const refundForm = reactive({
  amount: 0,
  method: 'cash',
  reason: '',
});

const payMethods = ['cash', 'card', 'bank_transfer', 'momo', 'vnpay'] as const;

const canRefund = computed(() => {
  const o = order.value;
  if (!o || !userStore.hasPerm('order:refund')) return false;
  const statusOk = o.status === 'paid' || o.status === 'completed';
  const payOk = o.paymentStatus === 'paid' || o.paymentStatus === 'partial';
  return statusOk && payOk && o.paidAmount > 0;
});

const canReverse = computed(() => {
  const o = order.value;
  if (!o || !userStore.hasPerm('order:checkout')) return false;
  return o.status === 'paid' && !(o.refunds && o.refunds.length > 0);
});

const canPrintRefund = computed(() => {
  const o = order.value;
  if (!o || !userStore.hasPerm('order:refund')) return false;
  return !!(o.refunds && o.refunds.length > 0);
});

function nameOf(row: { nameZh: string; nameVi: string }) {
  const loc = locale.value === 'vi-VN' ? 'vi' : 'zh';
  return localeField(row as unknown as Record<string, unknown>, 'name', loc);
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

function methodLabel(method: string) {
  if (method === 'bank_transfer') return t('order.bank');
  if (method === 'cash') return t('order.cash');
  if (method === 'card') return t('order.card');
  if (method === 'momo') return 'MoMo';
  if (method === 'vnpay') return 'VNPay';
  return method;
}

async function load() {
  loading.value = true;
  try {
    order.value = await getOrderApi(String(route.params.id));
  } finally {
    loading.value = false;
  }
}

async function reverse() {
  await ElMessageBox.confirm(t('order.reverseConfirm'), { type: 'warning' });
  order.value = await reverseCheckoutApi(String(route.params.id));
  ElMessage.success(t('order.reversed'));
}

function openRefund() {
  const o = order.value;
  if (!o) return;
  refundForm.amount = o.paidAmount;
  refundForm.method = o.payments?.[0]?.method || 'cash';
  refundForm.reason = '';
  refundVisible.value = true;
}

async function submitRefund() {
  const o = order.value;
  if (!o) return;
  if (!refundForm.reason.trim()) {
    ElMessage.warning(t('order.reasonRequired'));
    return;
  }
  if (refundForm.amount < 1 || refundForm.amount > o.paidAmount) {
    ElMessage.warning(t('order.refundAmountInvalid'));
    return;
  }
  refundSubmitting.value = true;
  try {
    order.value = await refundOrderApi(o.id, {
      amount: Math.floor(refundForm.amount),
      method: refundForm.method,
      reason: refundForm.reason.trim(),
    });
    refundVisible.value = false;
    ElMessage.success(t('order.refunded'));
  } finally {
    refundSubmitting.value = false;
  }
}

async function printRefundTicket(refundId?: string) {
  const o = order.value;
  if (!o) return;
  await printRefundTicketApi(o.id, refundId);
  ElMessage.success(t('order.refundTicketQueued'));
}

onMounted(load);
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="head">
      <el-button text @click="router.push('/orders')">← {{ t('order.backList') }}</el-button>
      <div class="head-actions">
        <el-button v-if="canPrintRefund" @click="printRefundTicket()">
          {{ t('order.printRefundTicket') }}
        </el-button>
        <el-button v-if="canRefund" type="danger" plain @click="openRefund">
          {{ t('order.refund') }}
        </el-button>
        <el-button v-if="canReverse" type="warning" @click="reverse">
          {{ t('order.reverseCheckout') }}
        </el-button>
      </div>
    </div>

    <template v-if="order">
      <el-descriptions :title="order.orderNo" :column="3" border>
        <el-descriptions-item :label="t('order.filterStatus')">
          {{ t(`order.status.${order.status}`, order.status) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('order.filterType')">
          {{ t(`order.type.${order.type}`, order.type) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('order.filterTable')">
          {{ order.tableCode || '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('order.paymentStatus')">
          {{ t(`order.paymentStatusMap.${order.paymentStatus}`, order.paymentStatus) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('order.subtotal')">{{ formatVND(order.subtotal) }}</el-descriptions-item>
        <el-descriptions-item :label="t('order.discountAmount')">{{ formatVND(order.discount) }}</el-descriptions-item>
        <el-descriptions-item :label="t('order.serviceCharge')">{{ formatVND(order.serviceCharge) }}</el-descriptions-item>
        <el-descriptions-item :label="t('order.billTotal')">{{ formatVND(order.total) }}</el-descriptions-item>
        <el-descriptions-item :label="t('order.paidAmount')">{{ formatVND(order.paidAmount) }}</el-descriptions-item>
        <el-descriptions-item :label="t('order.refundedAmount')">
          {{ formatVND(order.refundedAmount || 0) }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('order.createdAt')">
          {{ new Date(order.createdAt).toLocaleString() }}
        </el-descriptions-item>
      </el-descriptions>

      <h3>{{ t('order.ordered') }}</h3>
      <div v-for="batch in order.batches" :key="batch.id" class="batch">
        <div class="batch-h">{{ t('order.round', { n: batch.roundNo }) }}</div>
        <el-table :data="batch.items" size="small">
          <el-table-column :label="t('order.itemName')" min-width="180">
            <template #default="{ row }">
              <div>{{ nameOf(row) }}</div>
              <div
                v-for="(line, idx) in snapshotLines(row.optionsSnapshot)"
                :key="idx"
                class="snap"
              >
                · {{ line }}
              </div>
            </template>
          </el-table-column>
          <el-table-column prop="qty" :label="t('order.qty')" width="70" />
          <el-table-column :label="t('order.unitPrice')" width="120">
            <template #default="{ row }">{{ formatVND(row.unitPrice) }}</template>
          </el-table-column>
          <el-table-column :label="t('order.amount')" width="120">
            <template #default="{ row }">{{ formatVND(row.amount) }}</template>
          </el-table-column>
          <el-table-column prop="status" :label="t('order.filterStatus')" width="100" />
          <el-table-column prop="voidReason" :label="t('order.voidReason')" min-width="120" />
        </el-table>
      </div>
      <el-table
        v-if="!order.batches?.length && order.items?.length"
        :data="order.items"
        size="small"
      >
        <el-table-column :label="t('order.itemName')" min-width="180">
          <template #default="{ row }">
            <div>{{ nameOf(row) }}</div>
            <div
              v-for="(line, idx) in snapshotLines(row.optionsSnapshot)"
              :key="idx"
              class="snap"
            >
              · {{ line }}
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="qty" :label="t('order.qty')" width="70" />
        <el-table-column :label="t('order.unitPrice')" width="120">
          <template #default="{ row }">{{ formatVND(row.unitPrice) }}</template>
        </el-table-column>
        <el-table-column :label="t('order.amount')" width="120">
          <template #default="{ row }">{{ formatVND(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="status" :label="t('order.filterStatus')" width="100" />
      </el-table>

      <h3 v-if="order.payments.length">{{ t('order.payments') }}</h3>
      <el-table v-if="order.payments.length" :data="order.payments" size="small">
        <el-table-column :label="t('order.payMethod')">
          <template #default="{ row }">{{ methodLabel(row.method) }}</template>
        </el-table-column>
        <el-table-column :label="t('order.amount')">
          <template #default="{ row }">{{ formatVND(row.amount) }}</template>
        </el-table-column>
        <el-table-column :label="t('order.received')">
          <template #default="{ row }">{{ formatVND(row.received) }}</template>
        </el-table-column>
        <el-table-column :label="t('order.change')">
          <template #default="{ row }">{{ formatVND(row.change) }}</template>
        </el-table-column>
      </el-table>

      <h3 v-if="order.refunds?.length">{{ t('order.refunds') }}</h3>
      <el-table v-if="order.refunds?.length" :data="order.refunds" size="small">
        <el-table-column :label="t('order.payMethod')">
          <template #default="{ row }">{{ methodLabel(row.method) }}</template>
        </el-table-column>
        <el-table-column :label="t('order.amount')">
          <template #default="{ row }">{{ formatVND(row.amount) }}</template>
        </el-table-column>
        <el-table-column prop="reason" :label="t('order.refundReason')" min-width="160" />
        <el-table-column :label="t('order.createdAt')" width="180">
          <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="100" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="userStore.hasPerm('order:refund')"
              link
              type="primary"
              @click="printRefundTicket(row.id)"
            >
              {{ t('order.printTicket') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <el-dialog v-model="refundVisible" :title="t('order.refund')" width="420px" destroy-on-close>
      <el-form label-width="96px">
        <el-form-item :label="t('order.refundAmount')">
          <el-input-number
            v-model="refundForm.amount"
            :min="1"
            :max="order?.paidAmount || 1"
            :step="1000"
            controls-position="right"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item :label="t('order.payMethod')">
          <el-select v-model="refundForm.method" style="width: 100%">
            <el-option
              v-for="m in payMethods"
              :key="m"
              :label="methodLabel(m)"
              :value="m"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('order.refundReason')">
          <el-input
            v-model="refundForm.reason"
            type="textarea"
            :rows="3"
            maxlength="512"
            show-word-limit
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="refundVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="danger" :loading="refundSubmitting" @click="submitRefund">
          {{ t('order.confirmRefund') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  padding: 12px 16px 24px;
}
.head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 12px;
}
.head-actions {
  display: flex;
  gap: 8px;
}
.batch {
  margin-bottom: 16px;
}
.batch-h {
  font-weight: 600;
  margin: 8px 0;
}
.snap {
  color: #909399;
  font-size: 12px;
  line-height: 1.4;
}
h3 {
  margin: 20px 0 8px;
}
</style>

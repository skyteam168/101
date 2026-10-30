<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';
import { formatVND, localeField } from '@restaurant/shared';
import { getOrderApi, reverseCheckoutApi, type Order } from '../../api/order';
import { useUserStore } from '../../stores/user';

const { t, locale } = useI18n();
const route = useRoute();
const router = useRouter();
const userStore = useUserStore();
const order = ref<Order | null>(null);
const loading = ref(false);

function nameOf(row: { nameZh: string; nameVi: string }) {
  const loc = locale.value === 'vi-VN' ? 'vi' : 'zh';
  return localeField(row as unknown as Record<string, unknown>, 'name', loc);
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

onMounted(load);
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="head">
      <el-button text @click="router.push('/orders')">← {{ t('order.backList') }}</el-button>
      <el-button
        v-if="order?.status === 'paid' && userStore.hasPerm('order:checkout')"
        type="warning"
        @click="reverse"
      >
        {{ t('order.reverseCheckout') }}
      </el-button>
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
        <el-descriptions-item :label="t('order.subtotal')">{{ formatVND(order.subtotal) }}</el-descriptions-item>
        <el-descriptions-item :label="t('order.discountAmount')">{{ formatVND(order.discount) }}</el-descriptions-item>
        <el-descriptions-item :label="t('order.serviceCharge')">{{ formatVND(order.serviceCharge) }}</el-descriptions-item>
        <el-descriptions-item :label="t('order.billTotal')">{{ formatVND(order.total) }}</el-descriptions-item>
        <el-descriptions-item :label="t('order.paidAmount')">{{ formatVND(order.paidAmount) }}</el-descriptions-item>
        <el-descriptions-item :label="t('order.createdAt')">
          {{ new Date(order.createdAt).toLocaleString() }}
        </el-descriptions-item>
      </el-descriptions>

      <h3>{{ t('order.ordered') }}</h3>
      <div v-for="batch in order.batches" :key="batch.id" class="batch">
        <div class="batch-h">{{ t('order.round', { n: batch.roundNo }) }}</div>
        <el-table :data="batch.items" size="small">
          <el-table-column :label="t('order.itemName')">
            <template #default="{ row }">{{ nameOf(row) }}</template>
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

      <h3 v-if="order.payments.length">{{ t('order.payments') }}</h3>
      <el-table v-if="order.payments.length" :data="order.payments" size="small">
        <el-table-column prop="method" :label="t('order.payMethod')" />
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
    </template>
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
.batch {
  margin-bottom: 16px;
}
.batch-h {
  font-weight: 600;
  margin: 8px 0;
}
h3 {
  margin: 20px 0 8px;
}
</style>

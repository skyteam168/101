<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { formatVND } from '@restaurant/shared';
import { listOrdersApi, type Order } from '../../api/order';

const { t } = useI18n();
const router = useRouter();
const loading = ref(false);
const rows = ref<Order[]>([]);
const total = ref(0);
const query = reactive({
  date: '',
  type: '',
  status: '',
  tableCode: '',
  page: 1,
  pageSize: 20,
});

async function load() {
  loading.value = true;
  try {
    const res = await listOrdersApi({
      date: query.date || undefined,
      type: query.type || undefined,
      status: query.status || undefined,
      tableCode: query.tableCode || undefined,
      page: query.page,
      pageSize: query.pageSize,
    });
    rows.value = res.list;
    total.value = res.total;
  } finally {
    loading.value = false;
  }
}

function statusLabel(s: string) {
  return t(`order.status.${s}`, s);
}

onMounted(load);
</script>

<template>
  <div class="page">
    <el-form inline class="filters">
      <el-form-item :label="t('order.filterDate')">
        <el-date-picker
          v-model="query.date"
          type="date"
          value-format="YYYY-MM-DD"
          :placeholder="t('order.filterDate')"
          clearable
        />
      </el-form-item>
      <el-form-item :label="t('order.filterType')">
        <el-select v-model="query.type" clearable style="width: 120px">
          <el-option value="dine_in" :label="t('order.type.dine_in')" />
          <el-option value="takeaway" :label="t('order.type.takeaway')" />
          <el-option value="delivery" :label="t('order.type.delivery')" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('order.filterStatus')">
        <el-select v-model="query.status" clearable style="width: 120px">
          <el-option value="open" :label="statusLabel('open')" />
          <el-option value="paid" :label="statusLabel('paid')" />
          <el-option value="cancelled" :label="statusLabel('cancelled')" />
        </el-select>
      </el-form-item>
      <el-form-item :label="t('order.filterTable')">
        <el-input v-model="query.tableCode" clearable style="width: 100px" />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" @click="query.page = 1; load()">{{ t('common.search') }}</el-button>
      </el-form-item>
    </el-form>

    <el-table v-loading="loading" :data="rows" stripe @row-click="(row: Order) => router.push(`/orders/${row.id}`)">
      <el-table-column prop="orderNo" :label="t('order.orderNo')" min-width="160" />
      <el-table-column prop="tableCode" :label="t('order.filterTable')" width="90" />
      <el-table-column :label="t('order.filterType')" width="100">
        <template #default="{ row }">{{ t(`order.type.${row.type}`, row.type) }}</template>
      </el-table-column>
      <el-table-column :label="t('order.filterStatus')" width="100">
        <template #default="{ row }">{{ statusLabel(row.status) }}</template>
      </el-table-column>
      <el-table-column :label="t('order.billTotal')" width="120">
        <template #default="{ row }">{{ formatVND(row.total) }}</template>
      </el-table-column>
      <el-table-column prop="createdAt" :label="t('order.createdAt')" min-width="170">
        <template #default="{ row }">{{ new Date(row.createdAt).toLocaleString() }}</template>
      </el-table-column>
    </el-table>

    <div class="pager">
      <el-pagination
        v-model:current-page="query.page"
        v-model:page-size="query.pageSize"
        layout="total, prev, pager, next"
        :total="total"
        @current-change="load"
      />
    </div>
  </div>
</template>

<style scoped>
.page {
  padding: 12px 16px;
}
.filters {
  margin-bottom: 8px;
}
.pager {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
:deep(.el-table__row) {
  cursor: pointer;
}
</style>

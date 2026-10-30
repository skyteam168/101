<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import { formatVND, localeField } from '@restaurant/shared';
import {
  listGroupMealInquiriesApi,
  updateGroupMealInquiryApi,
  type GroupMealInquiry,
} from '../../api/group-meal';

const { t, locale } = useI18n();
const loc = () => (locale.value === 'vi-VN' ? 'vi' : 'zh');
const loading = ref(false);
const status = ref('');
const list = ref<GroupMealInquiry[]>([]);

async function refresh() {
  loading.value = true;
  try {
    const res = await listGroupMealInquiriesApi(status.value ? { status: status.value } : undefined);
    list.value = res.list || [];
  } finally {
    loading.value = false;
  }
}

async function setStatus(row: GroupMealInquiry, next: string) {
  await updateGroupMealInquiryApi(row.id, { status: next });
  ElMessage.success(t('common.saved'));
  await refresh();
}

onMounted(refresh);
</script>

<template>
  <div class="page">
    <div class="toolbar">
      <el-select v-model="status" clearable :placeholder="t('common.status')" style="width: 160px" @change="refresh">
        <el-option :label="t('groupMeal.status.pending')" value="pending" />
        <el-option :label="t('groupMeal.status.confirmed')" value="confirmed" />
        <el-option :label="t('groupMeal.status.rejected')" value="rejected" />
        <el-option :label="t('groupMeal.status.cancelled')" value="cancelled" />
      </el-select>
      <el-button @click="refresh">{{ t('common.search') }}</el-button>
    </div>
    <el-table v-loading="loading" :data="list" border>
      <el-table-column :label="t('groupMeal.contact')" min-width="120">
        <template #default="{ row }">
          <div>{{ row.contactName }}</div>
          <div class="muted">{{ row.phone }}</div>
        </template>
      </el-table-column>
      <el-table-column prop="company" :label="t('groupMeal.company')" min-width="100" />
      <el-table-column prop="guestCount" :label="t('groupMeal.guestCount')" width="90" />
      <el-table-column :label="t('groupMeal.preferAt')" min-width="150">
        <template #default="{ row }">{{ row.preferAt?.slice(0, 16).replace('T', ' ') }}</template>
      </el-table-column>
      <el-table-column :label="t('groupMeal.combo')" min-width="120">
        <template #default="{ row }">
          {{
            row.comboNameZh
              ? localeField({ nameZh: row.comboNameZh, nameVi: row.comboNameVi || '' }, 'name', loc())
              : '-'
          }}
        </template>
      </el-table-column>
      <el-table-column :label="t('groupMeal.budget')" width="120">
        <template #default="{ row }">{{ row.budget != null ? formatVND(row.budget) : '-' }}</template>
      </el-table-column>
      <el-table-column prop="status" :label="t('common.status')" width="110">
        <template #default="{ row }">{{ t(`groupMeal.status.${row.status}`) }}</template>
      </el-table-column>
      <el-table-column :label="t('common.actions')" width="200" fixed="right">
        <template #default="{ row }">
          <el-button
            v-if="row.status === 'pending'"
            v-perm="'group_meal:edit'"
            link
            type="success"
            @click="setStatus(row, 'confirmed')"
          >
            {{ t('groupMeal.confirm') }}
          </el-button>
          <el-button
            v-if="row.status === 'pending'"
            v-perm="'group_meal:edit'"
            link
            type="danger"
            @click="setStatus(row, 'rejected')"
          >
            {{ t('groupMeal.reject') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>
  </div>
</template>

<style scoped>
.page {
  padding: 16px;
}
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.muted {
  color: #909399;
  font-size: 12px;
}
</style>

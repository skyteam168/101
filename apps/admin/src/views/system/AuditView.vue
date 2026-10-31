<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  listCustomerLoginLogsApi,
  listLoginLogsApi,
  listOperationLogsApi,
  type CustomerLoginLogRow,
  type LoginLogRow,
  type OperationLogRow,
} from '../../api/audit';

const { t } = useI18n();
const activeTab = ref('login');

const loginLoading = ref(false);
const loginRows = ref<LoginLogRow[]>([]);
const loginTotal = ref(0);
const loginQuery = reactive({
  page: 1,
  pageSize: 20,
  username: '',
  result: '',
  ip: '',
  range: null as [Date, Date] | null,
});

const custLoading = ref(false);
const custRows = ref<CustomerLoginLogRow[]>([]);
const custTotal = ref(0);
const custQuery = reactive({
  page: 1,
  pageSize: 20,
  email: '',
  action: '',
  result: '',
  ip: '',
  range: null as [Date, Date] | null,
});

const opLoading = ref(false);
const opRows = ref<OperationLogRow[]>([]);
const opTotal = ref(0);
const opQuery = reactive({
  page: 1,
  pageSize: 20,
  username: '',
  module: '',
  action: '',
  targetType: '',
  targetId: '',
  range: null as [Date, Date] | null,
});

const detailVisible = ref(false);
const detailRow = ref<OperationLogRow | null>(null);

function rangeParams(range: [Date, Date] | null) {
  if (!range) return {};
  return {
    from: range[0].toISOString(),
    to: range[1].toISOString(),
  };
}

async function loadLogin() {
  loginLoading.value = true;
  try {
    const data = await listLoginLogsApi({
      page: loginQuery.page,
      pageSize: loginQuery.pageSize,
      username: loginQuery.username || undefined,
      result: loginQuery.result || undefined,
      ip: loginQuery.ip || undefined,
      ...rangeParams(loginQuery.range),
    });
    loginRows.value = data.list;
    loginTotal.value = data.total;
  } finally {
    loginLoading.value = false;
  }
}

async function loadCustomer() {
  custLoading.value = true;
  try {
    const data = await listCustomerLoginLogsApi({
      page: custQuery.page,
      pageSize: custQuery.pageSize,
      email: custQuery.email || undefined,
      action: custQuery.action || undefined,
      result: custQuery.result || undefined,
      ip: custQuery.ip || undefined,
      ...rangeParams(custQuery.range),
    });
    custRows.value = data.list;
    custTotal.value = data.total;
  } finally {
    custLoading.value = false;
  }
}

async function loadOps() {
  opLoading.value = true;
  try {
    const data = await listOperationLogsApi({
      page: opQuery.page,
      pageSize: opQuery.pageSize,
      username: opQuery.username || undefined,
      module: opQuery.module || undefined,
      action: opQuery.action || undefined,
      targetType: opQuery.targetType || undefined,
      targetId: opQuery.targetId || undefined,
      ...rangeParams(opQuery.range),
    });
    opRows.value = data.list;
    opTotal.value = data.total;
  } finally {
    opLoading.value = false;
  }
}

function resetLogin() {
  Object.assign(loginQuery, {
    page: 1,
    username: '',
    result: '',
    ip: '',
    range: null,
  });
  loadLogin();
}

function resetCustomer() {
  Object.assign(custQuery, {
    page: 1,
    email: '',
    action: '',
    result: '',
    ip: '',
    range: null,
  });
  loadCustomer();
}

function resetOps() {
  Object.assign(opQuery, {
    page: 1,
    username: '',
    module: '',
    action: '',
    targetType: '',
    targetId: '',
    range: null,
  });
  loadOps();
}

function openDetail(row: OperationLogRow) {
  detailRow.value = row;
  detailVisible.value = true;
}

function resultLabel(r: string) {
  return t(`audit.result.${r}`);
}

function customerActionLabel(a: string) {
  const key = `audit.customerAction.${a}`;
  const label = t(key);
  return label === key ? a : label;
}

onMounted(() => {
  loadLogin();
});

function onTabChange(name: string | number) {
  if (name === 'customer' && !custRows.value.length) loadCustomer();
  if (name === 'ops' && !opRows.value.length) loadOps();
}
</script>

<template>
  <div class="page">
    <div class="page-head">
      <h2>{{ t('audit.title') }}</h2>
      <p class="hint">{{ t('audit.subtitle') }}</p>
    </div>

    <el-tabs v-model="activeTab" @tab-change="onTabChange">
      <el-tab-pane :label="t('audit.loginTab')" name="login">
        <el-form :inline="true" class="filters" @submit.prevent="loadLogin">
          <el-form-item :label="t('audit.username')">
            <el-input v-model="loginQuery.username" clearable style="width: 140px" />
          </el-form-item>
          <el-form-item :label="t('audit.resultLabel')">
            <el-select v-model="loginQuery.result" clearable style="width: 120px">
              <el-option :label="t('audit.result.success')" value="success" />
              <el-option :label="t('audit.result.fail')" value="fail" />
              <el-option :label="t('audit.result.logout')" value="logout" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('audit.ip')">
            <el-input v-model="loginQuery.ip" clearable style="width: 130px" />
          </el-form-item>
          <el-form-item :label="t('audit.time')">
            <el-date-picker
              v-model="loginQuery.range"
              type="datetimerange"
              value-format=""
              :start-placeholder="t('audit.from')"
              :end-placeholder="t('audit.to')"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="((loginQuery.page = 1), loadLogin())">
              {{ t('common.search') }}
            </el-button>
            <el-button @click="resetLogin">{{ t('common.reset') }}</el-button>
          </el-form-item>
        </el-form>

        <el-table v-loading="loginLoading" :data="loginRows" border stripe>
          <el-table-column prop="createdAt" :label="t('audit.time')" min-width="170" />
          <el-table-column prop="username" :label="t('audit.username')" width="120" />
          <el-table-column :label="t('audit.resultLabel')" width="100">
            <template #default="{ row }">
              <el-tag
                :type="
                  row.result === 'success' ? 'success' : row.result === 'fail' ? 'danger' : 'info'
                "
                size="small"
              >
                {{ resultLabel(row.result) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="failReason" :label="t('audit.failReason')" min-width="140" />
          <el-table-column prop="ip" :label="t('audit.ip')" width="130" />
          <el-table-column prop="userAgent" :label="t('audit.userAgent')" min-width="200" show-overflow-tooltip />
        </el-table>

        <div class="pager">
          <el-pagination
            v-model:current-page="loginQuery.page"
            v-model:page-size="loginQuery.pageSize"
            layout="total, sizes, prev, pager, next"
            :total="loginTotal"
            :page-sizes="[20, 50, 100]"
            @current-change="loadLogin"
            @size-change="((loginQuery.page = 1), loadLogin())"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('audit.customerTab')" name="customer">
        <el-form :inline="true" class="filters" @submit.prevent="loadCustomer">
          <el-form-item :label="t('audit.email')">
            <el-input v-model="custQuery.email" clearable style="width: 180px" />
          </el-form-item>
          <el-form-item :label="t('audit.action')">
            <el-select v-model="custQuery.action" clearable style="width: 140px">
              <el-option :label="t('audit.customerAction.register')" value="register" />
              <el-option :label="t('audit.customerAction.login')" value="login" />
              <el-option :label="t('audit.customerAction.login_code')" value="login_code" />
              <el-option :label="t('audit.customerAction.google')" value="google" />
              <el-option :label="t('audit.customerAction.logout')" value="logout" />
              <el-option :label="t('audit.customerAction.password_change')" value="password_change" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('audit.resultLabel')">
            <el-select v-model="custQuery.result" clearable style="width: 120px">
              <el-option :label="t('audit.result.success')" value="success" />
              <el-option :label="t('audit.result.fail')" value="fail" />
              <el-option :label="t('audit.result.logout')" value="logout" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('audit.ip')">
            <el-input v-model="custQuery.ip" clearable style="width: 130px" />
          </el-form-item>
          <el-form-item :label="t('audit.time')">
            <el-date-picker
              v-model="custQuery.range"
              type="datetimerange"
              :start-placeholder="t('audit.from')"
              :end-placeholder="t('audit.to')"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="((custQuery.page = 1), loadCustomer())">
              {{ t('common.search') }}
            </el-button>
            <el-button @click="resetCustomer">{{ t('common.reset') }}</el-button>
          </el-form-item>
        </el-form>

        <el-table v-loading="custLoading" :data="custRows" border stripe>
          <el-table-column prop="createdAt" :label="t('audit.time')" min-width="170" />
          <el-table-column prop="email" :label="t('audit.email')" min-width="180" />
          <el-table-column :label="t('audit.action')" width="130">
            <template #default="{ row }">
              {{ customerActionLabel(row.action) }}
            </template>
          </el-table-column>
          <el-table-column :label="t('audit.resultLabel')" width="100">
            <template #default="{ row }">
              <el-tag
                :type="
                  row.result === 'success' ? 'success' : row.result === 'fail' ? 'danger' : 'info'
                "
                size="small"
              >
                {{ resultLabel(row.result) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column prop="failReason" :label="t('audit.failReason')" min-width="140" />
          <el-table-column prop="ip" :label="t('audit.ip')" width="130" />
          <el-table-column prop="userAgent" :label="t('audit.userAgent')" min-width="200" show-overflow-tooltip />
        </el-table>

        <div class="pager">
          <el-pagination
            v-model:current-page="custQuery.page"
            v-model:page-size="custQuery.pageSize"
            layout="total, sizes, prev, pager, next"
            :total="custTotal"
            :page-sizes="[20, 50, 100]"
            @current-change="loadCustomer"
            @size-change="((custQuery.page = 1), loadCustomer())"
          />
        </div>
      </el-tab-pane>

      <el-tab-pane :label="t('audit.opsTab')" name="ops">
        <el-form :inline="true" class="filters" @submit.prevent="loadOps">
          <el-form-item :label="t('audit.username')">
            <el-input v-model="opQuery.username" clearable style="width: 140px" />
          </el-form-item>
          <el-form-item :label="t('audit.module')">
            <el-input v-model="opQuery.module" clearable style="width: 120px" />
          </el-form-item>
          <el-form-item :label="t('audit.action')">
            <el-input v-model="opQuery.action" clearable style="width: 140px" />
          </el-form-item>
          <el-form-item :label="t('audit.targetType')">
            <el-input v-model="opQuery.targetType" clearable style="width: 120px" />
          </el-form-item>
          <el-form-item :label="t('audit.targetId')">
            <el-input v-model="opQuery.targetId" clearable style="width: 100px" />
          </el-form-item>
          <el-form-item :label="t('audit.time')">
            <el-date-picker
              v-model="opQuery.range"
              type="datetimerange"
              :start-placeholder="t('audit.from')"
              :end-placeholder="t('audit.to')"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" @click="((opQuery.page = 1), loadOps())">
              {{ t('common.search') }}
            </el-button>
            <el-button @click="resetOps">{{ t('common.reset') }}</el-button>
          </el-form-item>
        </el-form>

        <el-table v-loading="opLoading" :data="opRows" border stripe>
          <el-table-column prop="createdAt" :label="t('audit.time')" min-width="170" />
          <el-table-column prop="username" :label="t('audit.username')" width="110" />
          <el-table-column prop="displayName" :label="t('audit.displayName')" width="110" />
          <el-table-column prop="module" :label="t('audit.module')" width="100" />
          <el-table-column prop="action" :label="t('audit.action')" min-width="140" />
          <el-table-column prop="targetType" :label="t('audit.targetType')" width="110" />
          <el-table-column prop="targetId" :label="t('audit.targetId')" width="90" />
          <el-table-column prop="ip" :label="t('audit.ip')" width="120" />
          <el-table-column :label="t('common.actions')" width="90" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" @click="openDetail(row)">
                {{ t('audit.detail') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>

        <div class="pager">
          <el-pagination
            v-model:current-page="opQuery.page"
            v-model:page-size="opQuery.pageSize"
            layout="total, sizes, prev, pager, next"
            :total="opTotal"
            :page-sizes="[20, 50, 100]"
            @current-change="loadOps"
            @size-change="((opQuery.page = 1), loadOps())"
          />
        </div>
      </el-tab-pane>
    </el-tabs>

    <el-drawer v-model="detailVisible" :title="t('audit.detail')" size="480px">
      <template v-if="detailRow">
        <p><strong>{{ t('audit.action') }}:</strong> {{ detailRow.action }}</p>
        <p><strong>{{ t('audit.targetType') }}:</strong> {{ detailRow.targetType }} / {{ detailRow.targetId }}</p>
        <h4>before</h4>
        <pre class="json">{{ JSON.stringify(detailRow.before, null, 2) }}</pre>
        <h4>after</h4>
        <pre class="json">{{ JSON.stringify(detailRow.after, null, 2) }}</pre>
      </template>
    </el-drawer>
  </div>
</template>

<style scoped>
.page {
  padding: 16px 20px;
}
.page-head h2 {
  margin: 0 0 4px;
  font-size: 20px;
}
.hint {
  margin: 0 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}
.filters {
  margin-bottom: 12px;
}
.pager {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
.json {
  background: var(--el-fill-color-light);
  padding: 12px;
  border-radius: 6px;
  font-size: 12px;
  overflow: auto;
  max-height: 280px;
}
</style>

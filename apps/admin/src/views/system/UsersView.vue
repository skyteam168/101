<script setup lang="ts">
import { isPasswordComplex } from '@restaurant/shared';
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import { listRolesBriefApi, type RoleRow } from '../../api/rbac';
import {
  createUserApi,
  listUsersApi,
  resetUserPasswordApi,
  setUserStatusApi,
  updateUserApi,
  type UserRow,
} from '../../api/user';

const { t } = useI18n();
const loading = ref(false);
const rows = ref<UserRow[]>([]);
const roles = ref<RoleRow[]>([]);
const dialogVisible = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({
  username: '',
  password: '',
  displayName: '',
  phone: '',
  lang: 'zh',
  roleIds: [] as string[],
});

async function load() {
  loading.value = true;
  try {
    rows.value = await listUsersApi();
    roles.value = await listRolesBriefApi().catch(() => []);
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, {
    username: '',
    password: 'Cashier@123',
    displayName: '',
    phone: '',
    lang: 'zh',
    roleIds: [],
  });
  dialogVisible.value = true;
}

function openEdit(row: UserRow) {
  editingId.value = row.id;
  Object.assign(form, {
    username: row.username,
    password: '',
    displayName: row.displayName,
    phone: row.phone || '',
    lang: row.lang,
    roleIds: row.roles.map((r) => r.id),
  });
  dialogVisible.value = true;
}

async function save() {
  if (editingId.value) {
    await updateUserApi(editingId.value, {
      displayName: form.displayName,
      phone: form.phone,
      lang: form.lang,
      roleIds: form.roleIds,
    });
  } else {
    if (!isPasswordComplex(form.password)) {
      ElMessage.warning(t('auth.passwordTooWeak'));
      return;
    }
    await createUserApi({ ...form });
  }
  ElMessage.success(t('common.saved'));
  dialogVisible.value = false;
  await load();
}

async function toggleStatus(row: UserRow) {
  const next = row.status === 'active' ? 'disabled' : 'active';
  await setUserStatusApi(row.id, next);
  ElMessage.success(t('common.saved'));
  await load();
}

async function resetPwd(row: UserRow) {
  const { value } = await ElMessageBox.prompt(t('users.newPassword'), t('users.resetPassword'), {
    inputValue: 'Cashier@123',
    inputPlaceholder: t('auth.passwordHint'),
    inputValidator: (v) => (isPasswordComplex(v || '') ? true : t('auth.passwordTooWeak')),
  });
  await resetUserPasswordApi(row.id, value);
  ElMessage.success(t('common.saved'));
}

onMounted(load);
</script>

<template>
  <el-card>
    <div class="toolbar">
      <h3>{{ t('menu.users') }}</h3>
      <el-button v-perm="'menu:system:user'" type="primary" @click="openCreate">
        {{ t('common.create') }}
      </el-button>
    </div>
    <el-table v-loading="loading" :data="rows" border>
      <el-table-column prop="username" :label="t('auth.username')" width="140" />
      <el-table-column prop="displayName" :label="t('users.displayName')" />
      <el-table-column prop="phone" :label="t('users.phone')" width="140" />
      <el-table-column :label="t('users.roles')">
        <template #default="{ row }">
          {{ row.roles.map((r: UserRow['roles'][number]) => r.nameZh).join(', ') }}
        </template>
      </el-table-column>
      <el-table-column prop="status" :label="t('users.status')" width="100" />
      <el-table-column :label="t('common.actions')" width="260">
        <template #default="{ row }">
          <el-button v-perm="'menu:system:user'" link type="primary" @click="openEdit(row)">
            {{ t('common.edit') }}
          </el-button>
          <el-button v-perm="'menu:system:user'" link @click="toggleStatus(row)">
            {{ row.status === 'active' ? t('users.disable') : t('users.enable') }}
          </el-button>
          <el-button v-perm="'menu:system:user'" link @click="resetPwd(row)">
            {{ t('users.resetPassword') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog v-model="dialogVisible" :title="editingId ? t('common.edit') : t('common.create')">
      <el-form label-width="100px">
        <el-form-item :label="t('auth.username')">
          <el-input v-model="form.username" :disabled="!!editingId" />
        </el-form-item>
        <el-form-item v-if="!editingId" :label="t('auth.password')">
          <el-input
            v-model="form.password"
            type="password"
            show-password
            :placeholder="t('auth.passwordHint')"
          />
        </el-form-item>
        <el-form-item :label="t('users.displayName')">
          <el-input v-model="form.displayName" />
        </el-form-item>
        <el-form-item :label="t('users.phone')">
          <el-input v-model="form.phone" />
        </el-form-item>
        <el-form-item :label="t('users.roles')">
          <el-select v-model="form.roleIds" multiple style="width: 100%">
            <el-option v-for="r in roles" :key="r.id" :label="r.nameZh" :value="r.id" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="save">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </el-card>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
</style>

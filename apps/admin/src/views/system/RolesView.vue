<script setup lang="ts">
import { nextTick, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox, ElTree } from 'element-plus';
import { localeField } from '@restaurant/shared';
import {
  createRoleApi,
  deleteRoleApi,
  listRolesApi,
  permissionTreeApi,
  rolePermissionIdsApi,
  setRolePermissionsApi,
  updateRoleApi,
  type PermNode,
  type RoleRow,
} from '../../api/rbac';

const { t, locale } = useI18n();
const loading = ref(false);
const roles = ref<RoleRow[]>([]);
const tree = ref<PermNode[]>([]);
const currentRoleId = ref<string>('');
const checkedIds = ref<string[]>([]);
const treeRef = ref<InstanceType<typeof ElTree>>();
const dialogVisible = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({ code: '', nameZh: '', nameVi: '' });

function label(node: PermNode) {
  return localeField(node as unknown as Record<string, unknown>, 'name', locale.value === 'vi-VN' ? 'vi' : 'zh');
}

async function load() {
  loading.value = true;
  try {
    roles.value = await listRolesApi();
    tree.value = await permissionTreeApi();
    if (!currentRoleId.value && roles.value.length) {
      await selectRole(roles.value[0].id);
    }
  } finally {
    loading.value = false;
  }
}

async function selectRole(id: string) {
  currentRoleId.value = id;
  checkedIds.value = await rolePermissionIdsApi(id);
  await nextTick();
  // leafOnly=true：避免把半选父节点当全选，刷新后子节点被全部勾上
  treeRef.value?.setCheckedKeys(checkedIds.value, true);
}

function openCreate() {
  editingId.value = null;
  Object.assign(form, { code: '', nameZh: '', nameVi: '' });
  dialogVisible.value = true;
}

function openEdit(row: RoleRow) {
  editingId.value = row.id;
  Object.assign(form, { code: row.code, nameZh: row.nameZh, nameVi: row.nameVi });
  dialogVisible.value = true;
}

async function saveRole() {
  if (editingId.value) {
    await updateRoleApi(editingId.value, { nameZh: form.nameZh, nameVi: form.nameVi });
  } else {
    await createRoleApi({ ...form });
  }
  ElMessage.success(t('common.saved'));
  dialogVisible.value = false;
  await load();
}

async function removeRole(row: RoleRow) {
  await ElMessageBox.confirm(t('common.confirmDelete'), { type: 'warning' });
  await deleteRoleApi(row.id);
  ElMessage.success(t('common.saved'));
  if (currentRoleId.value === row.id) currentRoleId.value = '';
  await load();
}

async function savePerms() {
  if (!currentRoleId.value) return;
  // 全选节点 + 半选父节点（菜单需入库才能出现在侧栏）
  const keys = [
    ...new Set([
      ...((treeRef.value?.getCheckedKeys(false) as string[]) || []),
      ...((treeRef.value?.getHalfCheckedKeys() as string[]) || []),
    ]),
  ].map(String);
  await setRolePermissionsApi(currentRoleId.value, keys);
  checkedIds.value = await rolePermissionIdsApi(currentRoleId.value);
  await nextTick();
  treeRef.value?.setCheckedKeys(checkedIds.value, true);
  ElMessage.success(t('common.saved'));
}

onMounted(load);
</script>

<template>
  <el-row :gutter="16">
    <el-col :span="10">
      <el-card v-loading="loading">
        <div class="toolbar">
          <h3>{{ t('menu.roles') }}</h3>
          <el-button v-perm="'system:role'" type="primary" @click="openCreate">
            {{ t('common.create') }}
          </el-button>
        </div>
        <el-table :data="roles" highlight-current-row @current-change="(r: RoleRow) => r && selectRole(r.id)">
          <el-table-column prop="code" label="Code" width="140" />
          <el-table-column prop="nameZh" :label="t('roles.nameZh')" />
          <el-table-column :label="t('common.actions')" width="140">
            <template #default="{ row }">
              <el-button v-perm="'system:role'" link type="primary" @click="openEdit(row)">
                {{ t('common.edit') }}
              </el-button>
              <el-button
                v-if="!row.isSystem"
                v-perm="'system:role'"
                link
                type="danger"
                @click="removeRole(row)"
              >
                {{ t('common.delete') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </el-col>
    <el-col :span="14">
      <el-card>
        <div class="toolbar">
          <h3>{{ t('roles.permissions') }}</h3>
          <el-button v-perm="'system:role'" type="primary" :disabled="!currentRoleId" @click="savePerms">
            {{ t('common.save') }}
          </el-button>
        </div>
        <el-tree
          ref="treeRef"
          :data="tree"
          node-key="id"
          show-checkbox
          default-expand-all
          :props="{ label: 'nameZh', children: 'children' }"
        >
          <template #default="{ data }">
            <span>{{ label(data) }} <small class="code">{{ data.code }}</small></span>
          </template>
        </el-tree>
      </el-card>
    </el-col>
  </el-row>

  <el-dialog v-model="dialogVisible" :title="editingId ? t('common.edit') : t('common.create')">
    <el-form label-width="100px">
      <el-form-item label="Code">
        <el-input v-model="form.code" :disabled="!!editingId" />
      </el-form-item>
      <el-form-item :label="t('roles.nameZh')">
        <el-input v-model="form.nameZh" />
      </el-form-item>
      <el-form-item :label="t('roles.nameVi')">
        <el-input v-model="form.nameVi" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" @click="saveRole">{{ t('common.save') }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.code {
  color: #909399;
  margin-left: 8px;
}
</style>

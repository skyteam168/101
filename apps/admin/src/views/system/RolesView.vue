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
const saving = ref(false);
const roles = ref<RoleRow[]>([]);
const tree = ref<PermNode[]>([]);
const currentRoleId = ref<string>('');
const currentRole = ref<RoleRow | null>(null);
const treeRef = ref<InstanceType<typeof ElTree>>();
const dialogVisible = ref(false);
const editingId = ref<string | null>(null);
const form = reactive({ code: '', nameZh: '', nameVi: '' });

function label(node: PermNode) {
  return localeField(node as unknown as Record<string, unknown>, 'name', locale.value === 'vi-VN' ? 'vi' : 'zh');
}

/** 收集节点祖先 id，保证侧栏菜单父级也会入库 */
function collectAncestorIds(nodes: PermNode[], selected: Set<string>, parentIds: string[] = []): string[] {
  const extra: string[] = [];
  for (const n of nodes) {
    const path = [...parentIds, n.id];
    if (selected.has(n.id)) {
      for (const pid of parentIds) {
        if (!selected.has(pid)) extra.push(pid);
      }
    }
    if (n.children?.length) {
      extra.push(...collectAncestorIds(n.children, selected, path));
    }
  }
  return extra;
}

async function load() {
  loading.value = true;
  try {
    roles.value = await listRolesApi();
    tree.value = await permissionTreeApi();
    const keep = currentRoleId.value;
    if (keep && roles.value.some((r) => r.id === keep)) {
      await selectRole(keep);
    } else if (roles.value.length) {
      // 默认选第一个非超管角色，避免误以为超管可改
      const first = roles.value.find((r) => r.code !== 'super_admin') || roles.value[0];
      await selectRole(first.id);
    }
  } finally {
    loading.value = false;
  }
}

async function selectRole(id: string) {
  currentRoleId.value = id;
  currentRole.value = roles.value.find((r) => r.id === id) || null;
  const ids = await rolePermissionIdsApi(id);
  await nextTick();
  // check-strictly：父子独立，按库里存的 id 精确勾选，不会串改
  treeRef.value?.setCheckedKeys(ids, false);
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
  if (currentRoleId.value === row.id) {
    currentRoleId.value = '';
    currentRole.value = null;
  }
  await load();
}

async function savePerms() {
  if (!currentRoleId.value) return;
  if (currentRole.value?.code === 'super_admin') {
    ElMessage.warning(t('roles.superAdminLocked'));
    return;
  }
  saving.value = true;
  try {
    const checked = new Set(
      ((treeRef.value?.getCheckedKeys(false) as Array<string | number>) || []).map(String),
    );
    for (const id of collectAncestorIds(tree.value, checked)) {
      checked.add(id);
    }
    const keys = [...checked];
    await setRolePermissionsApi(currentRoleId.value, keys);
    // 保存后立刻从服务端回读并重绘，确认落库
    await selectRole(currentRoleId.value);
    ElMessage.success(t('common.saved'));
  } finally {
    saving.value = false;
  }
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
        <el-table
          :data="roles"
          highlight-current-row
          :current-row-key="currentRoleId"
          row-key="id"
          @current-change="(r: RoleRow | null) => r && selectRole(r.id)"
        >
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
          <div>
            <h3>{{ t('roles.permissions') }}</h3>
            <p v-if="currentRole" class="role-tip">
              {{ currentRole.nameZh }}
              <code>{{ currentRole.code }}</code>
              <span v-if="currentRole.code === 'super_admin'" class="warn">
                · {{ t('roles.superAdminLocked') }}
              </span>
            </p>
          </div>
          <el-button
            v-perm="'system:role'"
            type="primary"
            :disabled="!currentRoleId || currentRole?.code === 'super_admin'"
            :loading="saving"
            @click="savePerms"
          >
            {{ t('common.save') }}
          </el-button>
        </div>
        <el-tree
          ref="treeRef"
          :data="tree"
          node-key="id"
          show-checkbox
          check-strictly
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
  align-items: flex-start;
  margin-bottom: 12px;
  gap: 12px;
}
.toolbar h3 {
  margin: 0;
}
.role-tip {
  margin: 4px 0 0;
  font-size: 12px;
  color: #909399;
}
.role-tip code {
  margin-left: 6px;
  color: #606266;
}
.role-tip .warn {
  color: #e6a23c;
}
.code {
  color: #909399;
  margin-left: 8px;
}
</style>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  createAgentApi,
  createPrinterApi,
  createPrintStationApi,
  deleteAgentApi,
  deletePrinterApi,
  deletePrintStationApi,
  listAgentsApi,
  listPrintersApi,
  listPrintJobsApi,
  listPrintStationsApi,
  printShiftApi,
  regenerateAgentSecretApi,
  reprintJobApi,
  updateAgentApi,
  updatePrinterApi,
  updatePrintStationApi,
  type PrintAgent,
  type PrintJob,
  type Printer,
  type Station,
} from '../../api/print';

const { t } = useI18n();
const tab = ref('jobs');
const loading = ref(false);

const stations = ref<Station[]>([]);
const printers = ref<Printer[]>([]);
const agents = ref<PrintAgent[]>([]);
const jobs = ref<PrintJob[]>([]);
const jobTotal = ref(0);

const stationDialog = ref(false);
const stationForm = reactive({ id: '', nameZh: '', nameVi: '' });

const printerDialog = ref(false);
const printerForm = reactive({
  id: '',
  name: '',
  ip: '127.0.0.1',
  port: 9100,
  paperWidth: 80 as 58 | 80,
  role: 'front' as 'front' | 'kitchen',
  stationId: '' as string,
  agentId: '' as string,
  isActive: true,
});

const agentDialog = ref(false);
const agentForm = reactive({ id: '', name: '' });
const secretShown = ref('');

async function loadAll() {
  loading.value = true;
  try {
    const [s, p, a, j] = await Promise.all([
      listPrintStationsApi(),
      listPrintersApi(),
      listAgentsApi(),
      listPrintJobsApi({ page: 1, pageSize: 50 }),
    ]);
    stations.value = s;
    printers.value = p;
    agents.value = a;
    jobs.value = j.list;
    jobTotal.value = j.total;
  } finally {
    loading.value = false;
  }
}

function openStation(row?: Station) {
  stationForm.id = row?.id || '';
  stationForm.nameZh = row?.nameZh || '';
  stationForm.nameVi = row?.nameVi || '';
  stationDialog.value = true;
}

async function saveStation() {
  if (stationForm.id) {
    await updatePrintStationApi(stationForm.id, {
      nameZh: stationForm.nameZh,
      nameVi: stationForm.nameVi,
    });
  } else {
    await createPrintStationApi({ nameZh: stationForm.nameZh, nameVi: stationForm.nameVi });
  }
  stationDialog.value = false;
  ElMessage.success(t('common.saved'));
  await loadAll();
}

async function removeStation(row: Station) {
  await ElMessageBox.confirm(t('common.confirmDelete'));
  await deletePrintStationApi(row.id);
  await loadAll();
}

function openPrinter(row?: Printer) {
  printerForm.id = row?.id || '';
  printerForm.name = row?.name || '';
  printerForm.ip = row?.ip || '127.0.0.1';
  printerForm.port = row?.port || 9100;
  printerForm.paperWidth = (row?.paperWidth === 58 ? 58 : 80) as 58 | 80;
  printerForm.role = row?.role || 'front';
  printerForm.stationId = row?.stationId || '';
  printerForm.agentId = row?.agentId || '';
  printerForm.isActive = row?.isActive ?? true;
  printerDialog.value = true;
}

async function savePrinter() {
  const body = {
    name: printerForm.name,
    ip: printerForm.ip,
    port: printerForm.port,
    paperWidth: printerForm.paperWidth,
    role: printerForm.role,
    stationId: printerForm.role === 'kitchen' ? printerForm.stationId || null : null,
    agentId: printerForm.agentId || null,
    isActive: printerForm.isActive,
  };
  if (printerForm.id) await updatePrinterApi(printerForm.id, body);
  else await createPrinterApi(body);
  printerDialog.value = false;
  ElMessage.success(t('common.saved'));
  await loadAll();
}

async function removePrinter(row: Printer) {
  await ElMessageBox.confirm(t('common.confirmDelete'));
  await deletePrinterApi(row.id);
  await loadAll();
}

function openAgent(row?: PrintAgent) {
  agentForm.id = row?.id || '';
  agentForm.name = row?.name || '';
  secretShown.value = '';
  agentDialog.value = true;
}

async function saveAgent() {
  if (agentForm.id) {
    await updateAgentApi(agentForm.id, { name: agentForm.name });
    secretShown.value = '';
  } else {
    const created = await createAgentApi({ name: agentForm.name });
    secretShown.value = created.secret || '';
    ElMessageBox.alert(
      `${t('print.secretOnce')}: ${secretShown.value}`,
      t('print.agentSecret'),
      { confirmButtonText: 'OK' },
    );
  }
  agentDialog.value = false;
  ElMessage.success(t('common.saved'));
  await loadAll();
}

async function regenSecret(row: PrintAgent) {
  const res = await regenerateAgentSecretApi(row.id);
  await ElMessageBox.alert(`${t('print.secretOnce')}: ${res.secret}`, t('print.agentSecret'));
}

async function removeAgent(row: PrintAgent) {
  await ElMessageBox.confirm(t('common.confirmDelete'));
  await deleteAgentApi(row.id);
  await loadAll();
}

async function reprint(row: PrintJob) {
  let printerId: string | undefined;
  try {
    const { value } = await ElMessageBox.prompt(t('print.reprintHint'), t('print.reprint'), {
      inputPlaceholder: t('print.printerIdOptional'),
      inputValue: '',
    });
    printerId = value || undefined;
  } catch {
    return;
  }
  await reprintJobApi(row.id, printerId);
  ElMessage.success(t('print.reprinted'));
  await loadAll();
}

async function doShift() {
  await printShiftApi();
  ElMessage.success(t('print.shiftQueued'));
  await loadAll();
}

onMounted(loadAll);
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="toolbar">
      <h3>{{ t('print.title') }}</h3>
      <el-button @click="doShift">{{ t('print.printShift') }}</el-button>
    </div>

    <el-tabs v-model="tab">
      <el-tab-pane :label="t('print.jobs')" name="jobs">
        <el-table :data="jobs" size="small" stripe>
          <el-table-column prop="id" :label="t('print.jobId')" width="80" />
          <el-table-column prop="kind" :label="t('print.kind')" width="120" />
          <el-table-column prop="status" :label="t('print.status')" width="100" />
          <el-table-column :label="t('print.printer')" min-width="140">
            <template #default="{ row }">{{ row.printer?.name }} ({{ row.printer?.ip }})</template>
          </el-table-column>
          <el-table-column prop="retries" :label="t('print.retries')" width="80" />
          <el-table-column prop="error" :label="t('print.error')" min-width="160" show-overflow-tooltip />
          <el-table-column prop="createdAt" :label="t('print.createdAt')" width="170" />
          <el-table-column :label="t('common.actions')" width="100" fixed="right">
            <template #default="{ row }">
              <el-button link type="primary" v-perm="'print:reprint'" @click="reprint(row)">
                {{ t('print.reprint') }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
        <div class="hint">{{ t('print.jobTotal', { n: jobTotal }) }}</div>
      </el-tab-pane>

      <el-tab-pane :label="t('print.printers')" name="printers">
        <el-button type="primary" size="small" class="mb" @click="openPrinter()">{{ t('common.create') }}</el-button>
        <el-table :data="printers" size="small" stripe>
          <el-table-column prop="name" :label="t('print.name')" />
          <el-table-column prop="ip" label="IP" width="130" />
          <el-table-column prop="port" :label="t('print.port')" width="80" />
          <el-table-column prop="paperWidth" :label="t('print.paperWidth')" width="90" />
          <el-table-column prop="role" :label="t('print.role')" width="90" />
          <el-table-column :label="t('print.station')" width="120">
            <template #default="{ row }">{{ row.station?.nameZh || '-' }}</template>
          </el-table-column>
          <el-table-column :label="t('print.agent')" width="140">
            <template #default="{ row }">{{ row.agent?.name || '-' }}</template>
          </el-table-column>
          <el-table-column :label="t('common.actions')" width="140">
            <template #default="{ row }">
              <el-button link type="primary" @click="openPrinter(row)">{{ t('common.edit') }}</el-button>
              <el-button link type="danger" @click="removePrinter(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('print.agents')" name="agents">
        <el-button type="primary" size="small" class="mb" @click="openAgent()">{{ t('common.create') }}</el-button>
        <el-table :data="agents" size="small" stripe>
          <el-table-column prop="id" label="ID" width="70" />
          <el-table-column prop="name" :label="t('print.name')" />
          <el-table-column prop="status" :label="t('print.status')" width="100" />
          <el-table-column prop="printerCount" :label="t('print.printerCount')" width="100" />
          <el-table-column prop="lastSeenAt" :label="t('print.lastSeen')" width="170" />
          <el-table-column :label="t('common.actions')" width="220">
            <template #default="{ row }">
              <el-button link type="primary" @click="openAgent(row)">{{ t('common.edit') }}</el-button>
              <el-button link @click="regenSecret(row)">{{ t('print.regenSecret') }}</el-button>
              <el-button link type="danger" @click="removeAgent(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>

      <el-tab-pane :label="t('print.stations')" name="stations">
        <el-button type="primary" size="small" class="mb" @click="openStation()">{{ t('common.create') }}</el-button>
        <el-table :data="stations" size="small" stripe>
          <el-table-column prop="nameZh" :label="t('print.nameZh')" />
          <el-table-column prop="nameVi" :label="t('print.nameVi')" />
          <el-table-column :label="t('common.actions')" width="140">
            <template #default="{ row }">
              <el-button link type="primary" @click="openStation(row)">{{ t('common.edit') }}</el-button>
              <el-button link type="danger" @click="removeStation(row)">{{ t('common.delete') }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-tab-pane>
    </el-tabs>

    <el-dialog v-model="stationDialog" :title="t('print.stations')" width="420px">
      <el-form label-width="100px">
        <el-form-item :label="t('print.nameZh')"><el-input v-model="stationForm.nameZh" /></el-form-item>
        <el-form-item :label="t('print.nameVi')"><el-input v-model="stationForm.nameVi" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="stationDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveStation">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="printerDialog" :title="t('print.printers')" width="480px">
      <el-form label-width="110px">
        <el-form-item :label="t('print.name')"><el-input v-model="printerForm.name" /></el-form-item>
        <el-form-item label="IP"><el-input v-model="printerForm.ip" /></el-form-item>
        <el-form-item :label="t('print.port')"><el-input-number v-model="printerForm.port" :min="1" :max="65535" /></el-form-item>
        <el-form-item :label="t('print.paperWidth')">
          <el-radio-group v-model="printerForm.paperWidth">
            <el-radio :label="58">58mm</el-radio>
            <el-radio :label="80">80mm</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('print.role')">
          <el-radio-group v-model="printerForm.role">
            <el-radio label="front">{{ t('print.roleFront') }}</el-radio>
            <el-radio label="kitchen">{{ t('print.roleKitchen') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="printerForm.role === 'kitchen'" :label="t('print.station')">
          <el-select v-model="printerForm.stationId" clearable style="width: 100%">
            <el-option v-for="s in stations" :key="s.id" :label="s.nameZh" :value="s.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('print.agent')">
          <el-select v-model="printerForm.agentId" clearable style="width: 100%">
            <el-option v-for="a in agents" :key="a.id" :label="a.name" :value="a.id" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('print.active')"><el-switch v-model="printerForm.isActive" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="printerDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="savePrinter">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>

    <el-dialog v-model="agentDialog" :title="t('print.agents')" width="420px">
      <el-form label-width="100px">
        <el-form-item :label="t('print.name')"><el-input v-model="agentForm.name" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="agentDialog = false">{{ t('common.cancel') }}</el-button>
        <el-button type="primary" @click="saveAgent">{{ t('common.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.page {
  padding: 12px 16px 32px;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
h3 {
  margin: 0;
}
.mb {
  margin-bottom: 8px;
}
.hint {
  margin-top: 8px;
  color: #909399;
  font-size: 13px;
}
</style>

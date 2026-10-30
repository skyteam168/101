<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessage } from 'element-plus';
import {
  createNoticeApi,
  deleteNoticeApi,
  getStoreSettingsApi,
  listNoticesApi,
  pushMessageApi,
  updateNoticeApi,
  updateStoreSettingsApi,
  type AnnounceSettings,
  type HomeBanner,
  type MailSettings,
  type StoreNotice,
  type StoreSettings,
} from '../../api/store';
import { searchMembersApi, type Member } from '../../api/member';
import { useVoiceAlert } from '../../composables/useVoiceAlert';
import { ElMessageBox } from 'element-plus';

const { t } = useI18n();
const { reloadSettings } = useVoiceAlert();
const loading = ref(false);
const activeTab = ref('store');
const saving = ref(false);
const pushing = ref(false);

const form = reactive({
  nameZh: '',
  nameVi: '',
  address: '',
  phone: '',
  announceLang: 'zh' as 'zh' | 'vi',
  qrOrderNeedConfirm: false,
  qrAutoOpen: true,
  qrRequirePin: true,
  printSplitItem: false,
  deliveryRadiusKm: 5,
  minOrderAmount: 0,
  lat: null as number | null,
  lng: null as number | null,
  bankTransferQr: '',
  businessDayCutHour: 4,
  businessOpen: '09:00',
  businessClose: '22:00',
  feeRulesText: '[{"maxKm":2,"fee":15000},{"maxKm":5,"fee":25000}]',
  homeBannersText: '[]',
  announceSettings: {
    dineInNew: true,
    addItem: true,
    deliveryNew: true,
    callWaiter: true,
    requestBill: true,
    orderCancel: true,
    printFailed: true,
    reservationNew: true,
  } as AnnounceSettings,
  mailSettings: {
    enabled: false,
    host: '',
    port: 587,
    secure: false,
    user: '',
    pass: '',
    from: '',
  } as MailSettings,
});

const pushForm = reactive({
  subject: '',
  content: '',
  emailsText: '',
  memberIds: [] as string[],
});
const members = ref<Member[]>([]);

const notices = ref<StoreNotice[]>([]);
const noticeDialog = ref(false);
const noticeSaving = ref(false);
const editingNoticeId = ref<string | null>(null);
const noticeForm = reactive({
  titleZh: '',
  titleVi: '',
  contentZh: '',
  contentVi: '',
  level: 'info' as 'info' | 'warn' | 'important',
  isActive: true,
  sort: 0,
  expiresAt: '' as string,
});

const keys: (keyof AnnounceSettings)[] = [
  'dineInNew',
  'addItem',
  'deliveryNew',
  'reservationNew',
  'callWaiter',
  'requestBill',
  'orderCancel',
  'printFailed',
];

async function loadNotices() {
  notices.value = await listNoticesApi();
}

function openCreateNotice() {
  editingNoticeId.value = null;
  Object.assign(noticeForm, {
    titleZh: '',
    titleVi: '',
    contentZh: '',
    contentVi: '',
    level: 'info',
    isActive: true,
    sort: notices.value.length,
    expiresAt: '',
  });
  noticeDialog.value = true;
}

function openEditNotice(n: StoreNotice) {
  editingNoticeId.value = n.id;
  Object.assign(noticeForm, {
    titleZh: n.titleZh,
    titleVi: n.titleVi,
    contentZh: n.contentZh,
    contentVi: n.contentVi,
    level: (n.level as 'info' | 'warn' | 'important') || 'info',
    isActive: n.isActive,
    sort: n.sort,
    expiresAt: n.expiresAt ? n.expiresAt.slice(0, 16) : '',
  });
  noticeDialog.value = true;
}

async function saveNotice() {
  noticeSaving.value = true;
  try {
    const payload = {
      titleZh: noticeForm.titleZh,
      titleVi: noticeForm.titleVi,
      contentZh: noticeForm.contentZh,
      contentVi: noticeForm.contentVi,
      level: noticeForm.level,
      isActive: noticeForm.isActive,
      sort: noticeForm.sort,
      expiresAt: noticeForm.expiresAt ? new Date(noticeForm.expiresAt).toISOString() : null,
    };
    if (editingNoticeId.value) await updateNoticeApi(editingNoticeId.value, payload);
    else await createNoticeApi(payload);
    noticeDialog.value = false;
    await loadNotices();
    ElMessage.success(t('common.saved'));
  } finally {
    noticeSaving.value = false;
  }
}

async function removeNotice(n: StoreNotice) {
  await ElMessageBox.confirm(t('settings.noticeDeleteConfirm'), { type: 'warning' });
  await deleteNoticeApi(n.id);
  await loadNotices();
  ElMessage.success(t('common.saved'));
}

async function load() {
  loading.value = true;
  try {
    const s: StoreSettings = await getStoreSettingsApi();
    form.nameZh = s.nameZh;
    form.nameVi = s.nameVi;
    form.address = s.address || '';
    form.phone = s.phone || '';
    form.announceLang = s.announceLang;
    form.qrOrderNeedConfirm = s.qrOrderNeedConfirm;
    form.qrAutoOpen = s.qrAutoOpen;
    form.qrRequirePin = s.qrRequirePin;
    form.printSplitItem = s.printSplitItem;
    form.deliveryRadiusKm = s.deliveryRadiusKm;
    form.minOrderAmount = s.minOrderAmount;
    form.lat = s.lat;
    form.lng = s.lng;
    form.bankTransferQr = s.bankTransferQr || '';
    form.businessDayCutHour = s.businessDayCutHour ?? 4;
    form.businessOpen = s.businessHours?.open || '09:00';
    form.businessClose = s.businessHours?.close || '22:00';
    form.feeRulesText = JSON.stringify(s.deliveryFeeRules || [], null, 0);
    form.homeBannersText = JSON.stringify(s.homeBanners || [], null, 2);
    Object.assign(form.announceSettings, s.announceSettings);
    Object.assign(form.mailSettings, s.mailSettings || {});
    await loadNotices();
  } finally {
    loading.value = false;
  }
}

async function save() {
  let deliveryFeeRules;
  let homeBanners: HomeBanner[];
  try {
    deliveryFeeRules = JSON.parse(form.feeRulesText);
  } catch {
    ElMessage.error(t('settings.feeRulesInvalid'));
    return;
  }
  try {
    homeBanners = JSON.parse(form.homeBannersText);
    if (!Array.isArray(homeBanners)) throw new Error('invalid');
  } catch {
    ElMessage.error(t('settings.homeBannersInvalid'));
    return;
  }
  saving.value = true;
  try {
    await updateStoreSettingsApi({
      nameZh: form.nameZh,
      nameVi: form.nameVi,
      address: form.address,
      phone: form.phone,
      announceLang: form.announceLang,
      qrOrderNeedConfirm: form.qrOrderNeedConfirm,
      qrAutoOpen: form.qrAutoOpen,
      qrRequirePin: form.qrRequirePin,
      printSplitItem: form.printSplitItem,
      announceSettings: { ...form.announceSettings },
      deliveryRadiusKm: form.deliveryRadiusKm,
      minOrderAmount: form.minOrderAmount,
      lat: form.lat,
      lng: form.lng,
      bankTransferQr: form.bankTransferQr || null,
      businessDayCutHour: form.businessDayCutHour,
      businessHours: {
        open: form.businessOpen,
        close: form.businessClose,
        days: [0, 1, 2, 3, 4, 5, 6],
      },
      deliveryFeeRules,
      mailSettings: { ...form.mailSettings },
      homeBanners,
    });
    await reloadSettings();
    ElMessage.success(t('common.saved'));
  } finally {
    saving.value = false;
  }
}

async function searchMembers(q: string) {
  members.value = await searchMembersApi(q || undefined);
}

async function doPush() {
  const emails = pushForm.emailsText
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!emails.length && !pushForm.memberIds.length) {
    ElMessage.warning(t('settings.pushNeedTarget'));
    return;
  }
  if (!pushForm.subject || !pushForm.content) {
    ElMessage.warning(t('settings.pushNeedContent'));
    return;
  }
  pushing.value = true;
  try {
    const res = await pushMessageApi({
      emails,
      customerIds: pushForm.memberIds,
      subject: pushForm.subject,
      content: pushForm.content,
    });
    ElMessage.success(t('settings.pushSent', { n: res.sent }));
  } finally {
    pushing.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page" v-loading="loading">
    <div class="head">
      <h3>{{ t('settings.title') }}</h3>
      <p class="sub">{{ t('settings.subtitle') }}</p>
    </div>

    <el-tabs v-model="activeTab" class="tabs">
      <el-tab-pane :label="t('settings.tabStore')" name="store" />
      <el-tab-pane :label="t('settings.tabCashier')" name="cashier" />
      <el-tab-pane :label="t('settings.tabDelivery')" name="delivery" />
      <el-tab-pane :label="t('settings.tabVoice')" name="voice" />
      <el-tab-pane :label="t('settings.tabNotice')" name="notice" />
      <el-tab-pane :label="t('settings.tabMail')" name="mail" />
      <el-tab-pane :label="t('settings.tabPush')" name="push" />
    </el-tabs>

    <div v-show="activeTab === 'store'" class="panel">
      <h4>{{ t('settings.basic') }}</h4>
      <p class="hint">{{ t('settings.basicHint') }}</p>
      <el-form label-width="140px" style="max-width: 640px">
        <el-form-item :label="t('settings.nameZh')"><el-input v-model="form.nameZh" /></el-form-item>
        <el-form-item :label="t('settings.nameVi')"><el-input v-model="form.nameVi" /></el-form-item>
        <el-form-item :label="t('settings.address')"><el-input v-model="form.address" /></el-form-item>
        <el-form-item :label="t('settings.phone')"><el-input v-model="form.phone" /></el-form-item>
        <el-form-item :label="t('settings.homeBanners')">
          <el-input
            v-model="form.homeBannersText"
            type="textarea"
            :rows="5"
            :placeholder="t('settings.homeBannersPh')"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div v-show="activeTab === 'cashier'" class="panel">
      <h4>{{ t('settings.tabCashier') }}</h4>
      <p class="hint">{{ t('settings.cashierHint') }}</p>
      <el-form label-width="140px" style="max-width: 640px">
        <el-form-item :label="t('settings.qrAutoOpen')"><el-switch v-model="form.qrAutoOpen" /></el-form-item>
        <el-form-item :label="t('settings.qrRequirePin')"><el-switch v-model="form.qrRequirePin" /></el-form-item>
        <el-form-item :label="t('settings.qrNeedConfirm')"><el-switch v-model="form.qrOrderNeedConfirm" /></el-form-item>
        <el-form-item :label="t('settings.printSplitItem')"><el-switch v-model="form.printSplitItem" /></el-form-item>
        <el-form-item :label="t('settings.businessDayCutHour')">
          <el-input-number v-model="form.businessDayCutHour" :min="0" :max="23" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div v-show="activeTab === 'delivery'" class="panel">
      <h4>{{ t('settings.delivery') }}</h4>
      <el-form label-width="140px" style="max-width: 640px">
        <el-form-item :label="t('settings.businessOpen')">
          <el-input v-model="form.businessOpen" style="width: 120px" placeholder="09:00" />
          <span style="margin: 0 8px">-</span>
          <el-input v-model="form.businessClose" style="width: 120px" placeholder="22:00" />
        </el-form-item>
        <el-form-item :label="t('settings.minOrderAmount')">
          <el-input-number v-model="form.minOrderAmount" :min="0" :step="1000" />
        </el-form-item>
        <el-form-item :label="t('settings.deliveryRadiusKm')">
          <el-input-number v-model="form.deliveryRadiusKm" :min="0" :step="0.5" />
        </el-form-item>
        <el-form-item :label="t('settings.storeLat')">
          <el-input-number v-model="form.lat" :step="0.0001" :controls="false" />
        </el-form-item>
        <el-form-item :label="t('settings.storeLng')">
          <el-input-number v-model="form.lng" :step="0.0001" :controls="false" />
        </el-form-item>
        <el-form-item :label="t('settings.feeRules')">
          <el-input v-model="form.feeRulesText" type="textarea" :rows="3" />
        </el-form-item>
        <el-form-item :label="t('settings.bankTransferQr')">
          <el-input v-model="form.bankTransferQr" placeholder="https://..." />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div v-show="activeTab === 'voice'" class="panel">
      <h4>{{ t('settings.voice') }}</h4>
      <el-form label-width="140px" style="max-width: 640px">
        <el-form-item :label="t('settings.announceLang')">
          <el-radio-group v-model="form.announceLang">
            <el-radio label="zh">中文</el-radio>
            <el-radio label="vi">Tiếng Việt</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-for="k in keys" :key="k" :label="t(`settings.announce.${k}`)">
          <el-switch v-model="form.announceSettings[k]" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div v-show="activeTab === 'notice'" class="panel">
      <div class="notice-head">
        <div>
          <h4>{{ t('settings.noticeTitle') }}</h4>
          <p class="hint">{{ t('settings.noticeHint') }}</p>
        </div>
        <el-button type="primary" @click="openCreateNotice">{{ t('settings.noticeAdd') }}</el-button>
      </div>
      <el-table :data="notices" stripe empty-text="-">
        <el-table-column prop="sort" :label="t('settings.noticeSort')" width="70" />
        <el-table-column :label="t('settings.noticeTitleZh')" min-width="140">
          <template #default="{ row }">{{ row.titleZh }}</template>
        </el-table-column>
        <el-table-column :label="t('settings.noticeLevel')" width="100">
          <template #default="{ row }">
            {{ t(`settings.noticeLevel${row.level === 'warn' ? 'Warn' : row.level === 'important' ? 'Important' : 'Info'}`) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('settings.noticeActive')" width="80">
          <template #default="{ row }">
            <el-tag :type="row.isActive ? 'success' : 'info'" size="small">
              {{ row.isActive ? t('common.yes') : t('common.no') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.actions')" width="160" fixed="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="openEditNotice(row)">{{ t('common.edit') }}</el-button>
            <el-button link type="danger" @click="removeNotice(row)">{{ t('common.delete') }}</el-button>
          </template>
        </el-table-column>
      </el-table>

      <el-dialog
        v-model="noticeDialog"
        :title="editingNoticeId ? t('settings.noticeEdit') : t('settings.noticeAdd')"
        width="560px"
      >
        <el-form label-width="120px">
          <el-form-item :label="t('settings.noticeTitleZh')">
            <el-input v-model="noticeForm.titleZh" />
          </el-form-item>
          <el-form-item :label="t('settings.noticeTitleVi')">
            <el-input v-model="noticeForm.titleVi" />
          </el-form-item>
          <el-form-item :label="t('settings.noticeContentZh')">
            <el-input v-model="noticeForm.contentZh" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item :label="t('settings.noticeContentVi')">
            <el-input v-model="noticeForm.contentVi" type="textarea" :rows="3" />
          </el-form-item>
          <el-form-item :label="t('settings.noticeLevel')">
            <el-radio-group v-model="noticeForm.level">
              <el-radio label="info">{{ t('settings.noticeLevelInfo') }}</el-radio>
              <el-radio label="warn">{{ t('settings.noticeLevelWarn') }}</el-radio>
              <el-radio label="important">{{ t('settings.noticeLevelImportant') }}</el-radio>
            </el-radio-group>
          </el-form-item>
          <el-form-item :label="t('settings.noticeActive')">
            <el-switch v-model="noticeForm.isActive" />
          </el-form-item>
          <el-form-item :label="t('settings.noticeSort')">
            <el-input-number v-model="noticeForm.sort" :min="0" />
          </el-form-item>
          <el-form-item :label="t('settings.noticeExpires')">
            <el-input v-model="noticeForm.expiresAt" type="datetime-local" />
          </el-form-item>
        </el-form>
        <template #footer>
          <el-button @click="noticeDialog = false">{{ t('common.cancel') }}</el-button>
          <el-button type="primary" :loading="noticeSaving" @click="saveNotice">
            {{ t('common.save') }}
          </el-button>
        </template>
      </el-dialog>
    </div>

    <div v-show="activeTab === 'mail'" class="panel">
      <h4>{{ t('settings.mailTitle') }}</h4>
      <p class="hint">{{ t('settings.mailHint') }}</p>
      <el-form label-width="140px" style="max-width: 640px">
        <el-form-item :label="t('settings.mailEnabled')">
          <el-switch v-model="form.mailSettings.enabled" />
        </el-form-item>
        <el-form-item label="SMTP Host">
          <el-input v-model="form.mailSettings.host" placeholder="smtp.example.com" />
        </el-form-item>
        <el-form-item label="Port">
          <el-input-number v-model="form.mailSettings.port" :min="1" :max="65535" />
        </el-form-item>
        <el-form-item :label="t('settings.mailSecure')">
          <el-switch v-model="form.mailSettings.secure" />
        </el-form-item>
        <el-form-item :label="t('settings.mailUser')">
          <el-input v-model="form.mailSettings.user" />
        </el-form-item>
        <el-form-item :label="t('settings.mailPass')">
          <el-input v-model="form.mailSettings.pass" type="password" show-password placeholder="********" />
        </el-form-item>
        <el-form-item :label="t('settings.mailFrom')">
          <el-input v-model="form.mailSettings.from" placeholder="noreply@example.com" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</el-button>
        </el-form-item>
      </el-form>
    </div>

    <div v-show="activeTab === 'push'" class="panel">
      <h4>{{ t('settings.pushTitle') }}</h4>
      <p class="hint">{{ t('settings.pushHint') }}</p>
      <el-form label-width="140px" style="max-width: 720px">
        <el-form-item :label="t('settings.pushEmails')">
          <el-input
            v-model="pushForm.emailsText"
            type="textarea"
            :rows="2"
            :placeholder="t('settings.pushEmailsPh')"
          />
        </el-form-item>
        <el-form-item :label="t('settings.pushMembers')">
          <el-select
            v-model="pushForm.memberIds"
            multiple
            filterable
            remote
            :remote-method="searchMembers"
            style="width: 100%"
            :placeholder="t('cashier.selectMember')"
          >
            <el-option
              v-for="m in members"
              :key="m.id"
              :label="`${m.name || m.email} · ${m.email}`"
              :value="m.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('settings.pushSubject')">
          <el-input v-model="pushForm.subject" />
        </el-form-item>
        <el-form-item :label="t('settings.pushContent')">
          <el-input v-model="pushForm.content" type="textarea" :rows="5" />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="pushing" @click="doPush">
            {{ t('settings.pushSend') }}
          </el-button>
        </el-form-item>
      </el-form>
    </div>
  </div>
</template>

<style scoped>
.page { padding: 8px 4px 32px; }
.head h3 { margin: 0; }
.sub { margin: 4px 0 12px; color: #888; font-size: 13px; }
.tabs :deep(.el-tabs__item.is-active) { color: #e6a23c; }
.tabs :deep(.el-tabs__active-bar) { background: #e6a23c; }
.panel {
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  padding: 16px 18px 8px;
}
.panel h4 { margin: 0 0 4px; }
.hint { margin: 0 0 16px; color: #888; font-size: 13px; }
.notice-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}
.notice-head .hint { margin-bottom: 0; }
</style>

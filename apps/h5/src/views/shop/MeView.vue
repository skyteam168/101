<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { cancelAccount, updateMe, uploadCustomerImage } from '../../api/delivery';
import { getMyMembership, type Membership } from '../../api/member';
import { useCustomerStore } from '../../stores/customer';
import { formatVND, localeField } from '@restaurant/shared';

const { t, locale } = useI18n();
const router = useRouter();
const customer = useCustomerStore();

const editing = ref(false);
const saving = ref(false);
const uploadingAvatar = ref(false);
const form = reactive({ name: '', phone: '' });
const avatarInput = ref<HTMLInputElement | null>(null);
const membership = ref<Membership | null>(null);

onMounted(async () => {
  await customer.loadMe();
  if (customer.profile) {
    form.name = customer.profile.name || '';
    form.phone = customer.profile.phone || '';
  }
  try {
    membership.value = await getMyMembership();
  } catch {
    membership.value = null;
  }
});

function switchLocale() {
  locale.value = locale.value === 'zh-CN' ? 'vi-VN' : 'zh-CN';
  localStorage.setItem('locale', locale.value);
}

function pickAvatar() {
  avatarInput.value?.click();
}

async function onAvatarChange(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast(t('shop.me.avatarTypeInvalid'));
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showToast(t('shop.me.avatarTooLarge'));
    return;
  }
  uploadingAvatar.value = true;
  try {
    const { url } = await uploadCustomerImage(file);
    const updated = await updateMe({ avatar: url });
    customer.setAuth(customer.token!, updated);
    showToast(t('shop.me.avatarUpdated'));
  } catch {
    /* 拦截器已 toast */
  } finally {
    uploadingAvatar.value = false;
  }
}

async function handleSave() {
  if (!form.name) {
    showToast(t('shop.me.nameRequired'));
    return;
  }
  saving.value = true;
  try {
    const updated = await updateMe({ name: form.name, phone: form.phone });
    customer.setAuth(customer.token!, updated);
    showToast(t('shop.me.saved'));
    editing.value = false;
  } finally {
    saving.value = false;
  }
}

async function handleLogout() {
  await showConfirmDialog({
    title: t('shop.me.logoutTitle'),
    message: t('shop.me.logoutConfirm'),
  });
  await customer.logout();
  router.replace({ name: 'shop' });
}

async function handleCancelAccount() {
  await showConfirmDialog({
    title: t('shop.me.cancelTitle'),
    message: t('shop.me.cancelConfirm'),
  });
  await cancelAccount();
  await customer.logout();
  showToast(t('shop.me.cancelled'));
  router.replace({ name: 'shop' });
}
</script>

<template>
  <div class="me-page">
    <header class="page-head">
      <h1>{{ t('shop.me.title') }}</h1>
      <button type="button" class="head-btn" @click="editing = !editing">
        <van-icon :name="editing ? 'cross' : 'edit'" size="18" />
      </button>
    </header>

    <div class="me-body">
      <section class="profile-card">
        <button type="button" class="avatar-btn" :disabled="uploadingAvatar" @click="pickAvatar">
          <img
            v-if="customer.profile?.avatar"
            :src="customer.profile.avatar"
            class="avatar-img"
            alt=""
          />
          <van-icon v-else name="contact" size="48" color="#ea580c" />
          <span class="avatar-camera">
            <van-loading v-if="uploadingAvatar" size="14" color="#fff" />
            <van-icon v-else name="photograph" size="14" color="#fff" />
          </span>
        </button>
        <div class="profile-copy">
          <div class="profile-name">{{ customer.profile?.name || customer.profile?.email }}</div>
          <div class="profile-email">{{ customer.profile?.email }}</div>
          <div class="avatar-hint">{{ t('shop.me.avatarHint') }}</div>
        </div>
        <input
          ref="avatarInput"
          type="file"
          accept="image/*"
          capture="user"
          class="file-hidden"
          @change="onAvatarChange"
        />
      </section>

      <section class="member-card">
        <div class="member-row">
          <span>{{ t('shop.me.member') }}</span>
          <strong>{{
            membership?.joined && membership.memberLevel
              ? localeField(
                  membership.memberLevel as unknown as Record<string, unknown>,
                  'name',
                  locale.startsWith('vi') ? 'vi' : 'zh',
                )
              : t('shop.me.notJoined')
          }}</strong>
        </div>
        <div v-if="membership?.joined" class="member-row">
          <span>{{ t('shop.me.spend') }}</span>
          <strong>{{ formatVND(membership.lifetimeSpend || 0) }}</strong>
        </div>
        <p v-if="membership?.birthdayGiftPending" class="member-gift">{{ t('shop.me.birthdayGiftHint') }}</p>
        <button v-if="!membership?.joined" type="button" class="member-join" @click="router.push({ path: '/', query: { join: '1' } })">
          {{ t('home.joinNow') }}
        </button>
      </section>

      <van-cell-group v-if="editing" inset class="block">
        <van-field
          v-model="form.name"
          :label="t('shop.me.name')"
          :placeholder="t('shop.me.namePlaceholder')"
        />
        <van-field
          v-model="form.phone"
          type="tel"
          :label="t('shop.me.phone')"
          :placeholder="t('shop.me.phonePlaceholder')"
        />
        <div class="save-wrap">
          <button type="button" class="save-btn" :disabled="saving" @click="handleSave">
            {{ t('shop.me.save') }}
          </button>
        </div>
      </van-cell-group>

      <van-cell-group v-else inset class="block">
        <van-cell :title="t('shop.me.name')" :value="customer.profile?.name || '-'" />
        <van-cell :title="t('shop.me.phone')" :value="customer.profile?.phone || '-'" />
        <van-cell :title="t('shop.me.email')" :value="customer.profile?.email || '-'" />
      </van-cell-group>

      <van-cell-group inset class="block">
        <van-cell
          :title="t('shop.me.myOrders')"
          icon="orders-o"
          is-link
          @click="router.push({ name: 'shop-orders' })"
        />
        <van-cell
          :title="t('reserve.myTitle')"
          icon="shop-o"
          is-link
          @click="router.push({ name: 'my-reservations', query: { phone: customer.profile?.phone || '' } })"
        />
        <van-cell
          :title="t('shop.me.myAddresses')"
          icon="location-o"
          is-link
          @click="router.push({ name: 'shop-addresses' })"
        />
        <van-cell
          :title="
            customer.profile?.hasPassword
              ? t('shop.auth.changePassword')
              : t('shop.auth.setPassword')
          "
          icon="lock"
          is-link
          @click="router.push({ name: 'shop-change-password' })"
        />
        <van-cell
          :title="t('shop.me.language')"
          icon="label-o"
          is-link
          :value="locale === 'zh-CN' ? '中文' : 'Tiếng Việt'"
          @click="switchLocale"
        />
      </van-cell-group>

      <div class="actions">
        <button type="button" class="action danger" @click="handleLogout">
          {{ t('shop.me.logout') }}
        </button>
        <button type="button" class="action" @click="handleCancelAccount">
          {{ t('shop.me.cancelAccount') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.me-page {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #f6f7f9;
}
.page-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 8px;
}
.page-head h1 {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  letter-spacing: -0.03em;
  color: #1c1917;
}
.head-btn {
  width: 36px;
  height: 36px;
  border: 0;
  border-radius: 50%;
  background: #fff;
  color: #292524;
  box-shadow: 0 6px 16px rgba(28, 25, 23, 0.06);
}
.me-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 8px 0 20px;
}
.profile-card {
  margin: 0 16px 12px;
  padding: 16px;
  border-radius: 20px;
  background: linear-gradient(120deg, #fff7ed 0%, #fff 55%, #ecfdf3 100%);
  display: flex;
  align-items: center;
  gap: 14px;
  box-shadow: 0 8px 20px rgba(28, 25, 23, 0.04);
}
.avatar-btn {
  position: relative;
  width: 72px;
  height: 72px;
  border: 0;
  border-radius: 50%;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  overflow: hidden;
  flex-shrink: 0;
}
.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.avatar-camera {
  position: absolute;
  right: 0;
  bottom: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: rgba(28, 25, 23, 0.62);
  display: flex;
  align-items: center;
  justify-content: center;
}
.profile-copy {
  min-width: 0;
  flex: 1;
}
.profile-name {
  font-size: 17px;
  font-weight: 800;
  color: #1c1917;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.member-card {
  margin: 0 16px 12px;
  padding: 14px;
  border-radius: 16px;
  background: #ecfdf5;
}
.member-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 14px;
  margin-bottom: 6px;
}
.member-gift {
  margin: 8px 0 0;
  font-size: 13px;
  color: #047857;
  line-height: 1.4;
}
.member-join {
  margin-top: 8px;
  height: 36px;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: #1c1917;
  color: #fff;
  font-weight: 700;
}
.profile-email {
  margin-top: 2px;
  font-size: 13px;
  color: #78716c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.avatar-hint {
  margin-top: 4px;
  font-size: 12px;
  color: #a8a29e;
}
.file-hidden {
  display: none;
}
.block {
  margin-top: 12px;
}
.save-wrap {
  padding: 12px 16px 16px;
}
.save-btn {
  width: 100%;
  height: 42px;
  border: 0;
  border-radius: 999px;
  background: #ff6a00;
  color: #fff;
  font-size: 15px;
  font-weight: 700;
}
.save-btn:disabled {
  opacity: 0.6;
}
.actions {
  padding: 18px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.action {
  height: 44px;
  border-radius: 999px;
  border: 1px solid #e7e5e4;
  background: #fff;
  color: #44403c;
  font-size: 15px;
  font-weight: 650;
}
.action.danger {
  color: #ea580c;
  border-color: #ffedd5;
  background: #fff7ed;
}
</style>

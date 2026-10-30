<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { cancelAccount, updateMe } from '../../api/delivery';
import { useCustomerStore } from '../../stores/customer';

const { t, locale } = useI18n();
const router = useRouter();
const customer = useCustomerStore();

const editing = ref(false);
const saving = ref(false);
const form = reactive({ name: '', phone: '' });

onMounted(async () => {
  await customer.loadMe();
  if (customer.profile) {
    form.name = customer.profile.name || '';
    form.phone = customer.profile.phone || '';
  }
});

function switchLocale() {
  locale.value = locale.value === 'zh-CN' ? 'vi-VN' : 'zh-CN';
  localStorage.setItem('locale', locale.value);
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
  customer.logout();
  router.replace({ name: 'shop' });
}

async function handleCancelAccount() {
  await showConfirmDialog({
    title: t('shop.me.cancelTitle'),
    message: t('shop.me.cancelConfirm'),
  });
  await cancelAccount();
  customer.logout();
  showToast(t('shop.me.cancelled'));
  router.replace({ name: 'shop' });
}
</script>

<template>
  <div class="me-page">
    <van-nav-bar :title="t('shop.me.title')">
      <template #right>
        <van-icon v-if="!editing" name="edit" size="20" @click="editing = true" />
        <van-icon v-else name="cross" size="20" @click="editing = false" />
      </template>
    </van-nav-bar>

    <!-- 头像区域 -->
    <div class="avatar-section">
      <van-icon name="contact" size="60" color="#ee0a24" />
      <div class="profile-email">{{ customer.profile?.email }}</div>
    </div>

    <!-- 编辑表单 -->
    <van-cell-group v-if="editing" inset style="margin-top: 12px">
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
      <div style="padding: 12px 16px">
        <van-button block type="danger" round :loading="saving" @click="handleSave">
          {{ t('shop.me.save') }}
        </van-button>
      </div>
    </van-cell-group>

    <!-- 信息展示 -->
    <van-cell-group v-else inset style="margin-top: 12px">
      <van-cell :title="t('shop.me.name')" :value="customer.profile?.name || '-'" />
      <van-cell :title="t('shop.me.phone')" :value="customer.profile?.phone || '-'" />
      <van-cell :title="t('shop.me.email')" :value="customer.profile?.email || '-'" />
    </van-cell-group>

    <!-- 快捷入口 -->
    <van-cell-group inset style="margin-top: 12px">
      <van-cell
        :title="t('shop.me.myOrders')"
        icon="orders-o"
        is-link
        @click="router.push({ name: 'shop-orders' })"
      />
      <van-cell
        :title="t('shop.me.myAddresses')"
        icon="location-o"
        is-link
        @click="router.push({ name: 'shop-addresses' })"
      />
      <van-cell
        :title="t('shop.me.language')"
        icon="label-o"
        is-link
        :value="locale === 'zh-CN' ? '中文' : 'Tiếng Việt'"
        @click="switchLocale"
      />
    </van-cell-group>

    <!-- 退出 / 注销 -->
    <div style="padding: 16px; margin-top: 8px; display: flex; flex-direction: column; gap: 10px">
      <van-button block plain type="danger" round @click="handleLogout">
        {{ t('shop.me.logout') }}
      </van-button>
      <van-button block plain type="default" round @click="handleCancelAccount">
        {{ t('shop.me.cancelAccount') }}
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.me-page { min-height: 100vh; background: #f7f8fa; padding-bottom: 24px; }
.avatar-section {
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px 16px 20px;
  gap: 8px;
}
.profile-email { font-size: 14px; color: #646566; }
</style>

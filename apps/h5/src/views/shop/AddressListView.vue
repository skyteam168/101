<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showConfirmDialog, showToast } from 'vant';
import { deleteAddress, listAddresses, setDefaultAddress, type CustomerAddress } from '../../api/delivery';

const { t } = useI18n();
const router = useRouter();

const addresses = ref<CustomerAddress[]>([]);
const loading = ref(true);

async function load() {
  loading.value = true;
  try {
    addresses.value = await listAddresses();
  } finally {
    loading.value = false;
  }
}

onMounted(load);

async function handleSetDefault(addr: CustomerAddress) {
  await setDefaultAddress(addr.id);
  showToast(t('shop.address.defaultSet'));
  await load();
}

async function handleDelete(addr: CustomerAddress) {
  await showConfirmDialog({
    title: t('shop.address.deleteTitle'),
    message: t('shop.address.deleteConfirm'),
  });
  await deleteAddress(addr.id);
  showToast(t('shop.address.deleted'));
  await load();
}

function handleEdit(addr: CustomerAddress) {
  router.push({ name: 'shop-address-edit', query: { id: String(addr.id) } });
}
</script>

<template>
  <div class="addr-list-page">
    <van-nav-bar
      :title="t('shop.address.title')"
      left-arrow
      fixed
      placeholder
      @click-left="router.back()"
    >
      <template #right>
        <van-icon name="plus" size="20" @click="router.push({ name: 'shop-address-edit' })" />
      </template>
    </van-nav-bar>

    <div v-if="loading" style="padding: 24px">
      <van-skeleton title :row="4" />
    </div>

    <div v-else>
      <van-empty v-if="addresses.length === 0" :description="t('shop.address.empty')" />

      <van-swipe-cell
        v-for="addr in addresses"
        :key="addr.id"
        style="margin: 8px 16px 0"
      >
        <van-cell-group>
          <van-cell @click="handleEdit(addr)">
            <template #title>
              <div class="addr-title-row">
                <span class="addr-contact">{{ addr.contactName }}</span>
                <span class="addr-phone">{{ addr.phone }}</span>
                <van-tag v-if="addr.isDefault" type="danger">{{ t('shop.address.default') }}</van-tag>
              </div>
              <div class="addr-text">{{ addr.addressText }}</div>
              <div v-if="addr.detail" class="addr-detail">{{ addr.detail }}</div>
              <img
                v-if="addr.landmarkPhoto"
                :src="addr.landmarkPhoto"
                class="addr-landmark"
                alt=""
              />
            </template>
            <template #right-icon>
              <van-icon name="edit" color="#969799" />
            </template>
          </van-cell>
        </van-cell-group>

        <template #right>
          <div class="swipe-btns">
            <van-button
              v-if="!addr.isDefault"
              square
              type="primary"
              size="normal"
              @click="handleSetDefault(addr)"
            >
              {{ t('shop.address.setDefault') }}
            </van-button>
            <van-button
              square
              type="danger"
              size="normal"
              @click="handleDelete(addr)"
            >
              {{ t('shop.address.delete') }}
            </van-button>
          </div>
        </template>
      </van-swipe-cell>
    </div>

    <div style="padding: 16px">
      <van-button block type="danger" round @click="router.push({ name: 'shop-address-edit' })">
        + {{ t('shop.address.add') }}
      </van-button>
    </div>
  </div>
</template>

<style scoped>
.addr-list-page { min-height: 100vh; background: #f7f8fa; }
.addr-title-row { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.addr-contact { font-size: 15px; font-weight: 700; color: #323233; }
.addr-phone { font-size: 13px; color: #646566; }
.addr-text { font-size: 13px; color: #323233; }
.addr-detail { font-size: 12px; color: #969799; }
.addr-landmark {
  margin-top: 8px;
  width: 72px;
  height: 72px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #eee;
  display: block;
}
.swipe-btns { display: flex; height: 100%; }
</style>

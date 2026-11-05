<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { showToast } from 'vant';
import { formatVND, localeField } from '@restaurant/shared';
import {
  createGroupInquiry,
  listGroupCombos,
  placeGroupOrder,
  type GroupCombo,
} from '../../api/group-meal';
import {
  getStoreInfo,
  listAddresses,
  type CustomerAddress,
  type StoreInfo,
} from '../../api/delivery';
import { getCustomerToken } from '../../utils/customer-storage';

const { t, locale } = useI18n();
const router = useRouter();

const tab = ref(0);
const combos = ref<GroupCombo[]>([]);
const selected = ref<GroupCombo | null>(null);
const selections = ref<Record<string, string[]>>({});
const qty = ref(1);
const guestCount = ref(10);
const addresses = ref<CustomerAddress[]>([]);
const addressId = ref<string | null>(null);
const payMethod = ref<'cash' | 'bank_transfer'>('cash');
const orderRemark = ref('');
const ordering = ref(false);
const inquiryOk = ref(false);
/** 门店收款码（与外卖结算一致） */
const store = ref<StoreInfo | null>(null);

const inquiry = reactive({
  contactName: '',
  phone: '',
  company: '',
  guestCount: 10,
  preferDate: '',
  preferTime: '12:00',
  address: '',
  comboId: '' as string,
  budget: '' as string,
  remark: '',
});
const inquirySubmitting = ref(false);
const showDate = ref(false);
const showTime = ref(false);

function onPickDate(v: { selectedValues: string[] }) {
  inquiry.preferDate = v.selectedValues.join('-');
  showDate.value = false;
}

function onPickTime(v: { selectedValues: string[] }) {
  inquiry.preferTime = v.selectedValues.join(':');
  showTime.value = false;
}

const loc = computed(() => (String(locale.value).startsWith('vi') ? 'vi' : 'zh'));

function nameOf(row: { nameZh: string; nameVi: string }) {
  return localeField(row as unknown as Record<string, unknown>, 'name', loc.value);
}

/** 套餐封面：优先套餐图，否则取分组内第一张菜品图 */
function coverOf(c: GroupCombo): string | undefined {
  if (c.image) return c.image;
  for (const g of c.groups || []) {
    for (const it of g.items || []) {
      if (it.dish?.image) return it.dish.image;
    }
  }
  return undefined;
}

function openCombo(c: GroupCombo) {
  selected.value = c;
  guestCount.value = c.servingSize || 10;
  qty.value = 1;
  const map: Record<string, string[]> = {};
  for (const g of c.groups) {
    map[g.id] = g.items.filter((i) => i.isDefault).map((i) => i.dishId);
    if (!map[g.id].length && g.minSelect > 0 && g.items[0]) {
      map[g.id] = [g.items[0].dishId];
    }
  }
  selections.value = map;
}

function toggleDish(groupId: string, dishId: string, maxSelect: number) {
  const cur = [...(selections.value[groupId] || [])];
  const idx = cur.indexOf(dishId);
  if (idx >= 0) cur.splice(idx, 1);
  else {
    if (maxSelect === 1) cur.splice(0, cur.length, dishId);
    else if (cur.length < maxSelect) cur.push(dishId);
  }
  selections.value = { ...selections.value, [groupId]: cur };
}

const unitPrice = computed(() => {
  if (!selected.value) return 0;
  let extra = 0;
  for (const g of selected.value.groups) {
    for (const did of selections.value[g.id] || []) {
      const item = g.items.find((i) => i.dishId === did);
      if (item) extra += item.extraPrice;
    }
  }
  return (selected.value.takeawayPrice || selected.value.price) + extra;
});

async function loadCombos() {
  combos.value = await listGroupCombos().catch(() => []);
}

async function loadStore() {
  store.value = await getStoreInfo().catch(() => null);
}

async function loadAddresses() {
  if (!getCustomerToken()) return;
  addresses.value = await listAddresses().catch(() => []);
  const def = addresses.value.find((a) => a.isDefault) ?? addresses.value[0];
  if (def) addressId.value = def.id;
}

async function submitOrder() {
  if (!selected.value) return;
  if (!getCustomerToken()) {
    router.push({ name: 'shop-login', query: { redirect: '/group-meal' } });
    return;
  }
  for (const g of selected.value.groups) {
    const n = (selections.value[g.id] || []).length;
    if (n < g.minSelect || n > g.maxSelect) {
      showToast(t('group.invalidSelection'));
      return;
    }
  }
  if (!addressId.value) {
    showToast(t('shop.checkout.addressRequired'));
    return;
  }
  if (selected.value.servingSize && guestCount.value < selected.value.servingSize) {
    showToast(t('group.guestTooFew', { n: selected.value.servingSize }));
    return;
  }
  ordering.value = true;
  try {
    const order = await placeGroupOrder({
      comboId: selected.value.id,
      selections: selected.value.groups.map((g) => ({
        groupId: g.id,
        dishIds: selections.value[g.id] || [],
      })),
      qty: qty.value,
      guestCount: guestCount.value,
      addressId: addressId.value,
      payMethod: payMethod.value,
      remark: orderRemark.value || undefined,
    });
    showToast(t('group.orderOk'));
    router.replace({ name: 'shop-order-detail', params: { id: (order as { id: string }).id } });
  } catch {
    // interceptor
  } finally {
    ordering.value = false;
  }
}

async function submitInquiry() {
  if (!inquiry.contactName || !inquiry.phone || !inquiry.preferDate) {
    showToast(t('group.inquiryRequired'));
    return;
  }
  inquirySubmitting.value = true;
  try {
    const preferAt = new Date(`${inquiry.preferDate}T${inquiry.preferTime}:00`).toISOString();
    await createGroupInquiry({
      contactName: inquiry.contactName,
      phone: inquiry.phone,
      company: inquiry.company || undefined,
      guestCount: inquiry.guestCount,
      preferAt,
      address: inquiry.address || undefined,
      comboId: inquiry.comboId || undefined,
      budget: inquiry.budget ? Number(inquiry.budget) : undefined,
      remark: inquiry.remark || undefined,
    });
    showDate.value = false;
    showTime.value = false;
    inquiryOk.value = true;
  } catch {
    // interceptor
  } finally {
    inquirySubmitting.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadCombos(), loadStore(), loadAddresses()]);
});
</script>

<template>
  <div class="group-page">
    <van-nav-bar
      :title="t('group.title')"
      left-arrow
      fixed
      placeholder
      @click-left="router.back()"
    />
    <van-tabs v-model:active="tab" color="#ff6a00" sticky offset-top="46">
      <van-tab :title="t('group.tabOrder')">
        <van-empty v-if="!combos.length" :description="t('group.emptyCombos')" />
        <div v-else class="combo-list">
          <button
            v-for="c in combos"
            :key="c.id"
            type="button"
            class="combo-card"
            @click="openCombo(c)"
          >
            <div
              class="cover"
              :class="{ empty: !coverOf(c) }"
              :style="(u => (u ? { backgroundImage: `url(${u})` } : undefined))(coverOf(c))"
            >
              <span v-if="!coverOf(c)" class="cover-placeholder">{{ nameOf(c).slice(0, 1) || '餐' }}</span>
            </div>
            <div class="meta">
              <div class="name">{{ nameOf(c) }}</div>
              <div class="sub">
                <span v-if="c.servingSize">{{ t('group.serving', { n: c.servingSize }) }}</span>
                <strong>{{ formatVND(c.takeawayPrice || c.price) }}</strong>
              </div>
            </div>
          </button>
        </div>
      </van-tab>

      <van-tab :title="t('group.tabInquiry')">
        <van-empty v-if="inquiryOk" :description="t('group.inquiryOk')">
          <van-button round color="#ff6a00" @click="inquiryOk = false">{{ t('group.again') }}</van-button>
        </van-empty>
        <van-form v-else @submit="submitInquiry">
          <van-cell-group inset>
            <van-field v-model="inquiry.contactName" required :label="t('group.contact')" />
            <van-field v-model="inquiry.phone" required type="tel" :label="t('group.phone')" />
            <van-field v-model="inquiry.company" :label="t('group.company')" />
            <van-field
              v-model.number="inquiry.guestCount"
              type="digit"
              required
              :label="t('group.guestCount')"
            />
            <van-field
              :model-value="inquiry.preferDate"
              is-link
              readonly
              required
              :label="t('group.preferAt')"
              @click="showDate = true"
            />
            <van-field
              :model-value="inquiry.preferTime"
              is-link
              readonly
              :label="t('group.preferTime')"
              @click="showTime = true"
            />
            <van-field v-model="inquiry.address" :label="t('group.address')" />
            <van-field
              :model-value="inquiry.comboId ? nameOf(combos.find((c) => c.id === inquiry.comboId) || { nameZh: '', nameVi: '' }) : ''"
              is-link
              readonly
              :label="t('group.intentCombo')"
              :placeholder="t('group.optional')"
              @click="inquiry.comboId = combos[0]?.id || ''"
            />
            <van-field v-model="inquiry.budget" type="digit" :label="t('group.budget')" />
            <van-field v-model="inquiry.remark" rows="2" autosize type="textarea" :label="t('group.remark')" />
          </van-cell-group>
          <div style="margin: 16px">
            <van-button round block color="#ff6a00" native-type="submit" :loading="inquirySubmitting">
              {{ t('group.submitInquiry') }}
            </van-button>
          </div>
        </van-form>
      </van-tab>
    </van-tabs>

    <van-popup
      :show="!!selected"
      position="bottom"
      round
      :style="{ maxHeight: '88%' }"
      @update:show="(v: boolean) => { if (!v) selected = null }"
    >
      <div v-if="selected" class="order-sheet">
        <h3>{{ nameOf(selected) }}</h3>
        <div v-for="g in selected.groups" :key="g.id" class="group-block">
          <div class="g-title">{{ nameOf(g) }}（{{ g.minSelect }}-{{ g.maxSelect }}）</div>
          <van-checkbox-group :model-value="selections[g.id] || []">
            <van-cell
              v-for="it in g.items"
              :key="it.dishId"
              clickable
              :title="it.dish ? nameOf(it.dish) : it.dishId"
              :label="it.extraPrice ? `+${formatVND(it.extraPrice)}` : undefined"
              @click="toggleDish(g.id, it.dishId, g.maxSelect)"
            >
              <template #right-icon>
                <van-checkbox :name="it.dishId" @click.stop="toggleDish(g.id, it.dishId, g.maxSelect)" />
              </template>
            </van-cell>
          </van-checkbox-group>
        </div>
        <van-field v-model.number="guestCount" type="digit" :label="t('group.guestCount')" />
        <van-field :label="t('group.qty')">
          <template #input>
            <van-stepper v-model="qty" :min="1" integer />
          </template>
        </van-field>
        <van-cell
          :title="t('shop.checkout.address')"
          is-link
          :value="addresses.find((a) => a.id === addressId)?.addressText || t('shop.checkout.selectAddress')"
          @click="router.push({ name: 'shop-addresses' })"
        />
        <van-radio-group v-model="payMethod" direction="horizontal" style="padding: 12px 16px">
          <van-radio name="cash">{{ t('shop.checkout.cash') }}</van-radio>
          <van-radio name="bank_transfer">{{ t('shop.checkout.bankTransfer') }}</van-radio>
        </van-radio-group>
        <div v-if="payMethod === 'bank_transfer' && store?.bankTransferQr" class="qr-box">
          <p class="qr-hint">{{ t('shop.checkout.scanQr') }}</p>
          <img :src="store.bankTransferQr" class="qr-img" alt="" />
        </div>
        <van-field v-model="orderRemark" :label="t('group.remark')" />
        <div class="sheet-footer">
          <strong>{{ formatVND(unitPrice * qty) }}</strong>
          <van-button round color="#ff6a00" :loading="ordering" @click="submitOrder">
            {{ t('group.placeOrder') }}
          </van-button>
        </div>
      </div>
    </van-popup>

    <van-popup v-model:show="showDate" position="bottom" round>
      <van-date-picker
        :min-date="new Date()"
        @confirm="onPickDate"
        @cancel="showDate = false"
      />
    </van-popup>
    <van-popup v-model:show="showTime" position="bottom" round>
      <van-time-picker
        @confirm="onPickTime"
        @cancel="showTime = false"
      />
    </van-popup>
  </div>
</template>

<style scoped>
.group-page {
  min-height: 100vh;
  background: #f7f8fa;
}
.combo-list {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.qr-box {
  text-align: center;
  padding: 4px 16px 12px;
}
.qr-hint {
  margin: 0 0 8px;
  font-size: 13px;
  color: #969799;
}
.qr-img {
  max-width: 200px;
  border-radius: 8px;
  border: 1px solid #eee;
}
.combo-card {
  border: none;
  background: #fff;
  border-radius: 12px;
  display: flex;
  overflow: hidden;
  text-align: left;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
}
.cover {
  width: 96px;
  height: 96px;
  background: #f3f4f6 center/cover no-repeat;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.cover.empty {
  background: linear-gradient(145deg, #fff3e8, #ffe0c2);
}
.cover-placeholder {
  font-size: 28px;
  font-weight: 700;
  color: #ff6a00;
  opacity: 0.55;
}
.meta {
  padding: 12px;
  flex: 1;
}
.name {
  font-weight: 700;
  font-size: 15px;
}
.sub {
  margin-top: 10px;
  display: flex;
  justify-content: space-between;
  color: #6b7280;
  font-size: 12px;
}
.sub strong {
  color: #ff6a00;
}
.order-sheet {
  padding: 16px 0 24px;
  max-height: 88vh;
  overflow: auto;
}
.order-sheet h3 {
  margin: 0 16px 12px;
}
.group-block {
  margin-bottom: 8px;
}
.g-title {
  padding: 8px 16px;
  font-size: 13px;
  color: #6b7280;
}
.sheet-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  gap: 12px;
}
.sheet-footer strong {
  color: #ff6a00;
  font-size: 18px;
}
</style>

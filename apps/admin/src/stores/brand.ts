import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { getStoreBrandApi, type StoreBrand } from '../api/store';

export const useBrandStore = defineStore('brand', () => {
  const nameZh = ref('');
  const nameVi = ref('');
  const adminLogo = ref<string | null>(null);
  const loaded = ref(false);

  const markChar = computed(() => {
    const zh = nameZh.value.trim();
    if (zh) return zh.charAt(0);
    const vi = nameVi.value.trim();
    if (vi) return vi.charAt(0).toUpperCase();
    return '美';
  });

  function apply(data: StoreBrand) {
    nameZh.value = data.nameZh || '';
    nameVi.value = data.nameVi || '';
    adminLogo.value = data.adminLogo || null;
    loaded.value = true;
  }

  async function fetchBrand() {
    try {
      const data = await getStoreBrandApi();
      apply(data);
      return data;
    } catch {
      // 无门店或未登录时保持默认
      return null;
    }
  }

  return {
    nameZh,
    nameVi,
    adminLogo,
    loaded,
    markChar,
    apply,
    fetchBrand,
  };
});

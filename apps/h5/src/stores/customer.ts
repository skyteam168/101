import { defineStore } from 'pinia';
import { ref } from 'vue';
import { getMe, logoutCustomer, type CustomerProfile } from '../api/delivery';
import {
  clearCustomerToken,
  getCustomerToken,
  setCustomerProfile,
  setCustomerToken,
  getCustomerProfile,
} from '../utils/customer-storage';

export const useCustomerStore = defineStore('customer', () => {
  const token = ref<string | null>(getCustomerToken());
  const profile = ref<CustomerProfile | null>(getCustomerProfile());
  const loading = ref(false);

  /** 登录成功后调用 */
  function setAuth(newToken: string, newProfile: CustomerProfile) {
    token.value = newToken;
    profile.value = newProfile;
    setCustomerToken(newToken);
    setCustomerProfile(newProfile);
  }

  /** 退出登录（尽量通知服务端写审计日志） */
  async function logout() {
    try {
      if (token.value) await logoutCustomer();
    } catch {
      // 登出日志失败不挡本地清理
    }
    token.value = null;
    profile.value = null;
    clearCustomerToken();
  }

  /** 拉取最新用户信息 */
  async function loadMe() {
    if (!token.value) return;
    loading.value = true;
    try {
      const data = await getMe();
      profile.value = data;
      setCustomerProfile(data);
    } finally {
      loading.value = false;
    }
  }

  const isLoggedIn = () => !!token.value;

  return { token, profile, loading, setAuth, logout, loadMe, isLoggedIn };
});

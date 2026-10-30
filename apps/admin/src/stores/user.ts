import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { loginApi, logoutApi, meApi, type MeResult, type MenuNode } from '../api/auth';
import { clearTokens, getRefreshToken, setTokens } from '../utils/auth-storage';

export const useUserStore = defineStore('user', () => {
  const profile = ref<MeResult['user'] | null>(null);
  const roles = ref<MeResult['roles']>([]);
  const permissions = ref<string[]>([]);
  const menus = ref<MenuNode[]>([]);
  const ready = ref(false);

  const isSuperAdmin = computed(() => roles.value.some((r) => r.code === 'super_admin'));

  function hasPerm(code: string) {
    if (isSuperAdmin.value) return true;
    return permissions.value.includes(code);
  }

  async function login(username: string, password: string) {
    const data = await loginApi(username, password);
    setTokens(data.accessToken, data.refreshToken);
    await fetchMe();
  }

  async function fetchMe() {
    const data = await meApi();
    profile.value = data.user;
    roles.value = data.roles;
    permissions.value = data.permissions;
    menus.value = data.menus;
    ready.value = true;
    return data;
  }

  async function logout() {
    try {
      await logoutApi(getRefreshToken() ?? undefined);
    } catch {
      // ignore
    }
    clearTokens();
    profile.value = null;
    roles.value = [];
    permissions.value = [];
    menus.value = [];
    ready.value = false;
  }

  return {
    profile,
    roles,
    permissions,
    menus,
    ready,
    isSuperAdmin,
    hasPerm,
    login,
    fetchMe,
    logout,
  };
});

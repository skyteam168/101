import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { loginApi, logoutApi, meApi, type MeResult, type MenuNode } from '../api/auth';
import { clearTokens, getRefreshToken, setTokens } from '../utils/auth-storage';

/** 导航时若权限快照超过此时长，重新拉取 /auth/me */
const ME_STALE_MS = 15_000;

export const useUserStore = defineStore('user', () => {
  const profile = ref<MeResult['user'] | null>(null);
  const roles = ref<MeResult['roles']>([]);
  const permissions = ref<string[]>([]);
  const menus = ref<MenuNode[]>([]);
  const ready = ref(false);
  const lastFetchedAt = ref(0);

  const isSuperAdmin = computed(() => roles.value.some((r) => r.code === 'super_admin'));

  function hasPerm(code: string) {
    if (!code) return true;
    if (isSuperAdmin.value) return true;
    return permissions.value.includes(code);
  }

  function hasAnyPerm(codes: string[]) {
    if (!codes.length) return true;
    return codes.some((c) => hasPerm(c));
  }

  async function login(username: string, password: string, cfTurnstileToken?: string) {
    const data = await loginApi(username, password, cfTurnstileToken);
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
    lastFetchedAt.value = Date.now();
    return data;
  }

  /** 权限可能刚被改过：过期则重新拉 me，返回是否发生了刷新 */
  async function refreshMeIfStale(force = false) {
    if (!ready.value) {
      await fetchMe();
      return true;
    }
    if (!force && Date.now() - lastFetchedAt.value < ME_STALE_MS) return false;
    const prevMenus = JSON.stringify(menus.value.map((m) => m.code));
    const prevPerms = permissions.value.slice().sort().join('|');
    await fetchMe();
    const nextMenus = JSON.stringify(menus.value.map((m) => m.code));
    const nextPerms = permissions.value.slice().sort().join('|');
    return prevMenus !== nextMenus || prevPerms !== nextPerms;
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
    lastFetchedAt.value = 0;
  }

  return {
    profile,
    roles,
    permissions,
    menus,
    ready,
    lastFetchedAt,
    isSuperAdmin,
    hasPerm,
    hasAnyPerm,
    login,
    fetchMe,
    refreshMeIfStale,
    logout,
  };
});

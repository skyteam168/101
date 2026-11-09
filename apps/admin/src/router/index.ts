import { ElMessage } from 'element-plus';
import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import type { MenuNode } from '../api/auth';
import { i18n } from '../i18n';
import { getAccessToken } from '../utils/auth-storage';
import { constantRoutes, notFoundRoute, viewModules } from './routes';

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: constantRoutes,
});

let dynamicAdded = false;

function flattenMenus(menus: MenuNode[]): MenuNode[] {
  const list: MenuNode[] = [];
  const walk = (nodes: MenuNode[]) => {
    for (const n of nodes) {
      list.push(n);
      if (n.children?.length) walk(n.children);
    }
  };
  walk(menus);
  return list;
}

export function resetDynamicRoutes() {
  dynamicAdded = false;
  router.getRoutes().forEach((r) => {
    if (r.name && (String(r.name).startsWith('dyn-') || r.name === 'not-found')) {
      router.removeRoute(r.name);
    }
  });
}

export function addDynamicRoutes(menus: MenuNode[]) {
  if (dynamicAdded) return;
  const flat = flattenMenus(menus).filter((m) => m.path && viewModules[m.path]);
  for (const m of flat) {
    const path = m.path!;
    const route = {
      path: path.replace(/^\//, ''),
      name: `dyn-${m.code}`,
      component: viewModules[path] as RouteRecordRaw['component'],
      meta: {
        titleZh: m.nameZh,
        titleVi: m.nameVi,
        perm: m.code,
      },
    } as RouteRecordRaw;
    router.addRoute('layout', route);
  }
  if (!router.hasRoute('not-found')) {
    router.addRoute(notFoundRoute);
  }
  dynamicAdded = true;
}

function ensureNotFound() {
  if (!router.hasRoute('not-found')) {
    router.addRoute(notFoundRoute);
  }
}

function routePermDenied(store: {
  hasPerm: (code: string) => boolean;
  hasAnyPerm: (codes: string[]) => boolean;
}, to: { meta: Record<string, unknown>; matched: { meta: Record<string, unknown> }[] }) {
  // 取最深匹配记录上的权限声明
  const matched = [...to.matched].reverse();
  for (const record of matched) {
    const perm = record.meta.perm as string | undefined;
    const permAny = record.meta.permAny as string[] | undefined;
    if (perm && !store.hasPerm(perm)) return true;
    if (permAny?.length && !store.hasAnyPerm(permAny)) return true;
  }
  const perm = to.meta.perm as string | undefined;
  const permAny = to.meta.permAny as string[] | undefined;
  if (perm && !store.hasPerm(perm)) return true;
  if (permAny?.length && !store.hasAnyPerm(permAny)) return true;
  return false;
}

router.beforeEach(async (to, _from, next) => {
  if (to.meta.public && to.name !== 'not-found') {
    next();
    return;
  }
  const token = getAccessToken();
  if (!token) {
    ensureNotFound();
    next({ path: '/login', query: { redirect: to.fullPath } });
    return;
  }

  const { useUserStore } = await import('../stores/user');
  const store = useUserStore();
  if (!store.ready) {
    try {
      await store.fetchMe();
      addDynamicRoutes(store.menus);
      // 不能 next({ ...to })，否则会带着首次匹配到的 404 记录
      next({ path: to.fullPath, query: to.query, hash: to.hash, replace: true });
      return;
    } catch {
      await store.logout();
      ensureNotFound();
      next({ path: '/login', query: { redirect: to.fullPath } });
      return;
    }
  }

  // 进入带权限声明的页面时强制刷新 /auth/me，避免角色刚改完仍用旧快照放行
  const needsPermCheck = to.matched.some(
    (r) => !!(r.meta.perm || (Array.isArray(r.meta.permAny) && r.meta.permAny.length)),
  );
  let menusChanged = false;
  try {
    menusChanged = await store.refreshMeIfStale(needsPermCheck);
  } catch {
    // 刷新失败不阻断已登录会话，继续用旧快照做校验
  }
  if (menusChanged) {
    resetDynamicRoutes();
    addDynamicRoutes(store.menus);
    next({ path: to.fullPath, query: to.query, hash: to.hash, replace: true });
    return;
  }

  if (!dynamicAdded) {
    addDynamicRoutes(store.menus);
    next({ path: to.fullPath, query: to.query, hash: to.hash, replace: true });
    return;
  }

  if (to.name !== 'forbidden' && to.name !== 'dashboard' && routePermDenied(store, to)) {
    ElMessage.error(String(i18n.global.t('errors.FORBIDDEN')));
    next({ path: '/forbidden', replace: true });
    return;
  }

  next();
});

router.afterEach((to) => {
  const brand = String(i18n.global.t('app.title'));
  const page =
    i18n.global.locale.value === 'vi-VN'
      ? (to.meta.titleVi as string | undefined)
      : (to.meta.titleZh as string | undefined);
  document.title = page ? `${page} · ${brand}` : brand;
});

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import type { MenuNode } from '../api/auth';
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

  if (!dynamicAdded) {
    addDynamicRoutes(store.menus);
    next({ path: to.fullPath, query: to.query, hash: to.hash, replace: true });
    return;
  }
  next();
});

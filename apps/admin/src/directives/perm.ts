import type { App, Directive } from 'vue';
import { useUserStore } from '../stores/user';

function applyPerm(el: HTMLElement, value: string | string[] | undefined) {
  const store = useUserStore();
  const codes = Array.isArray(value) ? value : value ? [value] : [];
  const ok = !codes.length || codes.every((c) => store.hasPerm(c));
  if (ok) {
    el.style.removeProperty('display');
    el.removeAttribute('disabled');
  } else {
    el.style.display = 'none';
    el.setAttribute('disabled', 'true');
  }
}

const permDirective: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    applyPerm(el, binding.value);
  },
  updated(el, binding) {
    applyPerm(el, binding.value);
  },
};

export function setupPermDirective(app: App) {
  app.directive('perm', permDirective);
}

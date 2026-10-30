import type { App, Directive } from 'vue';
import { useUserStore } from '../stores/user';

const permDirective: Directive<HTMLElement, string | string[]> = {
  mounted(el, binding) {
    const store = useUserStore();
    const value = binding.value;
    const codes = Array.isArray(value) ? value : [value];
    const ok = codes.every((c) => store.hasPerm(c));
    if (!ok) {
      el.style.display = 'none';
      el.setAttribute('disabled', 'true');
    }
  },
};

export function setupPermDirective(app: App) {
  app.directive('perm', permDirective);
}

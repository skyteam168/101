/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_STORE_ID?: string;
  readonly VITE_CF_TURNSTILE_SITE_KEY?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

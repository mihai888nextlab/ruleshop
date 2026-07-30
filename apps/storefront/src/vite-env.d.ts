/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_RULESHOP_API_URL: string;
  readonly VITE_RULESHOP_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

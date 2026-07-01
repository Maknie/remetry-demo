/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_REMETRY_DSN?: string;
  readonly VITE_REMETRY_ENDPOINT?: string;
  readonly VITE_REMETRY_RELEASE?: string;
  readonly VITE_REMETRY_REPLAY_MODE?: "onError" | "always";
  readonly VITE_DASHBOARD_URL?: string;
  readonly VITE_MOCK_API_BASE?: string;
  readonly VITE_BAD_RELEASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

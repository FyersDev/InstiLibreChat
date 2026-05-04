/// <reference types="vite/client" />

/** Set in main.jsx at startup (see client/src/constants/api_list.ts). */
declare global {
  // eslint-disable-next-line no-var
  var __FYERS_T2_API__:
    | {
        base: string;
        urls: Readonly<Record<string, string>>;
        list: ReadonlyArray<{
          key: string;
          method: string;
          url: string;
          usedIn: string;
        }>;
      }
    | undefined;
}

export {};

interface ImportMetaEnv {
  readonly VITE_ENABLE_LOGGER: string;
  readonly VITE_LOGGER_FILTER: string;
  // Add other env variables here
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

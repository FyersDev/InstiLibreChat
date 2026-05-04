/**
 * FYERS Insti API hosts on api-t2.fyers.in
 *
 * Used in-repo:
 * - client/src/main.jsx — `globalThis.__FYERS_T2_API__` (base, urls, list)
 * - services/proxy/proxymain.go — GET user-details (`FYERS_T2_INSTI_ADMIN_USER_DETAILS` overrides URL;
 *   default string must match `fyersT2Urls.instiAdminUserDetails`)
 *
 * Add new rows here when you introduce additional api-t2 callers so URLs stay in one place.
 */
export const FYERS_T2_API_BASE = 'https://api-t2.fyers.in' as const;

/** Concrete URLs (append-only as new endpoints are wired up). */
export const fyersT2Urls = {
  /** GET — Insti admin user profile for SSO validation / role (proxy → FYERS). */
  instiAdminUserDetails: `${FYERS_T2_API_BASE}/insti/admin/user-details`,
} as const;

export type FyersT2UrlKey = keyof typeof fyersT2Urls;

/** Machine-readable list for tooling, OpenAPI notes, or UI diagnostics. */
export const fyersT2ApiList: ReadonlyArray<{
  key: FyersT2UrlKey;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** Full URL */
  url: string;
  /** Where this repo calls it */
  usedIn: string;
}> = [
  {
    key: 'instiAdminUserDetails',
    method: 'GET',
    url: fyersT2Urls.instiAdminUserDetails,
    usedIn: 'services/proxy/proxymain.go — fetchUserDetailsFromFyersAPI',
  },
];

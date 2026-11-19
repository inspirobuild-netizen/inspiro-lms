import { useAuthStore, type AdminUser } from './auth';

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? 'http://localhost:3000';

export type ApiResponse<T> =
  | { success: true; data: T; meta?: { page: number; limit: number; total: number } }
  | { success: false; error: { code: string; message: string; details?: unknown } };

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function doFetch(path: string, init: RequestInit, token?: string): Promise<Response> {
  // FormData bodies must NOT get a manual Content-Type — the browser sets
  // multipart/form-data with its boundary itself.
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      ...(init.body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
    credentials: 'include',
  });
}

// ── Single-flight token refresh ────────────────────────────────────────────────
// The access token lives 15 minutes; the refresh token (httpOnly cookie) 30 days.
// On any 401 we refresh once and retry — so admins stay signed in for 30 days.
let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  refreshPromise ??= (async () => {
    try {
      const res = await doFetch('/api/v1/auth/refresh', { method: 'POST' });
      const json = (await res.json()) as ApiResponse<{ accessToken: string; user: AdminUser }>;
      if (!res.ok || !json.success) return null;
      useAuthStore.getState().setAuth(json.data.user, json.data.accessToken);
      return json.data.accessToken;
    } catch {
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

// Expired/invalid access token → refresh once and retry (skip for auth endpoints).
async function fetchWithRefresh(path: string, init: RequestInit, token?: string): Promise<Response> {
  const res = await doFetch(path, init, token);
  if (res.status !== 401 || path.startsWith('/api/v1/auth/')) return res;

  const newToken = await refreshAccessToken();
  if (newToken) return doFetch(path, init, newToken);

  // Refresh failed — session is genuinely over
  useAuthStore.getState().clearAuth();
  if (typeof window !== 'undefined') window.location.href = '/login';
  throw new ApiError('SESSION_EXPIRED', 'Session expired — please sign in again');
}

async function request<T>(
  path: string,
  init?: RequestInit & { token?: string },
): Promise<{ data: T; meta?: { page: number; limit: number; total: number } }> {
  const { token, ...fetchInit } = init ?? {};

  const res = await fetchWithRefresh(path, fetchInit, token);

  const json = (await res.json()) as ApiResponse<T>;

  if (!json.success) {
    throw new ApiError(json.error.code, json.error.message, json.error.details);
  }

  return { data: json.data, meta: json.meta };
}

// ── File downloads ───────────────────────────────────────────────────────────
// A plain <a href download> cannot carry the Bearer token, so an export link
// always came back 401. Files are fetched like any other call — with the same
// refresh-and-retry, so a download after 15 idle minutes still works — and
// handed to the browser as a Blob.
export async function downloadFile(path: string, filename: string, token: string | null): Promise<void> {
  const res = await fetchWithRefresh(path, { method: 'GET' }, token ?? undefined);
  if (!res.ok) {
    const json = (await res.json().catch(() => null)) as ApiResponse<unknown> | null;
    if (json && !json.success) throw new ApiError(json.error.code, json.error.message, json.error.details);
    throw new ApiError('DOWNLOAD_FAILED', `Download failed (${res.status})`);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking in the same tick can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function createApiClient(token: string | null) {
  const opts = (extra?: RequestInit) => ({ ...extra, token: token ?? undefined });

  return {
    get: <T>(path: string) => request<T>(path, opts({ method: 'GET' })),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, opts({ method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined })),
    postForm: <T>(path: string, form: FormData) => request<T>(path, opts({ method: 'POST', body: form })),
    patch: <T>(path: string, body: unknown) =>
      request<T>(path, opts({ method: 'PATCH', body: JSON.stringify(body) })),
    put: <T>(path: string, body: unknown) =>
      request<T>(path, opts({ method: 'PUT', body: JSON.stringify(body) })),
    delete: <T>(path: string, body?: unknown) =>
      request<T>(path, opts({ method: 'DELETE', body: body !== undefined ? JSON.stringify(body) : undefined })),
  };
}

// Auth endpoints don't require a token
export const authApi = {
  login: (email: string, password: string) =>
    request<{ accessToken: string; user: AdminUser }>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  sendOtp: (phone: string) =>
    request<{ message: string; resendAfter: number }>('/api/v1/auth/send-otp', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    }),
  verifyOtp: (phone: string, otp: string) =>
    request<{ accessToken: string; user: AdminUser }>('/api/v1/auth/verify-otp', {
      method: 'POST',
      body: JSON.stringify({ phone, otp }),
    }),
  refresh: () => request<{ accessToken: string; user: AdminUser }>('/api/v1/auth/refresh', { method: 'POST' }),
  logout: (token: string) =>
    request<{ message: string }>('/api/v1/auth/logout', { method: 'POST', token: token }),
  forgotPassword: (email: string) =>
    request<{ message: string }>('/api/v1/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  resetPassword: (token: string, password: string) =>
    request<{ message: string }>('/api/v1/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, password }),
    }),
};

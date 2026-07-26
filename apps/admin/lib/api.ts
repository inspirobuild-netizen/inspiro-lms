import { useAuthStore } from './auth';

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
  return fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
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

async function request<T>(
  path: string,
  init?: RequestInit & { token?: string },
): Promise<{ data: T; meta?: { page: number; limit: number; total: number } }> {
  const { token, ...fetchInit } = init ?? {};

  let res = await doFetch(path, fetchInit, token);

  // Expired/invalid access token → refresh once and retry (skip for auth endpoints)
  if (res.status === 401 && !path.startsWith('/api/v1/auth/')) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      res = await doFetch(path, fetchInit, newToken);
    } else {
      // Refresh failed — session is genuinely over
      useAuthStore.getState().clearAuth();
      if (typeof window !== 'undefined') window.location.href = '/login';
      throw new ApiError('SESSION_EXPIRED', 'Session expired — please sign in again');
    }
  }

  const json = (await res.json()) as ApiResponse<T>;

  if (!json.success) {
    throw new ApiError(json.error.code, json.error.message, json.error.details);
  }

  return { data: json.data, meta: json.meta };
}

export function createApiClient(token: string | null) {
  const opts = (extra?: RequestInit) => ({ ...extra, token: token ?? undefined });

  return {
    get: <T>(path: string) => request<T>(path, opts({ method: 'GET' })),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, opts({ method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined })),
    patch: <T>(path: string, body: unknown) =>
      request<T>(path, opts({ method: 'PATCH', body: JSON.stringify(body) })),
    delete: <T>(path: string) => request<T>(path, opts({ method: 'DELETE' })),
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
    request<{ message: string }>('/api/v1/auth/logout', { method: 'POST', token }),
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

type AdminUser = { id: string; name: string; phone: string; role: 'admin' | 'instructor'; avatarUrl: string | null };

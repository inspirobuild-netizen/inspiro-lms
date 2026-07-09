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

async function request<T>(
  path: string,
  init?: RequestInit & { token?: string },
): Promise<{ data: T; meta?: { page: number; limit: number; total: number } }> {
  const { token, ...fetchInit } = init ?? {};

  const res = await fetch(`${API_BASE}${path}`, {
    ...fetchInit,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...fetchInit.headers,
    },
    credentials: 'include',
  });

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
};

type AdminUser = { id: string; name: string; phone: string; role: 'admin' | 'instructor'; avatarUrl: string | null };

'use client';

/** Tiny fetch wrapper for client components: JSON in/out, typed errors. */

export class RequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly issues?: Array<{ path: string; message: string }>,
  ) {
    super(code);
    this.name = 'RequestError';
  }
}

export async function api<T>(
  path: string,
  init?: Omit<RequestInit, 'body'> & { body?: unknown },
): Promise<T> {
  const { body, ...rest } = init ?? {};
  const requestInit: RequestInit = {
    ...rest,
    headers: { 'content-type': 'application/json', ...rest.headers },
  };
  if (body !== undefined) requestInit.body = JSON.stringify(body);
  const res = await fetch(path, requestInit);
  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    issues?: Array<{ path: string; message: string }>;
  };
  if (!res.ok) {
    throw new RequestError(res.status, data.error ?? 'request_failed', data.issues);
  }
  return data as T;
}

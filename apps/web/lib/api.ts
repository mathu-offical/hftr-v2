import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDb, NotFoundError, type Db } from '@hftr/db';
import { getAuthUserId } from './auth';

/**
 * Route hardening helpers. Every API handler is wrapped in withAuth() which
 * guarantees: authenticated Clerk user, parsed+validated input, ownership
 * errors → 404 (no existence leaks), unexpected errors → 500 without detail.
 */

export interface ApiContext {
  db: Db;
  clerkUserId: string;
}

type Handler<T> = (ctx: ApiContext) => Promise<T>;

export async function withAuth<T>(handler: Handler<T>): Promise<NextResponse> {
  const userId = await getAuthUserId();
  if (!userId) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  try {
    const result = await handler({ db: getDb(), clerkUserId: userId });
    return NextResponse.json(jsonSafe(result));
  } catch (err) {
    return errorResponse(err);
  }
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof z.ZodError) {
    return NextResponse.json(
      {
        error: 'invalid_input',
        issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 400 },
    );
  }
  if (err instanceof NotFoundError) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.code }, { status: err.status });
  }
  console.error('unhandled api error', err);
  return NextResponse.json({ error: 'internal_error' }, { status: 500 });
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
  ) {
    super(code);
    this.name = 'ApiError';
  }
}

/** Parse a JSON body against a schema; throws ZodError → 400. */
export async function parseBody<S extends z.ZodTypeAny>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, 'invalid_json');
  }
  return schema.parse(raw);
}

/** bigint-safe JSON serialization (fixed-point values). */
function jsonSafe(value: unknown): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v)),
  );
}

import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

/**
 * Default-deny: everything requires auth except the public marketing page,
 * health check, Clerk auth flows, and the cron drain route (which enforces
 * CRON_SECRET itself since Vercel cron cannot carry a Clerk session).
 *
 * When Clerk is unconfigured: production fails closed (401 on protected
 * routes); development passes through only if DEV_AUTH_BYPASS=1, where
 * lib/auth.ts substitutes a fixed dev user.
 */
const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health',
  '/api/queue/drain',
]);

const clerkConfigured = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY,
);
const devBypass = process.env.DEV_AUTH_BYPASS === '1' && process.env.NODE_ENV !== 'production';

const middleware = clerkConfigured
  ? clerkMiddleware(async (auth, req) => {
      if (!isPublicRoute(req)) {
        await auth.protect();
      }
    })
  : function fallbackMiddleware(req: Request & { nextUrl: URL }) {
      if (isPublicRoute(req as never) || devBypass) return NextResponse.next();
      return NextResponse.json({ error: 'auth_not_configured' }, { status: 401 });
    };

export default middleware;

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};

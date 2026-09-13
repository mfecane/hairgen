export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import '@/lib/serverBootstrap'

import { cookies } from 'next/headers';
import { auth } from '@/lib/auth/auth-server';

type SessionRequest = { idToken: string; refreshToken?: string };

// GET handler for next-auth session endpoint
export async function GET() {
  try {
    const session = await auth();
    return Response.json(session);
  } catch (e) {
    console.error('[auth/session] GET error:', e);
    return Response.json({ session: null });
  }
}

// POST handler for legacy token-based sessions (kept for compatibility)
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SessionRequest;
    const idToken = body?.idToken;
    const refreshToken = body?.refreshToken || '';
    if (!idToken) return Response.json({ error: 'MISSING_TOKEN' }, { status: 400 });

    const secure = process.env.NODE_ENV === 'production';
    const cookieStore = await cookies();
    const maxAge = 60 * 60; // 1 hour for ID token
    cookieStore.set('session_id_token', idToken, {
      httpOnly: true,
      secure,
      sameSite: 'lax',
      path: '/',
      maxAge,
    });
    if (refreshToken) {
      cookieStore.set('session_refresh_token', refreshToken, {
        httpOnly: true,
        secure,
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 14, // 14 days
      });
    }
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: 'SESSION_SET_FAILED' }, { status: 400 });
  }
}



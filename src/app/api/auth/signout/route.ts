export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import '@/lib/serverBootstrap'

import { cookies } from 'next/headers';
import { signOut } from '@/lib/auth/auth-server';

export async function POST() {
  try {
    // Use next-auth's signOut to properly clear the session
    await signOut({ redirect: false });
    
    // Also clear legacy session cookies if they exist
    const cookieStore = await cookies();
    cookieStore.set('session_id_token', '', { path: '/', maxAge: 0 });
    cookieStore.set('session_refresh_token', '', { path: '/', maxAge: 0 });
    
    console.log('[auth/signout] session cleared');
    return Response.json({ ok: true });
  } catch (error) {
    console.error('[auth/signout] error:', error);
    return Response.json({ ok: false, error: 'Failed to sign out' }, { status: 500 });
  }
}



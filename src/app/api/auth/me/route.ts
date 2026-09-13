export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

import '@/lib/serverBootstrap'

import { auth } from '@/lib/auth/auth-server';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return Response.json({ user: null });
    }

    return Response.json({ 
      user: { 
        uid: session.user.id, 
        email: session.user.email || '' 
      } 
    });
  } catch (e) {
    console.error('[auth/me] error:', e);
    return Response.json({ user: null });
  }
}



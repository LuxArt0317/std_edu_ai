import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { affairsClient } from './authClient';

import { AffairsContext, type AffairsIdentity } from './authContext';
export function AffairsAuthProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<AffairsIdentity>({ user: null, loading: Boolean(affairsClient), error: '' });
  useEffect(() => {
    if (!affairsClient) return;
    const client = affairsClient;
    let active = true, revision = 0;
    async function verify(session: Session | null) {
      const current = ++revision;
      if (!session) { if (active) setIdentity({ user: null, loading: false, error: '' }); return; }
      try {
        const result = await client.auth.getUser(session.access_token);
        if (result.error || !result.data.user?.identities?.some(item => item.provider === 'google'))
          throw new Error('Please sign in again with Google.');
        if (active && current === revision) setIdentity({ user: result.data.user, loading: false, error: '' });
      } catch {
        if (active && current === revision) setIdentity({ user: null, loading: false, error: 'Your School Affairs session could not be verified. Please sign in again.' });
      }
    }
    // Auth handlers stay synchronous: calling other Auth methods inside them can deadlock.
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) { revision++; if (active) setIdentity({ user: null, loading: false, error: '' }); }
      else {
        // Clear the previous person's UI/transcript before validating a different account.
        if (active) setIdentity(current => current.user?.id === session.user.id ? current : {user:null,loading:true,error:''});
        queueMicrotask(() => { if (active) void verify(session); });
      }
    });
    return () => { active = false; revision++; subscription.unsubscribe(); };
  }, []);
  return <AffairsContext value={identity}>{children}</AffairsContext>;
}

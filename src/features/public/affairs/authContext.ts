import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';
export type AffairsIdentity = { user: User | null; loading: boolean; error: string };
export const AffairsContext = createContext<AffairsIdentity>({ user: null, loading: false, error: '' });
export function useAffairsAuth() { return useContext(AffairsContext); }

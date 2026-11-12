import { useCallback, useEffect, useState } from 'react';
import { loadSchoolAffairsData, type AffairsSnapshot } from '@/services/schoolAffairsWorkspace';

export function useAffairsRecords(userId: string | undefined, admin = false) {
  const [version, setVersion] = useState(0);
  const refresh = useCallback(()=>setVersion(value=>value+1),[]);
  const [state, setState] = useState<{userId:string;version:number;admin:boolean;snapshot?:AffairsSnapshot;error?:string}>();
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30000)]);
    void loadSchoolAffairsData(admin,signal).then(snapshot => {
      if (snapshot.profile.userId !== userId) throw new Error('Your account changed. Reload the workspace.');
      if (!controller.signal.aborted) setState({userId,version,admin,snapshot});
    }).catch(error => {
      if (controller.signal.aborted) return;
      setState(prior=>({userId,version,admin,snapshot:prior?.userId===userId && prior.admin===admin?prior.snapshot:undefined,
        error:error instanceof Error ? error.message : 'Your records could not be loaded.'}));
    });
    return () => controller.abort();
  },[userId,version,admin]);
  const current = state?.userId === userId && state?.admin === admin ? state : undefined;
  return {
    snapshot:current?.snapshot, error:current?.error,
    loading:Boolean(userId && current?.version !== version),
    refresh,
  };
}

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { affairsClient } from './authClient';

type Student = { student_number: string; full_name: string; program: string; year_level: string };
export function SchoolAccountRecords({ userId }: { userId: string }) {
  const [state, setState] = useState<{loading:boolean;student:Student|null;error:boolean}>({loading:true,student:null,error:false});
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    async function load() {
      try {
        if (!affairsClient) throw new Error('Not configured');
        const {data,error} = await affairsClient.from('students')
          .select('student_number,full_name,program,year_level')
          .eq('profile_id', userId).eq('record_status','active').abortSignal(controller.signal).maybeSingle();
        if (error) throw error;
        if (active) setState({loading:false,student:data,error:false});
      } catch {
        if (active) setState({loading:false,student:null,error:true});
      }
    }
    void load();
    return () => {active=false;controller.abort();};
  }, [userId,attempt]);
  return <section className="portal-account-records" aria-label="My student record">
    <h2>我的學生資料 · My student record</h2>
    {state.loading ? <p role="status">Loading your linked record…</p> : state.error ? <><p role="alert">Your student record could not be loaded. No record has been changed.</p><Button variant="outline" onClick={()=>{setState({loading:true,student:null,error:false});setAttempt(attempt+1);}}>Try again</Button></> : state.student ? <dl>
      <dt>姓名 / Name</dt><dd>{state.student.full_name}</dd>
      <dt>學號 / Student number</dt><dd>{state.student.student_number}</dd>
      <dt>Program / Year</dt><dd>{state.student.program} · {state.student.year_level}</dd>
    </dl> : <><p>No student record is linked to this account.</p><p>Google sign-in confirms your identity. It does not automatically retrieve university courses, grades or fees. Ask the site administrator to link an authorized student record.</p></>}
  </section>;
}
export function SchoolAffairsPrivacy() {
  return <main className="affairs-login"><article className="affairs-login-wrap affairs-login-card">
    <h1>stu.best sign-in privacy</h1>
    <p>stu.best is an independent campus website. It is not the university’s identity provider.</p>
    <h2>Google account information</h2><p>Google authenticates you and shares your basic profile: name, email address and profile picture. We do not request Gmail mailbox, contacts, Drive or calendar access. Your Google password is entered only on Google.</p>
    <h2>Account and records</h2><p>Supabase stores your site account and authentication session. A new account receives student access, without staff or owner privileges. Student records are linked by an authorized administrator; signing in does not import official university records.</p>
    <h2>Browser storage</h2><p>A separate School Affairs session and account-specific display preferences are stored in your browser. Signing out of School Affairs leaves a separately signed-in Nexus management session unchanged. AI conversations are kept in page memory and cleared when the signed-in account changes. Submitted questions and attached images are processed by the site's AI service. School Affairs chat verifies your stu.best identity but does not read Nexus student, course, grade or timetable records; public questions use public knowledge and school web sources. Images are kept only in page memory for this chat.</p>
    <h2>Account assistance</h2><p>For account or data requests, contact the site administrator at <a href="mailto:luxart0317@gmail.com">luxart0317@gmail.com</a>.</p>
    <a href="/school-affairs/login">Return to sign in</a>
  </article></main>;
}

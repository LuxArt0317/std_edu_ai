import {useId} from 'react';
import './dormConduct.css';

export type DormConductIdentity={userId:string};
export type DormConductSnapshot={userId:string;sourceMode:'local_demo';version:number;result:'empty'|'unknown'};
export type DormConductProps={
  userId:string;
  identity:DormConductIdentity|null;
  snapshot:DormConductSnapshot|null;
  busy:boolean;
  error?:string|null;
  onReload:()=>void;
  onHome:()=>void;
};

const uuid=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
const object=(value:unknown):value is Record<string,unknown>=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value));
const exact=(value:Record<string,unknown>,keys:string[])=>Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key));

/** An absent/foreign/malformed response can never establish an empty history. */
// oxlint-disable-next-line react/only-export-components -- This unmounted view owns its small pure input boundary.
export function ownDormConductResult(userId:unknown,identity:unknown,snapshot:unknown):'empty'|'unknown'{
  if(!uuid(userId)||!object(identity)||!exact(identity,['userId'])||identity.userId!==userId
    ||!object(snapshot)||!exact(snapshot,['userId','sourceMode','version','result'])||snapshot.userId!==userId
    ||snapshot.sourceMode!=='local_demo'||!Number.isSafeInteger(snapshot.version)||Number(snapshot.version)<1||Number(snapshot.version)>999999999
    ||(snapshot.result!=='empty'&&snapshot.result!=='unknown'))return 'unknown';
  return snapshot.result==='empty'?'empty':'unknown';
}

/** Captured message page only: no inferred record table, issuance or housing action. */
export function DormConduct({userId,identity,snapshot,busy,error,onReload,onHome}:DormConductProps){
  const titleId=useId();
  const result=ownDormConductResult(userId,identity,snapshot);
  const state=busy?'loading':error?'error':result;
  const message=state==='loading'?'正在載入住宿獎懲紀錄…':state==='error'?'目前無法載入住宿獎懲紀錄，請稍後再試。'
    :state==='empty'?'您尚未有任何住宿的獎懲記錄.':'目前無法確認住宿獎懲紀錄。';
  return <div className="dorm-conduct" lang="zh-Hant">
    <main className="dorm-conduct-shell" aria-labelledby={titleId} aria-busy={busy}>
      <div className="dorm-conduct-container">
      <div className="dorm-conduct-frame">
        <div className="dorm-conduct-content">
          <header className="dorm-conduct-heading">
            <div className="dorm-conduct-logo"><img src="/stu-reference/dorm-conduct-logo.png" alt="" width="42" height="45"/></div>
            <h1 id={titleId}>校務系統事件訊息</h1>
            <div className="dorm-conduct-subtitle" aria-hidden="true"/>
          </header>
          <div className="dorm-conduct-message-row">
            <div className="dorm-conduct-message-icon" aria-hidden="true"><img src="/stu-reference/dorm-conduct-notice.png" alt="" width="42" height="45"/></div>
            <div className="dorm-conduct-message-spacer" aria-hidden="true"/>
            <div className={'dorm-conduct-message is-'+state} role={state==='error'?'alert':'status'}>
              <p>{message}</p>
              {(state==='unknown'||state==='error')&&<button type="button" className="dorm-conduct-retry" onClick={onReload}>重新載入</button>}
            </div>
          <nav className="dorm-conduct-related" aria-label="相關連結">
            相關連結： <button type="button" role="link" onClick={onHome}>HomePage</button>
          </nav>
          </div>
          <hr className="dorm-conduct-divider"/>
          <div className="dorm-conduct-support-spacer" aria-hidden="true"/>
          <p className="dorm-conduct-support">倘若有任何問題，請與電算中心聯繫，我們將竭誠為您服務。 謝謝您的支持！</p>
        </div>
        <footer className="dorm-conduct-footer">Shu-Te University 樹德科技大學 82445 高雄市燕巢區橫山路59號 (07) 6158000</footer>
      </div>
      </div>
    </main>
  </div>;
}

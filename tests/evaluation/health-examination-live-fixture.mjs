import {createHash} from 'node:crypto';
import {assertHealthExaminationFixtureIdentities,assertHealthExaminationFixtureRows,buildHealthExaminationFixturePlan,
  healthExaminationFixtureManifest,reconcileHealthExaminationFixturePlans} from './health-examination-fixture-plan.mjs';

const {table,columns}=healthExaminationFixtureManifest;
const fail=()=>{throw new Error('Health metadata fixture ownership or reconciliation could not be verified.');};

function idsFor(...plans){return [...new Set(plans.flatMap(plan=>plan?.recordIds??[]))];}

async function selectRows(sql,owners,ids,lock=false){
  const rows=await sql`select id,user_id,examination_code,student_number,student_name,class_label,examined_on::text as examined_on,report_available
    from public.affairs_health_examinations where user_id in ${sql(owners)} or id in ${sql(ids)}
    order by id limit 201 ${lock?sql`for update`:sql``}`;
  return {[table]:rows};
}

async function checkOwners(sql,plan){
  const owners=Object.values(plan.owners);
  const identities=await sql`select id,email,raw_user_meta_data->>'assistant_evaluation_run' as "runMarker"
    from auth.users where id in ${sql(owners.map(owner=>owner.id))}`;
  assertHealthExaminationFixtureIdentities(plan,{identities});
  return owners.map(owner=>owner.id);
}

export function createHealthMetadataFixture({sql,runId,owners,assertLease,persist,transaction}){
  let current=null,pending=null,uncertain=false;
  const allIds=new Set();
  const journal=()=>({current:current?.fixtureKey??null,pending:pending?.fixtureKey??null,
    uncertain,reservedIds:[...allIds].sort()});
  async function transition(family){
    const cleanup=family===null;
    if(!cleanup&&uncertain)fail();
    if(cleanup&&!current&&!pending)return;
    const next=cleanup?null:buildHealthExaminationFixturePlan({runId,owners,fixtureKey:family});
    if(!cleanup&&current?.fixtureKey===next.fixtureKey)return;
    const recovery=pending??next;
    const anchor=current??recovery;
    await assertLease({cleanup});
    // An ID seen before mutation is never added to the cleanup journal.
    if(next){
      const ownerIds=await checkOwners(sql,anchor);
      const observed=await selectRows(sql,ownerIds,idsFor(current,next));
      const expected=current?'previous':'empty';
      const found=reconcileHealthExaminationFixturePlans({previous:current,next,actual:observed});
      if(found.state!==expected)fail();
      pending=next;
      for(const id of next.recordIds)allIds.add(id);
      uncertain=true;
      await persist(journal());
    }
    const ids=[...allIds];
    await transaction(async()=>{
      const ownerIds=await checkOwners(sql,anchor);
      const actual=await selectRows(sql,ownerIds,ids,true);
      const reconciled=reconcileHealthExaminationFixturePlans({previous:current,next:recovery,actual});
      if(!cleanup&&reconciled.state!==(current?'previous':'empty'))fail();
      for(const {id,userId} of reconciled.deleteTargets){
        const deleted=await sql`delete from public.affairs_health_examinations
          where id=${id} and user_id=${userId} and report_available=false returning id`;
        if(deleted.length!==1||deleted[0].id!==id)fail();
      }
      if((await selectRows(sql,ownerIds,ids))[table].length!==0)fail();
      if(next){
        await sql`insert into public.affairs_health_examinations ${sql(next.rows[table],...columns)}`;
        assertHealthExaminationFixtureRows(next,await selectRows(sql,ownerIds,ids));
      }
    });
    current=next;
    pending=null;
    uncertain=false;
    await persist(journal());
  }
  return {
    transition,cleanup:()=>transition(null),
    current:()=>current,
    async observe(){
      if(!current||uncertain)fail();
      await assertLease({cleanup:false});
      const ownerIds=await checkOwners(sql,current);
      const actual=await selectRows(sql,ownerIds,[...allIds]);
      assertHealthExaminationFixtureRows(current,actual);
      return createHash('sha256').update(JSON.stringify(actual[table].map(row=>columns.map(key=>row[key])))).digest('hex');
    },
    async verifyAbsent(){
      if(current||pending||uncertain)fail();
      if(!allIds.size)return;
      const rows=await selectRows(sql,Object.values(owners).map(owner=>owner.id),[...allIds]);
      if(rows[table].length)fail();
    },
  };
}

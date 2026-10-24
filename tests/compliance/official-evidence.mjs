import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// No network or database access: all route dependencies are isolated below.
// --source <route.ts> allows checking an earlier release for the regression.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const requireWeb=createRequire(path.join(root,'apps/web/package.json'));
const ts=requireWeb('typescript');
const args=process.argv.slice(2);
assert.ok(args.length===0||(args.length===2&&args[0]==='--source'),'Usage: official-evidence.mjs [--source <route.ts>]');
const sourcePath=args.length?path.resolve(args[1]):path.join(root,'apps/web/app/api/compliance/official-standards/route.ts');
const compiled=ts.transpileModule(fs.readFileSync(sourcePath,'utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS},
 reportDiagnostics:true,
});
assert.equal((compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,'Official standards route must transpile');

const organization='synthetic-org';
const tableName='moe_official_standard_requirements';
const row=(patch={})=>({id:'req-1',organization_id:organization,standard_key:'synthetic-standard',clause_ref:'1',title:'Synthetic requirement',control_key:'idm-exclusive',applicability:'APPLICABLE',status:'PARTIAL',evidence_reference:null,...patch});

function harness({initial=row(),syncFailure=null}={}){
 const state={
  rows:[initial,row({id:'req-foreign',organization_id:'other-org',status:'PASS',evidence_reference:'other-org-proof'})],
  queries:[],snapshots:[],audits:[],
 };
 function query(table){
  let operation='select',patch=null,single=false;
  const filters=[];
  const q={
   select(){return q;},
   eq(key,value){filters.push([key,value]);return q;},
   order(){return q;},
   limit(){return q;},
   maybeSingle(){single=true;return q;},
   single(){single=true;return q;},
   update(value){operation='update';patch=value;return q;},
   insert(value){operation='insert';patch=value;return q;},
   then(resolve,reject){
    state.queries.push({table,operation,filters:[...filters],single});
    let data=single?null:[];
    let error=null;
    if(table===tableName){
     const matching=state.rows.filter(r=>filters.every(([key,value])=>r[key]===value));
     if(operation==='update'){
      const isReviewSync=filters.some(([key])=>key==='control_key');
      if(isReviewSync&&syncFailure){
       data=syncFailure==='error'?null:[];
       error=syncFailure==='error'?{code:'XX999',message:'Synthetic sync failure'}:null;
      }else{
       for(const r of matching)Object.assign(r,patch);
       data=single?matching[0]||null:matching;
      }
     }else data=single?matching[0]||null:matching;
    }
    if(table==='moe_official_standard_reviews'&&operation==='insert'){
     const snapshot={id:'synthetic-review',...patch};
     state.snapshots.push(snapshot);
     data=single?snapshot:[snapshot];
    }
    return Promise.resolve({data,error}).then(resolve,reject);
   },
  };
  return q;
 }
 const exports={};
 vm.runInNewContext(compiled.outputText,{
  exports,
  require(name){
   if(name==='crypto')return requireWeb('node:crypto');
   if(name==='next/server')return{NextResponse:{json:(body,init)=>({body,status:init?.status||200})}};
   if(name==='../../../../lib/server-auth')return{
    requireUser:async()=>({admin:{from:query},profile:{id:'synthetic-admin',role:'ADMIN',organization_id:organization}}),
    requireSensitiveAdminAction(){},
    writeSecurityAudit:async(...values)=>{state.audits.push(values);},
    apiError:error=>({status:500,message:String(error?.message||error),code:'TEST_ERROR'}),
   };
   throw new Error(`Unexpected import in isolated official standards test: ${name}`);
  },
  console,Request,Date,Promise,Set,Number,String,Array,Boolean,Math,
 },{filename:sourcePath});
 return{
  state,
  get:()=>exports.GET(new Request('http://local.invalid/api/compliance/official-standards')),
  post:body=>exports.POST(new Request('http://local.invalid/api/compliance/official-standards',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})),
 };
}

// 1. A PASS needs evidence, including when only the existing evidence is erased.
for(const[initial,patch]of[
 [row(),{status:'PASS'}],
 [row({status:'PASS',evidence_reference:'review-123'}),{evidence_reference:'  '}],
]){
 const h=harness({initial});
 const response=await h.post({action:'update_requirement',id:'req-1',...patch});
 assert.equal(response.status,400,'PASS without evidence must be rejected');
 assert.equal(response.body.code,'EVIDENCE_REQUIRED');
 assert.equal(h.state.queries.filter(q=>q.operation==='update').length,0,'Rejected evidence edits must not write');
 assert.equal(h.state.audits.length,0,'Rejected edits must not record a successful update');
}

// 2. An honest partial result remains saveable without supporting evidence.
{
 const h=harness({initial:row({status:'PASS',evidence_reference:'review-123'})});
 const response=await h.post({action:'update_requirement',id:'req-1',status:'PARTIAL',evidence_reference:''});
 assert.equal(response.status,200);
 assert.equal(response.body.ok,true);
 assert.equal(response.body.requirement.status,'PARTIAL');
 assert.equal(response.body.requirement.evidence_reference,null);
}

// 3. PASS with evidence is saveable, and both lookup and update are tenant-scoped.
{
 const h=harness();
 const response=await h.post({action:'update_requirement',id:'req-1',status:'PASS',evidence_reference:' review-456 '});
 assert.equal(response.status,200);
 assert.equal(response.body.requirement.status,'PASS');
 assert.equal(response.body.requirement.evidence_reference,'review-456');
 for(const operation of['select','update']){
  const calls=h.state.queries.filter(q=>q.table===tableName&&q.operation===operation);
  assert.equal(calls.length,1,`Expected one ${operation} for the requested requirement`);
  assert.ok(calls[0].filters.some(([k,v])=>k==='organization_id'&&v===organization),`${operation} must filter the current tenant`);
  assert.ok(calls[0].filters.some(([k,v])=>k==='id'&&v==='req-1'),`${operation} must filter the requested id`);
 }
 assert.equal(h.state.rows[1].evidence_reference,'other-org-proof','Another tenant must remain unchanged');
 assert.equal(h.state.audits.length,1);
 const foreign=await h.post({action:'update_requirement',id:'req-foreign',status:'PASS',evidence_reference:'replacement'});
 assert.equal(foreign.status,404,'An id belonging to another tenant must not be editable');
 assert.equal(h.state.rows[1].evidence_reference,'other-org-proof');
}

// 4. A failed or zero-row review sync must not produce a success or a snapshot.
for(const syncFailure of['error','empty']){
 const h=harness({syncFailure});
 const response=await h.post({action:'run_review'});
 assert.equal(response.status,502,`${syncFailure}: incomplete sync must fail`);
 assert.equal(response.body.code,'REVIEW_SYNC_INCOMPLETE');
 assert.notEqual(response.body.ok,true);
 assert.equal(h.state.snapshots.length,0,`${syncFailure}: no review snapshot may be created`);
 assert.equal(h.state.audits.length,0,`${syncFailure}: no completed-review audit may be created`);
}

// 5. Legacy PASS rows without evidence must not inflate the displayed summary.
{
 const h=harness({initial:row({status:'PASS',evidence_reference:'  '})});
 const response=await h.get();
 assert.equal(response.status,200);
 assert.equal(response.body.requirements[0].status,'PARTIAL');
 assert.equal(response.body.summary.counts.PASS,0);
 assert.equal(response.body.summary.counts.PARTIAL,1);
 assert.equal(response.body.summary.score,50);
 assert.equal(h.state.rows[0].status,'PASS','Read-time normalization must not mutate stored evidence');
 assert.equal(h.state.queries.filter(q=>q.operation==='update').length,0);
}

console.log('PASS: official evidence guards, partial/pass saves, tenant-scoped reads and writes, failed/empty review sync, legacy summary normalization.');

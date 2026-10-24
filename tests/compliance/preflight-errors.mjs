import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// Run from any directory: node <project>/tests/compliance/preflight-errors.mjs
// --source <route.ts> also allows verifying that the regression exists in a
// previous release. All database, authentication and response calls are mocked.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const requireWeb=createRequire(path.join(root,'apps/web/package.json'));
const ts=requireWeb('typescript');
const args=process.argv.slice(2);
assert.ok(args.length===0||(args.length===2&&args[0]==='--source'),'Usage: preflight-errors.mjs [--source <route.ts>]');
const sourcePath=args.length?path.resolve(args[1]):path.join(root,'apps/web/app/api/compliance/preflight/route.ts');
const source=fs.readFileSync(sourcePath,'utf8');
const compiled=ts.transpileModule(source,{
 compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.CommonJS},
 reportDiagnostics:true,
});
assert.equal((compiled.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,'Preflight must transpile without syntax errors');

// Each case names a failing dependency, the failure check that should be
// returned, and checks that must never claim success without that dependency.
const cases=[
 ['privacy_subprocessors','external-egress',['external-provider-readiness']],
 ['identity_assurance_policies','identity-assurance',['identity-session-risk','identity-access-review']],
 ['security_user_sessions','identity-assurance',['identity-session-risk']],
 ['access_review_items','identity-assurance',['identity-access-review']],
 ['security_detection_policies','detection-governance',['siem-forwarding']],
 ['security_alerts','detection-governance',['critical-alerts']],
 ['cryptographic_key_inventory','crypto-governance',['crypto-kms','crypto-rotation']],
 ['security_secret_inventory','crypto-governance',['crypto-secret-manager','crypto-rotation']],
 ['storage_security_evidence','crypto-governance',['crypto-storage']],
 ['service_dependency_inventory','continuity-governance',['continuity-review','continuity-failover','continuity-supplier-evidence']],
 ['continuity_action_items','continuity-governance',['continuity-critical-actions']],
 ['security_testing_policies','security-testing',['security-testing-independent']],
 ['security_retests','security-testing',['security-testing-retest']],
 ['security_vulnerabilities','security-testing',['security-testing-retest']],
 ['compliance_submission_freeze_policies','submission-freeze-schema',['submission-freeze-latest']],
 ['BUCKETS','storage',['bucket-documents']],
 ['RPC','rls-posture',['rls-security_audit_events']],
];

function fakeAdmin(failedTable,reject){
 function query(table){
  let head=false,single=false;
  const q={
   select(_fields,opts){head=!!opts?.head;return q;},
   maybeSingle(){single=true;return q;},
   then(resolve,rejectPromise){
    // Table probes succeed: existence of a table must not be mistaken for
    // successful retrieval of the evidence used by the readiness checks.
    if(!head&&failedTable===table){
     const error={code:'XX999',message:'SECRET_INTERNAL_SENTINEL SQL details'};
     return(reject?Promise.reject(error):Promise.resolve({data:null,error})).then(resolve,rejectPromise);
    }
    let data=single?null:[];
    if(table==='compliance_submission_freezes'&&!head)data={freeze_number:1,status:'FROZEN',valid_until:'2099-12-31',approved_at:null};
    if(table==='compliance_submission_freeze_policies'&&!head)data={require_two_person_freeze:false};
    return Promise.resolve({data,error:null}).then(resolve,rejectPromise);
   },
  };
  for(const method of ['eq','neq','is','in','gte','order','limit'])q[method]=()=>q;
  return q;
 }
 return{from:query,storage:{listBuckets:()=>query('BUCKETS')},rpc:()=>query('RPC')};
}

async function run(failedTable,reject=false,role='ADMIN'){
 const exports={};
 const admin=fakeAdmin(failedTable,reject);
 let audited=false;
 vm.runInNewContext(compiled.outputText,{
  exports,
  require(name){
   if(name==='next/server')return{NextResponse:{json:(body,init)=>({body,status:init?.status||200})}};
   if(name==='../../../../lib/server-auth')return{
    requireUser:async()=>({admin,profile:{role,organization_id:'synthetic-org'}}),
    writeSecurityAudit:async()=>{audited=true;},
    apiError:()=>({message:'Forbidden',code:'FORBIDDEN',status:403}),
   };
   throw new Error(`Unexpected import in isolated preflight test: ${name}`);
  },
  process:{env:{}},
  console,Request,Date,Promise,Set,Number,String,Array,Boolean,Math,
 },{filename:sourcePath});
 const response=await exports.GET(new Request('http://local.invalid/api/compliance/preflight'));
 return{response,audited};
}

for(const[table,group,unsafeKeys]of cases){
 for(const reject of[false,true]){
  const label=`${table} (${reject?'rejected promise':'resolved error'})`;
  const{response,audited}=await run(table,reject);
  const{body}=response;
  assert.equal(response.status,200,`${label}: report request should complete`);
  assert.equal(body.ok,true,`${label}: report should preserve its response contract`);
  assert.ok(audited,`${label}: completed preflight should be audited`);
  assert.ok(body.checks.some(c=>c.key===group&&!c.ok),`${label}: missing failed group`);
  for(const key of unsafeKeys)assert.ok(!body.checks.some(c=>c.key===key&&c.ok),`${label}: unsafe PASS for ${key}`);
  assert.ok(!JSON.stringify(body).includes('SECRET_INTERNAL_SENTINEL'),`${label}: raw database error leaked`);
  assert.equal(body.passed+body.failed,body.checks.length,`${label}: inconsistent counts`);
 }
}

const{response,audited}=await run('',false,'TEACHER');
assert.equal(response.status,403,'A non-admin user must be rejected');
assert.equal(audited,false,'A rejected request must not record a completed preflight');
console.log(`PASS: ${cases.length*2} database error/rejection scenarios; sanitized errors, no false PASS, consistent counts; non-admin rejected.`);

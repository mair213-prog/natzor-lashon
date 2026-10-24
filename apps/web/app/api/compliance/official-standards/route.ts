import {createHash} from 'crypto';
import {NextResponse} from 'next/server';
import {apiError,requireSensitiveAdminAction,requireUser,writeSecurityAudit} from '../../../../lib/server-auth';

const sha=(v:any)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const validStatus=new Set(['PASS','PARTIAL','GAP','EXTERNAL','NA']);
const validApplicability=new Set(['APPLICABLE','CONDITIONAL','REVIEW','NOT_APPLICABLE']);

async function latest(admin:any,table:string,org:string,fields='*'){
 const r=await admin.from(table).select(fields).eq('organization_id',org).order('created_at',{ascending:false}).limit(1).maybeSingle();
 return r.error?null:r.data;
}

async function load(admin:any,org:string){
 const [{data:reqs,error:reqErr},{data:policy}, {data:envs}, {data:secPolicy}, {data:reviews}] = await Promise.all([
  admin.from('moe_official_standard_requirements').select('*').eq('organization_id',org).order('sort_order'),
  admin.from('moe_idm_policies').select('*').eq('organization_id',org).maybeSingle(),
  admin.from('moe_idm_environment_configs').select('*').eq('organization_id',org),
  admin.from('organization_security_policies').select('require_mfa,session_timeout_minutes').eq('organization_id',org).maybeSingle(),
  admin.from('moe_official_standard_reviews').select('*').eq('organization_id',org).order('created_at',{ascending:false}).limit(20)
 ]);
 if(reqErr)throw reqErr;
 const [infra,detection,appsec,testing,privacy,identity,crypto,clientData,components,supplyChain,releaseIntegrity,environmentAssurance,runtimeResidency,thirdParty,vendorLifecycle]=await Promise.all([
  latest(admin,'production_infrastructure_reviews',org,'readiness_score,blockers,created_at'),
  latest(admin,'security_detection_review_runs',org,'score,failed,critical_open,overdue_alerts,created_at'),
  latest(admin,'application_hardening_reviews',org,'readiness_score,findings,created_at'),
  latest(admin,'security_testing_reviews',org,'readiness_score,findings,created_at'),
  latest(admin,'privacy_operations_review_runs',org,'status,summary,findings,created_at'),
  latest(admin,'identity_assurance_review_runs',org,'status,summary,findings,created_at'),
  latest(admin,'crypto_evidence_snapshots',org,'readiness_score,created_at'),
  latest(admin,'client_data_audit_runs',org,'result,manifest,manifest_sha256,created_at'),
  latest(admin,'software_component_snapshots',org,'component_count,manifest,manifest_sha256,created_at'),
  latest(admin,'supply_chain_evidence_runs',org,'result,sbom_component_count,vulnerability_counts,source,manifest,manifest_sha256,created_at'),
  latest(admin,'release_integrity_evidence_runs',org,'result,ci_counts,secret_findings,unpinned_actions,source_commit,repository_tree_sha256,cryptographically_signed,manifest_sha256,created_at'),
  latest(admin,'environment_assurance_evidence_runs',org,'result,environment_results,collision_findings,manifest_sha256,created_at'),
  latest(admin,'runtime_residency_evidence_runs',org,'result,runtime_manifest,external_services,findings,manifest_sha256,created_at'),
  latest(admin,'third_party_governance_evidence_runs',org,'result,vendor_count,findings,manifest_sha256,created_at'),
  latest(admin,'vendor_lifecycle_evidence_runs',org,'result,active_vendor_count,offboarding_vendor_count,findings,manifest_sha256,created_at')
 ]);
 const requirements=(reqs||[]).map((row:any)=>row.status==='PASS'&&!String(row.evidence_reference||'').trim()?{...row,status:'PARTIAL',next_action:row.next_action||'יש לצרף אסמכתה לפני סימון הסעיף כעומד בדרישה.'}:row);
 const counts={PASS:0,PARTIAL:0,GAP:0,EXTERNAL:0,NA:0};
 for(const x of requirements)(counts as any)[x.status]=((counts as any)[x.status]||0)+1;
 const applicable=requirements.filter((x:any)=>x.applicability!=='NOT_APPLICABLE'&&x.status!=='NA');
 const weighted=applicable.reduce((n:number,x:any)=>n+(x.status==='PASS'?1:x.status==='PARTIAL'?0.5:x.status==='EXTERNAL'?0.5:0),0);
 const score=Math.round(weighted/Math.max(1,applicable.length)*100);
 const prod=(envs||[]).find((x:any)=>x.environment==='PRODUCTION')||null;
 return {requirements,reviews:reviews||[],summary:{score,counts,total:requirements.length,internal_gaps:requirements.filter((x:any)=>x.status==='GAP').length,external_dependencies:requirements.filter((x:any)=>x.status==='EXTERNAL').length},idm:{policy:policy||null,production:prod,security_policy:secPolicy||null},evidence:{production_infrastructure:infra,detection,application_security:appsec,security_testing:testing,privacy,identity,crypto,client_data:clientData,software_components:components,supply_chain:supplyChain,release_integrity:releaseIntegrity,environment_assurance:environmentAssurance,runtime_residency:runtimeResidency,third_party_governance:thirdParty,vendor_lifecycle:vendorLifecycle},generated_at:new Date().toISOString()};
}

export async function GET(req:Request){
 try{const ctx=await requireUser(req);if(!['ADMIN','MANAGER'].includes(String(ctx.profile.role||'').toUpperCase()))throw new Error('FORBIDDEN');return NextResponse.json(await load(ctx.admin,ctx.profile.organization_id),{headers:{'cache-control':'no-store'}})}
 catch(e){const x=apiError(e);return NextResponse.json({error:x.message,code:x.code},{status:x.status,headers:{'cache-control':'no-store'}})}
}

export async function POST(req:Request){
 try{
  const ctx=await requireUser(req);if(!['ADMIN','MANAGER'].includes(String(ctx.profile.role||'').toUpperCase()))throw new Error('FORBIDDEN');
  const body=await req.json();const action=String(body.action||'');const org=ctx.profile.organization_id;const actor=ctx.profile.id;const now=new Date().toISOString();
  if(action==='update_requirement'){
   const id=String(body.id||'');if(!id)throw new Error('VALIDATION_ERROR');
   const patch:any={updated_at:now,verified_by:actor,verified_at:now};
   if(validStatus.has(String(body.status)))patch.status=String(body.status);
   if(validApplicability.has(String(body.applicability)))patch.applicability=String(body.applicability);
   for(const k of ['evidence_reference','owner_name','next_action','notes'])if(k in body)patch[k]=String(body[k]||'').trim().slice(0,k==='notes'?8000:3000)||null;
   const current=await ctx.admin.from('moe_official_standard_requirements').select('id,status,evidence_reference').eq('id',id).eq('organization_id',org).maybeSingle();
   if(current.error)throw current.error;
   if(!current.data)return NextResponse.json({error:'הסעיף לא נמצא בארגון הנוכחי.'},{status:404});
   const effectiveStatus=patch.status??current.data.status;
   const effectiveEvidence='evidence_reference' in patch?patch.evidence_reference:current.data.evidence_reference;
   if(effectiveStatus==='PASS'&&!String(effectiveEvidence||'').trim())return NextResponse.json({error:'יש לצרף אסמכתה לפני סימון הסעיף כעומד בדרישה. ניתן לשמור בינתיים סטטוס חלקי.',code:'EVIDENCE_REQUIRED'},{status:400});
   const{data,error}=await ctx.admin.from('moe_official_standard_requirements').update(patch).eq('id',id).eq('organization_id',org).select().single();if(error)throw error;
   await writeSecurityAudit(ctx.admin,ctx.profile,req,'MOE_STANDARD_REQUIREMENT_UPDATED','moe_standard_requirement',id,{standard_key:data.standard_key,clause_ref:data.clause_ref,status:data.status});
   return NextResponse.json({ok:true,requirement:data});
  }
  if(action==='save_auth_policy'){
   requireSensitiveAdminAction(ctx,['ADMIN']);
   const mode=String(body.staff_auth_mode||'LOCAL_ALLOWED');if(!['LOCAL_ALLOWED','IDM_TEST','IDM_ONLY'].includes(mode))throw new Error('VALIDATION_ERROR');
   if(mode==='IDM_ONLY'){
    const{data:prod}=await ctx.admin.from('moe_idm_environment_configs').select('status,ministry_approved').eq('organization_id',org).eq('environment','PRODUCTION').maybeSingle();
    if(!prod||prod.status!=='VERIFIED'||prod.ministry_approved!==true)throw new Error('IDM_PRODUCTION_NOT_APPROVED');
   }
   const roles=Array.isArray(body.enforce_idm_roles)?body.enforce_idm_roles.map((x:any)=>String(x).toUpperCase()).filter(Boolean):undefined;
   const patch:any={organization_id:org,staff_auth_mode:mode,allow_parent_local_auth:body.allow_parent_local_auth!==false,allow_external_local_auth:body.allow_external_local_auth!==false,updated_by:actor,updated_at:now};
   if(roles?.length)patch.enforce_idm_roles=roles;
   const{data,error}=await ctx.admin.from('moe_idm_policies').upsert(patch,{onConflict:'organization_id'}).select().single();if(error)throw error;
   await writeSecurityAudit(ctx.admin,ctx.profile,req,'MOE_IDM_AUTH_MODE_UPDATED','moe_idm_policy',org,{staff_auth_mode:mode});
   return NextResponse.json({ok:true,policy:data});
  }
  if(action==='run_review'){
   const before=await load(ctx.admin,org);const prod=before.idm.production;const idmPolicy=before.idm.policy;
   const updates:Record<string,{status:string;evidence?:string;next_action?:string}>={};
   const prodIdmApproved=prod?.status==='VERIFIED'&&prod?.ministry_approved===true;const idmExclusiveActive=idmPolicy?.staff_auth_mode==='IDM_ONLY';updates['idm-exclusive']={status:idmExclusiveActive&&prodIdmApproved?'PASS':prodIdmApproved?'GAP':'EXTERNAL',evidence:idmExclusiveActive?'IDM_ONLY מופעל ומוגן בצד השרת':prodIdmApproved?'Production מאושר אך IDM_ONLY עדיין לא הופעל':'מנגנון IDM_ONLY קיים ומוגן בצד השרת; ההפעלה ממתינה ל-PRODUCTION VERIFIED ולאישור משרד החינוך',next_action:idmExclusiveActive&&prodIdmApproved?'להמשיך לנטר שאין מסלול כניסה מקביל לצוות.':prodIdmApproved?'להפעיל IDM_ONLY לצוותים המוגדרים ולבצע בדיקת כניסה ללא מסלול מקביל.':'תלות חיצונית: להמתין לאישור PRODUCTION/IDM של משרד החינוך. אין להפעיל IDM_ONLY לפני האישור.'};
   const infraScore=Number(before.evidence.production_infrastructure?.readiness_score||0);const envAssurance=before.evidence.environment_assurance;const envAge=envAssurance?.created_at?Date.now()-new Date(envAssurance.created_at).getTime():Number.POSITIVE_INFINITY;const envFresh=envAge<=30*24*60*60*1000;const envStatus=envAssurance?.result==='PASS'&&envFresh?'PASS':envAssurance?.result==='FAIL'?'GAP':'PARTIAL';updates['environment-separation']={status:envStatus,evidence:envAssurance?`Environment Assurance ${envAssurance.result} · collisions ${Array.isArray(envAssurance.collision_findings)?envAssurance.collision_findings.length:0} · SHA-256 ${String(envAssurance.manifest_sha256||'').slice(0,16)}…`:(infraScore?`Production Infrastructure review: ${infraScore}% · טרם נשמר Environment Evidence`:'אין Environment Evidence עדכני'),next_action:envStatus==='PASS'?'להריץ מחדש לאחר כל שינוי בתשתית או Secrets ולחדש Evidence לפחות כל 30 יום.':'להריץ Environment Assurance Evidence עבור DEV/STAGING/PRODUCTION ולוודא שאין DB/Storage/Secret fingerprints משותפים ושאין מידע תלמידים אמיתי ב-Non-Prod.'};
   const rr=before.evidence.runtime_residency;const rrAge=rr?.created_at?Date.now()-new Date(rr.created_at).getTime():Number.POSITIVE_INFINITY;const rrFresh=rrAge<=30*24*60*60*1000;const rrBase=rr?.result==='PASS'&&rrFresh?'PASS':rr?.result==='FAIL'?'GAP':'PARTIAL';const tp=before.evidence.third_party_governance;const tpAge=tp?.created_at?Date.now()-new Date(tp.created_at).getTime():Number.POSITIVE_INFINITY;const tpFresh=tpAge<=30*24*60*60*1000;const tpStatus=tp?.result==='PASS'&&tpFresh?'PASS':tp?.result==='FAIL'?'GAP':'PARTIAL';const vl=before.evidence.vendor_lifecycle;const vlAge=vl?.created_at?Date.now()-new Date(vl.created_at).getTime():Number.POSITIVE_INFINITY;const vlFresh=vlAge<=30*24*60*60*1000;const vlStatus=vl?.result==='PASS'&&vlFresh?'PASS':vl?.result==='FAIL'?'GAP':'PARTIAL';const rrStatus=[rrBase,tpStatus,vlStatus].includes('GAP')?'GAP':rrBase==='PASS'&&tpStatus==='PASS'&&vlStatus==='PASS'?'PASS':'PARTIAL';updates['runtime-data-residency']={status:rrStatus,evidence:[rr?`Runtime/Residency ${rr.result} · services ${Array.isArray(rr.external_services)?rr.external_services.length:0} · findings ${Array.isArray(rr.findings)?rr.findings.length:0}`:'אין Runtime/Residency Evidence',tp?`Third-party ${tp.result} · vendors ${Number(tp.vendor_count||0)} · findings ${Array.isArray(tp.findings)?tp.findings.length:0}`:'אין Third-Party Governance Evidence',vl?`Vendor lifecycle ${vl.result} · active ${Number(vl.active_vendor_count||0)} · offboarding ${Number(vl.offboarding_vendor_count||0)} · findings ${Array.isArray(vl.findings)?vl.findings.length:0}`:'אין Vendor Lifecycle Evidence'].join(' | '),next_action:rrStatus==='PASS'?'לחדש את שלושת ה-Snapshots לפחות כל 30 יום ולאחר כל שינוי בספק/חוזה/SLA/Region.':'להשלים Runtime/Residency, Third-Party Governance ו-Vendor Lifecycle: DPA, חוזה/SLA, דיווח אירוע, Review תקופתי ו-Offboarding מתועד.'};
   const detectionScore=Number(before.evidence.detection?.score||0);updates['audit-logging']={status:detectionScore>=90?'PASS':'PARTIAL',evidence:detectionScore?`Detection/Logging review: ${detectionScore}%`:'אין Detection review עדכני'};
   const cryptoScore=Number(before.evidence.crypto?.readiness_score||0);updates['encryption-at-rest']={status:cryptoScore>=90?'PASS':'PARTIAL',evidence:cryptoScore?`Crypto evidence snapshot: ${cryptoScore}%`:'אין Crypto evidence snapshot עדכני'};
   updates['strong-auth']={status:before.idm.security_policy?.require_mfa===true?'PARTIAL':'GAP',evidence:before.idm.security_policy?.require_mfa===true?'MFA ארגוני מופעל; נדרש להשלים אימות IDM רשמי':'מדיניות MFA ארגונית אינה מחייבת את כלל האוכלוסייה הרלוונטית'};
   const clientAudit=before.evidence.client_data;updates['protected-device-storage']={status:clientAudit?.result==='PASS'?'PASS':clientAudit?.result==='FAIL'?'GAP':'PARTIAL',evidence:clientAudit?`Client Data Audit ${clientAudit.result} · SHA-256 ${String(clientAudit.manifest_sha256||'').slice(0,16)}…`:'טרם נשמר Client Data Audit',next_action:clientAudit?.result==='PASS'?'לצרף Evidence גם מבדיקת Android wrapper לפני הגשה סופית.':'להריץ בדיקת אחסון מקומי ממרכז Sprint 3 ולסגור כל מפתח אסור/לא מסווג.'};
   updates['client-data-erasure']={status:clientAudit?.result==='PASS'?'PARTIAL':'PARTIAL',evidence:clientAudit?'קיים מנגנון מחיקה מלא למכשיר + Audit מתועד.':'קיים מנגנון מחיקה; טרם נשמר Audit.',next_action:'לבצע תרחיש מחיקה ידני Web/PWA/Android ולצרף Evidence לפני PASS מלא.'};
   const comp=before.evidence.software_components;const sc=before.evidence.supply_chain;const ri=before.evidence.release_integrity;const scAge=sc?.created_at?Date.now()-new Date(sc.created_at).getTime():Number.POSITIVE_INFINITY;const scFresh=scAge<=30*24*60*60*1000;const riAge=ri?.created_at?Date.now()-new Date(ri.created_at).getTime():Number.POSITIVE_INFINITY;const riFresh=riAge<=30*24*60*60*1000;const scStatus=sc?.result==='PASS'&&scFresh?'PASS':sc?.result==='FAIL'?'GAP':'PARTIAL';const riStatus=ri?.result==='PASS'&&riFresh?'PASS':ri?.result==='FAIL'?'GAP':'PARTIAL';const componentStatus=scStatus==='GAP'||riStatus==='GAP'?'GAP':scStatus==='PASS'&&riStatus==='PASS'?'PASS':'PARTIAL';updates['supported-components']={status:componentStatus,evidence:[sc?`Supply-chain ${sc.result} · SBOM ${sc.sbom_component_count} · High ${Number(sc.vulnerability_counts?.high||0)} · Critical ${Number(sc.vulnerability_counts?.critical||0)}`:comp?`Component snapshot ${comp.component_count}`:'אין SBOM/SCA Evidence',ri?`Release integrity ${ri.result} · Secrets ${Number(ri.secret_findings||0)} · Commit ${String(ri.source_commit||'').slice(0,12)}`:'אין Release Integrity Evidence'].join(' | '),next_action:componentStatus==='PASS'?'לשמור SBOM/SCA ו-Release Integrity Evidence עדכניים בכל שינוי ולחדש לפחות כל 30 יום.':componentStatus==='GAP'?'לתקן HIGH/CRITICAL/Secrets או חולשות תלויות, להריץ את שני Workflows מחדש ולייבא Evidence חדש.':'להריץ גם Dependency Supply Chain Evidence וגם Release Integrity Evidence ולייבא תוצאות עדכניות.'};
   for(const [key,u] of Object.entries(updates)){
    const sync=await ctx.admin.from('moe_official_standard_requirements').update({status:u.status,evidence_reference:u.evidence||null,next_action:u.next_action||undefined,verified_by:actor,verified_at:now,updated_at:now}).eq('organization_id',org).eq('control_key',key).select('id');
    if(sync.error||!sync.data?.length)return NextResponse.json({error:'בדיקת התקנים לא הושלמה כי חלק מהסעיפים לא עודכנו. ייתכן שסעיפים אחרים כבר עודכנו; יש לרענן ולנסות שוב.',code:'REVIEW_SYNC_INCOMPLETE'},{status:502,headers:{'cache-control':'no-store'}});
   }
   const bundle=await load(ctx.admin,org);const manifest={schema:'kidum.moe-official-standards.v1',organization_id:org,created_at:now,summary:bundle.summary,requirements:bundle.requirements.map((x:any)=>({standard_key:x.standard_key,clause_ref:x.clause_ref,title:x.title,applicability:x.applicability,status:x.status,control_key:x.control_key,evidence_reference:x.evidence_reference,next_action:x.next_action}))};const hash=sha(manifest);
   const{data,error}=await ctx.admin.from('moe_official_standard_reviews').insert({organization_id:org,score:bundle.summary.score,pass_count:bundle.summary.counts.PASS,partial_count:bundle.summary.counts.PARTIAL,gap_count:bundle.summary.counts.GAP,external_count:bundle.summary.counts.EXTERNAL,manifest,manifest_sha256:hash,created_by:actor}).select().single();if(error)throw error;
   await writeSecurityAudit(ctx.admin,ctx.profile,req,'MOE_OFFICIAL_STANDARDS_REVIEW_CREATED','moe_official_standard_review',data.id,{score:bundle.summary.score,sha256:hash});
   return NextResponse.json({ok:true,review:data,bundle});
  }
  throw new Error('VALIDATION_ERROR');
 }catch(e){
  if(e instanceof Error&&e.message==='IDM_PRODUCTION_NOT_APPROVED')return NextResponse.json({error:'אי אפשר להפעיל IDM_ONLY לפני שסביבת PRODUCTION ב-IDM מסומנת VERIFIED וקיים אישור משרד החינוך.'},{status:409});
  const x=apiError(e);return NextResponse.json({error:x.message,code:x.code},{status:x.status,headers:{'cache-control':'no-store'}})
 }
}

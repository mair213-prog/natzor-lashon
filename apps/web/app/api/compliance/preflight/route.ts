import {NextResponse} from 'next/server';
import {apiError,requireUser,writeSecurityAudit} from '../../../../lib/server-auth';

type Check={key:string;label:string;ok:boolean;detail:string};

const READ_FAILURE_DETAIL='לא ניתן לקרוא את הנתונים הנדרשים לבדיקה. יש לבדוק זמינות והרשאות ולנסות שוב; הסעיף לא אומת.';

// Supabase read failures are returned as { data: null, error }; they do not
// normally reject. Never interpret an unavailable result as an empty, safe set.
async function checkedQuery<T extends {error:unknown}>(query:PromiseLike<T>):Promise<T>{
 const result=await query;
 if(!result||result.error)throw new Error('PREFLIGHT_DATA_UNAVAILABLE');
 return result;
}

export async function GET(req:Request){
 try{
  const ctx=await requireUser(req);
  const role=String(ctx.profile?.role||'').toUpperCase();
  if(!['ADMIN','MANAGER'].includes(role))throw new Error('FORBIDDEN');
  const checks:Check[]=[];
  const add=(key:string,label:string,ok:boolean,detail:string)=>checks.push({key,label,ok,detail});
  add('supabase','Supabase מוגדר בשרת',Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY),process.env.NEXT_PUBLIC_SUPABASE_URL?'הגדרות השרת קיימות':'חסרה כתובת או Service Role');
  add('strict-ai','מצב AI מחמיר',process.env.MOE_STRICT_AI_MODE==='true',process.env.MOE_STRICT_AI_MODE==='true'?'AI חיצוני חסום ללא אישור':'יש להפעיל MOE_STRICT_AI_MODE ב-Production');
  add('ai-approval','אישור ספק AI',process.env.OPENAI_MOE_APPROVED==='true',process.env.OPENAI_MOE_APPROVED==='true'?'הספק מסומן כמאושר':'טרם סומן אישור ספק AI');
  add('upload-av','סורק Malware',Boolean(process.env.MALWARE_SCAN_API_URL),process.env.MALWARE_SCAN_API_URL?'Endpoint סריקה מוגדר':'טרם הוגדר MALWARE_SCAN_API_URL');
  add('strict-upload','Fail Closed בהעלאות',process.env.MOE_STRICT_UPLOAD_SCAN==='true',process.env.MOE_STRICT_UPLOAD_SCAN==='true'?'העלאות נחסמות אם הסריקה אינה זמינה':'יש להפעיל MOE_STRICT_UPLOAD_SCAN ב-Production');
  add('siem','SIEM חיצוני',Boolean(process.env.SECURITY_SIEM_WEBHOOK_URL&&process.env.SECURITY_SIEM_WEBHOOK_SECRET),process.env.SECURITY_SIEM_WEBHOOK_URL?'Webhook מוגדר':'טרם הוגדר SIEM חיצוני');
  add('rate-limit','Rate limiting מבוזר',Boolean(process.env.UPSTASH_REDIS_REST_URL&&process.env.UPSTASH_REDIS_REST_TOKEN),process.env.UPSTASH_REDIS_REST_URL?'Redis rate limiter מוגדר':'טרם הוגדר rate limiter מבוזר');
  add('pdf-font','פונט עברי ל-PDF',Boolean(process.env.PDF_HEBREW_FONT_BASE64),process.env.PDF_HEBREW_FONT_BASE64?'פונט שרת מוגדר':'חסר PDF_HEBREW_FONT_BASE64');
  const tables=['compliance_requirements','security_audit_events','privacy_requests','accessibility_audit_runs','upload_security_scans','compliance_risks','security_incidents','backup_dr_plans','security_secret_inventory','incident_response_policies','security_incident_assessments','security_incident_timeline','security_incident_post_reviews','continuity_exercises','compliance_evidence_snapshots','privacy_notice_versions','legal_basis_register','privacy_consents','privacy_consent_events','retention_rules','legal_holds','retention_review_runs','field_governance_rules','data_minimization_review_runs','field_governance_policies','field_governance_enforcement_events','external_processing_policies','external_processing_events','vendor_change_assessments','security_scan_runs','security_vulnerabilities','security_risk_acceptances','release_gate_checks','release_evidence_snapshots','identity_assurance_policies','identity_assurance_review_runs','security_user_sessions','privacy_operations_policies','privacy_request_events','privacy_request_evidence','privacy_operations_review_runs','backup_integrity_policies','backup_artifact_inventory','backup_verification_runs','data_integrity_events','data_integrity_snapshots','crypto_governance_policies','cryptographic_key_inventory','secret_rotation_events','encryption_evidence_runs','storage_security_evidence','crypto_evidence_snapshots','security_detection_policies','security_detection_rules','security_log_evidence','security_alert_triage_events','security_detection_review_runs','business_continuity_policies','service_dependency_inventory','availability_evidence_runs','continuity_action_items','business_continuity_snapshots','security_testing_policies','penetration_test_engagements','security_test_coverage','security_retests','security_testing_reviews','production_infrastructure_policies','production_infrastructure_evidence','production_infrastructure_reviews','moe_idm_policies','moe_idm_environment_configs','moe_idm_claim_mappings','moe_idm_test_cases','moe_idm_submission_items','moe_idm_submission_reviews','compliance_submission_dry_run_policies','compliance_submission_attestations','compliance_submission_dry_runs','compliance_submission_dry_run_checks','compliance_submission_tracking_policies','compliance_submissions','compliance_submission_feedback_items','compliance_submission_tracking_events','compliance_go_live_policies','compliance_go_live_plans','compliance_go_live_checks','compliance_go_live_approvals','compliance_go_live_hypercare_items','compliance_go_live_events','moe_official_standard_requirements','moe_official_standard_reviews','moe_compatibility_test_runs','moe_accessibility_manual_checks','moe_accessibility_compatibility_reviews','external_dependency_register','external_dependency_reviews'];
  for(const table of tables){
   try{const{error}=await ctx.admin.from(table).select('*',{head:true,count:'exact'}).limit(1);add(`table-${table}`,`טבלה ${table}`,!error,error?READ_FAILURE_DETAIL:'קיימת ונגישה');}
   catch{add(`table-${table}`,`טבלה ${table}`,false,'לא ניתן לאמת את הטבלה');}
  }
  try{const{data:r,error}=await checkedQuery(ctx.admin.from('moe_official_standard_reviews').select('score,gap_count,external_count,created_at').eq('organization_id',ctx.profile.organization_id).order('created_at',{ascending:false}).limit(1).maybeSingle());if(error)throw error;add('official-moe-standards-review','Review מול התקנים הרשמיים',Boolean(r&&Number(r.gap_count)===0),r?`ציון ${r.score}% · פערים פנימיים ${r.gap_count} · תלויות חיצוניות ${r.external_count}`:'טרם נוצר Review מול מטריצת התקנים הרשמית');}catch(e:any){add('official-moe-standards-review','Review מול התקנים הרשמיים',false,READ_FAILURE_DETAIL);}
  try{const{data:r}=await checkedQuery(ctx.admin.from('production_infrastructure_reviews').select('readiness_score,created_at').eq('organization_id',ctx.profile.organization_id).order('created_at',{ascending:false}).limit(1).maybeSingle());add('prod-infra-review','Production Infrastructure Review',Boolean(r&&Number(r.readiness_score)>=85),r?`Snapshot אחרון: ${r.readiness_score}%`:'טרם נוצר Snapshot Production Infrastructure');}catch{add('prod-infra-review','Production Infrastructure Review',false,'לא ניתן לאמת Snapshot תשתית');}
  try{const{data:r}=await checkedQuery(ctx.admin.from('moe_idm_submission_reviews').select('readiness_score,internal_blockers,ministry_dependencies,created_at').eq('organization_id',ctx.profile.organization_id).order('created_at',{ascending:false}).limit(1).maybeSingle());const internal=Array.isArray(r?.internal_blockers)?r.internal_blockers.length:999;add('moe-idm-submission-review','MoE/IDM Submission Review',Boolean(r&&internal===0),r?`Snapshot ${r.readiness_score}% · חסמים פנימיים ${internal} · תלויות משרד ${Array.isArray(r.ministry_dependencies)?r.ministry_dependencies.length:0}`:'טרם נוצר Snapshot MoE/IDM');}catch{add('moe-idm-submission-review','MoE/IDM Submission Review',false,'לא ניתן לאמת Snapshot IDM');}
  try{
   const{data:egress}=await checkedQuery(ctx.admin.from('external_processing_policies').select('enforcement_mode').eq('organization_id',ctx.profile.organization_id).maybeSingle());
   const mode=String(egress?.enforcement_mode||'AUDIT');add('external-egress-mode','אכיפת יציאת מידע לספקים',mode!=='AUDIT',mode==='AUDIT'?'מצב AUDIT בלבד — לאחר אישור הספקים יש לעבור ל-ENFORCE_APPROVED':`מצב ${mode}`);
   const{data:providers}=await checkedQuery(ctx.admin.from('privacy_subprocessors').select('name,approval_status,dpa_status,production_allowed,security_review_status').eq('organization_id',ctx.profile.organization_id).eq('active',true));
   const notReady=(providers||[]).filter((x:any)=>x.production_allowed&&(x.approval_status!=='APPROVED'||x.dpa_status!=='SIGNED'||x.security_review_status!=='APPROVED'));add('external-provider-readiness','ספקי Production מאושרים',notReady.length===0,notReady.length?`${notReady.length} ספקי Production עם אישור/DPA/Security Review חסר`:'אין ספק Production המסומן כפעיל ללא האישורים הנדרשים');
  }catch(e:any){add('external-egress','בדיקת ממשל ספקים חיצוניים',false,READ_FAILURE_DETAIL);}
  try{
   const{data:identityPolicy}=await checkedQuery(ctx.admin.from('identity_assurance_policies').select('suspicious_risk_threshold,max_active_sessions_per_user,break_glass_test_max_age_days').eq('organization_id',ctx.profile.organization_id).maybeSingle());
   const threshold=Number(identityPolicy?.suspicious_risk_threshold||50);
   const{data:riskySessions}=await checkedQuery(ctx.admin.from('security_user_sessions').select('id').eq('organization_id',ctx.profile.organization_id).is('revoked_at',null).gte('risk_score',threshold));
   const{data:pendingAccess}=await checkedQuery(ctx.admin.from('access_review_items').select('id').eq('organization_id',ctx.profile.organization_id).eq('decision','PENDING'));
   add('identity-session-risk','אין Session פעיל מעל סף הסיכון',(riskySessions||[]).length===0,(riskySessions||[]).length?`${(riskySessions||[]).length} Sessions מעל סף הסיכון`:'לא נמצא Session פעיל מעל הסף');
   add('identity-access-review','אין Access Review ממתין',(pendingAccess||[]).length===0,(pendingAccess||[]).length?`${(pendingAccess||[]).length} פריטי Access Review ממתינים`:'אין פריטי Access Review ממתינים');
  }catch(e:any){add('identity-assurance','בדיקת Identity Assurance',false,READ_FAILURE_DETAIL);}

  try{
   const{data:dp}=await checkedQuery(ctx.admin.from('security_detection_policies').select('log_retention_days,require_external_siem,evidence_max_age_days').eq('organization_id',ctx.profile.organization_id).maybeSingle());
   const days=Number(dp?.evidence_max_age_days||90),cutoff=new Date(Date.now()-days*86400000).toISOString();
   const[{data:logEvidence},{data:openAlerts},{data:rules}]=await Promise.all([
    checkedQuery(ctx.admin.from('security_log_evidence').select('id,environment,retention_days,immutable_storage,time_sync_verified,siem_forwarded,last_verified_at').eq('organization_id',ctx.profile.organization_id).gte('last_verified_at',cutoff)),
    checkedQuery(ctx.admin.from('security_alerts').select('id,severity,status,first_seen_at').eq('organization_id',ctx.profile.organization_id).neq('status','RESOLVED')),
    checkedQuery(ctx.admin.from('security_detection_rules').select('id').eq('organization_id',ctx.profile.organization_id).eq('enabled',true))
   ]);
   const prod=(logEvidence||[]).filter((x:any)=>String(x.environment||'').toUpperCase()==='PRODUCTION');
   const siem=process.env.SECURITY_SIEM_FORWARDING_ENABLED==='true'&&Boolean(process.env.SECURITY_SIEM_WEBHOOK_URL&&process.env.SECURITY_SIEM_WEBHOOK_SECRET);
   add('detection-rules','חוקי Detection פעילים',(rules||[]).length>=3,`${(rules||[]).length} חוקים פעילים`);
   add('logging-evidence','ראיות Logging עדכניות',prod.length>0,prod.length?`${prod.length} ראיות Production עדכניות`:'אין ראיית Logging Production עדכנית');
   add('siem-forwarding','SIEM חיצוני מחובר',dp?.require_external_siem===false||siem,siem?'Webhook חתום ל-SIEM מוגדר':'SIEM נדרש אך טרם חובר');
   add('critical-alerts','אין Critical פתוח',!(openAlerts||[]).some((x:any)=>x.severity==='CRITICAL'),(openAlerts||[]).some((x:any)=>x.severity==='CRITICAL')?'קיימת התראת Critical פתוחה':'אין Critical פתוח');
  }catch(e:any){add('detection-governance','בדיקת Detection / Logging / SIEM',false,READ_FAILURE_DETAIL);}
  try{
   const{data:cryptoPolicy}=await checkedQuery(ctx.admin.from('crypto_governance_policies').select('require_managed_kms,require_secret_manager,evidence_max_age_days').eq('organization_id',ctx.profile.organization_id).maybeSingle());
   const days=Number(cryptoPolicy?.evidence_max_age_days||90),cutoffCrypto=new Date(Date.now()-days*86400000).toISOString();
   const[{data:keys},{data:secrets},{data:enc},{data:storageEvidence}]=await Promise.all([
    checkedQuery(ctx.admin.from('cryptographic_key_inventory').select('id,kms_managed,next_rotation_due,status').eq('organization_id',ctx.profile.organization_id).eq('status','ACTIVE')),
    checkedQuery(ctx.admin.from('security_secret_inventory').select('id,managed_by_kms,next_rotation_due,status,environment').eq('organization_id',ctx.profile.organization_id).eq('status','ACTIVE').eq('environment','PRODUCTION')),
    checkedQuery(ctx.admin.from('encryption_evidence_runs').select('scope,result,verified_at').eq('organization_id',ctx.profile.organization_id).gte('verified_at',cutoffCrypto).eq('result','PASS')),
    checkedQuery(ctx.admin.from('storage_security_evidence').select('id,private_access,encryption_at_rest,encryption_in_transit,public_exposure_detected,data_classification').eq('organization_id',ctx.profile.organization_id))
   ]);
   const nonKms=(keys||[]).filter((x:any)=>cryptoPolicy?.require_managed_kms!==false&&!x.kms_managed);
   const overdue=[...(keys||[]),...(secrets||[])].filter((x:any)=>x.next_rotation_due&&new Date(x.next_rotation_due)<new Date());
   const unmanagedSecrets=(secrets||[]).filter((x:any)=>cryptoPolicy?.require_secret_manager!==false&&!x.managed_by_kms);
   const scopes=new Set((enc||[]).map((x:any)=>x.scope));const required=['DATABASE','STORAGE','BACKUPS','API_TLS','SECRETS'];
   const unsafe=(storageEvidence||[]).filter((x:any)=>['PERSONAL','SENSITIVE','HIGHLY_SENSITIVE'].includes(x.data_classification)&&(!x.private_access||!x.encryption_at_rest||!x.encryption_in_transit||x.public_exposure_detected));
   add('crypto-kms','מפתחות פעילים מנוהלים ב-KMS',nonKms.length===0,nonKms.length?`${nonKms.length} מפתחות פעילים אינם מסומנים KMS`:'אין חריגת KMS פעילה');
   add('crypto-secret-manager','סודות Production מנוהלים',unmanagedSecrets.length===0,unmanagedSecrets.length?`${unmanagedSecrets.length} סודות Production אינם מסומנים כמנוהלים`:'כל סודות Production הפעילים מסומנים כמנוהלים');
   add('crypto-rotation','אין Rotation באיחור',overdue.length===0,overdue.length?`${overdue.length} פריטי Key/Secret עברו מועד Rotation`:'אין Rotation באיחור');
   add('crypto-evidence','ראיות הצפנה עדכניות',required.every(x=>scopes.has(x)),required.every(x=>scopes.has(x))?'קיימות ראיות PASS עדכניות לכל שכבות הליבה':`חסרות: ${required.filter(x=>!scopes.has(x)).join(', ')}`);
   add('crypto-storage','אחסון רגיש ללא חשיפה/הצפנה חסרה',unsafe.length===0,unsafe.length?`${unsafe.length} רשומות אחסון רגיש דורשות תיקון`:'לא נמצאה ראיית אחסון רגיש לא בטוחה');
  }catch(e:any){add('crypto-governance','בדיקת Cryptography / KMS',false,READ_FAILURE_DETAIL);}
  try{
   const{data:cp}=await checkedQuery(ctx.admin.from('business_continuity_policies').select('critical_rto_minutes,critical_rpo_minutes,dependency_review_days,continuity_test_frequency_days,availability_evidence_max_age_days,require_multi_zone,require_failover_runbook,require_supplier_bcp_evidence').eq('organization_id',ctx.profile.organization_id).maybeSingle());
   const reviewCutoff=new Date(Date.now()-Number(cp?.dependency_review_days||90)*86400000).toISOString();
   const evidenceCutoff=new Date(Date.now()-Number(cp?.availability_evidence_max_age_days||30)*86400000).toISOString();
   const exerciseCutoff=new Date(Date.now()-Number(cp?.continuity_test_frequency_days||180)*86400000).toISOString();
   const[{data:deps},{data:avail},{data:exercises},{data:actions}]=await Promise.all([
    checkedQuery(ctx.admin.from('service_dependency_inventory').select('criticality,status,failover_capability,multi_zone_capability,manual_workaround,last_reviewed_at,bcp_evidence_reference,failover_runbook_reference').eq('organization_id',ctx.profile.organization_id).neq('status','RETIRED')),
    checkedQuery(ctx.admin.from('availability_evidence_runs').select('result,verified_at,environment').eq('organization_id',ctx.profile.organization_id).eq('environment','PRODUCTION').gte('verified_at',evidenceCutoff).order('verified_at',{ascending:false}).limit(1)),
    checkedQuery(ctx.admin.from('continuity_exercises').select('result,performed_at,actual_rto_minutes,actual_rpo_minutes').eq('organization_id',ctx.profile.organization_id).gte('performed_at',exerciseCutoff).order('performed_at',{ascending:false}).limit(1)),
    checkedQuery(ctx.admin.from('continuity_action_items').select('severity,status').eq('organization_id',ctx.profile.organization_id).eq('severity','CRITICAL').in('status',['OPEN','IN_PROGRESS']))
   ]);
   const critical=(deps||[]).filter((x:any)=>['HIGH','CRITICAL'].includes(x.criticality));
   const overdue=critical.filter((x:any)=>!x.last_reviewed_at||new Date(x.last_reviewed_at)<new Date(reviewCutoff));
   const missingPath=critical.filter((x:any)=>!x.failover_capability&&!String(x.manual_workaround||'').trim());
   const missingEvidence=critical.filter((x:any)=>cp?.require_supplier_bcp_evidence!==false&&!String(x.bcp_evidence_reference||'').trim());
   add('continuity-dependencies','תלויות שירות קריטיות ממופות',critical.length>0,critical.length?`${critical.length} תלויות High/Critical`:'אין תלויות קריטיות מתועדות');
   add('continuity-review','סקירת תלויות בתוקף',overdue.length===0,overdue.length?`${overdue.length} תלויות דורשות סקירה`:'אין סקירות תלויות באיחור');
   add('continuity-failover','נתיב התאוששות לכל תלות קריטית',missingPath.length===0,missingPath.length?`${missingPath.length} תלויות ללא Failover/Workaround`:'לכל תלות קריטית יש נתיב התאוששות');
   add('continuity-supplier-evidence','ראיות BCP מספקים קריטיים',missingEvidence.length===0,missingEvidence.length?`${missingEvidence.length} תלויות ללא ראיית ספק`:'ראיות ספק מתועדות');
   add('continuity-availability','ראיית זמינות Production עדכנית',Boolean(avail?.[0]&&avail[0].result==='PASS'),avail?.[0]?`${avail[0].result} · ${new Date(avail[0].verified_at).toLocaleDateString('he-IL')}`:'אין ראיית זמינות עדכנית');
   add('continuity-exercise','תרגיל המשכיות עדכני עבר',Boolean(exercises?.[0]&&exercises[0].result==='PASS'),exercises?.[0]?`${exercises[0].result} · ${new Date(exercises[0].performed_at).toLocaleDateString('he-IL')}`:'אין תרגיל המשכיות עדכני');
   add('continuity-critical-actions','אין פעולות המשכיות Critical פתוחות',(actions||[]).length===0,(actions||[]).length?`${(actions||[]).length} פעולות Critical פתוחות`:'אין פעולות Critical פתוחות');
  }catch(e:any){add('continuity-governance','בדיקת Business Continuity',false,READ_FAILURE_DETAIL);}

  try{
   const[{data:appPolicy},{data:prodBaseline},{data:apiControls},{data:headerEvidence}]=await Promise.all([
    checkedQuery(ctx.admin.from('application_security_policies').select('*').eq('organization_id',ctx.profile.organization_id).maybeSingle()),
    checkedQuery(ctx.admin.from('environment_security_baselines').select('*').eq('organization_id',ctx.profile.organization_id).eq('environment','PRODUCTION').maybeSingle()),
    checkedQuery(ctx.admin.from('api_security_controls').select('control_key,enforcement_mode,enabled').eq('organization_id',ctx.profile.organization_id)),
    checkedQuery(ctx.admin.from('security_header_evidence').select('result,verified_at,csp_present,hsts_present').eq('organization_id',ctx.profile.organization_id).eq('environment','PRODUCTION').order('verified_at',{ascending:false}).limit(1))
   ]);
   const reqControls=['cors-restrictive','csrf-protection','api-rate-limits','safe-errors','admin-routes','secure-cookies'];
   const enforced=new Set((apiControls||[]).filter((x:any)=>x.enabled&&x.enforcement_mode==='ENFORCED').map((x:any)=>x.control_key));
   const prodOk=Boolean(prodBaseline?.status==='APPROVED'&&prodBaseline?.isolated_data&&prodBaseline?.isolated_secrets&&prodBaseline?.separate_service_credentials&&prodBaseline?.debug_disabled&&prodBaseline?.production_error_sanitization);
   const hdr=headerEvidence?.[0];
   add('app-security-policy','מדיניות Application Security מוגדרת',Boolean(appPolicy),appPolicy?'מדיניות קיימת':'טרם נשמרה מדיניות');
   add('app-security-prod-baseline','Production Hardening Baseline מאושר',prodOk,prodBaseline?`סטטוס ${prodBaseline.status}`:'אין Baseline ל-Production');
   add('app-security-api-controls','בקרות API ליבה ב-ENFORCED',reqControls.every(x=>enforced.has(x)),reqControls.every(x=>enforced.has(x))?'כל בקרות הליבה נאכפות':`חסרות: ${reqControls.filter(x=>!enforced.has(x)).join(', ')}`);
   add('app-security-headers','Secure Headers Production עברו בדיקה',Boolean(hdr&&hdr.result==='PASS'&&hdr.csp_present&&hdr.hsts_present),hdr?`${hdr.result} · ${new Date(hdr.verified_at).toLocaleDateString('he-IL')}`:'אין ראיית Headers');
  }catch(e:any){add('app-security-hardening','בדיקת Application/API Hardening',false,READ_FAILURE_DETAIL);}

  try{
   const cutoff=new Date(Date.now()-14*86400000).toISOString();
   const[{data:recentScans,error:scanError},{data:openCritical,error:vulnError}]=await Promise.all([
    checkedQuery(ctx.admin.from('security_scan_runs').select('scan_type,status,completed_at').eq('organization_id',ctx.profile.organization_id).gte('completed_at',cutoff)),
    checkedQuery(ctx.admin.from('security_vulnerabilities').select('id').eq('organization_id',ctx.profile.organization_id).eq('severity','CRITICAL').in('status',['OPEN','IN_PROGRESS']))
   ]);
   if(scanError)throw scanError;if(vulnError)throw vulnError;
   const types=new Set((recentScans||[]).filter((x:any)=>x.status!=='FAIL').map((x:any)=>x.scan_type));
   add('devsecops-scans','סריקות DevSecOps עדכניות',['SAST','SCA','SECRET'].every(x=>types.has(x)),['SAST','SCA','SECRET'].every(x=>types.has(x))?'SAST/SCA/Secret Scan תקינים ב-14 הימים האחרונים':`חסרות סריקות עדכניות: ${['SAST','SCA','SECRET'].filter(x=>!types.has(x)).join(', ')}`);
   add('critical-vulnerabilities','אין חולשת CRITICAL פתוחה',(openCritical||[]).length===0,(openCritical||[]).length?`${(openCritical||[]).length} ממצאי CRITICAL פתוחים`:'אין ממצא CRITICAL פתוח');
  }catch(e:any){add('devsecops-assurance','בדיקת DevSecOps / Vulnerabilities',false,READ_FAILURE_DETAIL);}

  try{
   const [{data:testPolicy},{data:pentests},{data:coverage},{data:retests},{data:fixedHigh}]=await Promise.all([
    checkedQuery(ctx.admin.from('security_testing_policies').select('penetration_test_frequency_days,require_independent_pentest').eq('organization_id',ctx.profile.organization_id).maybeSingle()),
    checkedQuery(ctx.admin.from('penetration_test_engagements').select('id,status,independent_tester,completed_at').eq('organization_id',ctx.profile.organization_id).order('completed_at',{ascending:false}).limit(10)),
    checkedQuery(ctx.admin.from('security_test_coverage').select('standard,category_key,status').eq('organization_id',ctx.profile.organization_id)),
    checkedQuery(ctx.admin.from('security_retests').select('vulnerability_id,result').eq('organization_id',ctx.profile.organization_id).eq('result','PASS')),
    checkedQuery(ctx.admin.from('security_vulnerabilities').select('id,severity,status').eq('organization_id',ctx.profile.organization_id).in('severity',['CRITICAL','HIGH']).eq('status','FIXED'))
   ]);
   const days=Number(testPolicy?.penetration_test_frequency_days||365),pcut=new Date(Date.now()-days*86400000);
   const current=(pentests||[]).find((x:any)=>x.status==='COMPLETE'&&x.completed_at&&new Date(x.completed_at)>=pcut);
   const web=new Set((coverage||[]).filter((x:any)=>x.standard==='OWASP_TOP_10'&&['PASS','FINDING','NA'].includes(x.status)).map((x:any)=>x.category_key));
   const api=new Set((coverage||[]).filter((x:any)=>x.standard==='OWASP_API_TOP_10'&&['PASS','FINDING','NA'].includes(x.status)).map((x:any)=>x.category_key));
   const passedRetests=new Set((retests||[]).map((x:any)=>x.vulnerability_id));
   const missing=(fixedHigh||[]).filter((x:any)=>!passedRetests.has(x.id));
   add('security-testing-pentest','בדיקת חדירות בתוקף',Boolean(current),current?`הושלמה ${new Date(current.completed_at).toLocaleDateString('he-IL')}`:`אין Pentest COMPLETE ב-${days} הימים האחרונים`);
   add('security-testing-independent','בדיקת חדירות עצמאית',Boolean(current&&(!testPolicy?.require_independent_pentest||current.independent_tester)),current?.independent_tester?'הבודק מסומן כעצמאי':'לא הוכח גורם עצמאי');
   add('security-testing-owasp-web','כיסוי OWASP Top 10',web.size>=10,`${web.size}/10 קטגוריות מתועדות`);
   add('security-testing-owasp-api','כיסוי OWASP API Top 10',api.size>=10,`${api.size}/10 קטגוריות מתועדות`);
   add('security-testing-retest','Retest לממצאים חמורים שתוקנו',missing.length===0,missing.length?`${missing.length} ממצאי High/Critical FIXED ללא Retest PASS`:'כל הממצאים החמורים שתוקנו עברו Retest');
  }catch(e:any){add('security-testing','בדיקת Security Testing / Pentest',false,READ_FAILURE_DETAIL);}
  try{
   for(const table of ['compliance_gap_action_policies','compliance_gap_action_events','compliance_gap_closure_reviews']){const{error}=await ctx.admin.from(table).select('*',{head:true,count:'exact'}).limit(1);add(`gap-closure-${table}`,`Gap Closure table: ${table}`,!error,error?READ_FAILURE_DETAIL:'זמין');}
   const{data:closureReview,error:closureError}=await checkedQuery(ctx.admin.from('compliance_gap_closure_reviews').select('submission_candidate,execution_score,created_at').eq('organization_id',ctx.profile.organization_id).order('created_at',{ascending:false}).limit(1).maybeSingle());if(closureError)throw closureError;add('gap-closure-snapshot','Gap Closure Snapshot עדכני',Boolean(closureReview),closureReview?`${closureReview.execution_score}% · ${closureReview.submission_candidate?'מועמד להגשה':'עדיין קיימים חסמים'}`:'לא נוצר Gap Closure Snapshot');
  }catch(e:any){add('gap-closure-schema','Gap Closure Workbench schema',false,READ_FAILURE_DETAIL);}
  try{
   for(const table of ['submission_pack_policies','submission_pack_runs','submission_pack_artifacts']){const{error}=await ctx.admin.from(table).select('*',{head:true,count:'exact'}).limit(1);add(`submission-${table}`,`Submission Pack table: ${table}`,!error,error?READ_FAILURE_DETAIL:'זמין');}
  }catch(e:any){add('submission-pack-schema','Submission Pack schema',false,READ_FAILURE_DETAIL);}
  try{
   for(const table of ['compliance_submission_dry_run_policies','compliance_submission_attestations','compliance_submission_dry_runs','compliance_submission_dry_run_checks','compliance_submission_tracking_policies','compliance_submissions','compliance_submission_feedback_items','compliance_submission_tracking_events']){const{error}=await ctx.admin.from(table).select('*',{head:true,count:'exact'}).limit(1);add(`submission-dry-run-${table}`,`Submission Dry Run table: ${table}`,!error,error?READ_FAILURE_DETAIL:'זמין');}
   const{data:dryRun,error:dryRunError}=await checkedQuery(ctx.admin.from('compliance_submission_dry_runs').select('readiness_score,internal_ready,ready_to_submit,created_at').eq('organization_id',ctx.profile.organization_id).order('created_at',{ascending:false}).limit(1).maybeSingle());if(dryRunError)throw dryRunError;add('submission-dry-run-latest','Submission Dry Run Snapshot קיים',Boolean(dryRun),dryRun?`${dryRun.readiness_score}% · ${dryRun.internal_ready?'Internal Ready':'עדיין חסום'}`:'טרם נוצר Submission Dry Run');
  }catch(e:any){add('submission-dry-run-schema','Submission Dry Run schema',false,READ_FAILURE_DETAIL);}
  try{
   for(const table of ['compliance_submission_freeze_policies','compliance_submission_freezes','compliance_submission_freeze_sources','compliance_submission_freeze_events']){const{error}=await ctx.admin.from(table).select('*',{head:true,count:'exact'}).limit(1);add(`submission-freeze-${table}`,`Submission Freeze table: ${table}`,!error,error?READ_FAILURE_DETAIL:'זמין');}
   const[{data:freeze,error:freezeError},{data:freezePolicy}]=await Promise.all([checkedQuery(ctx.admin.from('compliance_submission_freezes').select('freeze_number,status,internal_ready,valid_until,manifest_sha256,approved_at,created_at').eq('organization_id',ctx.profile.organization_id).order('created_at',{ascending:false}).limit(1).maybeSingle()),checkedQuery(ctx.admin.from('compliance_submission_freeze_policies').select('require_two_person_freeze').eq('organization_id',ctx.profile.organization_id).maybeSingle())]);if(freezeError)throw freezeError;const approved=!freezePolicy?.require_two_person_freeze||!!freeze?.approved_at;const valid=freeze&&new Date(`${freeze.valid_until}T23:59:59Z`).getTime()>=Date.now()&&freeze.status==='FROZEN'&&approved;add('submission-freeze-latest','Final Submission Freeze תקף',Boolean(valid),freeze?`${freeze.freeze_number} · ${freeze.status}${approved?'':' · ממתין לאישור שני'} · עד ${freeze.valid_until}`:'טרם נוצר Freeze');
   for(const table of ['compliance_delivery_bundle_policies','compliance_delivery_bundles','compliance_delivery_bundle_documents','compliance_delivery_bundle_events']){const{error}=await ctx.admin.from(table).select('*',{head:true,count:'exact'}).limit(1);add(`delivery-bundle-${table}`,`Final Delivery Bundle table: ${table}`,!error,error?READ_FAILURE_DETAIL:'זמין');}
   const{data:delivery,error:deliveryError}=await checkedQuery(ctx.admin.from('compliance_delivery_bundles').select('bundle_number,status,internal_ready,valid_until,manifest_sha256,created_at').eq('organization_id',ctx.profile.organization_id).order('created_at',{ascending:false}).limit(1).maybeSingle());if(deliveryError)throw deliveryError;const deliveryValid=delivery&&['READY_INTERNAL','EXTERNAL_PENDING'].includes(delivery.status)&&new Date(`${delivery.valid_until}T23:59:59Z`).getTime()>=Date.now();add('delivery-bundle-latest','Final Delivery Bundle תקף',Boolean(deliveryValid),delivery?`${delivery.bundle_number} · ${delivery.status} · עד ${delivery.valid_until}`:'טרם הופקה חבילת מסירה');
   for(const table of ['compliance_submission_tracking_policies','compliance_submissions','compliance_submission_feedback_items','compliance_submission_tracking_events']){const{error}=await ctx.admin.from(table).select('*',{head:true,count:'exact'}).limit(1);add(`submission-tracking-${table}`,`Submission Tracking table: ${table}`,!error,error?READ_FAILURE_DETAIL:'זמין');}
   const{data:submission,error:submissionError}=await checkedQuery(ctx.admin.from('compliance_submissions').select('submission_number,status,external_reference,response_due_at,created_at').eq('organization_id',ctx.profile.organization_id).order('created_at',{ascending:false}).limit(1).maybeSingle());if(submissionError)throw submissionError;const activeSubmission=submission&&['SUBMITTED','ACKNOWLEDGED','UNDER_REVIEW','CHANGES_REQUESTED','RESUBMISSION_READY','RESUBMITTED','APPROVED'].includes(String(submission.status));add('submission-tracking-latest','מעקב הגשה קיים',Boolean(activeSubmission),submission?`${submission.submission_number} · ${submission.status}${submission.external_reference?` · ${submission.external_reference}`:''}`:'טרם נרשמה הגשה למעקב');
  }catch(e:any){add('submission-freeze-schema','Submission Freeze schema',false,READ_FAILURE_DETAIL);}
  try{
   for(const table of ['compliance_go_live_policies','compliance_go_live_plans','compliance_go_live_checks','compliance_go_live_approvals','compliance_go_live_hypercare_items','compliance_go_live_events']){const{error}=await ctx.admin.from(table).select('*',{head:true,count:'exact'}).limit(1);add(`go-live-${table}`,`Go-Live table: ${table}`,!error,error?READ_FAILURE_DETAIL:'זמין');}
   const{data:goLive,error:goLiveError}=await checkedQuery(ctx.admin.from('compliance_go_live_plans').select('plan_number,status,target_go_live_at,actual_go_live_at,completed_at,created_at').eq('organization_id',ctx.profile.organization_id).order('created_at',{ascending:false}).limit(1).maybeSingle());if(goLiveError)throw goLiveError;const ready=goLive&&['SCHEDULED','IN_PROGRESS','HYPERCARE','COMPLETED'].includes(String(goLive.status));add('go-live-latest','Go-Live Governance מוכן להפעלה',Boolean(ready),goLive?`${goLive.plan_number} · ${goLive.status}${goLive.target_go_live_at?` · ${new Date(goLive.target_go_live_at).toLocaleString('he-IL')}`:''}`:'טרם נוצרה תוכנית Go-Live');
  }catch(e:any){add('go-live-schema','Go-Live Governance schema',false,READ_FAILURE_DETAIL);}
  try{
   for(const table of ['final_compliance_policies','final_compliance_gap_dispositions','final_compliance_reviews']){const{error}=await ctx.admin.from(table).select('*',{head:true,count:'exact'}).limit(1);add(`final-${table}`,`Final Audit table: ${table}`,!error,error?READ_FAILURE_DETAIL:'זמין');}
  }catch(e:any){add('final-compliance-schema','Final Compliance Audit schema',false,READ_FAILURE_DETAIL);}
  try{
   const{data:buckets}=await checkedQuery(ctx.admin.storage.listBuckets());
   for(const name of ['documents','chat-attachments','report-examples','child-photos']){const b=(buckets||[]).find((x:any)=>x.name===name||x.id===name);const exists=Boolean(b);const isPrivate=exists&&b?.public===false;const detail=!b?'לא נמצא':b.public?'ה-Bucket ציבורי — יש לתקן':'פרטי';add(`bucket-${name}`,`Bucket ${name} פרטי`,isPrivate,detail);}
  }catch{add('storage','בדיקת Storage',false,'לא ניתן לקרוא את רשימת ה-Buckets');}
  try{
   const{data:posture,error:postureError}=await checkedQuery(ctx.admin.rpc('kidum_rls_posture'));
   if(postureError)throw postureError;
   const rows=Array.isArray(posture)?posture:[];
   if(!rows.length)add('rls-posture','RLS בטבלאות קריטיות',false,'לא התקבל RLS Posture. יש לוודא שמיגרציות הציות העדכניות הוחלו בסביבה ולרענן Schema Cache');
   else for(const row of rows){const table=String(row?.table_name||'unknown');const ok=row?.ok===true;add(`rls-${table}`,`RLS: ${table}`,ok,!row?.table_exists?'הטבלה לא קיימת':!row?.rls_enabled?'RLS אינו פעיל':Number(row?.policy_count||0)<1?'אין Policy פעילה':`${row.policy_count} policies`);}
  }catch(e:any){add('rls-posture','RLS בטבלאות קריטיות',false,READ_FAILURE_DETAIL);}
  const passed=checks.filter(x=>x.ok).length,failed=checks.length-passed,score=Math.round(passed/Math.max(1,checks.length)*100);
  const manual_blockers=[
   'העברת Production ומידע רגיש לאזור ענן ישראלי מאושר.',
   'מבדק חדירה חיצוני ותיקון/סגירת הממצאים.',
   'בדיקת נגישות חיצונית WCAG AA / ת״י 5568.',
   'חיבור IDM של משרד החינוך לאחר אישור המוצר.',
   'אישור משפטי של מדיניות פרטיות, retention ומעבדי משנה.',
   'Restore Drill אמיתי ותיעוד RPO/RTO בפועל.'
  ];
  await writeSecurityAudit(ctx.admin,ctx.profile,req,'COMPLIANCE_PREFLIGHT_RUN','compliance',null,{score,passed,failed});
  return NextResponse.json({ok:true,score,passed,failed,checks,manual_blockers,generated_at:new Date().toISOString()},{headers:{'cache-control':'no-store'}});
 }catch(e){const x=apiError(e);return NextResponse.json({error:x.message,code:x.code},{status:x.status,headers:{'cache-control':'no-store'}})}
}

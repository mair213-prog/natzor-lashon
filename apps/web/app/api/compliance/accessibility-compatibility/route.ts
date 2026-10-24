import {createHash} from 'crypto';
import {NextResponse} from 'next/server';
import {apiError, requireUser, writeSecurityAudit} from '../../../../lib/server-auth';

const sha = (value: any) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const browserTargets = ['Chrome', 'Edge', 'Safari', 'Firefox'];
const manualRequired = ['keyboard-only', 'screen-reader', 'focus-order', 'forms-errors', 'zoom-reflow', 'rtl-bidi', 'reduced-motion', 'mobile-touch'];
const manualTitles: Record<string, string> = {
  'keyboard-only': 'הפעלה מלאה באמצעות מקלדת', 'screen-reader': 'בדיקת קורא מסך',
  'focus-order': 'סדר מיקוד ברור', 'forms-errors': 'טפסים ושגיאות',
  'zoom-reflow': 'הגדלה וזרימה מחדש', 'rtl-bidi': 'עברית וטקסט דו־כיווני',
  'reduced-motion': 'הפחתת תנועה', 'mobile-touch': 'מגע ומובייל',
};
const essentialCapabilities = ['webcrypto', 'indexeddb', 'file_api', 'css_grid', 'css_logical', 'viewport_meta', 'lang_he', 'dir_rtl'];
const noStore = {'cache-control': 'no-store'};
type ReviewSync = {
  status: 'PENDING' | 'COMPLETE' | 'PARTIAL'; review_id: string;
  updated_controls: string[]; preserved_controls: string[]; errors: string[];
};

function normalizeBrowser(value: string) {
  const browser = String(value || '').toLowerCase();
  if (browser.includes('edg')) return 'Edge';
  if (browser.includes('firefox') || browser.includes('fxios')) return 'Firefox';
  if (browser.includes('chrome') || browser.includes('chromium') || browser.includes('crios')) return 'Chrome';
  if (browser.includes('safari')) return 'Safari';
  return value || 'Other';
}
function hasEvidence(row: any) {
  return Boolean(typeof row?.evidence_reference === 'string' && row.evidence_reference.trim() &&
    row.tested_by && row.tested_at && Number.isFinite(Date.parse(row.tested_at)));
}
function verifiedManualRun(row: any) {
  return row?.test_type === 'MANUAL' && row.result === 'PASS' && hasEvidence(row) &&
    row.checks?.manual_confirmed === true && Boolean(String(row.browser_version || '').trim()) &&
    Boolean(String(row.platform || '').trim()) && row.platform !== 'Unknown';
}
function verifiedManualCheck(row: any) { return row?.result === 'PASS' && hasEvidence(row); }

async function load(admin: any, org: string) {
  const [{data: runs, error: runsErr}, {data: checks, error: checksErr}, {data: reviews, error: reviewsErr}] = await Promise.all([
    admin.from('moe_compatibility_test_runs').select('*').eq('organization_id', org).order('tested_at', {ascending: false}).limit(100),
    admin.from('moe_accessibility_manual_checks').select('*').eq('organization_id', org).order('category').order('title'),
    admin.from('moe_accessibility_compatibility_reviews').select('*').eq('organization_id', org).order('created_at', {ascending: false}).limit(20),
  ]);
  if (runsErr) throw runsErr;
  if (checksErr) throw checksErr;
  if (reviewsErr) throw reviewsErr;
  const allRuns = runs || [];
  const allChecks = (checks || []).map((check: any) => ({...check, evidence_valid: verifiedManualCheck(check)}));
  const browser: Record<string, any> = {};
  const browserAuto: Record<string, any> = {};
  for (const name of browserTargets) {
    // AUTO capability probes do not replace or count as manual product tests.
    const manual = allRuns.find((run: any) => normalizeBrowser(run.browser) === name && run.test_type === 'MANUAL');
    browser[name] = manual ? {...manual, evidence_valid: verifiedManualRun(manual)} : null;
    browserAuto[name] = allRuns.find((run: any) => normalizeBrowser(run.browser) === name && run.test_type === 'AUTO') || null;
  }
  const browserPass = browserTargets.filter(name => browser[name]?.evidence_valid).length;
  const byKey = new Map<string, any>(allChecks.map((check: any) => [check.check_key, check]));
  const manualPass = manualRequired.filter(key => verifiedManualCheck(byKey.get(key))).length;
  const manualFail = manualRequired.filter(key => byKey.get(key)?.result === 'FAIL').length;
  const missingManual = manualRequired.filter(key => !byKey.has(key));
  const compatibilityScore = Math.round(browserPass / browserTargets.length * 100);
  const accessibilityScore = Math.round(manualPass / manualRequired.length * 100);
  const score = Math.round((compatibilityScore + accessibilityScore) / 2);
  return {
    runs: allRuns, checks: allChecks, reviews: reviews || [],
    targets: {browsers: browserTargets, manual: manualRequired},
    coverage: {browser, browser_auto: browserAuto, browser_pass: browserPass, browser_total: browserTargets.length,
      manual_pass: manualPass, manual_fail: manualFail, manual_total: manualRequired.length,
      missing_manual: missingManual.map(key => ({key, title: manualTitles[key]}))},
    scores: {score, compatibility: compatibilityScore, accessibility: accessibilityScore},
    review_sync: reviews?.[0]?.summary?.sync || null, generated_at: new Date().toISOString(),
  };
}

async function syncOfficialRequirements(admin: any, org: string, actor: string, now: string, review: any, bundle: Awaited<ReturnType<typeof load>>) {
  const sync: ReviewSync = {status: 'PENDING', review_id: review.id, updated_controls: [], preserved_controls: [], errors: []};
  const targets = [
    {key: 'compatibility-browsers', status: bundle.coverage.browser_pass === browserTargets.length ? 'PASS' : 'PARTIAL', evidence: `Compatibility browser review ${review.id} · MANUAL ${bundle.coverage.browser_pass}/${browserTargets.length}`},
    // Browser evidence alone does not establish the whole technology standard.
    {key: 'compatibility-2025', status: 'PARTIAL', evidence: `Compatibility internal review ${review.id} · manual browsers ${bundle.coverage.browser_pass}/${browserTargets.length} · full standard checklist requires separate verification`},
    {key: 'accessibility-external-audit', status: 'PARTIAL', evidence: `Accessibility internal review ${review.id} · ${bundle.scores.accessibility}% · external audit still required`},
  ];
  try {
    const {data: requirements, error} = await admin.from('moe_official_standard_requirements')
      .select('id,control_key,status,applicability,evidence_reference,verified_by,verified_at')
      .eq('organization_id', org).in('control_key', targets.map(target => target.key));
    if (error) throw error;
    for (const target of targets) {
      const rows = (requirements || []).filter((row: any) => row.control_key === target.key);
      if (!rows.length) { sync.errors.push(`לא נמצא סעיף לסנכרון: ${target.key}`); continue; }
      for (const row of rows) {
        const evidence = String(row.evidence_reference || '').trim();
        const generatedEvidence = /(?:Compatibility (?:internal |browser )?review|Accessibility internal review)/i.test(evidence);
        const independentlyVerified = row.status === 'PASS' && evidence && row.verified_by && row.verified_at && !generatedEvidence;
        // Preserve separate professional evidence and established scope/external dependency decisions.
        if (row.applicability === 'NOT_APPLICABLE' || row.status === 'NA' || independentlyVerified ||
            (target.key === 'accessibility-external-audit' && row.status === 'EXTERNAL')) {
          sync.preserved_controls.push(target.key); continue;
        }
        try {
          const {data: updated, error: updateError} = await admin.from('moe_official_standard_requirements')
            .update({status: target.status, evidence_reference: target.evidence, verified_by: actor, verified_at: now, updated_at: now})
            .eq('organization_id', org).eq('id', row.id).select('id').maybeSingle();
          if (updateError) throw updateError;
          if (!updated) throw new Error('הסעיף לא עודכן; ייתכן שהרשומה השתנתה.');
          sync.updated_controls.push(target.key);
        } catch (updateError) { sync.errors.push(`${target.key}: ${apiError(updateError).message}`); }
      }
    }
  } catch (error) { sync.errors.push(`לא ניתן לסנכרן את מטריצת התקנים: ${apiError(error).message}`); }
  sync.status = sync.errors.length ? 'PARTIAL' : 'COMPLETE';
  return sync;
}

export async function GET(req: Request) {
  try {
    const ctx = await requireUser(req);
    if (!['ADMIN', 'MANAGER'].includes(String(ctx.profile.role || '').toUpperCase())) throw new Error('FORBIDDEN');
    return NextResponse.json(await load(ctx.admin, ctx.profile.organization_id), {headers: noStore});
  } catch (error) {
    const result = apiError(error);
    return NextResponse.json({error: result.message, code: result.code}, {status: result.status, headers: noStore});
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireUser(req);
    if (!['ADMIN', 'MANAGER'].includes(String(ctx.profile.role || '').toUpperCase())) throw new Error('FORBIDDEN');
    const body = await req.json();
    const action = String(body.action || '');
    const org = ctx.profile.organization_id;
    const actor = ctx.profile.id;
    const now = new Date().toISOString();
    if (action === 'save_auto_run' || action === 'save_manual_run') {
      const result = String(body.result || 'NOT_TESTED').toUpperCase();
      if (!['NOT_TESTED', 'PASS', 'PARTIAL', 'FAIL', 'NA'].includes(result)) throw new Error('תוצאת הבדיקה אינה תקפה.');
      const checks = body.checks && typeof body.checks === 'object' && !Array.isArray(body.checks) ? body.checks : {};
      const evidence = String(body.evidence_reference || '').trim().slice(0, 3000);
      const browser = normalizeBrowser(String(body.browser || 'Other')).slice(0, 80);
      const platform = String(body.platform || 'Unknown').trim().slice(0, 120);
      const browserVersion = String(body.browser_version || '').trim().slice(0, 80);
      const manual = action === 'save_manual_run';
      if (result === 'PASS') {
        if (!evidence) throw new Error('כדי לשמור תוצאה שעברה יש לצרף אסמכתה לבדיקה.');
        if (manual && (checks.manual_confirmed !== true || !browserVersion || !platform || platform === 'Unknown'))
          throw new Error('כדי לאשר בדיקה ידנית יש לציין גרסת דפדפן ומערכת הפעלה ולאשר שהבדיקה בוצעה בפועל.');
        if (!manual && !essentialCapabilities.every(key => checks[key] === true))
          throw new Error('לא ניתן לסמן בדיקת יכולות כתקינה כאשר חסרות תוצאות או קיימת יכולת חיונית שנכשלה.');
      }
      const dimension = (value: unknown) => {
        const number = Number(value);
        return Number.isInteger(number) && number > 0 && number <= 100000 ? number : null;
      };
      const row = {
        organization_id: org, test_type: manual ? 'MANUAL' : 'AUTO', platform,
        platform_version: String(body.platform_version || '').slice(0, 120) || null,
        browser, browser_version: browserVersion || null,
        viewport_width: dimension(body.viewport_width), viewport_height: dimension(body.viewport_height),
        input_mode: String(body.input_mode || '').slice(0, 80) || null, result, checks,
        issues: Array.isArray(body.issues) ? body.issues.slice(0, 100) : [], evidence_reference: evidence || null,
        user_agent: String(body.user_agent || '').slice(0, 2000) || null, tested_by: actor, tested_at: now,
      };
      const {data, error} = await ctx.admin.from('moe_compatibility_test_runs').insert(row).select().single();
      if (error) throw error;
      if (!data) throw new Error('תוצאת הבדיקה לא נשמרה.');
      await writeSecurityAudit(ctx.admin, ctx.profile, req, 'MOE_COMPATIBILITY_TEST_SAVED', 'moe_compatibility_test', data.id,
        {browser: data.browser, platform: data.platform, result: data.result, test_type: data.test_type, manual_confirmed: manual && checks.manual_confirmed === true});
      return NextResponse.json({ok: true, run: data, bundle: await load(ctx.admin, org)}, {headers: noStore});
    }
    if (action === 'save_manual_check') {
      const key = String(body.check_key || '');
      const result = String(body.result || 'NOT_TESTED').toUpperCase();
      if (!key || !['NOT_TESTED', 'PASS', 'FAIL', 'NA'].includes(result)) throw new Error('פרטי בדיקת הנגישות אינם תקפים.');
      const evidence = String(body.evidence_reference || '').trim().slice(0, 3000);
      if (result === 'PASS' && (!evidence || body.manual_confirmed !== true))
        throw new Error('כדי לסמן שעבר יש לצרף אסמכתה ולאשר שביצעת את הבדיקה הידנית.');
      const patch = {result, evidence_reference: evidence || null, notes: String(body.notes || '').trim().slice(0, 5000) || null,
        tested_by: result === 'NOT_TESTED' ? null : actor, tested_at: result === 'NOT_TESTED' ? null : now, updated_at: now};
      const {data, error} = await ctx.admin.from('moe_accessibility_manual_checks').update(patch)
        .eq('organization_id', org).eq('check_key', key).select().single();
      if (error) throw error;
      if (!data) throw new Error('בדיקת הנגישות לא נשמרה.');
      await writeSecurityAudit(ctx.admin, ctx.profile, req, 'MOE_ACCESSIBILITY_CHECK_UPDATED', 'moe_accessibility_check', data.id,
        {check_key: key, result, manual_confirmed: body.manual_confirmed === true});
      return NextResponse.json({ok: true, check: data, bundle: await load(ctx.admin, org)}, {headers: noStore});
    }
    if (action === 'run_review') {
      const bundle = await load(ctx.admin, org);
      const blockers: string[] = [];
      for (const browser of browserTargets) {
        if (!bundle.coverage.browser[browser]?.evidence_valid) blockers.push(`חסרה בדיקה ידנית שעברה עם אסמכתה ואישור מבצע לדפדפן ${browser}`);
      }
      const byKey = new Map<string, any>(bundle.checks.map((check: any) => [check.check_key, check]));
      for (const key of manualRequired) {
        const check = byKey.get(key);
        if (!check) blockers.push(`${manualTitles[key]}: רשומת בדיקת החובה חסרה`);
        else if (!verifiedManualCheck(check)) blockers.push(`${check.title}: ${check.result === 'FAIL' ? 'נכשל' : check.result === 'PASS' ? 'חסרה אסמכתה או זהות ותאריך בדיקה' : 'טרם הושלם'}`);
      }
      const manifest = {
        schema: 'kidum.moe-accessibility-compatibility.v2', organization_id: org, created_at: now,
        scope: 'INTERNAL_MANUAL_EVIDENCE', scores: bundle.scores, coverage: bundle.coverage, required_manual_keys: manualRequired,
        checks: bundle.checks.map((check: any) => ({check_key: check.check_key, result: check.result,
          evidence_reference: check.evidence_reference, tested_by: check.tested_by, tested_at: check.tested_at, evidence_valid: check.evidence_valid})),
        latest_browser_runs: Object.fromEntries(browserTargets.map(browser => [browser, bundle.coverage.browser[browser] || null])),
      };
      const hash = sha(manifest);
      const summary = {browser_pass: bundle.coverage.browser_pass, manual_pass: bundle.coverage.manual_pass,
        manual_fail: bundle.coverage.manual_fail, sync: {status: 'PENDING'}};
      const {data, error} = await ctx.admin.from('moe_accessibility_compatibility_reviews').insert({
        organization_id: org, score: bundle.scores.score, accessibility_score: bundle.scores.accessibility,
        compatibility_score: bundle.scores.compatibility, blockers, summary, manifest, manifest_sha256: hash, created_by: actor,
      }).select().single();
      if (error) throw error;
      if (!data) throw new Error('תמונת המצב לא נשמרה.');
      const sync = await syncOfficialRequirements(ctx.admin, org, actor, now, data, bundle);
      let finalSummary = {...summary, sync};
      try {
        const {data: updated, error: updateError} = await ctx.admin.from('moe_accessibility_compatibility_reviews')
          .update({summary: finalSummary}).eq('organization_id', org).eq('id', data.id).select('id').maybeSingle();
        if (updateError) throw updateError;
        if (!updated) throw new Error('לא נמצא Snapshot לעדכון מצב הסנכרון.');
      } catch (updateError) {
        sync.status = 'PARTIAL';
        sync.errors.push(`תמונת המצב נשמרה, אך שמירת מצב הסנכרון נכשלה: ${apiError(updateError).message}`);
        finalSummary = {...summary, sync};
      }
      await writeSecurityAudit(ctx.admin, ctx.profile, req, 'MOE_ACCESSIBILITY_COMPATIBILITY_REVIEW_CREATED', 'moe_accessibility_compatibility_review', data.id,
        {score: data.score, sha256: hash, blockers: blockers.length, sync_status: sync.status, sync_errors: sync.errors.length});
      let refreshed = bundle;
      try { refreshed = await load(ctx.admin, org); }
      catch (loadError) {
        sync.status = 'PARTIAL';
        sync.errors.push(`תמונת המצב נשמרה, אך רענון התצוגה נכשל: ${apiError(loadError).message}`);
      }
      const review = {...data, summary: finalSummary};
      // Preserve the bundle response contract when an already-saved review only partially synced.
      return NextResponse.json({ok: true, partial: sync.status !== 'COMPLETE', review,
        bundle: {...refreshed, reviews: [review, ...refreshed.reviews.filter((item: any) => item.id !== review.id)].slice(0, 20), review_sync: sync}},
      {headers: noStore});
    }
    throw new Error('הפעולה המבוקשת אינה תקפה.');
  } catch (error) {
    const result = apiError(error);
    return NextResponse.json({error: result.message, code: result.code}, {status: result.status, headers: noStore});
  }
}

import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';

// The route runs with synthetic data and mocked authentication/database calls.
// --source <route.ts> can demonstrate the regression in a previous release.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requireWeb = createRequire(path.join(root, 'apps/web/package.json'));
const ts = requireWeb('typescript');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--source'), 'Usage: accessibility-evidence.mjs [--source <route.ts>]');
const sourcePath = args.length ? path.resolve(args[1]) : path.join(root, 'apps/web/app/api/compliance/accessibility-compatibility/route.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022}, reportDiagnostics: true,
});
assert.equal((compiled.diagnostics || []).filter(item => item.category === ts.DiagnosticCategory.Error).length, 0, 'Route must transpile');

let activeAdmin, activeRole = 'ADMIN';
const exported = {};
vm.runInNewContext(compiled.outputText, {
  exports: exported,
  require(name) {
    if (name === 'crypto') return requireWeb('node:crypto');
    if (name === 'next/server') return {NextResponse: {json: (body, options) => ({body, status: options?.status || 200})}};
    if (name === '../../../../lib/server-auth') return {
      requireUser: async () => ({admin: activeAdmin, profile: {organization_id: 'synthetic-org', id: 'synthetic-tester', role: activeRole}}),
      apiError: error => ({message: error?.message || String(error), status: error?.message === 'FORBIDDEN' ? 403 : 400, code: error?.code || ''}),
      writeSecurityAudit: async () => {},
    };
    throw new Error(`Unexpected import in isolated accessibility test: ${name}`);
  },
  console, Date, Map, Set, Number, String, Object, Array, Boolean,
}, {filename: sourcePath});

const org = 'synthetic-org', stamp = '2026-10-24T12:00:00.000Z';
const requiredChecks = ['keyboard-only', 'screen-reader', 'focus-order', 'forms-errors', 'zoom-reflow', 'rtl-bidi', 'reduced-motion', 'mobile-touch'];
const capabilities = Object.fromEntries(['webcrypto', 'indexeddb', 'file_api', 'css_grid', 'css_logical', 'viewport_meta', 'lang_he', 'dir_rtl'].map(key => [key, true]));
function makeAdmin(seed = {}, fault) {
  const db = {
    moe_compatibility_test_runs: [], moe_accessibility_manual_checks: [], moe_accessibility_compatibility_reviews: [],
    moe_official_standard_requirements: [
      {id: 'browsers', organization_id: org, control_key: 'compatibility-browsers', status: 'PARTIAL'},
      {id: 'general', organization_id: org, control_key: 'compatibility-2025', status: 'PARTIAL'},
      {id: 'external', organization_id: org, control_key: 'accessibility-external-audit', status: 'EXTERNAL'},
    ], ...seed,
  };
  let sequence = 0;
  return {db, from(table) {
    let operation = 'select', payload, filters = [], limit = Infinity, single = false, orders = [];
    const query = {
      select() { return query; },
      insert(value) { operation = 'insert'; payload = value; return query; },
      update(value) { operation = 'update'; payload = value; return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      order(key, config) { orders.push([key, config?.ascending !== false]); return query; },
      limit(value) { limit = value; return query; },
      single() { single = true; return query; },
      maybeSingle() { single = true; return query; },
      then(resolve, reject) {
        try {
          const failure = fault?.(table, operation);
          const error = {message: 'Synthetic database failure', code: 'TEST_FAILURE'};
          if (failure) return (failure === 'reject' ? Promise.reject(error) : Promise.resolve({data: null, error})).then(resolve, reject);
          let rows = (db[table] || []).filter(row => filters.every(filter => filter(row)));
          if (operation === 'insert') {
            const row = {...payload, id: `insert-${++sequence}`, created_at: stamp};
            db[table].push(row); rows = [row];
          }
          if (operation === 'update') rows.forEach(row => Object.assign(row, payload));
          for (const [key, ascending] of orders.slice().reverse()) rows = rows.slice().sort((a, b) => String(a[key] || '').localeCompare(String(b[key] || '')) * (ascending ? 1 : -1));
          rows = rows.slice(0, limit);
          return Promise.resolve({data: single ? rows[0] || null : rows, error: null}).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return query;
  }};
}
const post = body => exported.POST({json: async () => body});
const browserRuns = () => ['Chrome', 'Edge', 'Safari', 'Firefox'].map((browser, index) => ({
  id: `manual-${index}`, organization_id: org, browser, browser_version: '120', platform: 'Windows', test_type: 'MANUAL',
  result: 'PASS', checks: {manual_confirmed: true}, tested_by: 'synthetic-tester', tested_at: stamp, evidence_reference: `report-${browser}`,
}));
const manualChecks = () => requiredChecks.map((check_key, index) => ({id: `check-${index}`, organization_id: org, check_key,
  title: check_key, result: 'PASS', tested_by: 'synthetic-tester', tested_at: stamp, evidence_reference: `report-${check_key}`}));
const storedRequirement = id => activeAdmin.db.moe_official_standard_requirements.find(row => row.id === id);
function assertHash(review) {
  assert.equal(createHash('sha256').update(JSON.stringify(review.manifest)).digest('hex'), review.manifest_sha256,
    'Updating sync metadata must not change the hashed manifest');
}

let cases = 0;
activeAdmin = makeAdmin();
let response = await post({action: 'save_auto_run', result: 'PASS', evidence_reference: 'capability report', checks: {}});
assert.equal(response.status, 400, 'Missing AUTO capability results must not be accepted as PASS');
assert.equal(activeAdmin.db.moe_compatibility_test_runs.length, 0); cases++;

response = await post({action: 'save_manual_run', result: 'PASS', browser: 'Chrome', browser_version: '120', platform: 'Windows', checks: {manual_confirmed: true}});
assert.equal(response.status, 400, 'A manual PASS requires evidence'); cases++;
response = await post({action: 'save_manual_run', result: 'PASS', browser: 'Chrome', browser_version: '120', platform: 'Windows', evidence_reference: 'report'});
assert.equal(response.status, 400, 'A manual PASS requires explicit confirmation'); cases++;
response = await post({action: 'save_manual_run', result: 'PASS', browser: 'Chrome', browser_version: '120', platform: 'Windows', evidence_reference: 'report', checks: {manual_confirmed: true}});
assert.equal(response.status, 200); assert.equal(response.body.bundle.coverage.browser_pass, 1); cases++;

activeAdmin = makeAdmin({moe_accessibility_manual_checks: manualChecks()});
response = await post({action: 'save_manual_check', check_key: 'keyboard-only', result: 'PASS', evidence_reference: 'report'});
assert.equal(response.status, 400, 'A manual accessibility PASS requires confirmation');
response = await post({action: 'save_manual_check', check_key: 'keyboard-only', result: 'PASS', evidence_reference: 'report', manual_confirmed: true});
assert.equal(response.status, 200); cases++;

activeAdmin = makeAdmin({moe_compatibility_test_runs: browserRuns().map(row => ({...row, test_type: 'AUTO', checks: capabilities}))});
response = await exported.GET({});
assert.equal(response.body.coverage.browser_pass, 0, 'Four AUTO probes must not count as four manual tests');
assert.equal(response.body.scores.compatibility, 0); cases++;
response = await post({action: 'run_review'});
assert.equal(response.status, 200); assert.equal(response.body.review.blockers.length, 12, 'Every missing required manual key must create a blocker');
assert.equal(storedRequirement('general').status, 'PARTIAL'); assert.equal(storedRequirement('browsers').status, 'PARTIAL');
assert.equal(storedRequirement('external').status, 'EXTERNAL', 'An external dependency must not be overwritten by an internal review'); assertHash(response.body.review); cases++;

activeAdmin = makeAdmin({moe_compatibility_test_runs: browserRuns(), moe_accessibility_manual_checks: manualChecks()});
response = await post({action: 'run_review'});
assert.equal(response.body.bundle.scores.compatibility, 100); assert.equal(response.body.review.blockers.length, 0);
assert.equal(storedRequirement('browsers').status, 'PASS');
assert.equal(storedRequirement('general').status, 'PARTIAL', 'A browser review must not certify the whole technology standard');
assertHash(response.body.review); cases++;

activeAdmin = makeAdmin({moe_compatibility_test_runs: browserRuns().map(row => ({...row, evidence_reference: ''})),
  moe_accessibility_manual_checks: manualChecks().map(row => ({...row, evidence_reference: ''}))});
response = await exported.GET({});
assert.equal(response.body.coverage.browser_pass, 0); assert.equal(response.body.coverage.manual_pass, 0, 'Legacy PASS rows without evidence must not inflate scores'); cases++;

for (const failure of ['error', 'reject']) {
  activeAdmin = makeAdmin({moe_compatibility_test_runs: browserRuns(), moe_accessibility_manual_checks: manualChecks()},
    (table, operation) => table === 'moe_official_standard_requirements' && operation === 'update' ? failure : false);
  response = await post({action: 'run_review'});
  assert.equal(response.status, 200, 'A saved review must remain available when synchronization fails');
  assert.equal(response.body.partial, true); assert.equal(response.body.bundle.review_sync.status, 'PARTIAL');
  assert.ok(response.body.bundle.review_sync.errors.length); assert.equal(activeAdmin.db.moe_accessibility_compatibility_reviews.length, 1);
  assertHash(response.body.review); cases++;
}

activeAdmin = makeAdmin({}, (table, operation) => table === 'moe_accessibility_compatibility_reviews' && operation === 'insert');
response = await post({action: 'run_review'});
assert.equal(response.status, 400, 'Review insertion failure must not report success'); cases++;

activeAdmin = makeAdmin({}, (table, operation) => table === 'moe_accessibility_compatibility_reviews' && operation === 'update');
response = await post({action: 'run_review'});
assert.equal(response.status, 200); assert.equal(response.body.partial, true, 'Failure to persist synchronization status must be visible');
assertHash(response.body.review); cases++;

activeAdmin = makeAdmin({moe_official_standard_requirements: []});
response = await post({action: 'run_review'});
assert.equal(response.body.partial, true); assert.equal(response.body.bundle.review_sync.errors.length, 3, 'Updating zero rows must not report completed synchronization'); cases++;

activeAdmin = makeAdmin();
Object.assign(storedRequirement('general'), {status: 'PASS', evidence_reference: 'Independent full standard report', verified_by: 'reviewer', verified_at: stamp});
response = await post({action: 'run_review'});
assert.equal(storedRequirement('general').status, 'PASS');
assert.ok(response.body.bundle.review_sync.preserved_controls.includes('compatibility-2025'), 'Separate verified evidence must be preserved'); cases++;

activeRole = 'TEACHER';
response = await exported.GET({}); assert.equal(response.status, 403);
response = await post({action: 'run_review'}); assert.equal(response.status, 403); cases++;
console.log(`PASS: ${cases} accessibility evidence, missing-check, authorization and partial-sync scenarios; manifest hashes preserved.`);

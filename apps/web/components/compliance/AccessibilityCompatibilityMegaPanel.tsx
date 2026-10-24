'use client';
import React, {useCallback, useEffect, useId, useMemo, useState} from 'react';
import {loadMoeAccessibilityCompatibility, runMoeAccessibilityCompatibilityReview, saveMoeAccessibilityManualCheck,
  saveMoeCompatibilityRun, type MoeA11yCompatBundle} from '../../lib/data-service';

const resultLabel: Record<string, string> = {PASS: 'עבר', PARTIAL: 'חלקי', FAIL: 'נכשל', NOT_TESTED: 'טרם נבדק', NA: 'לא חל'};
const requiredBrowsers = ['Chrome', 'Edge', 'Safari', 'Firefox'];
const resultClass = (value?: string) => `a11y-status a11y-status-${String(value || 'NOT_TESTED').toLowerCase()}`;
type ReviewSync = {status: 'PENDING' | 'COMPLETE' | 'PARTIAL'; review_id?: string; errors?: string[]};
type Bundle = MoeA11yCompatBundle & {review_sync?: ReviewSync | null};
const emptyManualRun = {browser: 'Chrome', browser_version: '', platform: '', platform_version: '', result: 'NOT_TESTED',
  viewport_width: '', viewport_height: '', evidence_reference: '', notes: '', confirmed: false};

function browserInfo() {
  const ua = navigator.userAgent;
  let browser = 'Other', version = '', platform = 'Unknown', platformVersion = '';
  let match: RegExpMatchArray | null;
  if ((match = ua.match(/Edg(?:A|iOS)?\/([\d.]+)/))) { browser = 'Edge'; version = match[1]; }
  else if ((match = ua.match(/(?:Firefox|FxiOS)\/([\d.]+)/))) { browser = 'Firefox'; version = match[1]; }
  else if ((match = ua.match(/(?:Chrome|CriOS)\/([\d.]+)/))) { browser = 'Chrome'; version = match[1]; }
  else if ((match = ua.match(/Version\/([\d.]+).*Safari/))) { browser = 'Safari'; version = match[1]; }
  if (/Windows NT/.test(ua)) { platform = 'Windows'; platformVersion = (ua.match(/Windows NT ([\d.]+)/) || [])[1] || ''; }
  else if (/iPhone|iPad|iPod/.test(ua)) { platform = 'iOS'; platformVersion = ((ua.match(/OS ([\d_]+)/) || [])[1] || '').replace(/_/g, '.'); }
  else if (/Android/.test(ua)) { platform = 'Android'; platformVersion = (ua.match(/Android ([\d.]+)/) || [])[1] || ''; }
  else if (/Mac OS X/.test(ua)) {
    platform = navigator.maxTouchPoints > 1 ? 'iOS' : 'macOS';
    platformVersion = platform === 'macOS' ? ((ua.match(/Mac OS X ([\d_]+)/) || [])[1] || '').replace(/_/g, '.') : '';
  }
  return {ua, browser, version, platform, platformVersion};
}

function autoChecks() {
  return {
    webcrypto: !!globalThis.crypto?.subtle, indexeddb: 'indexedDB' in window,
    service_worker: 'serviceWorker' in navigator, file_api: 'File' in window && 'FileReader' in window,
    css_grid: !!globalThis.CSS?.supports?.('display', 'grid'), css_logical: !!globalThis.CSS?.supports?.('margin-inline', '1px'),
    viewport_meta: !!document.querySelector('meta[name="viewport"]'),
    lang_he: document.documentElement.lang.toLowerCase().startsWith('he'), dir_rtl: document.documentElement.dir === 'rtl',
    reduced_motion: !!window.matchMedia,
    touch: (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches) || navigator.maxTouchPoints > 0,
  };
}

export default function AccessibilityCompatibilityMegaPanel() {
  const formId = useId();
  const [data, setData] = useState<Bundle | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busyAction, setBusyAction] = useState('');
  const [message, setMessage] = useState<{text: string; error: boolean}>({text: '', error: false});
  const [manualRun, setManualRun] = useState(emptyManualRun);
  const [checkDrafts, setCheckDrafts] = useState<Record<string, any>>({});
  const [confirmations, setConfirmations] = useState<Record<string, boolean>>({});
  const busy = loading || Boolean(busyAction);
  const announce = (text: string, error = false) => setMessage({text, error});

  const reload = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try { setData(await loadMoeAccessibilityCompatibility()); }
    catch (error) { setLoadError(error instanceof Error ? error.message : 'טעינת המרכז נכשלה'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void reload(); }, [reload]);

  const runCurrent = async () => {
    if (busy) return;
    setBusyAction('browser'); announce('');
    try {
      const info = browserInfo(), checks = autoChecks();
      const essential: (keyof typeof checks)[] = ['webcrypto', 'indexeddb', 'file_api', 'css_grid', 'css_logical', 'viewport_meta', 'lang_he', 'dir_rtl'];
      const failed = essential.filter(key => !checks[key]);
      const result = failed.length ? 'FAIL' : 'PASS';
      setData(await saveMoeCompatibilityRun({test_type: 'AUTO', platform: info.platform, platform_version: info.platformVersion,
        browser: info.browser, browser_version: info.version, viewport_width: window.innerWidth, viewport_height: window.innerHeight,
        input_mode: checks.touch ? 'TOUCH_OR_HYBRID' : 'POINTER_KEYBOARD', result, checks,
        issues: failed.map(key => ({code: key, title: `בדיקת יכולת נכשלה: ${key}`})), user_agent: info.ua,
        evidence_reference: `Client capability run · ${location.pathname}`}));
      announce(result === 'PASS' ? `בדיקת היכולות הטכניות של ${info.browser} עברה. להשלמת התאימות יש לתעד גם בדיקה ידנית.` : `נמצאו ${failed.length} כשלים ביכולות הדפדפן הנוכחי`, result !== 'PASS');
    } catch (error) { announce(error instanceof Error ? error.message : 'הבדיקה נכשלה', true); }
    finally { setBusyAction(''); }
  };

  const saveBrowserManual = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (manualRun.result === 'PASS' && (!manualRun.evidence_reference.trim() || !manualRun.confirmed || !manualRun.browser_version.trim() || !manualRun.platform)) {
      announce('כדי לסמן שעבר יש לציין גרסת דפדפן ומערכת הפעלה, לצרף אסמכתה ולאשר שהבדיקה בוצעה.', true); return;
    }
    setBusyAction('manual-browser'); announce('');
    try {
      setData(await saveMoeCompatibilityRun({...manualRun, test_type: 'MANUAL',
        checks: {manual_confirmed: manualRun.confirmed, notes: manualRun.notes.trim()}, issues: []}));
      setManualRun(current => ({...current, confirmed: false}));
      announce(`הבדיקה הידנית של ${manualRun.browser} נשמרה.`);
    } catch (error) { announce(error instanceof Error ? error.message : 'שמירת הבדיקה הידנית נכשלה', true); }
    finally { setBusyAction(''); }
  };

  const editCheck = (id: string, patch: any) => {
    setCheckDrafts(current => ({...current, [id]: {...current[id], ...patch}}));
    setConfirmations(current => ({...current, [id]: false}));
  };
  const saveCheck = async (event: React.FormEvent, check: any) => {
    event.preventDefault();
    if (busy) return;
    if (check.result === 'PASS' && (!String(check.evidence_reference || '').trim() || !confirmations[check.id])) {
      announce('כדי לסמן שעבר יש לצרף אסמכתה ולאשר שביצעת את הבדיקה הידנית.', true); return;
    }
    setBusyAction(`check-${check.id}`); announce('');
    try {
      setData(await saveMoeAccessibilityManualCheck({...check, manual_confirmed: confirmations[check.id] === true}));
      setCheckDrafts(current => {const next = {...current}; delete next[check.id]; return next;});
      setConfirmations(current => ({...current, [check.id]: false}));
      announce(`הבדיקה נשמרה: ${check.title}`);
    } catch (error) { announce(error instanceof Error ? error.message : 'השמירה נכשלה', true); }
    finally { setBusyAction(''); }
  };

  const review = async () => {
    if (busy) return;
    if (Object.keys(checkDrafts).length) { announce('יש שינויים בבדיקות הידניות שטרם נשמרו. יש לשמור אותם לפני יצירת תמונת מצב.', true); return; }
    setBusyAction('review'); announce('');
    try {
      const bundle = await runMoeAccessibilityCompatibilityReview() as Bundle;
      setData(bundle);
      const partial = bundle.review_sync && bundle.review_sync.status !== 'COMPLETE';
      announce(partial ? 'תמונת המצב נשמרה, אך הסנכרון למטריצת התקנים לא הושלם. פרטי ההשלמה מופיעים בהודעה שמתחת.' :
        'נשמרה תמונת מצב של הבדיקות הפנימיות והסנכרון הושלם. עמידה בתקן המלא ובדיקה חיצונית נבחנות בנפרד.', Boolean(partial));
    } catch (error) { announce(error instanceof Error ? error.message : 'יצירת תמונת המצב נכשלה', true); }
    finally { setBusyAction(''); }
  };
  const browserRows = useMemo(() => requiredBrowsers.map(name => ({name, run: data?.coverage?.browser?.[name] || null,
    auto: data?.coverage?.browser_auto?.[name] || null})), [data]);

  if (!data) return <section className="panel-card a11y-compat-panel" dir="rtl" aria-busy={loading}>
    {loading ? <div className="a11y-loading" role="status"><span className="a11y-spinner" aria-hidden="true"/><div>
      <h2>טוען נתוני נגישות ותאימות</h2><p>אוספים את תוצאות הבדיקות האחרונות…</p></div></div> :
      <div><h2>לא ניתן לטעון את מרכז הנגישות והתאימות</h2><p role="alert">{loadError || 'הנתונים אינם זמינים כרגע.'}</p>
        <button type="button" className="secondary-button" onClick={() => void reload()}>נסה שוב</button></div>}
  </section>;

  const browserPct = data.coverage.browser_total ? Math.round(data.coverage.browser_pass / data.coverage.browser_total * 100) : 0;
  const manualPct = data.coverage.manual_total ? Math.round(data.coverage.manual_pass / data.coverage.manual_total * 100) : 0;
  const sync = data.review_sync || data.reviews?.[0]?.summary?.sync as ReviewSync | undefined;
  const manualPass = manualRun.result === 'PASS';
  const changeManual = (patch: Partial<typeof emptyManualRun>) => setManualRun(current => ({...current, ...patch, confirmed: false}));

  return <section className="panel-card compliance-security-card a11y-compat-panel" id="moe-accessibility-compatibility" dir="rtl" aria-busy={busy}>
    <div className="a11y-hero"><div className="a11y-hero-copy"><span className="eyebrow">תקני משרד החינוך · שלב 2</span>
      <h2>נגישות, שמישות ותאימות טכנולוגית 2025</h2><p>בדיקות דפדפנים, מערכות הפעלה, עברית, מקלדת, קורא מסך, הגדלה וזרימה מחדש. הציון מתייחס לבדיקות הפנימיות המתועדות.</p></div>
      <div className="readiness-ring"><strong>{data.scores.score}%</strong><small>בדיקות פנימיות</small></div></div>
    {message.text && <div className="a11y-message" role={message.error ? 'alert' : 'status'}>{message.text}</div>}
    {loadError && <div className="a11y-message" role="alert"><p>{loadError} הנתונים המוצגים הם מהטעינה הקודמת.</p>
      <button type="button" className="secondary-button compact" disabled={busy} onClick={() => void reload()}>נסה שוב</button></div>}
    {sync && sync.status !== 'COMPLETE' && <div className="security-status warning" role="status"><b>תמונת המצב נשמרה; הסנכרון לא הושלם</b>
      <p>{sync.status === 'PENDING' ? 'אין עדיין אישור לסיום הסנכרון. יש לרענן את הנתונים ולבדוק שוב.' : 'חלק מסעיפי מטריצת התקנים לא עודכנו. לאחר תיקון השגיאה אפשר להפיק תמונת מצב חדשה.'}</p>
      {Boolean(sync.errors?.length) && <ul>{sync.errors!.map((error, index) => <li key={index}>{error}</li>)}</ul>}</div>}
    <div className="a11y-kpi-grid">
      <article><span>תאימות ידנית בדפדפנים</span><b>{data.scores.compatibility}%</b><small>{data.coverage.browser_pass} מתוך {data.coverage.browser_total} עם ראיה ואישור</small></article>
      <article><span>נגישות ידנית מתועדת</span><b>{data.scores.accessibility}%</b><small>{data.coverage.manual_pass} מתוך {data.coverage.manual_total} עברו</small></article>
      <article><span>דפדפנים שאומתו ידנית</span><b><bdi dir="ltr">{data.coverage.browser_pass} / {data.coverage.browser_total}</bdi></b><div className="a11y-progress" aria-hidden="true"><i style={{width: `${browserPct}%`}}/></div></article>
      <article><span>בדיקות נגישות שעברו</span><b><bdi dir="ltr">{data.coverage.manual_pass} / {data.coverage.manual_total}</bdi></b><div className="a11y-progress" aria-hidden="true"><i style={{width: `${manualPct}%`}}/></div></article>
    </div>
    <div className="a11y-existing"><b>הקשחות שכבר קיימות במערכת</b><p><code>lang=he</code>, <code>dir=rtl</code>, תצוגה רספונסיבית, קישור דילוג, מיקוד נראה לעין, הודעות לקורא מסך והפחתת תנועה. יש לבדוק את התנהגותן במסכי הליבה.</p></div>
    <div className="a11y-actions">
      <button type="button" className="primary-button" aria-busy={busyAction === 'browser'} disabled={busy} onClick={runCurrent}>{busyAction === 'browser' ? <><span className="save-spinner" aria-hidden="true"/>בודק…</> : 'בדיקת יכולות הדפדפן הנוכחי'}</button>
      <button type="button" className="secondary-button" aria-busy={busyAction === 'review'} disabled={busy} onClick={review}>{busyAction === 'review' ? <><span className="save-spinner" aria-hidden="true"/>יוצר תמונת מצב…</> : 'יצירת תמונת מצב'}</button>
      <button type="button" className="secondary-button" aria-busy={loading} disabled={busy} onClick={() => void reload()}>{loading ? 'מרענן…' : 'רענון נתונים'}</button>
      <a className="secondary-button" href="https://sapakim.education.gov.il/tech-standards/tech-adjustment12/" target="_blank" rel="noreferrer">תקן תאימות 2025 ↗</a>
      <a className="secondary-button" href="https://sapakim.education.gov.il/accessibility/tech-adjustments/" target="_blank" rel="noreferrer">נוהל נגישות ↗</a>
    </div>

    <section className="a11y-section-card"><div className="a11y-section-head"><div><h3>מטריצת דפדפנים</h3>
      <p>בדיקת היכולות בודקת זמינות טכנית בדפדפן הנוכחי. השלמת סעיף דפדפנים דורשת בדיקה ידנית מתועדת של הפעולות והממשק בכל דפדפן יעד.</p></div>
      <span className="a11y-count">{data.coverage.browser_pass} מתוך {data.coverage.browser_total}</span></div>
      <div className="a11y-browser-grid">{browserRows.map(({name, run, auto}) => {
        const status = run?.result === 'PASS' && !run.evidence_valid ? 'PARTIAL' : run?.result || 'NOT_TESTED';
        return <article className="a11y-browser-card" key={name}><div className="a11y-browser-top"><b>{name}</b><span className={resultClass(status)}>{resultLabel[status]}</span></div>
          <p>{run ? `בדיקה ידנית · ${run.platform}${run.browser_version ? ` · ${run.browser_version}` : ''}` : 'טרם תועדה בדיקה ידנית'}</p>
          {run && <small>{new Date(run.tested_at).toLocaleString('he-IL')}</small>}
          {run?.result === 'PASS' && !run.evidence_valid && <p>חסרים אסמכתה, פרטי בדיקה או אישור מבצע. יש לתעד ולאשר את הבדיקה מחדש.</p>}
          {run?.evidence_reference && <div className="a11y-evidence-line"><span>אסמכתה</span><code dir="auto">{run.evidence_reference}</code></div>}
          {auto && <p>בדיקת יכולות אוטומטית: {resultLabel[auto.result] || auto.result} · {new Date(auto.tested_at).toLocaleString('he-IL')}</p>}
        </article>;
      })}</div>
      <details className="panel-card" style={{marginTop: 16}}><summary><b>תיעוד בדיקת תאימות ידנית</b></summary>
        <form onSubmit={saveBrowserManual} aria-labelledby={`${formId}-manual-title`}>
          <h4 id={`${formId}-manual-title`}>הדפדפן והמערכת שנבדקו בפועל</h4>
          <div className="a11y-form-grid">
            <label htmlFor={`${formId}-browser`}><span>דפדפן</span><select id={`${formId}-browser`} value={manualRun.browser} disabled={busy} onChange={event => changeManual({browser: event.target.value})}>{requiredBrowsers.map(browser => <option key={browser}>{browser}</option>)}</select></label>
            <label htmlFor={`${formId}-browser-version`}><span>גרסת דפדפן{manualPass ? ' — חובה' : ''}</span><input id={`${formId}-browser-version`} dir="ltr" value={manualRun.browser_version} required={manualPass} disabled={busy} onChange={event => changeManual({browser_version: event.target.value})}/></label>
            <label htmlFor={`${formId}-platform`}><span>מערכת הפעלה{manualPass ? ' — חובה' : ''}</span><select id={`${formId}-platform`} value={manualRun.platform} required={manualPass} disabled={busy} onChange={event => changeManual({platform: event.target.value})}><option value="">בחירת מערכת</option>{['Windows', 'macOS', 'iOS', 'Android', 'Linux'].map(platform => <option key={platform}>{platform}</option>)}</select></label>
            <label htmlFor={`${formId}-platform-version`}><span>גרסת מערכת הפעלה</span><input id={`${formId}-platform-version`} dir="ltr" value={manualRun.platform_version} disabled={busy} onChange={event => changeManual({platform_version: event.target.value})}/></label>
            <label htmlFor={`${formId}-manual-result`}><span>תוצאת הבדיקה הידנית</span><select id={`${formId}-manual-result`} value={manualRun.result} disabled={busy} onChange={event => changeManual({result: event.target.value})}>{['NOT_TESTED', 'PASS', 'PARTIAL', 'FAIL', 'NA'].map(result => <option key={result} value={result}>{resultLabel[result]}</option>)}</select></label>
            <label htmlFor={`${formId}-manual-evidence`}><span>אסמכתה{manualPass ? ' — חובה' : ''}</span><input id={`${formId}-manual-evidence`} dir="auto" value={manualRun.evidence_reference} required={manualPass} maxLength={3000} disabled={busy} onChange={event => changeManual({evidence_reference: event.target.value})} placeholder="מספר דוח / קישור / צילום / סרטון"/></label>
            <label htmlFor={`${formId}-viewport-width`}><span>רוחב התצוגה שנבדקה, בפיקסלים</span><input id={`${formId}-viewport-width`} type="number" min={1} max={100000} value={manualRun.viewport_width} disabled={busy} onChange={event => changeManual({viewport_width: event.target.value})}/></label>
            <label htmlFor={`${formId}-viewport-height`}><span>גובה התצוגה שנבדקה, בפיקסלים</span><input id={`${formId}-viewport-height`} type="number" min={1} max={100000} value={manualRun.viewport_height} disabled={busy} onChange={event => changeManual({viewport_height: event.target.value})}/></label>
            <label htmlFor={`${formId}-manual-notes`} className="a11y-notes"><span>מה נבדק ומה הייתה התוצאה?</span><textarea id={`${formId}-manual-notes`} rows={3} value={manualRun.notes} maxLength={5000} disabled={busy} onChange={event => changeManual({notes: event.target.value})}/></label>
          </div>
          {manualPass && <label htmlFor={`${formId}-manual-confirm`} style={{display: 'flex', alignItems: 'flex-start', gap: 8, marginBlock: 12}}>
            <input id={`${formId}-manual-confirm`} type="checkbox" style={{width: 'auto', flexShrink: 0}} checked={manualRun.confirmed} required disabled={busy} onChange={event => setManualRun(current => ({...current, confirmed: event.target.checked}))}/>
            <span>אני מאשר/ת שביצעתי בדיקה ידנית של מסכי הליבה והפעולות המרכזיות בדפדפן ובמערכת שצוינו, ושהאסמכתה מתעדת את הבדיקה.</span></label>}
          <button type="submit" className="secondary-button compact" disabled={busy} aria-busy={busyAction === 'manual-browser'}>{busyAction === 'manual-browser' ? 'שומר…' : 'שמירת בדיקה ידנית'}</button>
        </form>
      </details>
    </section>

    <section className="a11y-section-card"><div className="a11y-section-head"><div><h3>בדיקות נגישות ושמישות ידניות</h3>
      <p>מסמנים “עבר” אחרי בדיקה בפועל, בצירוף אסמכתה ואישור מבצע. המדדים מחושבים מתוצאות שנשמרו בלבד.</p></div><span className="a11y-count">{data.coverage.manual_pass} מתוך {data.coverage.manual_total}</span></div>
      {Boolean(data.coverage.missing_manual?.length) && <div className="security-status warning" role="alert">רשומות של בדיקות חובה חסרות: {data.coverage.missing_manual.map((check: any) => check.title).join(', ')}. הן יופיעו כחסמים בתמונת המצב; יש להשלים את רשימת הבדיקות במסד הנתונים.</div>}
      <div className="a11y-manual-list">{data.checks.filter((check: any) => check.check_key !== 'keyboard-no-trap').map((saved: any) => {
        const check = {...saved, ...checkDrafts[saved.id]};
        const prefix = `${formId}-${check.id}`;
        const title = check.check_key === 'keyboard-only' ? 'מקלדת — הפעלה מלאה וללא מלכודות' : check.title;
        const dirty = Boolean(checkDrafts[check.id]);
        const status = saved.result === 'PASS' && !saved.evidence_valid ? 'PARTIAL' : saved.result;
        return <article className="a11y-manual-card" key={check.id}><div className="a11y-manual-head"><div><b id={`${prefix}-title`}>{title}</b>
          <p>{check.check_key === 'keyboard-only' ? 'כל הפעולות ניתנות לביצוע ללא עכבר, וניתן להתקדם, לחזור ולצאת מכל רכיב ללא מלכודת מקלדת.' : check.requirement_text}</p></div>
          <span className={resultClass(status)}>{resultLabel[status] || status}</span></div>
          {saved.result === 'PASS' && !saved.evidence_valid && <p>הבדיקה מסומנת כעברה, אך חסרה ראיה מתועדת. היא אינה נספרת במוכנות עד להשלמת האסמכתה והשמירה.</p>}
          <form onSubmit={event => void saveCheck(event, check)} aria-labelledby={`${prefix}-title`}>
            <div className="a11y-form-grid">
              <label htmlFor={`${prefix}-result`}><span id={`${prefix}-result-label`}>תוצאה</span><select id={`${prefix}-result`} aria-labelledby={`${prefix}-title ${prefix}-result-label`} value={check.result} disabled={busy} onChange={event => editCheck(check.id, {result: event.target.value})}>{['NOT_TESTED', 'PASS', 'FAIL', 'NA'].map(result => <option key={result} value={result}>{resultLabel[result]}</option>)}</select></label>
              <label htmlFor={`${prefix}-evidence`}><span id={`${prefix}-evidence-label`}>אסמכתה{check.result === 'PASS' ? ' — חובה' : ''}</span><input id={`${prefix}-evidence`} aria-labelledby={`${prefix}-title ${prefix}-evidence-label`} dir="auto" value={check.evidence_reference || ''} required={check.result === 'PASS'} maxLength={3000} disabled={busy} onChange={event => editCheck(check.id, {evidence_reference: event.target.value})} placeholder="מספר דוח / קישור / צילום / סרטון"/></label>
              <label htmlFor={`${prefix}-notes`} className="a11y-notes"><span id={`${prefix}-notes-label`}>הערות</span><textarea id={`${prefix}-notes`} aria-labelledby={`${prefix}-title ${prefix}-notes-label`} rows={3} value={check.notes || ''} maxLength={5000} disabled={busy} onChange={event => editCheck(check.id, {notes: event.target.value})} placeholder="מה נבדק ומה הייתה התוצאה?"/></label>
            </div>
            {check.result === 'PASS' && <label htmlFor={`${prefix}-confirm`} style={{display: 'flex', alignItems: 'flex-start', gap: 8, marginBlock: 12}}>
              <input id={`${prefix}-confirm`} type="checkbox" style={{width: 'auto', flexShrink: 0}} checked={confirmations[check.id] === true} required disabled={busy} onChange={event => setConfirmations(current => ({...current, [check.id]: event.target.checked}))}/>
              <span>אני מאשר/ת שביצעתי את הבדיקה “{title}” ושהאסמכתה מתעדת את התוצאה.</span></label>}
            {dirty && <p role="status">יש שינויים שטרם נשמרו בבדיקה זו.</p>}
            <div className="a11y-save-row"><button type="submit" className="secondary-button compact" aria-label={`שמירת הבדיקה: ${title}`} aria-busy={busyAction === `check-${check.id}`} disabled={busy}>{busyAction === `check-${check.id}` ? <><span className="save-spinner" aria-hidden="true"/>שומר…</> : 'שמירת בדיקה'}</button></div>
          </form>
        </article>;
      })}</div>
    </section>
    <div className="a11y-external-note"><b>בדיקה חיצונית ועמידה בתקן המלא</b><span>המרכז מתעד בדיקות פנימיות. השלמת מטריצת הדפדפנים אינה אישור לתקן התאימות כולו. סטטוס נגישות סופי דורש ראיה מקצועית מתאימה בהתאם לתחולה.</span></div>
  </section>;
}

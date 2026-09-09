function rankInfo(score){const n=Number(score||0);if(n>=150)return ['🏆','אלוף נצור לשונך','positive'];if(n>=120)return ['⭐','מוביל שפה נקייה','positive'];if(n>=90)return ['🛡️','מגן הדיבור','positive'];if(n>=60)return ['💬','נאמן הלשון','positive'];if(n>=30)return ['🌱','שומר המילה','positive'];if(n<=-100)return ['🛑','דורש שינוי','negative'];if(n<=-80)return ['🚦','עצירה וחשיבה','negative'];if(n<=-60)return ['🧭','חוזר למסלול','negative'];if(n<=-40)return ['🔄','מתחזק בדיבור','negative'];if(n<=-20)return ['⚠️','בדרך לתיקון','negative'];return null}
function rankBadge(score){const r=rankInfo(score);return r?`<span class="rank-badge ${r[2]}">${r[0]} ${r[1]}</span>`:''}
let me=null, area='class', groups=[], currentGroup=null, cooldownTimer=null, leadingGroupName='';
let adminData=null, adminGroupsData=[], adminRankings=[], adminWeekly=null, adminPeriods=[], adminSection='data', adminManageSection='students';
let adminReportArea='class', adminReportGroups=[], adminReportGroup=null;
const $=x=>document.getElementById(x);

let deferredInstallPrompt=null;
window.addEventListener('beforeinstallprompt',e=>{
  e.preventDefault();deferredInstallPrompt=e;showInstallButton();
});
window.addEventListener('appinstalled',()=>{deferredInstallPrompt=null;showInstallButton()});
function showInstallButton(){
  const b=document.getElementById('installAppBtn');
  if(b)b.classList.toggle('hidden',!deferredInstallPrompt);
}
async function installApp(){
  if(!deferredInstallPrompt)return alert('במכשיר הזה ניתן להתקין דרך תפריט הדפדפן: הוסף למסך הבית / התקנת אפליקציה');
  playSound('nav');
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt=null;showInstallButton();
}

let audioCtx=null;
function playSound(kind='nav'){
  try{
    audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
    const now=audioCtx.currentTime, osc=audioCtx.createOscillator(), gain=audioCtx.createGain();
    osc.connect(gain);gain.connect(audioCtx.destination);
    const cfg={nav:{f1:520,f2:660,d:.07,type:'sine',v:.045},plus:{f1:660,f2:990,d:.13,type:'sine',v:.06},minus:{f1:320,f2:180,d:.15,type:'triangle',v:.055}}[kind]||{f1:520,f2:660,d:.07,type:'sine',v:.04};
    osc.type=cfg.type;osc.frequency.setValueAtTime(cfg.f1,now);osc.frequency.exponentialRampToValueAtTime(cfg.f2,now+cfg.d);
    gain.gain.setValueAtTime(.0001,now);gain.gain.exponentialRampToValueAtTime(cfg.v,now+.012);gain.gain.exponentialRampToValueAtTime(.0001,now+cfg.d);
    osc.start(now);osc.stop(now+cfg.d+.02);
  }catch{}
}
function pulseButton(el){if(!el)return;el.classList.remove('click-pop');void el.offsetWidth;el.classList.add('click-pop');setTimeout(()=>el.classList.remove('click-pop'),260)}
document.addEventListener('click',e=>{const btn=e.target.closest('button,.nav-sound');if(!btn||btn.disabled)return;pulseButton(btn)});

async function api(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||'שגיאה');return d}
async function boot(){try{me=await api('/api/me');showApp()}catch{}}
async function login(){try{me=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:$('email').value,password:$('password').value})});showApp()}catch(e){$('loginMsg').textContent=e.message;$('loginMsg').classList.remove('hidden')}}
function openResults(){window.open('/results.html','_blank')}
async function logout(){await api('/api/auth/logout',{method:'POST'});location.reload()}
async function loadLeader(){try{const l=await api('/api/leaderboard');leadingGroupName=l?.name||'';const el=$('leaderCard');if(el)el.innerHTML=l?`<div class="leader-inner ${l.goal_reached?'goal-reached':''}"><span class="leader-crown">🏆</span><div class="grow"><div class="small">קבוצת הלימודים המובילה כרגע</div><b>${esc(l.name)}</b><div class="goal-mini"><span style="width:${Math.min(100,Math.max(0,(l.score/l.goal_target)*100))}%"></span></div><div class="small">יעד: ${l.goal_target} נק׳</div></div><div class="leader-score">${l.score} נק׳${l.goal_reached?'<div class="goal-win">🎉 היעד הושג!</div>':''}</div></div>`:`<div class="small">עדיין אין נתוני דירוג לימודים.</div>`;return l}catch{return null}}
function showApp(){$('login').classList.add('hidden');$('app').classList.remove('hidden');$('who').textContent=me.name;$('role').textContent=me.role==='admin'?'מנהל':me.role==='study'?'צוות לימודים':'צוות פנימייה';if(me.role==='admin')$('adminTab').classList.remove('hidden');if(me.role==='study'){area='class';$('dormTab').classList.add('hidden')}if(me.role==='dorm'){area='dorm';$('classTab').classList.add('hidden')}loadLeader();openArea(area)}
async function openArea(a){playSound('nav');area=a;$('admin').classList.add('hidden');$('reporting').classList.remove('hidden');$('classTab').classList.toggle('active',a==='class');$('dormTab').classList.toggle('active',a==='dorm');$('adminTab').classList.remove('active');const [loadedGroups,leader]=await Promise.all([api('/api/groups?type='+a),api('/api/leaderboard').catch(()=>null)]);groups=loadedGroups;leadingGroupName=leader?.name||leadingGroupName;currentGroup=groups[0]?.id||null;renderGroupPicker();if(currentGroup)loadStudents();else $('reporting').innerHTML+='<div class="panel">אין קבוצות שהוקצו למשתמש זה.</div>'}
function renderGroupPicker(){$('reporting').innerHTML=`<div class="panel"><h3>${area==='class'?'בחר קבוצת לימודים':'בחר קבוצת פנימייה'}</h3><div class="grid">${groups.map(g=>`<button class="btn group-picker-btn ${g.id===currentGroup?'active':''} ${g.name===leadingGroupName?'leader-picker':''}" onclick="selectGroup(${g.id})">${g.name===leadingGroupName?'<span class="picker-crown">🏆</span> ':''}${esc(g.name)}</button>`).join('')}</div></div><div id="students"></div>`}
async function selectGroup(id){playSound('nav');currentGroup=id;renderGroupPicker();await loadStudents()}
async function loadStudents(){const rows=await api('/api/groups/'+currentGroup+'/students');$('students').innerHTML=reportStudentsHtml(rows,groups.find(g=>g.id===currentGroup)?.name||'');startCooldownClock()}
function reportStudentsHtml(rows,title,prefix=''){return `<div class="panel"><h2>${esc(title)}</h2><div class="small" style="margin-bottom:8px">כל 20 דיווחי פלוס מזכים אוטומטית בבונוס של 5 נקודות.</div>${rows.map(s=>studentCard(s,prefix)).join('')}</div>`}
function studentCard(s,prefix=''){return `<div class="student"><div><div class="student-name-line"><b>${esc(s.name)}</b>${rankBadge(s.score)}</div><div class="small">ניקוד: ${s.score}${s.bonus?` · כולל בונוס ${s.bonus}+`:''}</div></div><div class="actions"><button id="${prefix}minus_${s.id}" class="minus" data-until="${s.minus_locked_until||''}" ${s.minus_locked?'disabled':''} onclick="${prefix?'adminReport':'report'}(${s.id},'minus')">−</button><span class="score">${s.score}</span><button id="${prefix}plus_${s.id}" class="plus" data-until="${s.plus_locked_until||''}" data-daily="${s.plus_locked?'1':''}" ${s.plus_locked?'disabled':''} onclick="${prefix?'adminReport':'report'}(${s.id},'plus')">+</button></div></div>`}
function startCooldownClock(){if(cooldownTimer)clearInterval(cooldownTimer);const tick=()=>document.querySelectorAll('button[data-until]').forEach(btn=>{if(btn.dataset.daily==='1'){btn.disabled=true;btn.title='הפלוס כבר ניתן היום באזור זה';return}const until=btn.dataset.until;if(!until){btn.title='';return}const ms=new Date(until).getTime()-Date.now();if(ms<=0){btn.disabled=false;btn.dataset.until='';btn.title='';return}const sec=Math.ceil(ms/1000),m=Math.floor(sec/60),r=String(sec%60).padStart(2,'0');btn.disabled=true;btn.title=`אפשר שוב בעוד ${m}:${r}`});tick();cooldownTimer=setInterval(tick,1000)}
async function report(studentId,type){playSound(type);const y=window.scrollY;try{await api('/api/reports',{method:'POST',body:JSON.stringify({studentId,type,area})});await Promise.all([loadStudents(),loadLeader()]);requestAnimationFrame(()=>window.scrollTo(0,y))}catch(e){alert(e.message);await loadStudents();requestAnimationFrame(()=>window.scrollTo(0,y))}}
async function loadAdminAll(){[adminData,adminGroupsData,adminRankings,adminWeekly,adminPeriods]=await Promise.all([api('/api/admin/dashboard'),api('/api/admin/groups'),api('/api/admin/class-rankings'),api('/api/admin/weekly'),api('/api/admin/periods')])}
async function openAdmin(section='data'){playSound('nav');$('reporting').classList.add('hidden');$('admin').classList.remove('hidden');$('classTab').classList.remove('active');$('dormTab').classList.remove('active');$('adminTab').classList.add('active');adminSection=section;await loadAdminAll();renderAdmin()}
function renderAdmin(){$('admin').innerHTML=`<div class="panel admin-shell"><div class="admin-tabs"><button class="btn ${adminSection==='data'?'active':''}" onclick="switchAdmin('data')">📊 הצגת נתונים</button><button class="btn ${adminSection==='manage'?'active':''}" onclick="switchAdmin('manage')">⚙️ ניהול</button></div></div><div id="adminContent"></div>`;renderAdminContent()}
async function switchAdmin(s){playSound('nav');adminSection=s;renderAdmin()}
function renderAdminContent(){const el=$('adminContent');if(!el)return;if(adminSection==='data')el.innerHTML=adminDataView();if(adminSection==='manage')el.innerHTML=adminManageView()}
function adminDataView(){const d=adminData;return `<div class="panel"><div class="row"><div class="grow"><h2>לוח נתונים</h2><div class="small">תקופה פעילה: <b>${esc(d.period?.name||'')}</b></div></div><button class="btn" onclick="openReportsCenter()">📋 דיווחים</button><button class="btn" onclick="exportExcel()">⬇️ Excel</button><button class="btn" onclick="printRankings()">🖨️ PDF / הדפסה</button></div><div class="statgrid"><div class="stat">תלמידים<b>${d.students.length}</b></div><div class="stat">דיווחים<b>${d.summary.reports}</b></div><div class="stat">פלוס<b>${d.summary.plus}</b></div><div class="stat">מינוס<b>${d.summary.minus}</b></div></div></div>${weeklyStar(adminWeekly)}${weeklyChart(adminWeekly)}${adminClassRankings(adminRankings)}`}
function weeklyStar(w){if(!w?.star)return `<div class="panel"><h2>⭐ תלמיד מצטיין השבוע</h2><div class="small">עדיין אין מספיק נתונים.</div></div>`;return `<div class="panel star-card"><div class="star-icon">⭐</div><div><div class="small">תלמיד מצטיין השבוע</div><h2>${esc(w.star.name)}</h2><div>${esc(w.star.class_name)} · ${w.star.score} נק׳ השבוע</div></div></div>`}
function weeklyChart(w){if(!w?.classes?.length)return '';const all=w.classes.flatMap(c=>c.points),max=Math.max(1,...all),width=680,height=220,pad=34,plotW=width-pad*2,plotH=height-pad*2;const polylines=w.classes.map((c,ci)=>{const pts=c.points.map((v,i)=>`${pad+(i/(Math.max(1,c.points.length-1)))*plotW},${height-pad-(v/max)*plotH}`).join(' ');return `<polyline class="chart-line line-${ci%6}" points="${pts}" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`}).join('');const labels=w.days.map((d,i)=>`<text x="${pad+(i/(Math.max(1,w.days.length-1)))*plotW}" y="${height-8}" text-anchor="middle" class="chart-label">${esc(d)}</text>`).join('');return `<div class="panel"><h2>📈 התקדמות שבועית לפי לימודים</h2><div class="chart-wrap"><svg viewBox="0 0 ${width} ${height}" role="img"><line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" class="axis"/>${polylines}${labels}</svg></div><div class="chart-legend">${w.classes.map((c,i)=>`<span><i class="legend-dot line-bg-${i%6}"></i>${esc(c.name)} <b>${c.points.at(-1)||0}</b></span>`).join('')}</div></div>`}
function adminClassRankings(classes){return `<div class="panel" id="rankingsPrint"><h2>מצב לימודים וניקוד</h2><div class="small" style="margin-bottom:10px">לחץ על שם הכיתה כדי לפתוח את דירוג התלמידים שלה.</div><div class="data-class-list">${classes.map((c,ci)=>{const pct=Math.min(100,Math.max(0,(c.class_score/c.goal_target)*100));return `<details class="admin-collapsible data-class-collapse ${ci===0?'leading-group':''} ${c.class_score>=c.goal_target?'goal-hit':''}"><summary><span class="summary-icon">${ci===0?'🏆':'🏫'}</span><span class="grow"><b>${esc(c.group_name)}</b><small>ניקוד קבוצתי: ${c.class_score} / ${c.goal_target}${c.class_score>=c.goal_target?' 🎉':''}</small></span><span class="summary-arrow">⌄</span></summary><div class="collapsible-body"><div class="goal-bar"><span style="width:${pct}%"></span></div><div class="data-class-students">${(c.students||[]).map((s,i)=>`<div class="ranking-row"><span class="rank">${i+1}</span><span class="grow">${esc(s.name)} ${rankBadge(s.score)}</span><span class="small">בסיס ${s.base_score}${s.bonus?` + בונוס ${s.bonus}`:''}</span><b>${s.score}</b></div>`).join('')||'<div class="small empty-admin-list">אין תלמידים בקבוצה</div>'}</div></div></details>`}).join('')||'<div class="small">אין קבוצות לימודים מוגדרות</div>'}</div></div>`}
function adminLogs(reports){return `<div class="panel"><h2>יומן דיווחים אחרונים</h2>${reports.map(r=>`<div class="logrow"><span>${esc(r.student_name)} ${r.report_type==='plus'?'➕':'➖'} <span class="small">על ידי ${esc(r.reporter_name)}</span></span><span class="small">${new Date(r.created_at).toLocaleString('he-IL')}</span></div>`).join('')||'אין דיווחים'}</div>`}
function exportExcel(){const rows=[['לימודים','מיקום','תלמיד','ניקוד בסיס','בונוס','ניקוד סופי']];for(const c of adminRankings)for(let i=0;i<(c.students||[]).length;i++){const s=c.students[i];rows.push([c.group_name,i+1,s.name,s.base_score,s.bonus,s.score])}const csv='\uFEFF'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`natzor-lashon-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)}
function printRankings(){const html=$('rankingsPrint')?.outerHTML||'';const w=window.open('','_blank');w.document.write(`<html dir="rtl"><head><title>דירוג נצור לשונך</title><style>body{font-family:Arial;padding:24px}.ranking-class{border:1px solid #ccc;padding:14px;margin:12px 0}.row,.ranking-row{display:flex;gap:12px;padding:6px}.grow{flex:1}.small{color:#555}.goal-bar{height:8px;background:#eee}.goal-bar span{display:block;height:100%;background:#333}</style></head><body>${html}<script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()}
function adminReportView(){return `<div class="panel"><h2>דיווח מנהל</h2><div class="tabs"><button class="btn ${adminReportArea==='class'?'active':''}" onclick="setAdminReportArea('class')">🏫 לימודים</button><button class="btn ${adminReportArea==='dorm'?'active':''}" onclick="setAdminReportArea('dorm')">🏠 פנימייה</button></div></div><div id="adminReportBody"><div class="panel small">טוען קבוצות...</div></div>`}
async function loadAdminReportGroups(){const [loadedGroups,leader]=await Promise.all([api('/api/groups?type='+adminReportArea),api('/api/leaderboard').catch(()=>null)]);adminReportGroups=loadedGroups;leadingGroupName=leader?.name||leadingGroupName;adminReportGroup=adminReportGroups[0]?.id||null;renderAdminReportPicker();if(adminReportGroup)loadAdminReportStudents()}
async function setAdminReportArea(a){playSound('nav');adminReportArea=a;renderAdminContent();await loadAdminReportGroups()}
function renderAdminReportPicker(){const el=$('adminReportBody');if(!el)return;el.innerHTML=`<div class="panel"><h3>${adminReportArea==='class'?'בחר קבוצת לימודים':'בחר קבוצת פנימייה'}</h3><div class="grid">${adminReportGroups.map(g=>`<button class="btn group-picker-btn ${g.id===adminReportGroup?'active':''} ${g.name===leadingGroupName?'leader-picker':''}" onclick="selectAdminReportGroup(${g.id})">${g.name===leadingGroupName?'<span class="picker-crown">🏆</span> ':''}${esc(g.name)}</button>`).join('')}</div></div><div id="adminReportStudents"></div>`}
async function selectAdminReportGroup(id){playSound('nav');adminReportGroup=id;renderAdminReportPicker();await loadAdminReportStudents()}
async function loadAdminReportStudents(){const rows=await api('/api/groups/'+adminReportGroup+'/students');$('adminReportStudents').innerHTML=reportStudentsHtml(rows,adminReportGroups.find(g=>g.id===adminReportGroup)?.name||'','a_');startCooldownClock()}
async function adminReport(studentId,type){playSound(type);const y=window.scrollY;try{await api('/api/reports',{method:'POST',body:JSON.stringify({studentId,type,area:adminReportArea})});await Promise.all([loadAdminReportStudents(),loadLeader(),loadAdminAll()]);requestAnimationFrame(()=>window.scrollTo(0,y))}catch(e){alert(e.message);await loadAdminReportStudents();requestAnimationFrame(()=>window.scrollTo(0,y))}}
function adminManageView(){return `<div class="panel manage-switch"><h2>ניהול</h2><div class="small">בחר את תחום הניהול</div><div class="manage-tabs"><button class="manage-card ${adminManageSection==='students'?'active':''}" onclick="setManageSection('students')"><span class="manage-icon">🎓</span><b>תלמידים</b><small>תלמידים, קבוצות ותקופות ניקוד</small></button><button class="manage-card ${adminManageSection==='staff'?'active':''}" onclick="setManageSection('staff')"><span class="manage-icon">👥</span><b>צוות</b><small>משתמשים, הרשאות ותזכורות</small></button><button class="manage-card ${adminManageSection==='rules'?'active':''}" onclick="setManageSection('rules')"><span class="manage-icon">📜</span><b>כללי המבצע</b><small>עריכת המלל שמוצג לצוות</small></button></div></div><div id="manageBody">${adminManageSection==='staff'?adminUsers(adminData.users,adminGroupsData):adminManageSection==='rules'?adminRulesEditor():`${adminPeriodsView()}${adminStudents(adminData.students)}${adminGroups(adminGroupsData.filter(g=>g.type==='class'),adminData.students)}`}</div>`}
function setManageSection(s){playSound('nav');adminManageSection=s;renderAdminContent();if(s==='rules')loadCampaignRulesEditor()}
function campaignRulesHtml(text){return esc(text||'').replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').split(/\n{2,}/).map(p=>`<p>${p.replace(/\n/g,'<br>')}</p>`).join('')}
function campaignRulesStyle(s={}){const fonts={system:'Arial,Helvetica,sans-serif',serif:'Georgia,"Times New Roman",serif',rounded:'"Arial Rounded MT Bold",Arial,sans-serif',traditional:'"Noto Serif Hebrew","Times New Roman",serif'};const sizes={small:'.92rem',medium:'1rem',large:'1.14rem'};return `background:${s.background||'#ffffff'};color:${s.textColor||'#17233b'};font-family:${fonts[s.font]||fonts.system};font-size:${sizes[s.size]||sizes.medium}`}
function rulesPlainToHtml(text){return campaignRulesHtml(text)}
function rulesEditorHtml(d){return (d.html&&d.html.trim())?d.html:rulesPlainToHtml(d.text||'')}
function cleanRulesHtml(html){
  const box=document.createElement('div');box.innerHTML=html||'';
  const allowed=new Set(['DIV','P','BR','B','STRONG','I','EM','U','S','UL','OL','LI','SPAN']);
  const allowedStyles=new Set(['color','background-color','font-family','font-size','text-align','font-weight','font-style','text-decoration']);
  function walk(node){
    [...node.children].forEach(el=>{
      if(!allowed.has(el.tagName)){el.replaceWith(...el.childNodes);return}
      [...el.attributes].forEach(a=>{
        if(a.name!=='style')el.removeAttribute(a.name)
      });
      if(el.hasAttribute('style')){
        const safe=[];
        for(const prop of allowedStyles){
          const v=el.style.getPropertyValue(prop);
          if(v&&!/url\s*\(|expression\s*\(|javascript\s*:/i.test(v))safe.push(`${prop}:${v}`)
        }
        if(safe.length)el.setAttribute('style',safe.join(';'));else el.removeAttribute('style');
      }
      walk(el);
    })
  }
  walk(box);return box.innerHTML;
}
function rulesExec(cmd,value=null){const ed=$('campaignRulesEditor');if(!ed)return;ed.focus();document.execCommand(cmd,false,value);previewCampaignRules()}
function rulesApplyFont(){const v=$('rulesFontFamily')?.value;if(v)rulesExec('fontName',v)}
function rulesApplySize(){const v=$('rulesFontSize')?.value;if(v)rulesExec('fontSize',v)}
function rulesApplyColor(){const v=$('rulesSelectionColor')?.value;if(v)rulesExec('foreColor',v)}
function rulesApplyHighlight(){const v=$('rulesHighlight')?.value;if(v)rulesExec('hiliteColor',v)}
function rulesClearFormatting(){rulesExec('removeFormat')}
function rulesInsertLink(){
  const url=prompt('הדבק כתובת קישור:');
  if(!url)return;
  if(!/^https?:\/\//i.test(url))return alert('יש להזין קישור שמתחיל ב-http:// או https://');
  rulesExec('createLink',url);
}
async function openCampaignRules(){playSound('nav');try{const d=await api('/api/campaign-rules');const body=(d.html&&d.html.trim())?d.html:campaignRulesHtml(d.text);modalShell('campaignRulesModal','📜 כללי המבצע',`<div class="campaign-rules-paper" style="${campaignRulesStyle(d.style)}"><div class="campaign-rules-content">${body}</div><div class="campaign-rules-sign">נצור לשונך <span>·</span> בוחרים לדבר נקי</div></div>`)}catch(e){alert(e.message)}}
function adminRulesEditor(){return `<div class="panel"><h2>📜 עריכת כללי המבצע</h2><div class="small" style="margin-bottom:10px">עורך מתקדם: אפשר לסמן מילה, משפט או פסקה ולשנות רק אותם — כמו ב־Word.</div>
<div class="word-toolbar">
  <div class="toolbar-group">
    <button class="editor-tool" type="button" onclick="rulesExec('bold')" title="מודגש"><b>B</b></button>
    <button class="editor-tool" type="button" onclick="rulesExec('italic')" title="נטוי"><i>I</i></button>
    <button class="editor-tool" type="button" onclick="rulesExec('underline')" title="קו תחתון"><u>U</u></button>
    <button class="editor-tool" type="button" onclick="rulesExec('strikeThrough')" title="קו חוצה"><s>S</s></button>
  </div>
  <div class="toolbar-group">
    <select id="rulesFontFamily" class="input editor-select font-select" onchange="rulesApplyFont()">
      <option value="">בחירת פונט</option>
      <option value="Arial">Arial</option>
      <option value="Calibri">Calibri</option>
      <option value="Aptos">Aptos</option>
      <option value="Times New Roman">Times New Roman</option>
      <option value="Georgia">Georgia</option>
      <option value="Tahoma">Tahoma</option>
      <option value="Verdana">Verdana</option>
      <option value="Trebuchet MS">Trebuchet MS</option>
      <option value="Courier New">Courier New</option>
      <option value="David">David</option>
      <option value="FrankRuehl">FrankRuehl</option>
      <option value="Narkisim">Narkisim</option>
      <option value="Guttman Yad">Guttman Yad</option>
    </select>
    <select id="rulesFontSize" class="input editor-select size-select" onchange="rulesApplySize()">
      <option value="">גודל</option>
      <option value="1">קטן מאוד</option>
      <option value="2">קטן</option>
      <option value="3">רגיל</option>
      <option value="4">גדול</option>
      <option value="5">גדול מאוד</option>
      <option value="6">כותרת</option>
      <option value="7">ענק</option>
    </select>
  </div>
  <div class="toolbar-group">
    <label class="editor-color">צבע אות <input id="rulesSelectionColor" type="color" value="#17233b" oninput="rulesApplyColor()"></label>
    <label class="editor-color">הדגשה <input id="rulesHighlight" type="color" value="#fff2a8" oninput="rulesApplyHighlight()"></label>
  </div>
  <div class="toolbar-group">
    <button class="editor-tool" type="button" onclick="rulesExec('justifyRight')" title="יישור לימין">⇥</button>
    <button class="editor-tool" type="button" onclick="rulesExec('justifyCenter')" title="מרכז">≡</button>
    <button class="editor-tool" type="button" onclick="rulesExec('justifyLeft')" title="יישור לשמאל">⇤</button>
    <button class="editor-tool" type="button" onclick="rulesExec('insertUnorderedList')" title="רשימת תבליטים">•</button>
    <button class="editor-tool" type="button" onclick="rulesExec('insertOrderedList')" title="רשימה ממוספרת">1.</button>
  </div>
  <div class="toolbar-group">
    <button class="editor-tool" type="button" onclick="rulesExec('undo')" title="בטל">↶</button>
    <button class="editor-tool" type="button" onclick="rulesExec('redo')" title="בצע שוב">↷</button>
    <button class="editor-tool" type="button" onclick="rulesClearFormatting()" title="נקה עיצוב">Tx</button>
    <button class="editor-tool" type="button" onclick="rulesInsertLink()" title="הוסף קישור">🔗</button>
  </div>
</div>
<div class="rules-page-controls">
  <label class="editor-color">צבע רקע המודעה <input id="rulesBg" type="color" value="#ffffff" oninput="previewCampaignRules()"></label>
  <label class="editor-color">צבע ברירת מחדל <input id="rulesTextColor" type="color" value="#17233b" oninput="previewCampaignRules()"></label>
</div>
<div id="campaignRulesEditor" class="campaign-rich-editor" contenteditable="true" dir="rtl" oninput="previewCampaignRules()"></div>
<div class="rules-preview-wrap"><div class="small"><b>תצוגה מקדימה</b></div><div id="campaignRulesPreview" class="campaign-rules-paper"></div></div>
<div class="row"><button class="btn ok" onclick="saveCampaignRules()">💾 שמור כללי מבצע</button><button class="btn" onclick="loadCampaignRulesEditor()">↻ טען מחדש</button></div></div>`}
function rulesEditorStyle(){return {background:$('rulesBg')?.value||'#ffffff',textColor:$('rulesTextColor')?.value||'#17233b',font:'system',size:'medium'}}
function previewCampaignRules(){const p=$('campaignRulesPreview'),ed=$('campaignRulesEditor');if(!p||!ed)return;p.setAttribute('style',campaignRulesStyle(rulesEditorStyle()));p.innerHTML=`<div class="campaign-rules-content">${cleanRulesHtml(ed.innerHTML)}</div>`}
async function loadCampaignRulesEditor(){const ed=$('campaignRulesEditor');if(!ed)return;try{const d=await api('/api/campaign-rules');ed.innerHTML=rulesEditorHtml(d);$('rulesBg').value=d.style?.background||'#ffffff';$('rulesTextColor').value=d.style?.textColor||'#17233b';previewCampaignRules()}catch(e){ed.innerHTML='';alert(e.message)}}
async function saveCampaignRules(){const ed=$('campaignRulesEditor');if(!ed)return;const html=cleanRulesHtml(ed.innerHTML).trim();const text=(ed.innerText||'').trim();if(!text)return alert('כללי המבצע לא יכולים להיות ריקים');try{await api('/api/admin/campaign-rules',{method:'PUT',body:JSON.stringify({text,html,style:rulesEditorStyle()})});alert('כללי המבצע והעיצוב נשמרו בהצלחה')}catch(e){alert(e.message)}}

function adminPeriodsView(){return `<div class="panel"><h2>🔄 תקופות ניקוד</h2><div class="small">פתיחת תקופה חדשה מאפסת את הניקוד המוצג, אבל שומרת את כל הדיווחים וההיסטוריה מהתקופות הקודמות.</div><div class="row"><input id="newPeriodName" class="input grow" placeholder="למשל: חודש חשוון / מחצית א׳"><button class="btn ok" onclick="startNewPeriod()">פתח תקופה חדשה</button></div><div class="period-list">${adminPeriods.slice(0,8).map(p=>`<div class="row"><span class="grow">${p.active?'🟢':'⚪'} ${esc(p.name)}</span><span class="small">${new Date(p.started_at).toLocaleDateString('he-IL')}</span></div>`).join('')}</div></div>`}
function adminStudents(students){return `<div class="panel"><h2>תלמידים</h2><div class="small" style="margin-bottom:10px">כל תלמיד הוא משותף אוטומטית ללימודים ולפנימייה. את השיוך לקבוצה עושים פעם אחת בלבד.</div><div class="row"><input id="newStudent" class="input grow" placeholder="שם תלמיד"><button class="btn ok" onclick="addStudent()">+ הוסף</button></div><details class="admin-collapsible students-list-box"><summary><span class="summary-icon">👥</span><span class="grow"><b>רשימת תלמידים</b><small>${students.length} תלמידים</small></span><span class="summary-arrow">⌄</span></summary><div class="collapsible-body"><div class="student-search-wrap"><span>🔎</span><input id="studentAdminSearch" class="input" placeholder="חיפוש תלמיד לפי שם" oninput="filterAdminStudents(this.value)"></div><div id="adminStudentsList">${students.map(s=>`<div class="row student-admin-row" data-student-name="${escAttr(String(s.name||'').toLowerCase())}"><input class="input grow" value="${escAttr(s.name)}" onchange="renameStudent(${s.id},this.value)"><button class="btn danger" onclick="deleteStudent(${s.id})">מחיקה</button></div>`).join('')||'<div class="small empty-admin-list">אין תלמידים</div>'}</div><div id="studentSearchEmpty" class="small empty-admin-list hidden">לא נמצאו תלמידים בשם הזה</div></div></details></div>`}
function filterAdminStudents(value){const q=String(value||'').trim().toLowerCase();let shown=0;document.querySelectorAll('#adminStudentsList .student-admin-row').forEach(row=>{const match=!q||row.dataset.studentName.includes(q);row.classList.toggle('hidden',!match);if(match)shown++});const empty=$('studentSearchEmpty');if(empty)empty.classList.toggle('hidden',shown>0)}
function adminGroups(gs,students){return `<div class="panel"><h2>קבוצות לימודים + יעדים</h2><div class="small" style="margin-bottom:10px">כל קבוצה ותלמיד שתוסיף כאן נוצרים ומשויכים אוטומטית גם בפנימייה.</div><div class="row"><input id="newGroup" class="input grow" placeholder="שם קבוצת לימודים"><button class="btn ok" onclick="addGroup()">+ הוסף</button></div><div class="group-admin-list">${gs.map(g=>`<details class="admin-collapsible group-collapse"><summary><span class="summary-icon">🏫</span><span class="grow"><b>${esc(g.name)}</b><small>${g.members.length} תלמידים · יעד ${g.goal_target||500}</small></span><span class="summary-arrow">⌄</span></summary><div class="collapsible-body"><div class="row"><input class="input grow" value="${escAttr(g.name)}" onchange="renameGroup(${g.id},this.value)"><b>לימודים</b><button class="btn danger" onclick="deleteGroup(${g.id})">מחיקה</button></div><div class="row goal-editor"><span>🎯 יעד קבוצתי</span><input id="goal_${g.id}" class="input" type="number" min="1" value="${g.goal_target||500}"><button class="btn" onclick="saveGoal(${g.id})">שמור יעד</button></div><div class="small admin-subtitle">תלמידים בקבוצה</div>${g.members.map(m=>`<div class="row group-member-row"><span class="grow">${esc(m.name)}</span><button class="btn danger" onclick="removeMember(${g.id},${m.id})">הסר</button></div>`).join('')||'<div class="small empty-admin-list">אין תלמידים בקבוצה</div>'}<div class="row add-member-row"><select id="add_${g.id}" class="grow">${students.filter(s=>!g.members.some(m=>m.id===s.id)).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><button class="btn ok" onclick="addMember(${g.id})">הוסף תלמיד</button></div></div></details>`).join('')||'<div class="small empty-admin-list">אין קבוצות לימודים</div>'}</div></div>`}
function adminUserCard(u,gs){return `<div class="panel soft staff-user-card" data-staff-name="${escAttr(String(u.name||'').toLowerCase())}"><div class="row"><input id="uname_${u.id}" class="input grow" value="${escAttr(u.name)}"><input id="uemail_${u.id}" class="input grow" value="${escAttr(u.email)}"><input id="uphone_${u.id}" class="input grow" inputmode="tel" placeholder="מספר WhatsApp" value="${escAttr(u.whatsapp_phone||'')}"></div><div class="row"><select id="urole_${u.id}" class="grow"><option value="study" ${u.role==='study'?'selected':''}>צוות לימודים</option><option value="dorm" ${u.role==='dorm'?'selected':''}>צוות פנימייה</option><option value="admin" ${u.role==='admin'?'selected':''}>ניהול</option></select><label><input id="uactive_${u.id}" type="checkbox" ${u.active?'checked':''}> פעיל</label><button class="btn ok" onclick="saveUser(${u.id})">שמור משתמש</button><button class="btn danger" onclick="deleteUser(${u.id})">מחיקה</button></div><div class="reminder-box"><b>🔔 תזכורת יומית לדיווח</b><div class="small">חובה לבחור דרך אחת לקבלת התזכורת.</div><div class="row"><input id="utime_${u.id}" class="input time-input" type="time" value="${u.reminder_time?String(u.reminder_time).slice(0,5):'20:00'}"><label><input id="uremail_${u.id}" name="uchannel_${u.id}" type="radio" ${u.reminder_enabled!==false&&u.reminder_email_enabled!==false&&!u.reminder_whatsapp_enabled?'checked':''}> 📧 אימייל</label><label><input id="urwa_${u.id}" name="uchannel_${u.id}" type="radio" ${u.reminder_enabled!==false&&u.reminder_whatsapp_enabled?'checked':''}> 💬 WhatsApp</label><label class="reminder-off-option"><input id="uroff_${u.id}" name="uchannel_${u.id}" type="radio" ${u.reminder_enabled===false?'checked':''}> 🔕 ללא תזכורת</label><button class="btn" onclick="saveReminder(${u.id})">שמור תזכורת</button><button class="btn ok" onclick="sendReminderNow(${u.id})">שלח עכשיו לבדיקה</button></div><div class="small">WhatsApp אוטומטי יפעל לאחר חיבור חשבון WhatsApp Business והגדרת תבנית הודעה מאושרת.</div></div><div class="row"><input id="upass_${u.id}" class="input grow" type="password" placeholder="סיסמה חדשה"><button class="btn" onclick="resetUserPassword(${u.id})">החלף סיסמה</button></div><div class="small" style="margin:8px 0">הרשאות ללימודים / פנימייה:</div><div class="row bulk-permissions"><button class="btn" onclick="setAllPermissions(${u.id},'class',true)">✓ כל הלימודים</button><button class="btn" onclick="setAllPermissions(${u.id},'class',false)">נקה לימודים</button><button class="btn" onclick="setAllPermissions(${u.id},'dorm',true)">✓ כל הפנימייה</button><button class="btn" onclick="setAllPermissions(${u.id},'dorm',false)">נקה פנימייה</button></div><div class="grid">${gs.map(g=>`<label class="panel group-check"><input class="permission-box" data-user="${u.id}" data-type="${g.type}" data-group="${g.id}" type="checkbox" ${Array.isArray(u.group_ids)&&u.group_ids.map(Number).includes(Number(g.id))?'checked':''} onchange="toggleUserGroup(${u.id},${g.id},this.checked)"> ${g.type==='class'?'🏫 לימודים':'🏠 פנימייה'} · ${esc(g.name)}</label>`).join('')}</div></div>`}
function staffRoleSection(users,gs,role,label,icon){const list=users.filter(u=>u.role===role);return `<details class="admin-collapsible staff-category" data-staff-category="${role}"><summary><span class="summary-icon">${icon}</span><span class="grow"><b>${label}</b><small>${list.length} אנשי צוות</small></span><span class="summary-arrow">⌄</span></summary><div class="collapsible-body staff-category-body">${list.map(u=>adminUserCard(u,gs)).join('')||'<div class="small empty-admin-list">אין משתמשים בקטגוריה זו</div>'}</div></details>`}
function adminUsers(users,gs){return `<div class="panel"><h2>צוות ותזכורות</h2><div class="small" style="margin-bottom:10px">הצוות מחולק לפי תחום. לחץ על קטגוריה כדי לפתוח את הרשימה.</div><div class="grid staff-create-grid"><input id="uName" class="input" placeholder="שם"><input id="uEmail" class="input" placeholder="אימייל"><input id="uPhone" class="input" inputmode="tel" placeholder="WhatsApp, לדוגמה 0501234567"><input id="uPass" class="input" placeholder="סיסמה (8+)"><select id="uRole"><option value="study">צוות לימודים</option><option value="dorm">צוות פנימייה</option><option value="admin">ניהול</option></select></div><button class="btn ok" onclick="addUser()">+ צור משתמש</button><div class="staff-search-wrap"><span>🔎</span><input id="staffSearch" class="input" placeholder="חיפוש איש צוות לפי שם" oninput="filterStaffUsers(this.value)"></div><div class="staff-categories">${staffRoleSection(users,gs,'study','צוות לימודים','🏫')}${staffRoleSection(users,gs,'dorm','צוות פנימייה','🏠')}${staffRoleSection(users,gs,'admin','ניהול','⚙️')}</div></div>`}
function filterStaffUsers(value){const q=String(value||'').trim().toLowerCase();document.querySelectorAll('.staff-category').forEach(section=>{let shown=0;section.querySelectorAll('.staff-user-card').forEach(card=>{const match=!q||card.dataset.staffName.includes(q);card.classList.toggle('hidden',!match);if(match)shown++});section.classList.toggle('staff-no-match',q&&shown===0);if(q&&shown>0)section.open=true})}
async function refreshAdminEdit(){await loadAdminAll();renderAdmin()}
async function startNewPeriod(){const name=$('newPeriodName').value.trim();if(!name)return alert('הזן שם לתקופה');if(!confirm(`לפתוח תקופת ניקוד חדשה בשם "${name}"? הניקוד המוצג יתאפס, אבל ההיסטוריה תישמר.`))return;await api('/api/admin/periods/start',{method:'POST',body:JSON.stringify({name})});await Promise.all([refreshAdminEdit(),loadLeader()]);alert('התקופה החדשה נפתחה')}
async function saveGoal(id){await api('/api/admin/groups/'+id+'/goal',{method:'PUT',body:JSON.stringify({target:Number($('goal_'+id).value)})});refreshAdminEdit()}
async function addStudent(){await api('/api/admin/students',{method:'POST',body:JSON.stringify({name:$('newStudent').value})});refreshAdminEdit()}
async function renameStudent(id,name){await api('/api/admin/students/'+id,{method:'PUT',body:JSON.stringify({name})});refreshAdminEdit()}
async function deleteStudent(id){if(confirm('למחוק תלמיד?')){await api('/api/admin/students/'+id,{method:'DELETE'});refreshAdminEdit()}}
async function addGroup(){await api('/api/admin/groups',{method:'POST',body:JSON.stringify({name:$('newGroup').value,type:'class'})});refreshAdminEdit()}
async function renameGroup(id,name){await api('/api/admin/groups/'+id,{method:'PUT',body:JSON.stringify({name})});refreshAdminEdit()}
async function deleteGroup(id){if(confirm('למחוק את הקבוצה גם מלימודים וגם מהפנימייה?')){await api('/api/admin/groups/'+id,{method:'DELETE'});refreshAdminEdit()}}
async function addMember(gid){let sid=$('add_'+gid).value;if(sid){await api(`/api/admin/groups/${gid}/students/${sid}`,{method:'POST'});refreshAdminEdit()}}
async function removeMember(gid,sid){await api(`/api/admin/groups/${gid}/students/${sid}`,{method:'DELETE'});refreshAdminEdit()}
async function addUser(){
  const role=$('uRole').value;
  let management_password='';
  if(role==='admin'){
    management_password=prompt('כדי להוסיף משתמש לצוות ניהול יש להזין את סיסמת הניהול הראשית:')||'';
    if(!management_password)return;
  }
  try{
    await api('/api/admin/users',{method:'POST',body:JSON.stringify({name:$('uName').value,email:$('uEmail').value,whatsapp_phone:$('uPhone').value,password:$('uPass').value,role,management_password})});
    refreshAdminEdit();
  }catch(e){alert(e.message)}
}
async function saveUser(id){
  const role=$('urole_'+id).value;
  const existing=adminData.users.find(u=>Number(u.id)===Number(id));
  let management_password='';
  if(role==='admin'&&existing?.role!=='admin'){
    management_password=prompt('כדי להעביר משתמש לצוות ניהול יש להזין את סיסמת הניהול הראשית:')||'';
    if(!management_password)return;
  }
  try{
    await api('/api/admin/users/'+id,{method:'PUT',body:JSON.stringify({name:$('uname_'+id).value,role,active:$('uactive_'+id).checked,management_password})});
    await api('/api/admin/users/'+id+'/email',{method:'PUT',body:JSON.stringify({email:$('uemail_'+id).value})});
    await api('/api/admin/users/'+id+'/whatsapp',{method:'PUT',body:JSON.stringify({phone:$('uphone_'+id).value})});
    refreshAdminEdit();
  }catch(e){alert(e.message)}
}
async function saveReminder(id){
  const email=$('uremail_'+id).checked,wa=$('urwa_'+id).checked,off=$('uroff_'+id)?.checked;
  if(!off&&email===wa)return alert('בחר אימייל, WhatsApp או ביטול תזכורת');
  await api('/api/admin/users/'+id+'/reminder',{method:'PUT',body:JSON.stringify({enabled:!off,time:$('utime_'+id).value,email_enabled:!off&&email,whatsapp_enabled:!off&&wa})});
  alert(off?'התזכורת בוטלה לאיש הצוות':'התזכורת נשמרה');
}
async function sendReminderNow(id){if(!confirm('לשלוח עכשיו תזכורת לאיש הצוות לפי הערוצים שנבחרו?'))return;try{const r=await api('/api/admin/users/'+id+'/reminder/send-now',{method:'POST'});alert(`נשלח בהצלחה. אימייל: ${r.emailSent||0}, WhatsApp: ${r.whatsappSent||0}`)}catch(e){alert(e.message)}}
async function resetUserPassword(id){const password=$('upass_'+id).value;if(!password)return alert('הזן סיסמה חדשה');await api('/api/admin/users/'+id+'/password',{method:'PUT',body:JSON.stringify({password})});alert('הסיסמה הוחלפה בהצלחה');refreshAdminEdit()}
async function deleteUser(id){if(confirm('למחוק את משתמש הצוות?')){await api('/api/admin/users/'+id,{method:'DELETE'});refreshAdminEdit()}}
async function toggleUserGroup(uid,gid,checked){await api(`/api/admin/users/${uid}/groups/${gid}`,{method:checked?'POST':'DELETE'})}
async function setAllPermissions(uid,type,checked){const boxes=[...document.querySelectorAll(`.permission-box[data-user="${uid}"][data-type="${type}"]`)];for(const b of boxes){if(b.checked!==checked){await toggleUserGroup(uid,Number(b.dataset.group),checked);b.checked=checked}}}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function escAttr(s){return esc(s)}
boot();


function modalShell(id,title,body){
  document.getElementById(id)?.remove();
  const el=document.createElement('div');el.id=id;el.className='modal-backdrop';
  el.innerHTML=`<div class="modal-card"><div class="row modal-head"><h2 class="grow">${title}</h2><button class="btn" onclick="document.getElementById('${id}').remove()">✕</button></div>${body}</div>`;
  document.body.appendChild(el);return el;
}
async function openMySettings(){
  try{
    const u=await api('/api/me');
    const channel=u.reminder_whatsapp_enabled?'whatsapp':'email';
    modalShell('mySettingsModal','⚙️ הגדרות שלי',`
      <div class="settings-section"><h3>🔔 תזכורת יומית</h3><div class="small">חובה לבחור דרך אחת לקבלת התזכורת.</div>
      <div class="row settings-choice">
        <label class="choice-card"><input type="radio" name="myReminderChannel" value="email" ${channel==='email'?'checked':''}> 📧 אימייל</label>
        <label class="choice-card"><input type="radio" name="myReminderChannel" value="whatsapp" ${channel==='whatsapp'?'checked':''}> 💬 WhatsApp</label>
        <input id="myReminderTime" class="input time-input" type="time" value="${u.reminder_time?String(u.reminder_time).slice(0,5):'20:00'}">
        <button class="btn ok" onclick="saveMyReminder()">שמור תזכורת</button>
      </div>
      <div class="small">אימייל: ${esc(u.email||'לא מוגדר')} · WhatsApp: ${esc(u.whatsapp_phone||'לא מוגדר')}</div></div>
      <div class="settings-section"><h3>🔐 החלפת סיסמה</h3>
        <input id="myCurrentPassword" class="input" type="password" placeholder="סיסמה נוכחית">
        <div class="settings-gap"></div><input id="myNewPassword" class="input" type="password" placeholder="סיסמה חדשה – לפחות 8 תווים">
        <div class="settings-gap"></div><input id="myNewPassword2" class="input" type="password" placeholder="אימות סיסמה חדשה">
        <div class="settings-gap"></div><button class="btn ok" onclick="changeMyPassword()">החלף סיסמה</button>
      </div>`);
  }catch(e){alert(e.message)}
}
async function saveMyReminder(){
  const ch=document.querySelector('input[name="myReminderChannel"]:checked')?.value;
  if(!ch)return alert('חובה לבחור אימייל או WhatsApp');
  try{await api('/api/me/reminder',{method:'PUT',body:JSON.stringify({channel:ch,time:$('myReminderTime').value})});alert('הגדרות התזכורת נשמרו')}catch(e){alert(e.message)}
}
async function changeMyPassword(){
  const current=$('myCurrentPassword').value,n=$('myNewPassword').value,n2=$('myNewPassword2').value;
  if(n.length<8)return alert('הסיסמה החדשה חייבת להכיל לפחות 8 תווים');
  if(n!==n2)return alert('אימות הסיסמה אינו תואם');
  try{await api('/api/me/password',{method:'PUT',body:JSON.stringify({current_password:current,new_password:n})});$('myCurrentPassword').value=$('myNewPassword').value=$('myNewPassword2').value='';alert('הסיסמה הוחלפה בהצלחה')}catch(e){alert(e.message)}
}

let reportSearchOffset=0,reportSearchRows=[];
function openReportsCenter(){
  modalShell('reportsModal','📋 מרכז דיווחים',`
    <div class="report-filters">
      <input id="rfStudent" class="input" placeholder="חיפוש לפי שם תלמיד">
      <input id="rfReporter" class="input" placeholder="חיפוש לפי איש צוות">
      <input id="rfDate" class="input" type="date">
      <select id="rfType" class="input"><option value="">כל סוגי הדיווח</option><option value="plus">פלוס</option><option value="minus">מינוס</option></select>
      <select id="rfArea" class="input"><option value="">לימודים + פנימייה</option><option value="class">לימודים</option><option value="dorm">פנימייה</option></select>
      <button class="btn active" onclick="searchReports(true)">🔎 חיפוש</button>
      <button class="btn" onclick="clearReportFilters()">נקה</button>
    </div>
    <div id="reportSearchSummary" class="report-summary"></div>
    <div id="reportSearchResults"></div>
    <div class="report-more"><button id="reportMoreBtn" class="btn hidden" onclick="searchReports(false)">הצג עוד</button></div>`);
  searchReports(true);
}
function clearReportFilters(){['rfStudent','rfReporter','rfDate'].forEach(id=>$(id).value='');$('rfType').value='';$('rfArea').value='';searchReports(true)}
async function searchReports(reset){
  if(reset){reportSearchOffset=0;reportSearchRows=[]}
  const q=new URLSearchParams({student:$('rfStudent').value,reporter:$('rfReporter').value,date:$('rfDate').value,type:$('rfType').value,area:$('rfArea').value,offset:String(reportSearchOffset),limit:'50'});
  try{
    const d=await api('/api/admin/reports?'+q.toString());
    reportSearchRows=reportSearchRows.concat(d.reports||[]);reportSearchOffset=d.next_offset||reportSearchRows.length;
    $('reportSearchSummary').innerHTML=`סה״כ <b>${d.summary.total}</b> דיווחים · <span class="plus-text">➕ ${d.summary.plus}</span> · <span class="minus-text">➖ ${d.summary.minus}</span>`;
    $('reportSearchResults').innerHTML=reportSearchRows.map(r=>`<div class="report-result-row"><div><b>${esc(r.student_name)}</b> ${r.report_type==='plus'?'➕':'➖'}<div class="small">${r.area==='class'?'🏫 לימודים':'🏠 פנימייה'} · על ידי ${esc(r.reporter_name)}</div></div><div class="small">${new Date(r.created_at).toLocaleString('he-IL')}</div></div>`).join('')||'<div class="empty-state">לא נמצאו דיווחים לפי החיפוש.</div>';
    $('reportMoreBtn').classList.toggle('hidden',!d.has_more);
  }catch(e){alert(e.message)}
}

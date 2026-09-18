function rankInfo(score){const n=Number(score||0);if(n>=150)return ['🏆','אלוף נצור לשונך','positive'];if(n>=120)return ['⭐','מוביל שפה נקייה','positive'];if(n>=90)return ['🛡️','מגן הדיבור','positive'];if(n>=60)return ['💬','נאמן הלשון','positive'];if(n>=30)return ['🌱','שומר המילה','positive'];if(n<=-100)return ['🛑','דורש שינוי','negative'];if(n<=-80)return ['🚦','עצירה וחשיבה','negative'];if(n<=-60)return ['🧭','חוזר למסלול','negative'];if(n<=-40)return ['🔄','מתחזק בדיבור','negative'];if(n<=-20)return ['⚠️','בדרך לתיקון','negative'];return null}
function rankBadge(score){const r=rankInfo(score);return r?`<span class="rank-badge ${r[2]}">${r[0]} ${r[1]}</span>`:''}
let me=null, area='class', groups=[], currentGroup=null, cooldownTimer=null, leadingGroupName='';
let adminData=null, adminGroupsData=[], adminRankings=[], adminWeekly=null, adminPeriods=[], adminDaily=[], adminScoreMap={}, adminSection='data', adminManageSection='students';
let adminReportArea='class', adminReportGroups=[], adminReportGroup=null;
let engagementChallenges=[], engagementAnnouncements=[], pushStats={total:0,study:0,dorm:0,admin:0,web:0,android:0}, pushInboxTimer=null, pushQueue=[], pushQueueIds=new Set(), pushShowing=false;
const $=x=>document.getElementById(x);
function togglePassword(id,btn){const el=$(id);if(!el)return;const show=el.type==='password';el.type=show?'text':'password';if(btn){btn.textContent=show?'🙈':'👁️';btn.setAttribute('aria-label',show?'הסתר סיסמה':'הצג סיסמה')}}
function passwordField(id,placeholder,value=''){return `<div class="password-wrap grow"><input id="${id}" class="input password-input" type="password" placeholder="${escAttr(placeholder)}" value="${escAttr(value)}"><button type="button" class="password-eye" onclick="togglePassword('${id}',this)" aria-label="הצג סיסמה">👁️</button></div>`}

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
function enqueuePushMessages(rows){for(const m of rows||[]){const id=Number(m.id)||0;if(!id||pushQueueIds.has(id))continue;pushQueueIds.add(id);pushQueue.push(m)}showNextPush()}
function showNextPush(){if(pushShowing||!pushQueue.length)return;const m=pushQueue[0];pushShowing=true;let x=$('inAppPush');if(!x){x=document.createElement('div');x.id='inAppPush';x.className='inapp-push';document.body.appendChild(x)}x.innerHTML=`<div class="inapp-push-backdrop"></div><div class="inapp-push-card" role="dialog" aria-modal="true" aria-label="התראה חדשה"><button class="inapp-push-close" onclick="dismissInAppPush(${Number(m.id)})" aria-label="סגירת הודעה">×</button><div class="inapp-push-icon">🔔</div><div class="inapp-push-kicker">הודעה חדשה</div><h3>${esc(m.title)}</h3><div class="inapp-push-body">${esc(m.body)}</div><button class="btn primary inapp-push-ok" onclick="dismissInAppPush(${Number(m.id)})">הבנתי</button></div>`;x.classList.add('show')}
async function dismissInAppPush(id){try{await api('/api/push/messages/'+id+'/dismiss',{method:'POST'})}catch{}const x=$('inAppPush');if(x)x.classList.remove('show');pushQueue=pushQueue.filter(m=>Number(m.id)!==Number(id));pushQueueIds.delete(Number(id));pushShowing=false;setTimeout(showNextPush,180)}
async function pollPushInbox(){if(!me)return;try{enqueuePushMessages(await api('/api/push/inbox'))}catch{}}
async function startPushInbox(){if(pushInboxTimer)clearInterval(pushInboxTimer);pushQueue=[];pushQueueIds.clear();pushShowing=false;await pollPushInbox();pushInboxTimer=setInterval(pollPushInbox,12000)}
async function boot(){try{me=await api('/api/me');showApp();startPushInbox()}catch{}}
async function login(){try{me=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:$('email').value,password:$('password').value,remember:!!$('rememberMe')?.checked})});showApp();startPushInbox()}catch(e){$('loginMsg').textContent=e.message;$('loginMsg').classList.remove('hidden')}}
function goHomeFromLogo(){playSound('nav');if(me)openHome()}
function openResults(){window.open('/results.html','_blank')}
async function logout(){await api('/api/auth/logout',{method:'POST'});location.reload()}
async function loadLeader(){try{const l=await api('/api/leaderboard');leadingGroupName=l?.name||'';const el=$('leaderCard');if(el)el.innerHTML=l?`<div class="leader-inner ${l.goal_reached?'goal-reached':''}"><span class="leader-crown">🏆</span><div class="grow"><div class="small">קבוצת הלימודים המובילה כרגע</div><b>${esc(l.name)}</b><div class="goal-mini"><span style="width:${Math.min(100,Math.max(0,(l.score/l.goal_target)*100))}%"></span></div><div class="small">יעד: ${l.goal_target} נק׳</div></div><div class="leader-score">${l.score} נק׳${l.goal_reached?'<div class="goal-win">🎉 היעד הושג!</div>':''}</div></div>`:`<div class="small">עדיין אין נתוני דירוג לימודים.</div>`;return l}catch{return null}}
function showApp(){$('login').classList.add('hidden');$('app').classList.remove('hidden');$('who').textContent=me.name;$('role').textContent=me.role==='admin'?'מנהל':me.role==='study'?'צוות לימודים':'צוות פנימייה';if(me.role==='admin')$('adminTab').classList.remove('hidden');if(me.role==='study'){area='class';$('dormTab').classList.add('hidden')}if(me.role==='dorm'){area='dorm';$('classTab').classList.add('hidden')}loadLeader();openHome()}
async function openArea(a){playSound('nav');area=a;$('homeTab')?.classList.remove('active');$('admin').classList.add('hidden');$('reporting').classList.remove('hidden');$('classTab').classList.toggle('active',a==='class');$('dormTab').classList.toggle('active',a==='dorm');$('adminTab').classList.remove('active');const [loadedGroups,leader]=await Promise.all([api('/api/groups?type='+a),api('/api/leaderboard').catch(()=>null)]);groups=loadedGroups;leadingGroupName=leader?.name||leadingGroupName;currentGroup=groups[0]?.id||null;renderGroupPicker();if(currentGroup)loadStudents();else $('reporting').innerHTML+='<div class="panel">אין קבוצות שהוקצו למשתמש זה.</div>'}
function renderGroupPicker(){$('reporting').innerHTML=`<div class="panel"><h3>${area==='class'?'בחר קבוצת לימודים':'בחר קבוצת פנימייה'}</h3><div class="grid">${groups.map(g=>`<button class="btn group-picker-btn ${g.id===currentGroup?'active':''} ${g.name===leadingGroupName?'leader-picker':''}" onclick="selectGroup(${g.id})">${g.name===leadingGroupName?'<span class="picker-crown">🏆</span> ':''}${esc(g.name)}</button>`).join('')}</div></div><div id="students"></div>`}
async function selectGroup(id){playSound('nav');currentGroup=id;renderGroupPicker();await loadStudents()}
async function loadStudents(){const rows=await api('/api/groups/'+currentGroup+'/students');$('students').innerHTML=reportStudentsHtml(rows,groups.find(g=>g.id===currentGroup)?.name||'');startCooldownClock()}
function reportStudentsHtml(rows,title,prefix=''){return `<div class="panel"><h2>${esc(title)}</h2><div class="small" style="margin-bottom:8px">השתתפות בשיעורים: +3 נק׳, פעם אחת ביום בלימודים ופעם אחת בפנימייה. כל 20 השתתפויות מזכות בבונוס 5 נק׳. דיווח על שפה לא נקייה: −1 נק׳.</div>${rows.map(s=>studentCard(s,prefix)).join('')}</div>`}
function studentCard(s,prefix=''){return `<div class="student"><div><div class="student-name-line"><b class="student-link" onclick="openStudentProfile(${s.id})">${esc(s.name)}</b>${rankBadge(s.score)}</div><div class="small">ניקוד: ${s.score}${s.bonus?` · כולל בונוס ${s.bonus}+`:''}</div></div><div class="actions"><button id="${prefix}minus_${s.id}" class="minus" data-until="${s.minus_locked_until||''}" ${s.minus_locked?'disabled':''} onclick="${prefix?'adminReport':'report'}(${s.id},'minus')">−</button><span class="score">${s.score}</span><button id="${prefix}plus_${s.id}" class="plus" data-until="${s.plus_locked_until||''}" data-daily="${s.plus_locked?'1':''}" ${s.plus_locked?'disabled':''} onclick="${prefix?'adminReport':'report'}(${s.id},'plus')">+</button></div></div>`}
function startCooldownClock(){if(cooldownTimer)clearInterval(cooldownTimer);const tick=()=>document.querySelectorAll('button[data-until]').forEach(btn=>{if(btn.dataset.daily==='1'){btn.disabled=true;btn.title='השתתפות בשיעורים כבר דווחה היום באזור זה';return}const until=btn.dataset.until;if(!until){btn.title='';return}const ms=new Date(until).getTime()-Date.now();if(ms<=0){btn.disabled=false;btn.dataset.until='';btn.title='';return}const sec=Math.ceil(ms/1000),m=Math.floor(sec/60),r=String(sec%60).padStart(2,'0');btn.disabled=true;btn.title=`אפשר שוב בעוד ${m}:${r}`});tick();cooldownTimer=setInterval(tick,1000)}
async function report(studentId,type){playSound(type);const y=window.scrollY;try{const r=await api('/api/reports',{method:'POST',body:JSON.stringify({studentId,type,area})});showUndo(r.id);await Promise.all([loadStudents(),loadLeader()]);requestAnimationFrame(()=>window.scrollTo(0,y))}catch(e){alert(e.message);await loadStudents();requestAnimationFrame(()=>window.scrollTo(0,y))}}
async function loadAdminAll(){const [d,g,r,w,p,dy,scores]=await Promise.all([api('/api/admin/dashboard'),api('/api/admin/groups'),api('/api/admin/class-rankings'),api('/api/admin/weekly'),api('/api/admin/periods'),api('/api/admin/daily-summary'),api('/api/admin/score-management/scores')]);adminData=d;adminGroupsData=g;adminRankings=r;adminWeekly=w;adminPeriods=p;adminDaily=dy;adminScoreMap={};(scores||[]).forEach(x=>adminScoreMap[Number(x.id)]=Number(x.score||0))}
async function openAdmin(section='data'){playSound('nav');$('reporting').classList.add('hidden');$('admin').classList.remove('hidden');$('classTab').classList.remove('active');$('dormTab').classList.remove('active');$('adminTab').classList.add('active');adminSection=section;await loadAdminAll();renderAdmin()}
function renderAdmin(){$('admin').innerHTML=`<div class="panel admin-shell"><div class="admin-tabs"><button class="btn ${adminSection==='data'?'active':''}" onclick="switchAdmin('data')">📊 הצגת נתונים</button><button class="btn ${adminSection==='manage'?'active':''}" onclick="switchAdmin('manage')">⚙️ ניהול</button></div></div><div id="adminContent"></div>`;renderAdminContent()}
async function switchAdmin(s){playSound('nav');adminSection=s;renderAdmin()}
function renderAdminContent(){const el=$('adminContent');if(!el)return;if(adminSection==='data')el.innerHTML=adminDataView();if(adminSection==='manage'){el.innerHTML=adminManageView();if(adminManageSection==='engagement')setTimeout(loadEngagementData,0)}}
function adminDataView(){const d=adminData;return `<div class="panel"><div class="row"><div class="grow"><h2>לוח נתונים</h2><div class="small">תקופה פעילה: <b>${esc(d.period?.name||'')}</b></div></div><button class="btn" onclick="openReportsCenter()">📋 דיווחים</button><button class="btn" onclick="exportExcel()">⬇️ Excel</button><button class="btn" onclick="printRankings()">🖨️ PDF / הדפסה</button></div><div class="statgrid"><div class="stat">תלמידים<b>${d.students.length}</b></div><div class="stat">דיווחים<b>${d.summary.reports}</b></div><div class="stat">השתתפות בשיעורים<b>${d.summary.plus}</b></div><div class="stat">שפה לא נקייה<b>${d.summary.minus}</b></div></div></div>${adminDailySummary(adminDaily)}${weeklyStar(adminWeekly)}${weeklyChart(adminWeekly)}${adminClassRankings(adminRankings)}`}
function adminDailySummary(rows){return `<div class="panel"><h2>📅 תמונת מצב יומית</h2><div class="small" style="margin-bottom:10px">הדוח מפריד בין השתתפות בשני השיעורים לבין דיווחים על שפה לא נקייה לאורך היום.</div><div class="daily-class-grid">${(rows||[]).map(x=>`<button class="daily-class-card" onclick="openClassProfile(${x.id})"><b>${esc(x.name)}</b><span>השתתפות ${x.plus}/${x.students*2} · ${x.participation_percent}%</span><span>שפה לא נקייה: ${x.minus}</span>${Number(x.adjustment||0)!==0?`<span>התאמת מנהל: ${Number(x.adjustment)>=0?'+':''}${Number(x.adjustment)}</span>`:''}<strong>מאזן יומי ${x.balance>=0?'+':''}${x.balance}</strong></button>`).join('')||'<div class="small">אין נתונים להיום</div>'}</div></div>`}
function weeklyStar(w){if(!w?.star)return `<div class="panel"><h2>⭐ תלמיד מצטיין השבוע</h2><div class="small">עדיין אין מספיק נתונים.</div></div>`;return `<div class="panel star-card"><div class="star-icon">⭐</div><div><div class="small">תלמיד מצטיין השבוע</div><h2 class="student-link" onclick="openStudentProfile(${w.star.student_id})">${esc(w.star.name)}</h2><div>${esc(w.star.class_name)} · ${w.star.score} נק׳ השבוע</div></div></div>`}
function weeklyChart(w){if(!w?.classes?.length)return '';const all=w.classes.flatMap(c=>c.points),max=Math.max(1,...all),width=680,height=220,pad=34,plotW=width-pad*2,plotH=height-pad*2;const polylines=w.classes.map((c,ci)=>{const pts=c.points.map((v,i)=>`${pad+(i/(Math.max(1,c.points.length-1)))*plotW},${height-pad-(v/max)*plotH}`).join(' ');return `<polyline class="chart-line line-${ci%6}" points="${pts}" fill="none" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`}).join('');const labels=w.days.map((d,i)=>`<text x="${pad+(i/(Math.max(1,w.days.length-1)))*plotW}" y="${height-8}" text-anchor="middle" class="chart-label">${esc(d)}</text>`).join('');return `<div class="panel"><h2>📈 התקדמות שבועית לפי לימודים</h2><div class="chart-wrap"><svg viewBox="0 0 ${width} ${height}" role="img"><line x1="${pad}" y1="${height-pad}" x2="${width-pad}" y2="${height-pad}" class="axis"/>${polylines}${labels}</svg></div><div class="chart-legend">${w.classes.map((c,i)=>`<span><i class="legend-dot line-bg-${i%6}"></i>${esc(c.name)} <b>${c.points.at(-1)||0}</b></span>`).join('')}</div></div>`}
function adminClassRankings(classes){return `<div class="panel" id="rankingsPrint"><h2>מצב לימודים וניקוד</h2><div class="small" style="margin-bottom:10px">לחץ על שם הכיתה לקבלת כרטיס כיתה, ועל שם תלמיד לקבלת כרטיס תלמיד.</div><div class="data-class-list">${classes.map((c,ci)=>{const pct=Math.min(100,Math.max(0,(c.class_score/c.goal_target)*100));return `<details class="admin-collapsible data-class-collapse ${ci===0?'leading-group':''} ${c.class_score>=c.goal_target?'goal-hit':''}"><summary><span class="summary-icon">${ci===0?'🏆':'🏫'}</span><span class="grow class-link" onclick="event.preventDefault();event.stopPropagation();openClassProfile(${c.group_id})"><b>${esc(c.group_name)}</b><small>ניקוד קבוצתי: ${c.class_score} / ${c.goal_target}${c.class_score>=c.goal_target?' 🎉':''}</small></span><span class="summary-arrow" aria-hidden="true"></span></summary><div class="collapsible-body"><div class="goal-bar"><span style="width:${pct}%"></span></div><div class="data-class-students">${(c.students||[]).map((st,i)=>`<div class="ranking-row"><span class="rank">${i+1}</span><span class="grow student-link" onclick="openStudentProfile(${st.id})">${esc(st.name)} ${rankBadge(st.score)}</span><span class="small">שפה נקייה ${st.clean_language_percent}% · השתתפות ${st.participation_percent}%</span><b title="ניקוד סופי: ${st.score}">${st.eligible_leader?st.leadership_score+'%':'—'}</b></div>`).join('')||'<div class="small empty-admin-list">אין תלמידים בקבוצה</div>'}</div></div></details>`}).join('')||'<div class="small">אין קבוצות לימודים מוגדרות</div>'}</div></div>`}
async function openClassProfile(id){try{const c=await api('/api/admin/classes/'+id+'/profile');modalShell('classProfile','🏫 '+esc(c.name),`<div class="class-profile-hero"><div><span>מצב הכיתה</span><b>${c.score} נק׳</b></div><div class="class-progress-big"><strong>${c.progress_percent}%</strong><small>מהמקסימום האפשרי עד היום</small></div></div><div class="goal-bar"><span style="width:${Math.min(100,c.progress_percent)}%"></span></div><div class="small">${c.score} מתוך ${c.max_possible} נק׳ אפשריות · ${c.student_count} תלמידים</div><div class="profile-tabs"><div><b>היום</b><span>השתתפות ${c.today.plus}/${c.student_count*2} (${c.today.participation_percent}%)</span><span>שפה לא נקייה: ${c.today.minus}</span>${Number(c.today.adjustment||0)!==0?`<span>התאמת מנהל: ${Number(c.today.adjustment)>=0?'+':''}${Number(c.today.adjustment)}</span>`:''}<strong>מאזן ${c.today.balance>=0?'+':''}${c.today.balance}</strong></div><div><b>7 ימים</b><span>השתתפויות: ${c.week.plus}</span><span>שפה לא נקייה: ${c.week.minus}</span>${Number(c.week.adjustment||0)!==0?`<span>התאמות מנהל: ${Number(c.week.adjustment)>=0?'+':''}${Number(c.week.adjustment)}</span>`:''}<strong>מאזן ${c.week.balance>=0?'+':''}${c.week.balance}</strong></div><div><b>כל המבצע</b><span>השתתפויות: ${c.all.plus}</span><span>שפה לא נקייה: ${c.all.minus}</span><strong>מאזן ${c.all.balance>=0?'+':''}${c.all.balance}</strong></div></div><h3>👥 תלמידי הכיתה</h3>${c.students.map((st,i)=>`<div class="ranking-row"><span class="rank">${i+1}</span><span class="grow student-link" onclick="openStudentProfile(${st.id})">${esc(st.name)}${st.eligible_leader?'':' <small>· טרם עומד בסף</small>'}</span><b title="ניקוד סופי: ${st.score}">${st.eligible_leader?st.leadership_score+'%':'—'}</b></div>`).join('')}`)}catch(e){alert(e.message)}}
function adminLogs(reports){return `<div class="panel"><h2>יומן דיווחים אחרונים</h2>${reports.map(r=>`<div class="logrow"><span>${esc(r.student_name)} ${r.report_type==='plus'?'➕':'➖'} <span class="small">על ידי ${esc(r.reporter_name)}</span></span><span class="small">${new Date(r.created_at).toLocaleString('he-IL')}</span></div>`).join('')||'אין דיווחים'}</div>`}
function exportExcel(){const rows=[['לימודים','מיקום','תלמיד','מדד מובילות','שפה נקייה %','השתתפות %','ניקוד סופי']];for(const c of adminRankings)for(let i=0;i<(c.students||[]).length;i++){const s=c.students[i];rows.push([c.group_name,i+1,s.name,s.leadership_score,s.clean_language_percent,s.participation_percent,s.score])}const csv='\uFEFF'+rows.map(r=>r.map(v=>`"${String(v??'').replaceAll('"','""')}"`).join(',')).join('\n');const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`natzor-lashon-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href)}
function printRankings(){const html=$('rankingsPrint')?.outerHTML||'';const w=window.open('','_blank');w.document.write(`<html dir="rtl"><head><title>דירוג נצור לשונך</title><style>body{font-family:Arial;padding:24px}.ranking-class{border:1px solid #ccc;padding:14px;margin:12px 0}.row,.ranking-row{display:flex;gap:12px;padding:6px}.grow{flex:1}.small{color:#555}.goal-bar{height:8px;background:#eee}.goal-bar span{display:block;height:100%;background:#333}</style></head><body>${html}<script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close()}
function adminReportView(){return `<div class="panel"><h2>דיווח מנהל</h2><div class="tabs"><button class="btn ${adminReportArea==='class'?'active':''}" onclick="setAdminReportArea('class')">🏫 לימודים</button><button class="btn ${adminReportArea==='dorm'?'active':''}" onclick="setAdminReportArea('dorm')">🏠 פנימייה</button></div></div><div id="adminReportBody"><div class="panel small">טוען קבוצות...</div></div>`}
async function loadAdminReportGroups(){const [loadedGroups,leader]=await Promise.all([api('/api/groups?type='+adminReportArea),api('/api/leaderboard').catch(()=>null)]);adminReportGroups=loadedGroups;leadingGroupName=leader?.name||leadingGroupName;adminReportGroup=adminReportGroups[0]?.id||null;renderAdminReportPicker();if(adminReportGroup)loadAdminReportStudents()}
async function setAdminReportArea(a){playSound('nav');adminReportArea=a;renderAdminContent();await loadAdminReportGroups()}
function renderAdminReportPicker(){const el=$('adminReportBody');if(!el)return;el.innerHTML=`<div class="panel"><h3>${adminReportArea==='class'?'בחר קבוצת לימודים':'בחר קבוצת פנימייה'}</h3><div class="grid">${adminReportGroups.map(g=>`<button class="btn group-picker-btn ${g.id===adminReportGroup?'active':''} ${g.name===leadingGroupName?'leader-picker':''}" onclick="selectAdminReportGroup(${g.id})">${g.name===leadingGroupName?'<span class="picker-crown">🏆</span> ':''}${esc(g.name)}</button>`).join('')}</div></div><div id="adminReportStudents"></div>`}
async function selectAdminReportGroup(id){playSound('nav');adminReportGroup=id;renderAdminReportPicker();await loadAdminReportStudents()}
async function loadAdminReportStudents(){const rows=await api('/api/groups/'+adminReportGroup+'/students');$('adminReportStudents').innerHTML=reportStudentsHtml(rows,adminReportGroups.find(g=>g.id===adminReportGroup)?.name||'','a_');startCooldownClock()}
async function adminReport(studentId,type){playSound(type);const y=window.scrollY;try{await api('/api/reports',{method:'POST',body:JSON.stringify({studentId,type,area:adminReportArea})});await Promise.all([loadAdminReportStudents(),loadLeader(),loadAdminAll()]);requestAnimationFrame(()=>window.scrollTo(0,y))}catch(e){alert(e.message);await loadAdminReportStudents();requestAnimationFrame(()=>window.scrollTo(0,y))}}
function adminManageView(){return `<div class="panel manage-switch"><h2>ניהול</h2><div class="small">בחר את תחום הניהול</div><div class="manage-tabs"><button class="manage-card ${adminManageSection==='students'?'active':''}" onclick="setManageSection('students')"><span class="manage-icon">🎓</span><b>תלמידים</b><small>תלמידים, קבוצות ותקופות ניקוד</small></button><button class="manage-card ${adminManageSection==='score'?'active':''}" onclick="setManageSection('score')"><span class="manage-icon">🎯</span><b>ניהול ניקוד</b><small>הוספה, הפחתה, איפוס ותקופות</small></button><button class="manage-card ${adminManageSection==='staff'?'active':''}" onclick="setManageSection('staff')"><span class="manage-icon">👥</span><b>צוות</b><small>משתמשים, הרשאות ותזכורות</small></button><button class="manage-card ${adminManageSection==='engagement'?'active':''}" onclick="setManageSection('engagement')"><span class="manage-icon">🚀</span><b>מעורבות</b><small>אתגרים, הודעות ו-Push</small></button><button class="manage-card ${adminManageSection==='rules'?'active':''}" onclick="setManageSection('rules')"><span class="manage-icon">📜</span><b>כללי המבצע</b><small>עריכת המלל שמוצג לצוות</small></button></div></div><div id="manageBody">${adminManageSection==='staff'?adminUsers(adminData.users,adminGroupsData):adminManageSection==='score'?adminScoreManagement():adminManageSection==='engagement'?adminEngagement():adminManageSection==='rules'?adminRulesEditor():`${adminStudents(adminData.students)}${adminGroups(adminGroupsData.filter(g=>g.type==='class'),adminData.students)}`}</div>`}
function setManageSection(s){playSound('nav');adminManageSection=s;renderAdminContent();if(s==='rules')loadCampaignRulesEditor();if(s==='engagement')loadEngagementData();if(s==='score')setTimeout(()=>searchScoreStudents(false),0)}
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

function adminPeriodsView(){return `<div class="panel score-period-panel"><h2>🗓️ תקופות ניקוד</h2><div class="small">פתיחת תקופה חדשה שומרת את כל התקופות והדיווחים הקודמים. ניתן לבחור תאריך התחלה ולראות נתונים מכל תקופה.</div><div class="score-period-create"><input id="newPeriodName" class="input" placeholder="שם התקופה"><input id="newPeriodDate" class="input" type="date" value="${new Date().toISOString().slice(0,10)}"><button class="btn ok" onclick="startNewPeriod()">פתח תקופה חדשה</button></div><div class="period-list rich-period-list">${adminPeriods.slice(0,12).map(p=>`<div class="period-row ${p.active?'active-period':''}"><div class="grow"><b>${p.active?'🟢 ':''}${esc(p.name)}</b><div class="small">התחלה: ${new Date(p.started_at).toLocaleDateString('he-IL')}${p.ended_at?' · סיום: '+new Date(p.ended_at).toLocaleDateString('he-IL'):''}</div><div class="small">${Number(p.reports||0)} דיווחים · ${Number(p.students||0)} תלמידים · התאמות ידניות: ${Number(p.manual_adjustments||0)>=0?'+':''}${Number(p.manual_adjustments||0)}</div></div><button class="btn mini" onclick="renamePeriod(${p.id},'${escAttr(p.name)}')">שנה שם</button></div>`).join('')}</div></div>`}
let scoreSearchTimer=null,scoreSelectedStudent=null;
function scoreStudentEditorShell(id,name,group){const initial=Object.prototype.hasOwnProperty.call(adminScoreMap,Number(id))?Number(adminScoreMap[Number(id)]):0;return `<div class="score-editor-card inline"><div class="score-editor-head"><div><h3>${esc(name)}</h3><div class="small">${esc(group||'ללא קבוצה')}</div></div><div class="score-current"><span>ניקוד נוכחי</span><b>${initial}</b></div></div><div class="small score-live-status">הניקוד מעודכן בזמן אמת</div><label class="small">מספר נקודות</label><input class="input score-delta-input" type="number" step="1" placeholder="למשל 10"><label class="small">סיבת השינוי (מומלץ)</label><input class="input score-reason-input" maxlength="300" placeholder="למשל: תיקון דיווח / בונוס מיוחד"><div class="score-actions"><button class="btn ok" onclick="doScoreAdjustFor(this,1)">➕ הוסף נקודות</button><button class="btn danger" onclick="doScoreAdjustFor(this,-1)">➖ הפחת נקודות</button><button class="btn warning score-reset-btn" onclick="resetStudentScoreFor(this)" disabled>↺ אפס ניקוד</button></div><div class="score-history-host"></div></div>`}
function scoreStudentRow(m,g){return `<details class="score-student-accordion" data-score-student="${m.id}" data-score-name="${escAttr(m.name)}" data-score-group="${escAttr(g||'')}" ontoggle="if(this.open)openScoreStudentInline(this)"><summary><span class="score-student-person">👤</span><span class="grow"><b>${esc(m.name)}</b></span><span class="modern-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span></summary><div class="score-inline-editor" id="scoreInline_${m.id}">${scoreStudentEditorShell(m.id,m.name,g||'')}</div></details>`}
function adminScoreManagement(){
  const groups=(adminGroupsData||[]).filter(g=>g.type==='class');
  const assigned=new Set(groups.flatMap(g=>(g.members||[]).map(m=>Number(m.id))));
  const ungrouped=(adminData?.students||[]).filter(s=>!assigned.has(Number(s.id)));
  const groupHtml=groups.map(g=>`<details class="admin-collapsible group-collapse score-group-collapse"><summary><span class="summary-icon">🏫</span><span class="grow"><b>${esc(g.name)}</b><small>${(g.members||[]).length} תלמידים</small></span><span class="modern-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span></summary><div class="collapsible-body score-group-students">${(g.members||[]).map(m=>scoreStudentRow(m,g.name)).join('')||'<div class="small empty-admin-list">אין תלמידים בקבוצה</div>'}</div></details>`).join('');
  const ungroupedHtml=ungrouped.length?`<details class="admin-collapsible group-collapse score-group-collapse"><summary><span class="summary-icon">👤</span><span class="grow"><b>ללא קבוצת לימודים</b><small>${ungrouped.length} תלמידים</small></span><span class="modern-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span></summary><div class="collapsible-body score-group-students">${ungrouped.map(m=>scoreStudentRow(m,'')).join('')}</div></details>`:'';
  return `${adminPeriodsView()}<div class="panel"><h2>🎯 ניהול ניקוד תלמיד</h2><div class="small">בחר קבוצת לימודים ולאחר מכן לחץ על שם התלמיד כדי לפתוח את כלי הניקוד. כל שינוי דורש סיסמת מנהל ונשמר ביומן.</div><div class="score-search-wrap"><input id="scoreStudentSearch" class="input" placeholder="או חפש תלמיד לפי שם..." oninput="clearTimeout(scoreSearchTimer);scoreSearchTimer=setTimeout(()=>searchScoreStudents(),250)"></div><div id="scoreStudentResults" class="score-student-results"></div><div class="group-admin-list score-groups-list">${groupHtml}${ungroupedHtml}</div></div>`
}
async function searchScoreStudents(){const el=$('scoreStudentResults');if(!el)return;const q=$('scoreStudentSearch')?.value||'';if(q.trim().length<1){el.innerHTML='';return}try{const rows=await api('/api/admin/score-management/students?q='+encodeURIComponent(q));el.innerHTML=rows.map(x=>`<details class="score-student-accordion search-score-row" data-score-student="${x.id}" data-score-name="${escAttr(x.name)}" data-score-group="${escAttr(x.group_name||'')}" ontoggle="if(this.open)openScoreStudentInline(this)"><summary><span class="score-student-person">👤</span><span class="grow"><b>${esc(x.name)}</b><small>${esc(x.group_name||'ללא קבוצת לימודים')}</small></span><strong>${Number(x.score||0)} נק׳</strong><span class="modern-chevron" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></span></summary><div class="score-inline-editor" id="scoreInlineSearch_${x.id}"></div></details>`).join('')||'<div class="small">לא נמצאו תלמידים</div>'}catch(e){el.innerHTML='<div class="small">'+esc(e.message)+'</div>'}}
async function openScoreStudentInline(details){
  if(!details.open)return;
  const id=Number(details.dataset.scoreStudent),name=details.dataset.scoreName||'',group=details.dataset.scoreGroup||'';
  document.querySelectorAll('.score-student-accordion[open]').forEach(d=>{if(d!==details)d.open=false});
  const initial=Object.prototype.hasOwnProperty.call(adminScoreMap,Number(id))?Number(adminScoreMap[Number(id)]):0;
  scoreSelectedStudent={id:Number(id),name:String(name||''),group:String(group||''),score:initial};
  updateOpenScoreEditorScore(details,initial);
  loadScoreHistoryInto(details,id);
}
function updateOpenScoreEditorScore(details,score){
  const n=Number(score||0);
  const b=details?.querySelector('.score-current b');if(b)b.textContent=n;
  if(details)details.dataset.currentScore=String(n);
  const reset=details?.querySelector('.score-reset-btn');if(reset)reset.disabled=false;
  const st=details?.querySelector('.score-live-status');if(st){st.textContent='הניקוד מעודכן בזמן אמת';st.classList.remove('score-load-error')}
}
async function loadScoreHistoryInto(details,id){
  const box=details?.querySelector('.score-history-host');if(!box)return;
  try{
    const hist=await api('/api/admin/score-management/'+id+'/history');
    if(!details.open)return;
    box.innerHTML=hist.length?`<details class="score-history"><summary>יומן התאמות (${hist.length})</summary>${hist.map(h=>`<div class="score-history-row"><span><b>${Number(h.delta)>0?'+':''}${Number(h.delta)}</b> · ${esc(h.reason||h.action_type)}</span><small>${new Date(h.created_at).toLocaleString('he-IL')} · ${esc(h.admin_name||'מנהל')}</small></div>`).join('')}<button class="btn mini" onclick="undoLastScoreChange()">בטל שינוי ידני אחרון</button></details>`:'';
  }catch(e){box.innerHTML=''}
}
function renderScoreStudentCard(target){
  const x=scoreSelectedStudent,el=target||document.querySelector(`.score-student-accordion[open] .score-inline-editor`);if(!x||!el)return;
  const known=Number.isFinite(Number(x.score))&&x.score!==null;
  el.innerHTML=`<div class="score-editor-card inline"><div class="score-editor-head"><div><h3>${esc(x.name)}</h3><div class="small">${esc(x.group||'ללא קבוצה')}</div></div><div class="score-current"><span>ניקוד נוכחי</span><b>${known?Number(x.score):'…'}</b></div></div><div class="small score-live-status">${known?'':'טוען את הניקוד הנוכחי…'}</div><label class="small">מספר נקודות</label><input id="scoreDelta" class="input" type="number" step="1" placeholder="למשל 10"><label class="small">סיבת השינוי (מומלץ)</label><input id="scoreReason" class="input" maxlength="300" placeholder="למשל: תיקון דיווח / בונוס מיוחד"><div class="score-actions"><button class="btn ok" onclick="doScoreAdjust(1)">➕ הוסף נקודות</button><button class="btn danger" onclick="doScoreAdjust(-1)">➖ הפחת נקודות</button><button class="btn warning score-reset-btn" onclick="resetStudentScore()" ${known?'':'disabled'}>↺ אפס ניקוד</button></div><div class="score-history-host"></div></div>`;
}
function scoreEditorContext(btn){
  const details=btn.closest('.score-student-accordion');
  const id=Number(details?.dataset.scoreStudent),name=details?.dataset.scoreName||'',group=details?.dataset.scoreGroup||'';
  const score=Number(details?.dataset.currentScore);
  scoreSelectedStudent={id,name,group,score:Number.isFinite(score)?score:null};
  return {details,id,name,group};
}
async function doScoreAdjustFor(btn,sign){
  const {details,id,name,group}=scoreEditorContext(btn);
  if(!details||!id)return alert('לא ניתן לזהות את התלמיד. רענן את המסך ונסה שוב.');
  const n=Math.abs(Math.trunc(Number(details.querySelector('.score-delta-input')?.value)));
  if(!n)return alert('יש להזין מספר נקודות');
  const delta=n*sign,reason=details.querySelector('.score-reason-input')?.value.trim()||'';
  if(!confirm(`${delta>0?'להוסיף':'להפחית'} ${n} נקודות ל${name}?`))return;
  const management_password=prompt('הזן סיסמת מנהל לאישור הפעולה:')||'';if(!management_password)return;
  btn.disabled=true;const status=details.querySelector('.score-live-status');if(status)status.textContent='מעדכן ניקוד…';
  try{
    const r=await api('/api/admin/score-management/'+id+'/adjust',{method:'POST',body:JSON.stringify({mode:'adjust',delta,reason,management_password})});
    const after=Number(r.after);adminScoreMap[id]=after;scoreSelectedStudent={id,name,group,score:after};updateOpenScoreEditorScore(details,after);
    const inp=details.querySelector('.score-delta-input');if(inp)inp.value='';const rs=details.querySelector('.score-reason-input');if(rs)rs.value='';
    loadScoreHistoryInto(details,id);Promise.all([loadAdminAll(),loadLeader()]).catch(()=>{});
  }catch(e){if(status){status.textContent='העדכון נכשל';status.classList.add('score-load-error')}alert(e.message)}finally{btn.disabled=false}
}
async function resetStudentScoreFor(btn){
  const {details,id,name,group}=scoreEditorContext(btn);if(!details||!id)return alert('לא ניתן לזהות את התלמיד. רענן את המסך ונסה שוב.');
  const current=Number(details.dataset.currentScore);if(!Number.isFinite(current))return alert('הניקוד הנוכחי עדיין לא נטען');
  if(!confirm(`לאפס את הניקוד של ${name} (${current} נק׳) ל-0?`))return;
  const management_password=prompt('הזן סיסמת מנהל לאישור האיפוס:')||'';if(!management_password)return;
  const reason=details.querySelector('.score-reason-input')?.value.trim()||'איפוס ניקוד';btn.disabled=true;const status=details.querySelector('.score-live-status');if(status)status.textContent='מאפס ניקוד…';
  try{const r=await api('/api/admin/score-management/'+id+'/adjust',{method:'POST',body:JSON.stringify({mode:'reset',reason,management_password})});const after=Number(r.after);adminScoreMap[id]=after;scoreSelectedStudent={id,name,group,score:after};updateOpenScoreEditorScore(details,after);loadScoreHistoryInto(details,id);Promise.all([loadAdminAll(),loadLeader()]).catch(()=>{})}catch(e){if(status){status.textContent='האיפוס נכשל';status.classList.add('score-load-error')}alert(e.message)}finally{btn.disabled=false}
}
async function doScoreAdjust(sign){const n=Math.abs(Math.trunc(Number($('scoreDelta')?.value)));if(!n)return alert('יש להזין מספר נקודות');const delta=n*sign,reason=$('scoreReason')?.value.trim()||'';if(!confirm(`${delta>0?'להוסיף':'להפחית'} ${n} נקודות ל${scoreSelectedStudent.name}?`))return;const management_password=prompt('הזן סיסמת מנהל לאישור הפעולה:')||'';if(!management_password)return;try{const r=await api('/api/admin/score-management/'+scoreSelectedStudent.id+'/adjust',{method:'POST',body:JSON.stringify({mode:'adjust',delta,reason,management_password})});scoreSelectedStudent.score=r.after;await renderScoreStudentCard();await Promise.all([loadAdminAll(),loadLeader()]);alert(`הניקוד עודכן ל-${r.after}`)}catch(e){alert(e.message)}}
async function resetStudentScore(){if(!scoreSelectedStudent||scoreSelectedStudent.score===null)return alert('הניקוד הנוכחי עדיין נטען. נסה שוב בעוד רגע.');if(!confirm(`לאפס את הניקוד של ${scoreSelectedStudent.name} מ-${scoreSelectedStudent.score} ל-0?\nהדיווחים וההיסטוריה יישמרו.`))return;const management_password=prompt('הזן סיסמת מנהל לאישור איפוס:')||'';if(!management_password)return;const reason=prompt('סיבת האיפוס (אופציונלי):')||'';try{const r=await api('/api/admin/score-management/'+scoreSelectedStudent.id+'/adjust',{method:'POST',body:JSON.stringify({mode:'reset',reason,management_password})});scoreSelectedStudent.score=r.after;await renderScoreStudentCard();await Promise.all([loadAdminAll(),loadLeader()]);alert('הניקוד אופס. ההיסטוריה נשמרה.')}catch(e){alert(e.message)}}
async function undoLastScoreChange(){if(!scoreSelectedStudent||!confirm('לבטל את השינוי הידני האחרון?'))return;const management_password=prompt('הזן סיסמת מנהל:')||'';if(!management_password)return;try{await api('/api/admin/score-management/'+scoreSelectedStudent.id+'/undo-last',{method:'POST',body:JSON.stringify({management_password})});const rows=await api('/api/admin/score-management/students?q='+encodeURIComponent(scoreSelectedStudent.name));const fresh=rows.find(x=>Number(x.id)===Number(scoreSelectedStudent.id));if(fresh)scoreSelectedStudent.score=fresh.score;await renderScoreStudentCard();await Promise.all([loadAdminAll(),loadLeader()])}catch(e){alert(e.message)}}
function adminStudents(students){return `<div class="panel"><h2>תלמידים</h2><div class="small" style="margin-bottom:10px">כל תלמיד הוא משותף אוטומטית ללימודים ולפנימייה. את השיוך לקבוצה עושים פעם אחת בלבד.</div><div class="row"><input id="newStudent" class="input grow" placeholder="שם תלמיד"><button class="btn ok" onclick="addStudent()">+ הוסף</button></div><details class="admin-collapsible students-list-box"><summary><span class="summary-icon">👥</span><span class="grow"><b>רשימת תלמידים</b><small>${students.length} תלמידים</small></span><span class="summary-arrow" aria-hidden="true"></span></summary><div class="collapsible-body"><div class="student-search-wrap"><span>🔎</span><input id="studentAdminSearch" class="input" placeholder="חיפוש תלמיד לפי שם" oninput="filterAdminStudents(this.value)"></div><div id="adminStudentsList">${students.map(s=>`<div class="row student-admin-row" data-student-name="${escAttr(String(s.name||'').toLowerCase())}"><input class="input grow" value="${escAttr(s.name)}" onchange="renameStudent(${s.id},this.value)"><button class="btn danger" onclick="deleteStudent(${s.id})">מחיקה</button></div>`).join('')||'<div class="small empty-admin-list">אין תלמידים</div>'}</div><div id="studentSearchEmpty" class="small empty-admin-list hidden">לא נמצאו תלמידים בשם הזה</div></div></details></div>`}
function filterAdminStudents(value){const q=String(value||'').trim().toLowerCase();let shown=0;document.querySelectorAll('#adminStudentsList .student-admin-row').forEach(row=>{const match=!q||row.dataset.studentName.includes(q);row.classList.toggle('hidden',!match);if(match)shown++});const empty=$('studentSearchEmpty');if(empty)empty.classList.toggle('hidden',shown>0)}
function adminGroups(gs,students){return `<div class="panel"><h2>קבוצות לימודים + יעדים</h2><div class="small" style="margin-bottom:10px">כל קבוצה ותלמיד שתוסיף כאן נוצרים ומשויכים אוטומטית גם בפנימייה.</div><div class="row"><input id="newGroup" class="input grow" placeholder="שם קבוצת לימודים"><button class="btn ok" onclick="addGroup()">+ הוסף</button></div><div class="group-admin-list">${gs.map(g=>`<details class="admin-collapsible group-collapse"><summary><span class="summary-icon">🏫</span><span class="grow"><b>${esc(g.name)}</b><small>${g.members.length} תלמידים · יעד ${g.goal_target||500}</small></span><span class="summary-arrow" aria-hidden="true"></span></summary><div class="collapsible-body"><div class="row"><input class="input grow" value="${escAttr(g.name)}" onchange="renameGroup(${g.id},this.value)"><b>לימודים</b><button class="btn danger" onclick="deleteGroup(${g.id})">מחיקה</button></div><div class="row goal-editor"><span>🎯 יעד קבוצתי</span><input id="goal_${g.id}" class="input" type="number" min="1" value="${g.goal_target||500}"><button class="btn" onclick="saveGoal(${g.id})">שמור יעד</button></div><div class="small admin-subtitle">תלמידים בקבוצה</div>${g.members.map(m=>`<div class="row group-member-row"><span class="grow">${esc(m.name)}</span><button class="btn danger" onclick="removeMember(${g.id},${m.id})">הסר</button></div>`).join('')||'<div class="small empty-admin-list">אין תלמידים בקבוצה</div>'}<div class="row add-member-row"><select id="add_${g.id}" class="grow">${students.filter(s=>!g.members.some(m=>m.id===s.id)).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><button class="btn ok" onclick="addMember(${g.id})">הוסף תלמיד</button></div></div></details>`).join('')||'<div class="small empty-admin-list">אין קבוצות לימודים</div>'}</div></div>`}
function adminUserCard(u,gs){const classGs=gs.filter(g=>g.type==='class'),dormGs=gs.filter(g=>g.type==='dorm');const permList=(items,type)=>`<div class="row bulk-permissions"><button class="btn" onclick="setAllPermissions(${u.id},'${type}',true)">✓ בחר הכל</button><button class="btn" onclick="setAllPermissions(${u.id},'${type}',false)">נקה הכל</button></div><div class="grid">${items.map(g=>`<label class="panel group-check"><input class="permission-box" data-user="${u.id}" data-type="${g.type}" data-group="${g.id}" type="checkbox" ${Array.isArray(u.group_ids)&&u.group_ids.map(Number).includes(Number(g.id))?'checked':''} onchange="toggleUserGroup(${u.id},${g.id},this.checked)"> ${g.type==='class'?'🏫 לימודים':'🏠 פנימייה'} · ${esc(g.name)}</label>`).join('')}</div>`;return `<div id="staff_user_${u.id}" class="panel soft staff-user-card" data-staff-name="${escAttr(String(u.name||'').toLowerCase())}"><div class="row"><input id="uname_${u.id}" class="input grow" value="${escAttr(u.name)}"><input id="uemail_${u.id}" class="input grow" value="${escAttr(u.email)}"><input id="uphone_${u.id}" class="input grow" inputmode="tel" placeholder="מספר WhatsApp" value="${escAttr(u.whatsapp_phone||'')}"></div><div class="row"><select id="urole_${u.id}" class="grow"><option value="study" ${u.role==='study'?'selected':''}>צוות לימודים</option><option value="dorm" ${u.role==='dorm'?'selected':''}>צוות פנימייה</option><option value="admin" ${u.role==='admin'?'selected':''}>ניהול</option></select><label><input id="uactive_${u.id}" type="checkbox" ${u.active?'checked':''}> פעיל</label><button class="btn ok" onclick="saveUser(${u.id})">שמור משתמש</button><button class="btn danger" onclick="deleteUser(${u.id})">מחיקה</button></div><div class="reminder-box"><b>🔔 תזכורת יומית לדיווח</b><div class="small">חובה לבחור דרך אחת לקבלת התזכורת.</div><div class="row"><input id="utime_${u.id}" class="input time-input" type="time" value="${u.reminder_time?String(u.reminder_time).slice(0,5):'20:00'}"><label><input id="uremail_${u.id}" name="uchannel_${u.id}" type="radio" ${u.reminder_enabled!==false&&u.reminder_email_enabled!==false&&!u.reminder_push_enabled&&!u.reminder_whatsapp_enabled?'checked':''}> 📧 אימייל</label><label><input id="urpush_${u.id}" name="uchannel_${u.id}" type="radio" ${u.reminder_enabled!==false&&u.reminder_push_enabled?'checked':''}> 🔔 Push (מומלץ)</label><label title="WhatsApp מושבת כרגע" style="opacity:.5;cursor:not-allowed"><input id="urwa_${u.id}" name="uchannel_${u.id}" type="radio" disabled> 💬 WhatsApp (מושבת)</label><label class="reminder-off-option"><input id="uroff_${u.id}" name="uchannel_${u.id}" type="radio" ${u.reminder_enabled===false?'checked':''}> 🔕 ללא תזכורת</label><button class="btn" onclick="saveReminder(${u.id})">שמור תזכורת</button><button class="btn ok" onclick="sendReminderNow(${u.id})">שלח עכשיו לבדיקה</button></div><div class="small">WhatsApp מושבת כרגע ולא ניתן לבחור בו. החיבור נשמר במערכת לשימוש עתידי.</div></div><div class="row">${passwordField('upass_'+u.id,'סיסמה חדשה')}<button class="btn" onclick="resetUserPassword(${u.id})">החלף סיסמה</button></div><details class="admin-collapsible permissions-root"><summary><span class="summary-icon">🔐</span><span class="grow"><b>הרשאות</b><small>לימודים ופנימייה</small></span><span class="summary-arrow" aria-hidden="true"></span></summary><div class="collapsible-body"><details class="admin-collapsible permission-sub"><summary><span class="summary-icon">🏫</span><span class="grow"><b>לימודים</b><small>${classGs.length} קבוצות</small></span><span class="summary-arrow" aria-hidden="true"></span></summary><div class="collapsible-body">${permList(classGs,'class')}</div></details><details class="admin-collapsible permission-sub"><summary><span class="summary-icon">🏠</span><span class="grow"><b>פנימייה</b><small>${dormGs.length} קבוצות</small></span><span class="summary-arrow" aria-hidden="true"></span></summary><div class="collapsible-body">${permList(dormGs,'dorm')}</div></details></div></details></div>`}
function staffRoleSection(users,gs,role,label,icon){const list=users.filter(u=>u.role===role);return `<details class="admin-collapsible staff-category" data-staff-category="${role}"><summary><span class="summary-icon">${icon}</span><span class="grow"><b>${label}</b><small>${list.length} אנשי צוות</small></span><span class="summary-arrow" aria-hidden="true"></span></summary><div class="collapsible-body staff-category-body">${list.map(u=>adminUserCard(u,gs)).join('')||'<div class="small empty-admin-list">אין משתמשים בקטגוריה זו</div>'}</div></details>`}
function adminUsers(users,gs){return `<div class="panel"><h2>צוות ותזכורות</h2><div class="small" style="margin-bottom:10px">הצוות מחולק לפי תחום. לחץ על קטגוריה כדי לפתוח את הרשימה.</div><div class="grid staff-create-grid"><input id="uName" class="input" placeholder="שם"><input id="uEmail" class="input" placeholder="אימייל"><input id="uPhone" class="input" inputmode="tel" placeholder="WhatsApp, לדוגמה 0501234567">${passwordField('uPass','סיסמה (8+)')}<select id="uRole"><option value="study">צוות לימודים</option><option value="dorm">צוות פנימייה</option><option value="admin">ניהול</option></select></div><button class="btn ok" onclick="addUser()">+ צור משתמש</button><div class="staff-search-wrap"><span>🔎</span><input id="staffSearch" class="input" placeholder="חיפוש איש צוות לפי שם" oninput="filterStaffUsers(this.value)"></div><div class="staff-categories">${staffRoleSection(users,gs,'study','צוות לימודים','🏫')}${staffRoleSection(users,gs,'dorm','צוות פנימייה','🏠')}${staffRoleSection(users,gs,'admin','ניהול','⚙️')}</div></div>`}
function filterStaffUsers(value){const q=String(value||'').trim().toLowerCase();document.querySelectorAll('.staff-category').forEach(section=>{let shown=0;section.querySelectorAll('.staff-user-card').forEach(card=>{const match=!q||card.dataset.staffName.includes(q);card.classList.toggle('hidden',!match);if(match)shown++});section.classList.toggle('staff-no-match',q&&shown===0);if(q&&shown>0)section.open=true})}
async function refreshAdminEdit(){await loadAdminAll();renderAdmin()}
async function startNewPeriod(){const name=$('newPeriodName').value.trim(),started_at=$('newPeriodDate')?.value;if(!name)return alert('הזן שם לתקופה');if(!confirm(`לפתוח תקופת ניקוד חדשה בשם "${name}"? התקופה הנוכחית תיסגר וכל ההיסטוריה תישמר.`))return;const management_password=prompt('הזן סיסמת מנהל לאישור פתיחת תקופה חדשה:')||'';if(!management_password)return;await api('/api/admin/periods/start',{method:'POST',body:JSON.stringify({name,started_at,management_password})});await Promise.all([refreshAdminEdit(),loadLeader()]);alert('התקופה החדשה נפתחה')}
async function renamePeriod(id,current){const name=prompt('שם חדש לתקופה:',current)||'';if(!name.trim())return;const management_password=prompt('הזן סיסמת מנהל:')||'';if(!management_password)return;await api('/api/admin/periods/'+id+'/name',{method:'PUT',body:JSON.stringify({name:name.trim(),management_password})});await refreshAdminEdit()}
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
    const created=await api('/api/admin/users',{method:'POST',body:JSON.stringify({name:$('uName').value,email:$('uEmail').value,whatsapp_phone:$('uPhone').value,password:$('uPass').value,role,management_password})});
    await refreshAdminEdit();
    const section=document.querySelector(`.staff-category[data-staff-category="${role}"]`);if(section)section.open=true;document.getElementById('staff_user_'+created.id)?.scrollIntoView({block:'center'});
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
    const y=window.scrollY;await refreshAdminEdit();const section=document.querySelector(`.staff-category[data-staff-category="${role}"]`);if(section)section.open=true;requestAnimationFrame(()=>window.scrollTo(0,y));
  }catch(e){alert(e.message)}
}
async function saveReminder(id){
  const email=$('uremail_'+id).checked,push=$('urpush_'+id).checked,wa=$('urwa_'+id).checked,off=$('uroff_'+id)?.checked;
  if(wa)return alert('WhatsApp מושבת כרגע');
  if(!off&&!email&&!push)return alert('בחר אימייל, Push או ביטול תזכורת');
  await api('/api/admin/users/'+id+'/reminder',{method:'PUT',body:JSON.stringify({enabled:!off,time:$('utime_'+id).value,email_enabled:!off&&email,push_enabled:!off&&push,whatsapp_enabled:!off&&wa})});
  alert(off?'התזכורת בוטלה לאיש הצוות':'התזכורת נשמרה');
}
async function sendReminderNow(id){if(!confirm('לשלוח עכשיו תזכורת לאיש הצוות לפי הערוצים שנבחרו?'))return;try{const r=await api('/api/admin/users/'+id+'/reminder/send-now',{method:'POST'});alert(`הבקשה התקבלה לשליחה. אימייל: ${r.emailSent||0}, Push: ${r.pushSent||0}, WhatsApp: ${r.whatsappSent||0}. שים לב: אישור השליחה אינו אישור מסירה לטלפון.`)}catch(e){alert(e.message)}}
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
    const channel=u.reminder_push_enabled?'push':'email';
    modalShell('mySettingsModal','⚙️ הגדרות שלי',`
      <div class="settings-section"><h3>🔔 תזכורת יומית</h3><div class="small">חובה לבחור דרך אחת לקבלת התזכורת.</div>
      <div class="row settings-choice">
        <label class="choice-card"><input type="radio" name="myReminderChannel" value="email" ${channel==='email'?'checked':''}> 📧 אימייל</label>
        <label class="choice-card recommended-push"><input type="radio" name="myReminderChannel" value="push" ${channel==='push'?'checked':''}> 🔔 Push (מומלץ)</label>
        <label class="choice-card" title="WhatsApp מושבת כרגע" style="opacity:.5;cursor:not-allowed"><input type="radio" name="myReminderChannel" value="whatsapp" disabled> 💬 WhatsApp (מושבת)</label>
        <input id="myReminderTime" class="input time-input" type="time" value="${u.reminder_time?String(u.reminder_time).slice(0,5):'20:00'}">
        <button class="btn ok" onclick="saveMyReminder()">שמור תזכורת</button>
      </div>
      <div class="small">אימייל: ${esc(u.email||'לא מוגדר')} · WhatsApp: ${esc(u.whatsapp_phone||'לא מוגדר')}</div></div>
      <div class="settings-section"><h3>🔐 החלפת סיסמה</h3>
        ${passwordField('myCurrentPassword','סיסמה נוכחית')}
        <div class="settings-gap"></div>${passwordField('myNewPassword','סיסמה חדשה – לפחות 8 תווים')}
        <div class="settings-gap"></div>${passwordField('myNewPassword2','אימות סיסמה חדשה')}
        <div class="settings-gap"></div><button class="btn ok" onclick="changeMyPassword()">החלף סיסמה</button>
      </div>`);
  }catch(e){alert(e.message)}
}
let pendingPushReminderSave=false;
function nativeNotificationsEnabled(){
  try{
    if(window.NatzorNative&&typeof window.NatzorNative.notificationsEnabled==='function') return !!window.NatzorNative.notificationsEnabled();
  }catch(_e){}
  return null;
}
async function preparePushPermission(forSave=false){
  try{
    const nativeEnabled=nativeNotificationsEnabled();
    if(nativeEnabled===true)return true;
    if(window.NatzorNative&&typeof window.NatzorNative.openNotificationSettings==='function'){
      if(forSave)pendingPushReminderSave=true;
      window.NatzorNative.openNotificationSettings();
      return false;
    }
    if('Notification' in window){
      if(Notification.permission==='granted')return true;
      const p=await Notification.requestPermission();
      if(p!=='granted'){alert('כדי לבחור Push יש לאשר התראות למערכת');return false}
      return true;
    }
    alert('כדי להשתמש ב-Push יש לאשר התראות ל„נצור לשונך” בהגדרות המכשיר.');
    return false;
  }catch(e){alert('לא ניתן לפתוח את הגדרות ההתראות במכשיר זה');return false}
}
async function persistMyReminder(channel){
  await api('/api/me/reminder',{method:'PUT',body:JSON.stringify({channel,time:$('myReminderTime').value})});
  alert('הגדרות התזכורת נשמרו');
}
async function saveMyReminder(){
  const ch=document.querySelector('input[name="myReminderChannel"]:checked')?.value;
  if(!ch)return alert('חובה לבחור אימייל או Push');
  if(ch==='whatsapp')return alert('WhatsApp מושבת כרגע');
  try{
    if(ch==='push'){
      const ok=await preparePushPermission(true);
      if(!ok)return;
    }
    pendingPushReminderSave=false;
    await persistMyReminder(ch);
  }catch(e){alert(e.message)}
}
window.onNativeNotificationPermissionChanged=async function(enabled){
  if(!enabled)return;
  if(!pendingPushReminderSave)return;
  const modal=document.getElementById('mySettingsModal');
  if(!modal){pendingPushReminderSave=false;return;}
  const selected=document.querySelector('input[name="myReminderChannel"]:checked')?.value;
  if(selected!=='push'){pendingPushReminderSave=false;return;}
  try{
    pendingPushReminderSave=false;
    await persistMyReminder('push');
  }catch(e){alert(e.message)}
};
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
      <select id="rfType" class="input"><option value="">כל סוגי הדיווח</option><option value="plus">השתתפות בשיעורים</option><option value="minus">דיווח על שפה לא נקייה</option></select>
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
    $('reportSearchResults').innerHTML=reportSearchRows.map(r=>`<div class="report-result-row"><div><b class="student-link" onclick="openStudentProfile(${r.student_id})">${esc(r.student_name)}</b> ${r.report_type==='plus'?'➕':'➖'}<div class="small">${r.area==='class'?'🏫 לימודים':'🏠 פנימייה'} · על ידי ${esc(r.reporter_name)}</div></div><div class="small">${new Date(r.created_at).toLocaleString('he-IL')}</div></div>`).join('')||'<div class="empty-state">לא נמצאו דיווחים לפי החיפוש.</div>';
    $('reportMoreBtn').classList.toggle('hidden',!d.has_more);
  }catch(e){alert(e.message)}
}


// ===== V2 UI =====
async function openHome(){playSound('nav');$('reporting').classList.remove('hidden');$('admin').classList.add('hidden');$('classTab')?.classList.remove('active');$('dormTab')?.classList.remove('active');$('adminTab')?.classList.remove('active');$('homeTab')?.classList.add('active');$('reporting').innerHTML='<div class="panel">טוען את מסך הבית...</div>';try{const d=await api('/api/home');$('reporting').innerHTML=homeV2Html(d)}catch(e){$('reporting').innerHTML=`<div class="panel">${esc(e.message)}</div>`}}
function homeV2Html(d){const t=d.today||{};return `<div class="v2-hero"><div><span class="eyebrow">נצור לשונך · היום</span><h1>בוחרים לדבר נקי ✨</h1><p>שפה נקייה. אווירה אחרת.</p></div><div class="hero-score">${t.plus||0}<small>השתתפויות היום</small></div></div><div class="v2-stats"><div>📝<b>${t.reports||0}</b><span>דיווחים היום</span></div><div>🌟<b>${t.plus||0}</b><span>השתתפות בשיעורים</span></div><div>🧭<b>${t.minus||0}</b><span>שפה לא נקייה</span></div></div>${(d.announcements||[]).length?`<div class="panel"><h2>📣 הודעות</h2>${d.announcements.map(a=>`<div class="v2-note"><b>${esc(a.title)}</b><div>${esc(a.body)}</div></div>`).join('')}</div>`:''}<div class="v2-two"><div class="panel"><h2>🏆 המובילים</h2><div class="small" style="margin-bottom:8px">מדד מובילות: 70% שפה נקייה + 30% השתתפות. נדרשים לפחות 50% השתתפות.</div>${(d.topStudents||[]).length?(d.topStudents||[]).filter(s=>s.eligible_leader).sort((a,b)=>(Number(b.leadership_score)||0)-(Number(a.leadership_score)||0)||(Number(b.score)||0)-(Number(a.score)||0)).map((s,i)=>`<div class="ranking-row"><span>${['🥇','🥈','🥉'][i]||i+1}</span><span class="grow student-link" onclick="openStudentProfile(${s.id})">${esc(s.name)}</span><b>${s.leadership_score}%</b></div>`).join(''):'<div class="small">עדיין אין תלמידים שעומדים בסף ההשתתפות לדירוג</div>'}</div><div class="panel"><h2>🎯 אתגרים</h2>${(d.challenges||[]).map(c=>`<div class="challenge"><b>${esc(c.title)}</b><div class="small">${esc(c.description||'')}</div><div class="goal-bar"><span style="width:${c.progress||0}%"></span></div><small>${c.current_score||0} מתוך ${c.target_points} נק׳ · ${c.progress||0}%</small></div>`).join('')||'<div class="small">אין כרגע אתגר פעיל</div>'}</div></div>`}
async function openStudentProfile(id){try{const s=await api('/api/students/'+id+'/profile');const max=Math.max(1,...s.history.map(x=>Math.abs(Number(x.points)||0)));const status=s.today.plus>=2&&s.today.minus===0?'🌟 יום מצוין':s.today.plus>=2&&s.today.minus<=2?'✅ יום טוב':s.today.minus>=5?'🔴 דורש ליווי':'🟡 דורש תשומת לב';const chart=s.history.map(x=>{const pts=Number(x.points)||0;const h=Math.max(8,Math.abs(pts)/max*90);return `<div class="chart-day ${pts<0?'negative':''}" title="${escAttr(x.label)}: ${pts>=0?'+':''}${pts}"><i style="height:${h}px"></i><small>${esc(x.label)}<br><b>${pts>=0?'+':''}${pts}</b></small></div>`}).join('');modalShell('studentProfile','👤 '+esc(s.name),`<div class="profile-score">${s.score}<small>נקודות</small></div><div class="leadership-card"><b>🏆 ${s.eligible_leader?'מדד מובילות: '+s.leadership_score+'%':'מדד מובילות: אין מספיק נתונים'}</b><span>שפה נקייה ${s.clean_language_percent}% · השתתפות ${s.participation_percent}%</span><small>${s.eligible_leader?'עומד בסף ההשתתפות למובילים':'כדי להיכלל במובילים נדרשים לפחות 50% השתתפות'}</small></div><div class="student-daily-card"><b>📅 מצב היום · ${status}</b><span>השתתפות בשיעורים: ${s.today.plus}/2</span><span>נקודות השתתפות: +${s.today.plus*3}</span><span>דיווחים על שפה לא נקייה: ${s.today.minus}</span>${Number(s.today.adjustment||0)!==0?`<span>התאמת מנהל: ${Number(s.today.adjustment)>=0?'+':''}${Number(s.today.adjustment)}</span>`:''}<strong>מאזן יומי: ${s.today.balance>=0?'+':''}${s.today.balance}</strong></div><div class="v2-stats"><div>➕<b>${s.plus_count}</b><span>השתתפות בשיעורים</span></div><div>🔥<b>${s.streak}</b><span>רצף ימים</span></div><div>➖<b>${s.minus_count}</b><span>שפה לא נקייה</span></div></div><h3>🏅 הישגים</h3><div class="badges">${s.badges.map(b=>`<span>${esc(b)}</span>`).join('')||'<span>ההישג הראשון בדרך</span>'}</div><h3>📈 מאזן יומי – 14 הימים האחרונים</h3><div class="mini-chart">${chart}</div>`)}catch(e){alert(e.message)}}
let undoTimer=null;function showUndo(id){let x=$('undoToast');if(!x){x=document.createElement('div');x.id='undoToast';x.className='undo-toast';document.body.appendChild(x)}x.innerHTML=`הדיווח נשמר ✓ <button onclick="undoReport(${id})">↩ ביטול</button>`;x.classList.add('show');clearTimeout(undoTimer);undoTimer=setTimeout(()=>x.classList.remove('show'),10000)}
async function undoReport(id){try{await api('/api/reports/'+id+'/undo',{method:'DELETE'});$('undoToast')?.classList.remove('show');await Promise.all([loadLeader(),currentGroup?loadStudents():Promise.resolve()])}catch(e){alert(e.message)}}
function urlBase64ToUint8Array(base64String){const padding='='.repeat((4-base64String.length%4)%4),base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/'),raw=atob(base64);return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)))}
async function registerNativeFcmToken(token){try{if(!token||!me)return;await api('/api/push/fcm-token',{method:'POST',body:JSON.stringify({token})})}catch(e){console.warn('FCM token registration failed',e)}}
window.registerNativeFcmToken=registerNativeFcmToken;
async function enablePush(){try{if(!('serviceWorker'in navigator)||!('PushManager'in window))throw new Error('המכשיר אינו תומך בהתראות Push');const p=await Notification.requestPermission();if(p!=='granted')throw new Error('לא ניתנה הרשאה להתראות');const {key}=await api('/api/push/public-key');if(!key)throw new Error('יש להגדיר מפתחות Push ב-Render');const reg=await navigator.serviceWorker.ready;const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlBase64ToUint8Array(key)});await api('/api/push/subscribe',{method:'POST',body:JSON.stringify(sub)});alert('ההתראות הופעלו בהצלחה 🔔')}catch(e){alert(e.message)}}

function fmtDateTimeLocal(v){if(!v)return '';const d=new Date(v);if(Number.isNaN(d.getTime()))return '';const p=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}
function expiryFromChoice(){const choice=$('announcementDuration')?.value||'7d';if(choice==='none')return null;if(choice==='custom')return $('announcementExpires')?.value?new Date($('announcementExpires').value).toISOString():null;const days={'1d':1,'3d':3,'7d':7,'30d':30}[choice]||7;return new Date(Date.now()+days*86400000).toISOString()}
function adminEngagement(){const staff=(adminData?.users||[]).filter(u=>u.active);return `<div class="panel engagement-dashboard"><div class="engagement-head"><div><span class="engagement-kicker">ניהול מעורבות</span><h2>🚀 אתגרים, הודעות ו-Push</h2><div class="small">יצירה, עריכה וניהול במקום אחד — בצורה ברורה ונוחה.</div></div></div>
<div class="engagement-section challenge-section"><div class="section-title-row"><div><span class="section-icon">🎯</span><div><h3>אתגרים</h3><div class="small">צרו יעד משותף ועקבו אחר ההתקדמות לפי ניקוד המבצע.</div></div></div><span class="section-badge">ניקוד חי</span></div>
<div class="create-card"><div class="create-card-title">יצירת אתגר חדש</div><div class="form-grid-2"><label class="field-label"><span>שם האתגר</span><input id="challengeTitle" class="input" placeholder="לדוגמה: שבוע של שפה נקייה"></label><label class="field-label"><span>יעד נקודות</span><input id="challengeTarget" class="input" type="number" value="300" min="1"></label></div><label class="field-label"><span>תיאור קצר</span><textarea id="challengeDesc" class="input" rows="3" placeholder="מה מטרת האתגר ומה מקבלים כשמגיעים ליעד?"></textarea></label><div class="form-grid-2"><label class="field-label"><span>תאריך ושעת סיום</span><input id="challengeEnd" class="input" type="datetime-local"></label><div class="score-rule-box"><b>איך מחושב הניקוד?</b><span>+3 השתתפות בשיעורים · −1 שפה לא נקייה · +5 בונוס לכל 20 השתתפויות בשיעורים לכל תלמיד</span></div></div><div class="create-actions"><button class="btn ok primary-create" onclick="createChallenge()">＋ צור אתגר</button></div></div>
<div id="challengeList" class="engagement-list"><div class="empty-state"><span>🎯</span><b>טוען אתגרים...</b></div></div></div>

<div class="engagement-section announcement-section"><div class="section-title-row"><div><span class="section-icon">📣</span><div><h3>הודעות לצוות</h3><div class="small">פרסמו הודעה שתופיע לצוות במערכת, עם תוקף לבחירתכם.</div></div></div><span class="section-badge">תצוגה במערכת</span></div>
<div class="create-card"><div class="create-card-title">פרסום הודעה חדשה</div><label class="field-label"><span>כותרת</span><input id="announcementTitle" class="input" placeholder="כותרת ההודעה"></label><label class="field-label"><span>תוכן ההודעה</span><textarea id="announcementBody" class="input" rows="5" placeholder="כתבו כאן את ההודעה לצוות"></textarea></label><div class="form-grid-2"><label class="field-label"><span>משך הצגה</span><select id="announcementDuration" class="input" onchange="document.getElementById('announcementExpires').classList.toggle('hidden',this.value!=='custom')"><option value="1d">יום אחד</option><option value="3d">3 ימים</option><option value="7d" selected>שבוע</option><option value="30d">חודש</option><option value="none">ללא הגבלת זמן</option><option value="custom">תאריך ושעה מותאמים</option></select></label><label class="field-label"><span>תאריך ושעה מותאמים</span><input id="announcementExpires" class="input hidden" type="datetime-local"></label></div><div class="create-actions"><button class="btn ok primary-create" onclick="createAnnouncement()">📣 פרסם הודעה</button></div></div>
<div id="announcementList" class="engagement-list"><div class="empty-state"><span>📣</span><b>טוען הודעות...</b></div></div></div>

<div class="engagement-section push-section"><div class="section-title-row"><div><span class="section-icon">🔔</span><div><h3>Push</h3><div class="small">שליחת התראה מיידית למכשירים הרשומים.</div></div></div></div><div class="push-card"><div class="push-stats-card" id="pushStats">טוען נתוני מנויים...</div><div class="form-grid-2"><label class="field-label"><span>כותרת ההתראה</span><input id="pushTitle" class="input" value="נצור לשונך"></label><label class="field-label"><span>קהל יעד</span><select id="pushAudience" class="input" onchange="document.getElementById('pushUser').classList.toggle('hidden',this.value!=='user')"><option value="all">כל המנויים</option><option value="study">צוות לימודים</option><option value="dorm">צוות פנימייה</option><option value="admin">מנהלים</option><option value="user">איש צוות מסוים</option></select></label></div><label class="field-label"><span>תוכן ההתראה</span><textarea id="pushBody" class="input" rows="3" placeholder="תוכן ההתראה"></textarea></label><div class="row"><select id="pushUser" class="input hidden"><option value="">בחר איש צוות</option>${staff.map(u=>`<option value="${u.id}">${esc(u.name)} · ${u.role==='admin'?'מנהל':u.role==='study'?'לימודים':'פנימייה'}</option>`).join('')}</select><button class="btn primary-create" onclick="sendAdminPush()">🔔 שלח Push</button></div></div></div></div>`}
async function loadEngagementData(){try{[engagementChallenges,engagementAnnouncements,pushStats]=await Promise.all([api('/api/admin/challenges'),api('/api/admin/announcements'),api('/api/admin/push/stats')]);renderEngagementLists()}catch(e){console.error(e)}}
function renderEngagementLists(){
  const cl=$('challengeList');
  if(cl){
    const items=engagementChallenges.map(c=>{
      const until=c.end_at?`עד ${new Date(c.end_at).toLocaleString('he-IL')}`:'ללא תאריך סיום';
      const progress=Math.max(0,Math.min(100,Number(c.progress)||0));
      return `<div class="engagement-item ${c.active?'is-active':'is-paused'}"><div class="engagement-item-top"><div><div class="item-title-line"><b>${esc(c.title)}</b><span class="status-pill ${c.active?'active':'paused'}">${c.active?'● פעיל':'⏸ מושבת'}</span></div><div class="small">${until}</div></div><div class="item-score"><strong>${c.current_score||0}</strong><span>/ ${c.target_points} נק׳</span></div></div>${c.description?`<div class="item-description">${esc(c.description)}</div>`:''}<div class="item-progress"><div class="goal-bar"><span style="width:${progress}%"></span></div><b>${progress}%</b></div><div class="item-actions"><button class="btn small-btn" onclick="editChallenge(${c.id})">✏️ עריכה</button><button class="btn small-btn" onclick="toggleChallenge(${c.id},${!c.active})">${c.active?'⏸️ השבת':'▶️ הפעל'}</button><button class="btn danger small-btn" onclick="deleteChallenge(${c.id})">🗑️ מחיקה</button></div></div>`;
    }).join('');
    cl.innerHTML=`<div class="list-heading"><b>אתגרים קיימים</b><span>${engagementChallenges.length}</span></div>${items||'<div class="empty-state"><span>🎯</span><b>עדיין אין אתגרים</b><small>צרו את האתגר הראשון באמצעות הטופס שמעל.</small></div>'}`;
  }
  const al=$('announcementList');
  if(al){
    const items=engagementAnnouncements.map(a=>{
      const until=a.expires_at?`עד ${new Date(a.expires_at).toLocaleString('he-IL')}`:'ללא הגבלת זמן';
      return `<div class="engagement-item ${a.active?'is-active':'is-paused'}"><div class="engagement-item-top"><div><div class="item-title-line"><b>${esc(a.title)}</b><span class="status-pill ${a.active?'active':'paused'}">${a.active?'● פעילה':'⏸ מושבתת'}</span></div><div class="small">${until}</div></div><div class="announcement-icon">📣</div></div><div class="item-description announcement-body">${esc(a.body)}</div><div class="item-actions"><button class="btn small-btn" onclick="editAnnouncement(${a.id})">✏️ עריכה</button><button class="btn small-btn" onclick="toggleAnnouncement(${a.id},${!a.active})">${a.active?'⏸️ השבת':'▶️ הפעל'}</button><button class="btn danger small-btn" onclick="deleteAnnouncement(${a.id})">🗑️ מחיקה</button></div></div>`;
    }).join('');
    al.innerHTML=`<div class="list-heading"><b>הודעות קיימות</b><span>${engagementAnnouncements.length}</span></div>${items||'<div class="empty-state"><span>📣</span><b>עדיין אין הודעות</b><small>הודעות שתפרסמו יופיעו כאן לניהול מלא.</small></div>'}`;
  }
  const ps=$('pushStats');if(ps)ps.innerHTML=`<b>${pushStats.total||0}</b> מכשירים רשומים <span>Android ${pushStats.android||0}</span><span>Web ${pushStats.web||0}</span><span>לימודים ${pushStats.study||0}</span><span>פנימייה ${pushStats.dorm||0}</span><span>מנהלים ${pushStats.admin||0}</span>`;
}
async function createChallenge(){const title=$('challengeTitle').value.trim(),target=Number($('challengeTarget').value),end=$('challengeEnd').value;if(!title)return alert('יש להזין שם לאתגר');if(!Number.isFinite(target)||target<1)return alert('יעד הנקודות חייב להיות לפחות 1');try{await api('/api/admin/challenges',{method:'POST',body:JSON.stringify({title,description:$('challengeDesc').value,target_points:target,end_at:end?new Date(end).toISOString():null})});$('challengeTitle').value='';$('challengeDesc').value='';$('challengeTarget').value='300';$('challengeEnd').value='';await loadEngagementData();alert('האתגר נוצר 🎯')}catch(e){alert(e.message)}}
function editChallenge(id){
  const c=engagementChallenges.find(x=>x.id===id);if(!c)return;
  modalShell('challengeEditModal','🎯 עריכת אתגר',`<div class="edit-form">
    <label><span>שם האתגר</span><input id="editChallengeTitle" class="input" value="${escAttr(c.title)}"></label>
    <label><span>תיאור</span><textarea id="editChallengeDesc" class="input" rows="4">${esc(c.description||'')}</textarea></label>
    <div class="edit-form-grid"><label><span>יעד נקודות</span><input id="editChallengeTarget" class="input" type="number" min="1" value="${Number(c.target_points)||1}"></label><label><span>תאריך ושעת סיום</span><input id="editChallengeEnd" class="input" type="datetime-local" value="${fmtDateTimeLocal(c.end_at)}"></label></div>
    <label class="edit-check"><input id="editChallengeActive" type="checkbox" ${c.active?'checked':''}> האתגר פעיל</label>
    <div class="edit-hint">הניקוד באתגר מחושב לפי כללי המבצע: +3 להשתתפות בשיעורים, −1 לדיווח על שפה לא נקייה, ובונוס +5 לכל 20 השתתפויות בשיעורים לכל תלמיד.</div>
    <div class="edit-actions"><button class="btn" onclick="document.getElementById('challengeEditModal').remove()">ביטול</button><button class="btn ok" onclick="saveChallengeEdit(${c.id})">💾 שמור שינויים</button></div>
  </div>`);
}
async function saveChallengeEdit(id){
  const title=$('editChallengeTitle').value.trim(),target=Number($('editChallengeTarget').value),end=$('editChallengeEnd').value;
  if(!title)return alert('יש להזין שם לאתגר');if(!Number.isFinite(target)||target<1)return alert('יעד הנקודות חייב להיות לפחות 1');
  try{await api('/api/admin/challenges/'+id,{method:'PUT',body:JSON.stringify({title,description:$('editChallengeDesc').value,target_points:target,end_at:end?new Date(end).toISOString():null,active:$('editChallengeActive').checked})});document.getElementById('challengeEditModal')?.remove();await loadEngagementData();alert('האתגר עודכן בהצלחה 🎯')}catch(e){alert(e.message)}
}
async function toggleChallenge(id,active){const c=engagementChallenges.find(x=>x.id===id);if(!c)return;try{await api('/api/admin/challenges/'+id,{method:'PUT',body:JSON.stringify({title:c.title,description:c.description,target_points:c.target_points,end_at:c.end_at,active})});await loadEngagementData()}catch(e){alert(e.message)}}
async function deleteChallenge(id){if(!confirm('למחוק את האתגר?'))return;try{await api('/api/admin/challenges/'+id,{method:'DELETE'});await loadEngagementData()}catch(e){alert(e.message)}}
async function createAnnouncement(){try{await api('/api/admin/announcements',{method:'POST',body:JSON.stringify({title:$('announcementTitle').value,body:$('announcementBody').value,expires_at:expiryFromChoice()})});$('announcementTitle').value='';$('announcementBody').value='';await loadEngagementData();alert('ההודעה פורסמה 📣')}catch(e){alert(e.message)}}
function editAnnouncement(id){
  const a=engagementAnnouncements.find(x=>x.id===id);if(!a)return;
  modalShell('announcementEditModal','📣 עריכת הודעה',`<div class="edit-form">
    <label><span>כותרת</span><input id="editAnnouncementTitle" class="input" value="${escAttr(a.title)}"></label>
    <label><span>תוכן ההודעה</span><textarea id="editAnnouncementBody" class="input" rows="6">${esc(a.body||'')}</textarea></label>
    <div class="edit-form-grid"><label><span>מוצגת עד</span><input id="editAnnouncementExpires" class="input" type="datetime-local" value="${fmtDateTimeLocal(a.expires_at)}" ${a.expires_at?'':'disabled'}></label><label class="edit-check edit-check-box"><input id="editAnnouncementUnlimited" type="checkbox" ${a.expires_at?'':'checked'} onchange="$('editAnnouncementExpires').disabled=this.checked"> ללא הגבלת זמן</label></div>
    <label class="edit-check"><input id="editAnnouncementActive" type="checkbox" ${a.active?'checked':''}> ההודעה פעילה</label>
    <div class="edit-actions"><button class="btn" onclick="document.getElementById('announcementEditModal').remove()">ביטול</button><button class="btn ok" onclick="saveAnnouncementEdit(${a.id})">💾 שמור שינויים</button></div>
  </div>`);
}
async function saveAnnouncementEdit(id){
  const title=$('editAnnouncementTitle').value.trim(),body=$('editAnnouncementBody').value.trim(),unlimited=$('editAnnouncementUnlimited').checked,exp=$('editAnnouncementExpires').value;
  if(!title||!body)return alert('יש למלא כותרת ותוכן');
  try{await api('/api/admin/announcements/'+id,{method:'PUT',body:JSON.stringify({title,body,expires_at:unlimited?null:(exp?new Date(exp).toISOString():null),active:$('editAnnouncementActive').checked})});document.getElementById('announcementEditModal')?.remove();await loadEngagementData();alert('ההודעה עודכנה בהצלחה 📣')}catch(e){alert(e.message)}
}
async function toggleAnnouncement(id,active){const a=engagementAnnouncements.find(x=>x.id===id);if(!a)return;try{await api('/api/admin/announcements/'+id,{method:'PUT',body:JSON.stringify({title:a.title,body:a.body,expires_at:a.expires_at,active})});await loadEngagementData()}catch(e){alert(e.message)}}
async function deleteAnnouncement(id){if(!confirm('למחוק את ההודעה?'))return;try{await api('/api/admin/announcements/'+id,{method:'DELETE'});await loadEngagementData()}catch(e){alert(e.message)}}
async function sendAdminPush(){try{const audience=$('pushAudience').value,user_id=$('pushUser').value||null;const r=await api('/api/admin/push',{method:'POST',body:JSON.stringify({title:$('pushTitle').value,body:$('pushBody').value,audience,user_id})});alert(`ההתראה נשלחה: ${r.sent} מכשירים · Android ${r.fcm_sent||0} · Web ${r.web_sent||0}`);await loadEngagementData()}catch(e){alert(e.message)}}

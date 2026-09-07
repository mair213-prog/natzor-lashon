let me=null, area='class', groups=[], currentGroup=null, cooldownTimer=null;
const $=x=>document.getElementById(x);
async function api(url,opt={}){
 const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});
 const d=await r.json().catch(()=>({})); if(!r.ok) throw new Error(d.error||'שגיאה'); return d;
}
async function boot(){
 try{me=await api('/api/me'); showApp();}catch{}
}
async function login(){
 try{me=await api('/api/auth/login',{method:'POST',body:JSON.stringify({email:$('email').value,password:$('password').value})});showApp()}
 catch(e){$('loginMsg').textContent=e.message;$('loginMsg').classList.remove('hidden')}
}
async function logout(){await api('/api/auth/logout',{method:'POST'});location.reload()}
function showApp(){
 $('login').classList.add('hidden');$('app').classList.remove('hidden');$('who').textContent=me.name;
 $('role').textContent=me.role==='admin'?'מנהל':me.role==='study'?'צוות לימודים':'צוות פנימייה';
 if(me.role==='admin') $('adminTab').classList.remove('hidden');
 if(me.role==='study'){area='class';$('dormTab').classList.add('hidden')}
 if(me.role==='dorm'){area='dorm';$('classTab').classList.add('hidden')}
 openArea(area);
}
async function openArea(a){
 area=a;$('admin').classList.add('hidden');$('reporting').classList.remove('hidden');
 $('classTab').classList.toggle('active',a==='class');$('dormTab').classList.toggle('active',a==='dorm');
 groups=await api('/api/groups?type='+a); currentGroup=groups[0]?.id||null; renderGroupPicker(); if(currentGroup) loadStudents(); else $('reporting').innerHTML+='<div class="panel">אין קבוצות שהוקצו למשתמש זה.</div>';
}
function renderGroupPicker(){
 $('reporting').innerHTML=`<div class="panel"><h3>${area==='class'?'בחר כיתה':'בחר קבוצת פנימייה'}</h3><div class="grid">${groups.map(g=>`<button class="btn ${g.id===currentGroup?'active':''}" onclick="selectGroup(${g.id})">${esc(g.name)}</button>`).join('')}</div></div><div id="students"></div>`;
}
async function selectGroup(id){currentGroup=id;renderGroupPicker();await loadStudents()}
async function loadStudents(){
 const rows=await api('/api/groups/'+currentGroup+'/students');
 $('students').innerHTML=`<div class="panel"><h2>${esc(groups.find(g=>g.id===currentGroup)?.name||'')}</h2><div class="small" style="margin-bottom:8px">כל 20 דיווחי פלוס מזכים אוטומטית בבונוס של 5 נקודות.</div>${rows.map(s=>studentCard(s)).join('')}</div>`;
 startCooldownClock();
}
function studentCard(s){return `<div class="student"><div><b>${esc(s.name)}</b><div class="small">ניקוד: ${s.score}${s.bonus?` · כולל בונוס ${s.bonus}+`:''}</div></div><div class="actions"><button id="minus_${s.id}" class="minus" data-until="${s.minus_locked_until||''}" ${s.minus_locked?'disabled':''} onclick="report(${s.id},'minus')">−</button><span class="score">${s.score}</span><button id="plus_${s.id}" class="plus" data-until="${s.plus_locked_until||''}" ${s.plus_locked?'disabled':''} onclick="report(${s.id},'plus')">+</button></div></div>`}
function startCooldownClock(){
 if(cooldownTimer) clearInterval(cooldownTimer);
 const tick=()=>document.querySelectorAll('button[data-until]').forEach(btn=>{
   const until=btn.dataset.until; if(!until){btn.title='';return}
   const ms=new Date(until).getTime()-Date.now();
   if(ms<=0){btn.disabled=false;btn.dataset.until='';btn.title='';return}
   const sec=Math.ceil(ms/1000),m=Math.floor(sec/60),r=String(sec%60).padStart(2,'0');
   btn.disabled=true;btn.title=`אפשר שוב בעוד ${m}:${r}`;
 });
 tick(); cooldownTimer=setInterval(tick,1000);
}
async function report(studentId,type){try{await api('/api/reports',{method:'POST',body:JSON.stringify({studentId,type,area})});await loadStudents()}catch(e){alert(e.message);await loadStudents()}}
async function openAdmin(){
 $('reporting').classList.add('hidden');$('admin').classList.remove('hidden');
 const [d,gs,rankings]=await Promise.all([api('/api/admin/dashboard'),api('/api/admin/groups'),api('/api/admin/class-rankings')]);
 $('admin').innerHTML=`<div class="panel"><h2>לוח מנהל</h2><div class="statgrid"><div class="stat">תלמידים<b>${d.students.length}</b></div><div class="stat">דיווחים<b>${d.summary.reports}</b></div><div class="stat">פלוס<b>${d.summary.plus}</b></div><div class="stat">מינוס<b>${d.summary.minus}</b></div></div></div>
 ${adminClassRankings(rankings)}${adminStudents(d.students)}${adminGroups(gs,d.students)}${adminUsers(d.users,gs)}${adminLogs(d.reports)}`;
}
function adminClassRankings(classes){return `<div class="panel"><h2>מצב כיתות וניקוד</h2><div class="small" style="margin-bottom:10px">הדירוג בכל כיתה מוצג מהניקוד הגבוה לנמוך. כל 20 דיווחי פלוס מעניקים בונוס אוטומטי של 5 נקודות.</div>${classes.map(c=>`<div class="ranking-class"><div class="row ranking-head"><b class="grow">${esc(c.group_name)}</b><span>ניקוד כיתתי: <b>${c.class_score}</b></span></div>${(c.students||[]).map((s,i)=>`<div class="ranking-row"><span class="rank">${i+1}</span><span class="grow">${esc(s.name)}</span><span class="small">בסיס ${s.base_score}${s.bonus?` + בונוס ${s.bonus}`:''}</span><b>${s.score}</b></div>`).join('')||'<div class="small">אין תלמידים בכיתה</div>'}</div>`).join('')||'<div class="small">אין כיתות מוגדרות</div>'}</div>`}
function adminStudents(students){return `<div class="panel"><h2>תלמידים</h2><div class="row"><input id="newStudent" class="input grow" placeholder="שם תלמיד"><button class="btn ok" onclick="addStudent()">+ הוסף</button></div>${students.map(s=>`<div class="row"><input class="input grow" value="${escAttr(s.name)}" onchange="renameStudent(${s.id},this.value)"><button class="btn danger" onclick="deleteStudent(${s.id})">מחיקה</button></div>`).join('')}</div>`}
function adminGroups(gs,students){return `<div class="panel"><h2>כיתות וקבוצות</h2><div class="row"><input id="newGroup" class="input grow" placeholder="שם"><select id="newGroupType" style="max-width:180px"><option value="class">כיתה</option><option value="dorm">פנימייה</option></select><button class="btn ok" onclick="addGroup()">+ הוסף</button></div>${gs.map(g=>`<div class="panel" style="background:#f8f9fb"><div class="row"><input class="input grow" value="${escAttr(g.name)}" onchange="renameGroup(${g.id},this.value)"><b>${g.type==='class'?'כיתה':'פנימייה'}</b><button class="btn danger" onclick="deleteGroup(${g.id})">מחיקה</button></div><div class="small">תלמידים בקבוצה</div>${g.members.map(m=>`<div class="row"><span class="grow">${esc(m.name)}</span><button class="btn danger" onclick="removeMember(${g.id},${m.id})">הסר</button></div>`).join('')}<div class="row"><select id="add_${g.id}" class="grow">${students.filter(s=>!g.members.some(m=>m.id===s.id)).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select><button class="btn ok" onclick="addMember(${g.id})">הוסף תלמיד</button></div></div>`).join('')}</div>`}
function adminUsers(users,gs){return `<div class="panel"><h2>משתמשי צוות</h2>
<div class="grid">
<input id="uName" class="input" placeholder="שם">
<input id="uEmail" class="input" placeholder="אימייל">
<input id="uPass" class="input" placeholder="סיסמה (8+)">
<select id="uRole"><option value="study">צוות לימודים</option><option value="dorm">צוות פנימייה</option><option value="admin">מנהל</option></select>
</div><button class="btn ok" onclick="addUser()">+ צור משתמש</button>
${users.map(u=>`<div class="panel" style="background:#f8f9fb">
<div class="row"><input id="uname_${u.id}" class="input grow" value="${escAttr(u.name)}"><input id="uemail_${u.id}" class="input grow" value="${escAttr(u.email)}"></div>
<div class="row"><select id="urole_${u.id}" class="grow"><option value="study" ${u.role==='study'?'selected':''}>צוות לימודים</option><option value="dorm" ${u.role==='dorm'?'selected':''}>צוות פנימייה</option><option value="admin" ${u.role==='admin'?'selected':''}>מנהל</option></select>
<label><input id="uactive_${u.id}" type="checkbox" ${u.active?'checked':''}> פעיל</label>
<button class="btn ok" onclick="saveUser(${u.id})">שמור משתמש</button>
<button class="btn danger" onclick="deleteUser(${u.id})">מחיקה</button></div>
<div class="row"><input id="upass_${u.id}" class="input grow" type="password" placeholder="סיסמה חדשה"><button class="btn" onclick="resetUserPassword(${u.id})">החלף סיסמה</button></div>
<div class="small" style="margin:8px 0">הרשאות לכיתות / קבוצות:</div>
<div class="grid">${gs.map(g=>`<label class="panel" style="padding:8px;margin:0"><input type="checkbox" ${Array.isArray(u.group_ids)&&u.group_ids.map(Number).includes(Number(g.id))?'checked':''} onchange="toggleUserGroup(${u.id},${g.id},this.checked)"> ${g.type==='class'?'🏫':'🏠'} ${esc(g.name)}</label>`).join('')}</div>
</div>`).join('')}</div>`}
function adminLogs(reports){return `<div class="panel"><h2>יומן דיווחים</h2>${reports.map(r=>`<div class="logrow"><span>${esc(r.student_name)} ${r.report_type==='plus'?'➕':'➖'} <span class="small">על ידי ${esc(r.reporter_name)}</span></span><span class="small">${new Date(r.created_at).toLocaleString('he-IL')}</span></div>`).join('')||'אין דיווחים'}</div>`}
async function addStudent(){await api('/api/admin/students',{method:'POST',body:JSON.stringify({name:$('newStudent').value})});openAdmin()}
async function renameStudent(id,name){await api('/api/admin/students/'+id,{method:'PUT',body:JSON.stringify({name})});openAdmin()}
async function deleteStudent(id){if(confirm('למחוק תלמיד?')){await api('/api/admin/students/'+id,{method:'DELETE'});openAdmin()}}
async function addGroup(){await api('/api/admin/groups',{method:'POST',body:JSON.stringify({name:$('newGroup').value,type:$('newGroupType').value})});openAdmin()}
async function renameGroup(id,name){await api('/api/admin/groups/'+id,{method:'PUT',body:JSON.stringify({name})});openAdmin()}
async function deleteGroup(id){if(confirm('למחוק קבוצה?')){await api('/api/admin/groups/'+id,{method:'DELETE'});openAdmin()}}
async function addMember(gid){let sid=$('add_'+gid).value;if(sid){await api(`/api/admin/groups/${gid}/students/${sid}`,{method:'POST'});openAdmin()}}
async function removeMember(gid,sid){await api(`/api/admin/groups/${gid}/students/${sid}`,{method:'DELETE'});openAdmin()}
async function addUser(){await api('/api/admin/users',{method:'POST',body:JSON.stringify({name:$('uName').value,email:$('uEmail').value,password:$('uPass').value,role:$('uRole').value})});openAdmin()}

async function saveUser(id){
  await api('/api/admin/users/'+id,{method:'PUT',body:JSON.stringify({name:$('uname_'+id).value,role:$('urole_'+id).value,active:$('uactive_'+id).checked})});
  await api('/api/admin/users/'+id+'/email',{method:'PUT',body:JSON.stringify({email:$('uemail_'+id).value})});
  openAdmin();
}
async function resetUserPassword(id){
  const password=$('upass_'+id).value;
  if(!password) return alert('הזן סיסמה חדשה');
  await api('/api/admin/users/'+id+'/password',{method:'PUT',body:JSON.stringify({password})});
  alert('הסיסמה הוחלפה בהצלחה');
  openAdmin();
}
async function deleteUser(id){
  if(confirm('למחוק את משתמש הצוות?')){await api('/api/admin/users/'+id,{method:'DELETE'});openAdmin()}
}
async function toggleUserGroup(uid,gid,checked){
  await api(`/api/admin/users/${uid}/groups/${gid}`,{method:checked?'POST':'DELETE'});
}

function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function escAttr(s){return esc(s)}
boot();

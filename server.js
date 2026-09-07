import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { sendDueReminders } from './reminders.js';

const { Pool } = pg;
const app = express();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false
});

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname,'public')));

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET is required');

function signUser(u){return jwt.sign({id:u.id,name:u.name,email:u.email,role:u.role},JWT_SECRET,{expiresIn:'12h'})}
function auth(req,res,next){try{const token=req.cookies.natzor_token;if(!token)return res.status(401).json({error:'not_authenticated'});req.user=jwt.verify(token,JWT_SECRET);next()}catch{res.status(401).json({error:'not_authenticated'})}}
function admin(req,res,next){if(req.user?.role!=='admin')return res.status(403).json({error:'admin_only'});next()}
function cookieOpts(){return {httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:12*60*60*1000}}
async function activePeriodId(client=pool){const {rows}=await client.query('SELECT id FROM score_periods WHERE active=true ORDER BY id DESC LIMIT 1');if(!rows[0])throw new Error('No active score period');return rows[0].id}

app.post('/api/auth/login',async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');
  const {rows}=await pool.query('SELECT * FROM users WHERE email=$1 AND active=true',[email]);
  if(!rows[0]||!(await bcrypt.compare(password,rows[0].password_hash)))return res.status(401).json({error:'פרטי התחברות שגויים'});
  const u=rows[0];res.cookie('natzor_token',signUser(u),cookieOpts()).json({id:u.id,name:u.name,email:u.email,role:u.role});
});
app.post('/api/auth/logout',(req,res)=>res.clearCookie('natzor_token',cookieOpts()).json({ok:true}));
app.get('/api/me',auth,(req,res)=>res.json(req.user));

app.get('/api/leaderboard',auth,async(req,res)=>{
  const {rows}=await pool.query(`
    WITH p AS (SELECT id FROM score_periods WHERE active=true LIMIT 1), student_scores AS (
      SELECT s.id,
        COUNT(r.id) FILTER (WHERE r.report_type='plus')::int plus_count,
        COUNT(r.id) FILTER (WHERE r.report_type='minus')::int minus_count
      FROM students s LEFT JOIN reports r ON r.student_id=s.id AND r.period_id=(SELECT id FROM p)
      WHERE s.active=true GROUP BY s.id
    ), class_scores AS (
      SELECT g.id,g.name,g.goal_target,COALESCE(SUM(ss.plus_count-ss.minus_count+FLOOR(ss.plus_count/20.0)*5),0)::int score
      FROM groups g LEFT JOIN group_students gs ON gs.group_id=g.id LEFT JOIN student_scores ss ON ss.id=gs.student_id
      WHERE g.type='class' AND g.active=true GROUP BY g.id,g.name,g.goal_target
    ) SELECT id,name,score,goal_target,(score>=goal_target) AS goal_reached FROM class_scores ORDER BY score DESC,name ASC LIMIT 1`);
  res.json(rows[0]||null);
});

app.get('/api/groups',auth,async(req,res)=>{
  const type=req.query.type;if(!['class','dorm'].includes(type))return res.status(400).json({error:'bad_type'});
  if(req.user.role==='admin'){const {rows}=await pool.query('SELECT * FROM groups WHERE type=$1 AND active=true ORDER BY name',[type]);return res.json(rows)}
  const allowed=(req.user.role==='study'&&type==='class')||(req.user.role==='dorm'&&type==='dorm');if(!allowed)return res.json([]);
  const {rows}=await pool.query(`SELECT g.* FROM groups g JOIN user_groups ug ON ug.group_id=g.id WHERE ug.user_id=$1 AND g.type=$2 AND g.active=true ORDER BY g.name`,[req.user.id,type]);res.json(rows);
});

app.get('/api/groups/:id/students',auth,async(req,res)=>{
  const gid=Number(req.params.id),{rows:grows}=await pool.query('SELECT * FROM groups WHERE id=$1 AND active=true',[gid]);const g=grows[0];if(!g)return res.status(404).json({error:'not_found'});
  if(req.user.role!=='admin'){
    const allowed=(req.user.role==='study'&&g.type==='class')||(req.user.role==='dorm'&&g.type==='dorm');if(!allowed)return res.status(403).json({error:'forbidden'});
    const {rowCount}=await pool.query('SELECT 1 FROM user_groups WHERE user_id=$1 AND group_id=$2',[req.user.id,gid]);if(!rowCount)return res.status(403).json({error:'forbidden'});
  }
  const {rows}=await pool.query(`
    WITH p AS (SELECT id FROM score_periods WHERE active=true LIMIT 1), scores AS (
      SELECT s.id,s.name,
        COUNT(r.id) FILTER (WHERE r.report_type='plus')::int plus_count,
        COUNT(r.id) FILTER (WHERE r.report_type='minus')::int minus_count,
        MAX(r.created_at) FILTER (WHERE r.report_type='plus') last_plus_at,
        MAX(r.created_at) FILTER (WHERE r.report_type='minus') last_minus_at
      FROM students s JOIN group_students gs ON gs.student_id=s.id
      LEFT JOIN reports r ON r.student_id=s.id AND r.period_id=(SELECT id FROM p)
      WHERE gs.group_id=$1 AND s.active=true GROUP BY s.id,s.name
    ) SELECT id,name,(plus_count-minus_count)::int base_score,(FLOOR(plus_count/20.0)*5)::int bonus,
      (plus_count-minus_count+FLOOR(plus_count/20.0)*5)::int score,
      (last_plus_at IS NOT NULL AND last_plus_at>now()-interval '5 minutes') plus_locked,
      (last_minus_at IS NOT NULL AND last_minus_at>now()-interval '5 minutes') minus_locked,
      CASE WHEN last_plus_at IS NOT NULL AND last_plus_at>now()-interval '5 minutes' THEN last_plus_at+interval '5 minutes' END plus_locked_until,
      CASE WHEN last_minus_at IS NOT NULL AND last_minus_at>now()-interval '5 minutes' THEN last_minus_at+interval '5 minutes' END minus_locked_until
    FROM scores ORDER BY name`,[gid]);res.json(rows);
});

app.post('/api/reports',auth,async(req,res)=>{
  const studentId=Number(req.body.studentId),type=req.body.type,area=req.body.area;
  if(!studentId||!['plus','minus'].includes(type)||!['class','dorm'].includes(area))return res.status(400).json({error:'bad_request'});
  if(req.user.role!=='admin'){
    if(req.user.role==='study'&&area!=='class')return res.status(403).json({error:'forbidden'});
    if(req.user.role==='dorm'&&area!=='dorm')return res.status(403).json({error:'forbidden'});
  }
  const client=await pool.connect();
  try{
    await client.query('BEGIN');const lockKey=studentId*2+(type==='plus'?0:1);await client.query('SELECT pg_advisory_xact_lock($1)',[lockKey]);
    const recent=await client.query(`SELECT created_at,created_at+interval '5 minutes' locked_until FROM reports WHERE student_id=$1 AND report_type=$2 ORDER BY created_at DESC LIMIT 1`,[studentId,type]);
    if(recent.rows[0]&&new Date(recent.rows[0].created_at).getTime()>Date.now()-5*60*1000){await client.query('ROLLBACK');return res.status(409).json({error:'אפשר לבצע דיווח נוסף מאותו סוג רק לאחר 5 דקות',locked_until:recent.rows[0].locked_until})}
    const pid=await activePeriodId(client);
    const {rows}=await client.query(`INSERT INTO reports(student_id,reporter_id,report_type,area,period_id) VALUES($1,$2,$3,$4,$5) RETURNING *`,[studentId,req.user.id,type,area,pid]);
    await client.query('COMMIT');res.json(rows[0]);
  }catch(e){try{await client.query('ROLLBACK')}catch{};throw e}finally{client.release()}
});

app.get('/api/admin/dashboard',auth,admin,async(req,res)=>{
  const [students,users,reports,summary,period]=await Promise.all([
    pool.query('SELECT * FROM students WHERE active=true ORDER BY name'),
    pool.query(`SELECT u.id,u.name,u.email,u.role,u.active,u.reminder_enabled,u.reminder_time,u.reminder_timezone,u.reminder_last_sent_date,COALESCE(json_agg(ug.group_id) FILTER(WHERE ug.group_id IS NOT NULL),'[]') group_ids FROM users u LEFT JOIN user_groups ug ON ug.user_id=u.id GROUP BY u.id ORDER BY u.name`),
    pool.query(`SELECT r.id,s.name student_name,u.name reporter_name,r.report_type,r.area,r.created_at FROM reports r JOIN students s ON s.id=r.student_id JOIN users u ON u.id=r.reporter_id WHERE r.period_id=(SELECT id FROM score_periods WHERE active=true LIMIT 1) ORDER BY r.created_at DESC LIMIT 200`),
    pool.query(`SELECT COUNT(*)::int reports,COUNT(*) FILTER(WHERE report_type='plus')::int plus,COUNT(*) FILTER(WHERE report_type='minus')::int minus FROM reports WHERE period_id=(SELECT id FROM score_periods WHERE active=true LIMIT 1)`),
    pool.query('SELECT * FROM score_periods WHERE active=true ORDER BY id DESC LIMIT 1')
  ]);
  res.json({students:students.rows,users:users.rows,reports:reports.rows,summary:summary.rows[0],period:period.rows[0]||null});
});

app.get('/api/admin/class-rankings',auth,admin,async(req,res)=>{
  const {rows}=await pool.query(`
    WITH p AS (SELECT id FROM score_periods WHERE active=true LIMIT 1), student_scores AS (
      SELECT s.id,s.name,COUNT(r.id) FILTER(WHERE r.report_type='plus')::int plus_count,COUNT(r.id) FILTER(WHERE r.report_type='minus')::int minus_count
      FROM students s LEFT JOIN reports r ON r.student_id=s.id AND r.period_id=(SELECT id FROM p) WHERE s.active=true GROUP BY s.id,s.name
    ), ranked AS (
      SELECT g.id group_id,g.name group_name,g.goal_target,ss.id student_id,ss.name student_name,(ss.plus_count-ss.minus_count)::int base_score,(FLOOR(ss.plus_count/20.0)*5)::int bonus,(ss.plus_count-ss.minus_count+FLOOR(ss.plus_count/20.0)*5)::int score
      FROM groups g JOIN group_students gs ON gs.group_id=g.id JOIN student_scores ss ON ss.id=gs.student_id WHERE g.type='class' AND g.active=true
    ) SELECT group_id,group_name,goal_target,COALESCE(SUM(score),0)::int class_score,
      COALESCE(json_agg(json_build_object('id',student_id,'name',student_name,'base_score',base_score,'bonus',bonus,'score',score) ORDER BY score DESC,student_name ASC),'[]') students
    FROM ranked GROUP BY group_id,group_name,goal_target ORDER BY class_score DESC,group_name`);res.json(rows);
});

app.get('/api/admin/weekly',auth,admin,async(req,res)=>{
  const pid=await activePeriodId();
  const [classesQ,reportsQ,periodQ]=await Promise.all([
    pool.query(`SELECT g.id,g.name,gs.student_id FROM groups g LEFT JOIN group_students gs ON gs.group_id=g.id WHERE g.type='class' AND g.active=true ORDER BY g.name`),
    pool.query(`SELECT student_id,report_type,created_at FROM reports WHERE period_id=$1 ORDER BY created_at`,[pid]),
    pool.query('SELECT * FROM score_periods WHERE id=$1',[pid])
  ]);
  const classMap=new Map();for(const r of classesQ.rows){if(!classMap.has(r.id))classMap.set(r.id,{id:r.id,name:r.name,students:new Set()});if(r.student_id)classMap.get(r.id).students.add(Number(r.student_id))}
  const reports=reportsQ.rows.map(r=>({...r,student_id:Number(r.student_id),ts:new Date(r.created_at).getTime()}));
  const now=new Date();const days=[];for(let i=6;i>=0;i--){const d=new Date(now);d.setHours(23,59,59,999);d.setDate(d.getDate()-i);days.push({label:d.toLocaleDateString('he-IL',{weekday:'short',day:'2-digit',month:'2-digit'}),end:d.getTime()})}
  function scoreFor(studentIds,end){const counts=new Map();for(const r of reports){if(r.ts>end||!studentIds.has(r.student_id))continue;const c=counts.get(r.student_id)||{p:0,m:0};r.report_type==='plus'?c.p++:c.m++;counts.set(r.student_id,c)}let score=0;for(const c of counts.values())score+=c.p-c.m+Math.floor(c.p/20)*5;return score}
  const classes=[...classMap.values()].map(c=>({id:c.id,name:c.name,points:days.map(d=>scoreFor(c.students,d.end))}));
  const weekStart=days[0].end-24*60*60*1000+1;const studentWeek=new Map();
  const allStudentIds=new Set([...classMap.values()].flatMap(c=>[...c.students]));
  for(const sid of allStudentIds){let beforeP=0,beforeM=0,weekP=0,weekM=0;for(const r of reports){if(r.student_id!==sid)continue;if(r.ts<weekStart){r.report_type==='plus'?beforeP++:beforeM++}else{r.report_type==='plus'?weekP++:weekM++}}const bonusDelta=(Math.floor((beforeP+weekP)/20)-Math.floor(beforeP/20))*5;studentWeek.set(sid,weekP-weekM+bonusDelta)}
  let star=null;for(const c of classMap.values()){for(const sid of c.students){const sc=studentWeek.get(sid)||0;if(!star||sc>star.score)star={student_id:sid,score:sc,class_name:c.name}}}
  if(star){const {rows}=await pool.query('SELECT name FROM students WHERE id=$1',[star.student_id]);star.name=rows[0]?.name||''}
  res.json({days:days.map(d=>d.label),classes,star,period:periodQ.rows[0]||null});
});

app.get('/api/admin/periods',auth,admin,async(req,res)=>{const {rows}=await pool.query('SELECT * FROM score_periods ORDER BY started_at DESC');res.json(rows)});
app.post('/api/admin/periods/start',auth,admin,async(req,res)=>{
  const name=String(req.body.name||'').trim();if(!name)return res.status(400).json({error:'יש להזין שם לתקופה'});
  const client=await pool.connect();try{await client.query('BEGIN');await client.query('UPDATE score_periods SET active=false,ended_at=COALESCE(ended_at,now()) WHERE active=true');const {rows}=await client.query('INSERT INTO score_periods(name,active) VALUES($1,true) RETURNING *',[name]);await client.query('COMMIT');res.json(rows[0])}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});

app.get('/api/admin/groups',auth,admin,async(req,res)=>{const {rows}=await pool.query(`SELECT g.*,COALESCE(json_agg(json_build_object('id',s.id,'name',s.name) ORDER BY s.name) FILTER(WHERE s.id IS NOT NULL),'[]') members FROM groups g LEFT JOIN group_students gs ON gs.group_id=g.id LEFT JOIN students s ON s.id=gs.student_id WHERE g.active=true GROUP BY g.id ORDER BY g.type,g.name`);res.json(rows)});
app.post('/api/admin/groups',auth,admin,async(req,res)=>{const {name,type}=req.body;if(!name||!['class','dorm'].includes(type))return res.status(400).json({error:'bad_request'});const {rows}=await pool.query('INSERT INTO groups(name,type) VALUES($1,$2) RETURNING *',[name.trim(),type]);res.json(rows[0])});
app.put('/api/admin/groups/:id',auth,admin,async(req,res)=>{const {rows}=await pool.query('UPDATE groups SET name=$1 WHERE id=$2 RETURNING *',[String(req.body.name||'').trim(),Number(req.params.id)]);res.json(rows[0])});
app.put('/api/admin/groups/:id/goal',auth,admin,async(req,res)=>{const target=Math.round(Number(req.body.target));if(!target||target<1)return res.status(400).json({error:'יעד חייב להיות מספר חיובי'});const {rows}=await pool.query('UPDATE groups SET goal_target=$1 WHERE id=$2 AND type=\'class\' RETURNING *',[target,Number(req.params.id)]);res.json(rows[0])});
app.delete('/api/admin/groups/:id',auth,admin,async(req,res)=>{await pool.query('DELETE FROM groups WHERE id=$1',[Number(req.params.id)]);res.json({ok:true})});

app.post('/api/admin/students',auth,admin,async(req,res)=>{const name=String(req.body.name||'').trim();if(!name)return res.status(400).json({error:'name_required'});const {rows}=await pool.query('INSERT INTO students(name) VALUES($1) RETURNING *',[name]);res.json(rows[0])});
app.put('/api/admin/students/:id',auth,admin,async(req,res)=>{const {rows}=await pool.query('UPDATE students SET name=$1 WHERE id=$2 RETURNING *',[String(req.body.name||'').trim(),Number(req.params.id)]);res.json(rows[0])});
app.delete('/api/admin/students/:id',auth,admin,async(req,res)=>{await pool.query('DELETE FROM students WHERE id=$1',[Number(req.params.id)]);res.json({ok:true})});
app.post('/api/admin/groups/:gid/students/:sid',auth,admin,async(req,res)=>{await pool.query('INSERT INTO group_students(group_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[Number(req.params.gid),Number(req.params.sid)]);res.json({ok:true})});
app.delete('/api/admin/groups/:gid/students/:sid',auth,admin,async(req,res)=>{await pool.query('DELETE FROM group_students WHERE group_id=$1 AND student_id=$2',[Number(req.params.gid),Number(req.params.sid)]);res.json({ok:true})});

app.post('/api/admin/users',auth,admin,async(req,res)=>{const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||''),role=req.body.role;if(!name||!email||password.length<8||!['admin','study','dorm'].includes(role))return res.status(400).json({error:'יש למלא שם, אימייל, תפקיד וסיסמה של 8 תווים לפחות'});const hash=await bcrypt.hash(password,12);const {rows}=await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role,active',[name,email,hash,role]);res.json(rows[0])});
app.put('/api/admin/users/:id',auth,admin,async(req,res)=>{const id=Number(req.params.id),name=String(req.body.name||'').trim(),role=req.body.role,active=!!req.body.active;const {rows}=await pool.query('UPDATE users SET name=$1,role=$2,active=$3 WHERE id=$4 RETURNING id,name,email,role,active',[name,role,active,id]);res.json(rows[0])});
app.put('/api/admin/users/:id/email',auth,admin,async(req,res)=>{const id=Number(req.params.id),email=String(req.body.email||'').trim().toLowerCase();if(!email)return res.status(400).json({error:'email_required'});const {rows}=await pool.query('UPDATE users SET email=$1 WHERE id=$2 RETURNING id,name,email,role,active',[email,id]);res.json(rows[0])});
app.put('/api/admin/users/:id/reminder',auth,admin,async(req,res)=>{const id=Number(req.params.id),enabled=!!req.body.enabled,time=String(req.body.time||'').trim();if(enabled&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return res.status(400).json({error:'יש לבחור שעה תקינה'});const {rows}=await pool.query(`UPDATE users SET reminder_enabled=$1,reminder_time=$2,reminder_timezone='Asia/Jerusalem' WHERE id=$3 RETURNING id,reminder_enabled,reminder_time,reminder_timezone`,[enabled,enabled?time:null,id]);res.json(rows[0])});
app.put('/api/admin/users/:id/password',auth,admin,async(req,res)=>{const id=Number(req.params.id),password=String(req.body.password||'');if(password.length<8)return res.status(400).json({error:'הסיסמה חייבת להכיל לפחות 8 תווים'});const hash=await bcrypt.hash(password,12);await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,id]);res.json({ok:true})});
app.delete('/api/admin/users/:id',auth,admin,async(req,res)=>{const id=Number(req.params.id);if(id===req.user.id)return res.status(400).json({error:'לא ניתן למחוק את המשתמש שבו אתה מחובר'});await pool.query('DELETE FROM users WHERE id=$1',[id]);res.json({ok:true})});
app.post('/api/admin/users/:uid/groups/:gid',auth,admin,async(req,res)=>{await pool.query('INSERT INTO user_groups(user_id,group_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[Number(req.params.uid),Number(req.params.gid)]);res.json({ok:true})});
app.delete('/api/admin/users/:uid/groups/:gid',auth,admin,async(req,res)=>{await pool.query('DELETE FROM user_groups WHERE user_id=$1 AND group_id=$2',[Number(req.params.uid),Number(req.params.gid)]);res.json({ok:true})});

// Free external schedulers (for example cron-job.org) can POST here every 5 minutes.
app.post('/api/cron/reminders',async(req,res)=>{
  const secret=process.env.CRON_SECRET;if(!secret)return res.status(503).json({error:'CRON_SECRET is not configured'});
  const authHeader=String(req.headers.authorization||'');if(authHeader!==`Bearer ${secret}`)return res.status(401).json({error:'unauthorized'});
  try{const result=await sendDueReminders(pool);res.json({ok:true,...result})}catch(e){console.error(e);res.status(500).json({error:'reminder_failed'})}
});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'שגיאת שרת'})});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(process.env.PORT||3000,()=>console.log('Natzor Lashon running'));

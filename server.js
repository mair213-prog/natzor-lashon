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
const MANAGEMENT_PASSWORD = process.env.MANAGEMENT_PASSWORD;
function validManagementPassword(value){
  return !!MANAGEMENT_PASSWORD && String(value||'')===MANAGEMENT_PASSWORD;
}
function signUser(u){return jwt.sign({id:u.id,name:u.name,email:u.email,role:u.role},JWT_SECRET,{expiresIn:'12h'})}
function auth(req,res,next){try{const token=req.cookies.natzor_token;if(!token)return res.status(401).json({error:'not_authenticated'});req.user=jwt.verify(token,JWT_SECRET);next()}catch{res.status(401).json({error:'not_authenticated'})}}
function admin(req,res,next){if(req.user?.role!=='admin')return res.status(403).json({error:'admin_only'});next()}
function cookieOpts(){return {httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:12*60*60*1000}}

const DEFAULT_CAMPAIGN_RULES = "בישיבת נחלת יעקב בוחרים לדבר נקי.\n\nבמשך חודש שלם אנחנו שמים את הדיבור במרכז, מתחזקים יחד בשפה נקייה ומכבדים זה את זה בכל זמן ובכל מקום.\n\nאיך צוברים נקודות?\nבכל יום מתקיימים שני זמני לימוד קצרים בנושא שמירת הלשון: 10 דקות לפני מנחה בבית המדרש, ו־10 דקות במהלך סדר \"והגית\". המחנך מדווח על הלימוד בצהריים, והמדריך מדווח על הלימוד בערב.\n\nעל כל דיווח חיובי התלמיד מקבל 3 נקודות. ניתן לקבל דיווח חיובי פעם אחת ביום בלימודים ופעם אחת ביום בפנימייה, ולכן כל תלמיד יכול לצבור עד 6 נקודות רגילות ביום. לאחר דיווח חיובי האפשרות ננעלת באותו תחום עד ליום המחרת.\n\nממשיכים לצבור – ומקבלים בונוס:\nעל כל 20 דיווחים חיוביים שנצברו במבצע, התלמיד מקבל בונוס נוסף של 5 נקודות.\n\nשומרים על שפה נקייה:\nכאשר תלמיד אינו שומר על דיבור נקי, כל איש צוות ששמע את הדברים רשאי לבצע דיווח שלילי. כל דיווח שלילי מוריד נקודה אחת, וניתן לבצע דיווח שלילי נוסף לאחר 5 דקות.\n\nהמטרה שלנו היא לא רק לצבור נקודות, אלא ליצור בישיבת נחלת יעקב אווירה של דיבור נקי, מכבד וטוב.\n\nבסיום חודש המבצע, התלמידים שיעמדו ביעד שנקבע יזכו לצאת יחד לטיול שווה.\n\nנצור לשונך – בוחרים לדבר נקי.";

async function ensureV8Schema(){
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_email_enabled BOOLEAN NOT NULL DEFAULT TRUE`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reminder_whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE`);
  await pool.query(`CREATE TABLE IF NOT EXISTS app_settings (
    setting_key TEXT PRIMARY KEY,
    setting_value TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  await pool.query(`INSERT INTO app_settings(setting_key,setting_value) VALUES('campaign_rules',$1) ON CONFLICT(setting_key) DO NOTHING`,[DEFAULT_CAMPAIGN_RULES]);
  await pool.query(`INSERT INTO app_settings(setting_key,setting_value) VALUES
    ('campaign_rules_bg','#ffffff'),
    ('campaign_rules_text','#17233b'),
    ('campaign_rules_font','system'),
    ('campaign_rules_size','medium')
    ON CONFLICT(setting_key) DO NOTHING`);
  await pool.query(`UPDATE users SET reminder_email_enabled=TRUE,reminder_whatsapp_enabled=FALSE WHERE COALESCE(reminder_email_enabled,FALSE)=FALSE AND COALESCE(reminder_whatsapp_enabled,FALSE)=FALSE`);
}

app.get('/api/campaign-rules',auth,async(req,res)=>{
  const {rows}=await pool.query(`SELECT setting_key,setting_value FROM app_settings WHERE setting_key = ANY($1)`,[['campaign_rules','campaign_rules_bg','campaign_rules_text','campaign_rules_font','campaign_rules_size']]);
  const s=Object.fromEntries(rows.map(r=>[r.setting_key,r.setting_value]));
  res.json({text:s.campaign_rules||DEFAULT_CAMPAIGN_RULES,style:{background:s.campaign_rules_bg||'#ffffff',textColor:s.campaign_rules_text||'#17233b',font:s.campaign_rules_font||'system',size:s.campaign_rules_size||'medium'}});
});
app.put('/api/admin/campaign-rules',auth,admin,async(req,res)=>{
  const text=String(req.body.text||'').trim();
  const style=req.body.style||{};
  const colorOk=v=>/^#[0-9a-fA-F]{6}$/.test(String(v||''));
  const bg=colorOk(style.background)?style.background:'#ffffff';
  const textColor=colorOk(style.textColor)?style.textColor:'#17233b';
  const font=['system','serif','rounded','traditional'].includes(style.font)?style.font:'system';
  const size=['small','medium','large'].includes(style.size)?style.size:'medium';
  if(!text)return res.status(400).json({error:'תוכן כללי המבצע לא יכול להיות ריק'});
  if(text.length>12000)return res.status(400).json({error:'תוכן כללי המבצע ארוך מדי'});
  const values=[['campaign_rules',text],['campaign_rules_bg',bg],['campaign_rules_text',textColor],['campaign_rules_font',font],['campaign_rules_size',size]];
  const client=await pool.connect();
  try{await client.query('BEGIN');for(const [k,v] of values)await client.query(`INSERT INTO app_settings(setting_key,setting_value,updated_at) VALUES($1,$2,NOW()) ON CONFLICT(setting_key) DO UPDATE SET setting_value=EXCLUDED.setting_value,updated_at=NOW()`,[k,v]);await client.query('COMMIT')}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
  res.json({ok:true,text,style:{background:bg,textColor,font,size}});
});

async function activePeriodId(client=pool){const {rows}=await client.query('SELECT id FROM score_periods WHERE active=true ORDER BY id DESC LIMIT 1');if(!rows[0])throw new Error('No active score period');return rows[0].id}

/* V6: לימודים ופנימייה משתמשים באותן קבוצות ובאותם שיוכי תלמידים.
   בבסיס הנתונים נשמרים עדיין שני סוגי קבוצות כדי לא לפגוע בהרשאות ובדוחות. */
async function syncStudyDormGroups(client=pool){
  await client.query(`
    INSERT INTO groups(name,type,active,goal_target)
    SELECT g.name,'dorm',g.active,g.goal_target
    FROM groups g
    WHERE g.type='class'
      AND NOT EXISTS (SELECT 1 FROM groups x WHERE x.type='dorm' AND x.name=g.name)
  `);
  await client.query(`
    INSERT INTO groups(name,type,active,goal_target)
    SELECT g.name,'class',g.active,g.goal_target
    FROM groups g
    WHERE g.type='dorm'
      AND NOT EXISTS (SELECT 1 FROM groups x WHERE x.type='class' AND x.name=g.name)
  `);
  await client.query(`
    INSERT INTO group_students(group_id,student_id)
    SELECT target.id,gs.student_id
    FROM groups source
    JOIN groups target ON target.name=source.name AND target.type<>source.type
    JOIN group_students gs ON gs.group_id=source.id
    ON CONFLICT DO NOTHING
  `);
}
async function pairedGroup(client,gid){
  const {rows}=await client.query(`
    SELECT other.id
    FROM groups g
    JOIN groups other ON other.name=g.name AND other.type<>g.type
    WHERE g.id=$1
    ORDER BY other.id
    LIMIT 1
  `,[gid]);
  return rows[0]?.id||null;
}

app.post('/api/auth/login',async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||'');
  const {rows}=await pool.query('SELECT * FROM users WHERE email=$1 AND active=true',[email]);
  if(!rows[0]||!(await bcrypt.compare(password,rows[0].password_hash)))return res.status(401).json({error:'פרטי התחברות שגויים'});
  const u=rows[0];res.cookie('natzor_token',signUser(u),cookieOpts()).json({id:u.id,name:u.name,email:u.email,role:u.role});
});
app.post('/api/auth/logout',(req,res)=>res.clearCookie('natzor_token',cookieOpts()).json({ok:true}));
app.get('/api/me',auth,async(req,res)=>{
  const {rows}=await pool.query(`SELECT id,name,email,whatsapp_phone,role,active,reminder_time,reminder_timezone,reminder_email_enabled,reminder_whatsapp_enabled FROM users WHERE id=$1`,[req.user.id]);
  if(!rows[0])return res.status(404).json({error:'משתמש לא נמצא'});
  res.json(rows[0]);
});

app.put('/api/me/password',auth,async(req,res)=>{
  const current=String(req.body.current_password||''),next=String(req.body.new_password||'');
  if(next.length<8)return res.status(400).json({error:'הסיסמה החדשה חייבת להכיל לפחות 8 תווים'});
  const {rows}=await pool.query('SELECT password_hash FROM users WHERE id=$1',[req.user.id]);
  if(!rows[0]||!(await bcrypt.compare(current,rows[0].password_hash)))return res.status(400).json({error:'הסיסמה הנוכחית אינה נכונה'});
  const hash=await bcrypt.hash(next,12);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,req.user.id]);
  res.json({ok:true});
});

app.put('/api/me/reminder',auth,async(req,res)=>{
  const channel=String(req.body.channel||''),time=String(req.body.time||'').trim();
  if(!['email','whatsapp'].includes(channel))return res.status(400).json({error:'חובה לבחור אימייל או WhatsApp'});
  if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return res.status(400).json({error:'יש לבחור שעה תקינה'});
  const {rows:users}=await pool.query('SELECT email,whatsapp_phone FROM users WHERE id=$1',[req.user.id]);
  const u=users[0];if(!u)return res.status(404).json({error:'משתמש לא נמצא'});
  if(channel==='email'&&!u.email)return res.status(400).json({error:'לא מוגדרת כתובת אימייל'});
  if(channel==='whatsapp'&&!u.whatsapp_phone)return res.status(400).json({error:'לא מוגדר מספר WhatsApp. פנה למנהל לעדכון המספר'});
  const {rows}=await pool.query(`UPDATE users SET reminder_enabled=TRUE,reminder_email_enabled=$1,reminder_whatsapp_enabled=$2,reminder_time=$3,reminder_timezone='Asia/Jerusalem' WHERE id=$4 RETURNING reminder_time,reminder_email_enabled,reminder_whatsapp_enabled`,[channel==='email',channel==='whatsapp',time,req.user.id]);
  res.json(rows[0]);
});

app.get('/api/leaderboard',auth,async(req,res)=>{
  const {rows}=await pool.query(`
    WITH p AS (SELECT id FROM score_periods WHERE active=true LIMIT 1), student_scores AS (
      SELECT s.id,
        COUNT(r.id) FILTER (WHERE r.report_type='plus')::int plus_count,
        COUNT(r.id) FILTER (WHERE r.report_type='minus')::int minus_count
      FROM students s LEFT JOIN reports r ON r.student_id=s.id AND r.period_id=(SELECT id FROM p)
      WHERE s.active=true GROUP BY s.id
    ), class_scores AS (
      SELECT g.id,g.name,g.goal_target,COALESCE(SUM(ss.plus_count*3-ss.minus_count+FLOOR(ss.plus_count/20.0)*5),0)::int score
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
        MAX(r.created_at) FILTER (WHERE r.report_type='plus' AND r.area=g.type) last_plus_at,
        MAX(r.created_at) FILTER (WHERE r.report_type='minus' AND r.area=g.type) last_minus_at
      FROM students s JOIN group_students gs ON gs.student_id=s.id JOIN groups g ON g.id=gs.group_id
      LEFT JOIN reports r ON r.student_id=s.id AND r.period_id=(SELECT id FROM p)
      WHERE gs.group_id=$1 AND s.active=true GROUP BY s.id,s.name
    ) SELECT id,name,(plus_count*3-minus_count)::int base_score,(FLOOR(plus_count/20.0)*5)::int bonus,
      (plus_count*3-minus_count+FLOOR(plus_count/20.0)*5)::int score,
      (last_plus_at IS NOT NULL AND (last_plus_at AT TIME ZONE 'Asia/Jerusalem')::date=(now() AT TIME ZONE 'Asia/Jerusalem')::date) plus_locked,
      (last_minus_at IS NOT NULL AND last_minus_at>now()-interval '5 minutes') minus_locked,
      CASE WHEN last_plus_at IS NOT NULL AND (last_plus_at AT TIME ZONE 'Asia/Jerusalem')::date=(now() AT TIME ZONE 'Asia/Jerusalem')::date THEN date_trunc('day',now() AT TIME ZONE 'Asia/Jerusalem')+interval '1 day' END plus_locked_until,
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
    await client.query('BEGIN');
    // Separate lock per student + report type + area prevents double-click races without blocking the other area.
    const lockKey=studentId*10+(type==='plus'?0:2)+(area==='dorm'?1:0);await client.query('SELECT pg_advisory_xact_lock($1)',[lockKey]);
    const pid=await activePeriodId(client);
    const membership=await client.query(`SELECT 1 FROM group_students gs JOIN groups g ON g.id=gs.group_id WHERE gs.student_id=$1 AND g.type=$2 AND g.active=true LIMIT 1`,[studentId,area]);
    if(!membership.rowCount){await client.query('ROLLBACK');return res.status(400).json({error:'התלמיד אינו משויך לקבוצה באזור זה'})}
    if(req.user.role!=='admin'){
      const permitted=await client.query(`SELECT 1 FROM user_groups ug JOIN groups g ON g.id=ug.group_id JOIN group_students gs ON gs.group_id=g.id WHERE ug.user_id=$1 AND gs.student_id=$2 AND g.type=$3 LIMIT 1`,[req.user.id,studentId,area]);
      if(!permitted.rowCount){await client.query('ROLLBACK');return res.status(403).json({error:'אין לך הרשאה לדווח על תלמיד זה'})}
    }
    if(type==='plus'){
      const recent=await client.query(`SELECT created_at FROM reports WHERE student_id=$1 AND report_type='plus' AND area=$2 AND period_id=$3 AND (created_at AT TIME ZONE 'Asia/Jerusalem')::date=(now() AT TIME ZONE 'Asia/Jerusalem')::date LIMIT 1`,[studentId,area,pid]);
      if(recent.rowCount){await client.query('ROLLBACK');return res.status(409).json({error:`כבר ניתן לתלמיד פלוס היום ב${area==='class'?'לימודים':'פנימייה'}. הפלוס ייפתח שוב מחר.`})}
    }else{
      const recent=await client.query(`SELECT created_at,created_at+interval '5 minutes' locked_until FROM reports WHERE student_id=$1 AND report_type='minus' AND area=$2 AND period_id=$3 ORDER BY created_at DESC LIMIT 1`,[studentId,area,pid]);
      if(recent.rows[0]&&new Date(recent.rows[0].created_at).getTime()>Date.now()-5*60*1000){await client.query('ROLLBACK');return res.status(409).json({error:'אפשר לתת מינוס נוסף לאחר 5 דקות',locked_until:recent.rows[0].locked_until})}
    }
    const {rows}=await client.query(`INSERT INTO reports(student_id,reporter_id,report_type,area,period_id) VALUES($1,$2,$3,$4,$5) RETURNING *`,[studentId,req.user.id,type,area,pid]);
    await client.query('COMMIT');res.json(rows[0]);
  }catch(e){try{await client.query('ROLLBACK')}catch{};throw e}finally{client.release()}
});

app.get('/api/public/results',async(req,res)=>{
  try{
    const pid=await activePeriodId();
    const {rows:students}=await pool.query(`WITH scores AS (
      SELECT s.id,s.name,COUNT(r.id) FILTER(WHERE r.report_type='plus')::int p,COUNT(r.id) FILTER(WHERE r.report_type='minus')::int m
      FROM students s LEFT JOIN reports r ON r.student_id=s.id AND r.period_id=$1 WHERE s.active=true GROUP BY s.id,s.name
    ) SELECT sc.id,sc.name,(sc.p*3-sc.m+FLOOR(sc.p/20.0)*5)::int score,
      COALESCE((SELECT g.name FROM group_students gs JOIN groups g ON g.id=gs.group_id WHERE gs.student_id=sc.id AND g.type='class' AND g.active=true ORDER BY g.name LIMIT 1),'') class_name
      FROM scores sc ORDER BY score DESC,sc.name LIMIT 20`,[pid]);
    const {rows:leaders}=await pool.query(`WITH scores AS (
      SELECT s.id,(COUNT(r.id) FILTER(WHERE r.report_type='plus')*3-COUNT(r.id) FILTER(WHERE r.report_type='minus')+FLOOR((COUNT(r.id) FILTER(WHERE r.report_type='plus'))/20.0)*5)::int score
      FROM students s LEFT JOIN reports r ON r.student_id=s.id AND r.period_id=$1 WHERE s.active=true GROUP BY s.id
    ) SELECT g.id,g.name,COALESCE(SUM(sc.score),0)::int score FROM groups g LEFT JOIN group_students gs ON gs.group_id=g.id LEFT JOIN scores sc ON sc.id=gs.student_id WHERE g.type='class' AND g.active=true GROUP BY g.id,g.name ORDER BY score DESC,g.name`,[pid]);
    const maxScore=Math.max(0,...leaders.map(g=>Number(g.score||0)));
    const groups=leaders.map((g,i)=>({...g,place:i+1,percent:maxScore>0?Math.max(0,Math.round(Number(g.score||0)/maxScore*100)):0}));
    res.set('Cache-Control','no-store');res.json({leader:leaders[0]||null,groups,students});
  }catch(e){console.error(e);res.status(500).json({error:'שגיאה בטעינת התוצאות'})}
});

app.get('/api/admin/dashboard',auth,admin,async(req,res)=>{
  const [students,users,reports,summary,period]=await Promise.all([
    pool.query('SELECT * FROM students WHERE active=true ORDER BY name'),
    pool.query(`SELECT u.id,u.name,u.email,u.whatsapp_phone,u.role,u.active,u.reminder_enabled,u.reminder_email_enabled,u.reminder_whatsapp_enabled,u.reminder_time,u.reminder_timezone,u.reminder_last_sent_date,COALESCE(json_agg(ug.group_id) FILTER(WHERE ug.group_id IS NOT NULL),'[]') group_ids FROM users u LEFT JOIN user_groups ug ON ug.user_id=u.id GROUP BY u.id ORDER BY u.name`),
    pool.query(`SELECT r.id,s.name student_name,u.name reporter_name,r.report_type,r.area,r.created_at FROM reports r JOIN students s ON s.id=r.student_id JOIN users u ON u.id=r.reporter_id WHERE r.period_id=(SELECT id FROM score_periods WHERE active=true LIMIT 1) ORDER BY r.created_at DESC LIMIT 200`),
    pool.query(`SELECT COUNT(*)::int reports,COUNT(*) FILTER(WHERE report_type='plus')::int plus,COUNT(*) FILTER(WHERE report_type='minus')::int minus FROM reports WHERE period_id=(SELECT id FROM score_periods WHERE active=true LIMIT 1)`),
    pool.query('SELECT * FROM score_periods WHERE active=true ORDER BY id DESC LIMIT 1')
  ]);
  res.json({students:students.rows,users:users.rows,reports:reports.rows,summary:summary.rows[0],period:period.rows[0]||null});
});


app.get('/api/admin/reports',auth,admin,async(req,res)=>{
  const student=String(req.query.student||'').trim(),reporter=String(req.query.reporter||'').trim();
  const date=String(req.query.date||'').trim(),type=String(req.query.type||'').trim(),area=String(req.query.area||'').trim();
  const limit=Math.min(100,Math.max(1,Number(req.query.limit)||50)),offset=Math.max(0,Number(req.query.offset)||0);
  const where=[`r.period_id=(SELECT id FROM score_periods WHERE active=true ORDER BY id DESC LIMIT 1)`],vals=[];
  const add=(sql,v)=>{vals.push(v);where.push(sql.replace('?',`$${vals.length}`))};
  if(student)add(`s.name ILIKE ?`,'%'+student+'%');
  if(reporter)add(`u.name ILIKE ?`,'%'+reporter+'%');
  if(date&&/^\d{4}-\d{2}-\d{2}$/.test(date)){add(`(r.created_at AT TIME ZONE 'Asia/Jerusalem')::date = ?::date`,date)}
  if(['plus','minus'].includes(type))add(`r.report_type = ?`,type);
  if(['class','dorm'].includes(area))add(`r.area = ?`,area);
  const base=`FROM reports r JOIN students s ON s.id=r.student_id JOIN users u ON u.id=r.reporter_id WHERE ${where.join(' AND ')}`;
  const countVals=[...vals];
  const {rows:summary}=await pool.query(`SELECT COUNT(*)::int total,COUNT(*) FILTER(WHERE r.report_type='plus')::int plus,COUNT(*) FILTER(WHERE r.report_type='minus')::int minus ${base}`,countVals);
  vals.push(limit,offset);
  const {rows}=await pool.query(`SELECT r.id,s.name student_name,u.name reporter_name,r.report_type,r.area,r.created_at ${base} ORDER BY r.created_at DESC LIMIT $${vals.length-1} OFFSET $${vals.length}`,vals);
  res.json({reports:rows,summary:summary[0],has_more:offset+rows.length<summary[0].total,next_offset:offset+rows.length});
});

app.get('/api/admin/class-rankings',auth,admin,async(req,res)=>{
  const {rows}=await pool.query(`
    WITH p AS (SELECT id FROM score_periods WHERE active=true LIMIT 1), student_scores AS (
      SELECT s.id,s.name,COUNT(r.id) FILTER(WHERE r.report_type='plus')::int plus_count,COUNT(r.id) FILTER(WHERE r.report_type='minus')::int minus_count
      FROM students s LEFT JOIN reports r ON r.student_id=s.id AND r.period_id=(SELECT id FROM p) WHERE s.active=true GROUP BY s.id,s.name
    ), ranked AS (
      SELECT g.id group_id,g.name group_name,g.goal_target,ss.id student_id,ss.name student_name,(ss.plus_count*3-ss.minus_count)::int base_score,(FLOOR(ss.plus_count/20.0)*5)::int bonus,(ss.plus_count*3-ss.minus_count+FLOOR(ss.plus_count/20.0)*5)::int score
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
  function scoreFor(studentIds,end){const counts=new Map();for(const r of reports){if(r.ts>end||!studentIds.has(r.student_id))continue;const c=counts.get(r.student_id)||{p:0,m:0};r.report_type==='plus'?c.p++:c.m++;counts.set(r.student_id,c)}let score=0;for(const c of counts.values())score+=c.p*3-c.m+Math.floor(c.p/20)*5;return score}
  const classes=[...classMap.values()].map(c=>({id:c.id,name:c.name,points:days.map(d=>scoreFor(c.students,d.end))}));
  const weekStart=days[0].end-24*60*60*1000+1;const studentWeek=new Map();
  const allStudentIds=new Set([...classMap.values()].flatMap(c=>[...c.students]));
  for(const sid of allStudentIds){let beforeP=0,beforeM=0,weekP=0,weekM=0;for(const r of reports){if(r.student_id!==sid)continue;if(r.ts<weekStart){r.report_type==='plus'?beforeP++:beforeM++}else{r.report_type==='plus'?weekP++:weekM++}}const bonusDelta=(Math.floor((beforeP+weekP)/20)-Math.floor(beforeP/20))*5;studentWeek.set(sid,weekP*3-weekM+bonusDelta)}
  let star=null;for(const c of classMap.values()){for(const sid of c.students){const sc=studentWeek.get(sid)||0;if(!star||sc>star.score)star={student_id:sid,score:sc,class_name:c.name}}}
  if(star){const {rows}=await pool.query('SELECT name FROM students WHERE id=$1',[star.student_id]);star.name=rows[0]?.name||''}
  res.json({days:days.map(d=>d.label),classes,star,period:periodQ.rows[0]||null});
});

app.get('/api/admin/periods',auth,admin,async(req,res)=>{const {rows}=await pool.query('SELECT * FROM score_periods ORDER BY started_at DESC');res.json(rows)});
app.post('/api/admin/periods/start',auth,admin,async(req,res)=>{
  const name=String(req.body.name||'').trim();if(!name)return res.status(400).json({error:'יש להזין שם לתקופה'});
  const client=await pool.connect();try{await client.query('BEGIN');await client.query('UPDATE score_periods SET active=false,ended_at=COALESCE(ended_at,now()) WHERE active=true');const {rows}=await client.query('INSERT INTO score_periods(name,active) VALUES($1,true) RETURNING *',[name]);await client.query('COMMIT');res.json(rows[0])}catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});

app.get('/api/admin/groups',auth,admin,async(req,res)=>{
  await syncStudyDormGroups();
  const {rows}=await pool.query(`SELECT g.*,COALESCE(json_agg(json_build_object('id',s.id,'name',s.name) ORDER BY s.name) FILTER(WHERE s.id IS NOT NULL),'[]') members FROM groups g LEFT JOIN group_students gs ON gs.group_id=g.id LEFT JOIN students s ON s.id=gs.student_id WHERE g.active=true GROUP BY g.id ORDER BY g.type,g.name`);
  res.json(rows)
});

app.post('/api/admin/groups',auth,admin,async(req,res)=>{
  const name=String(req.body.name||'').trim();
  if(!name)return res.status(400).json({error:'יש להזין שם קבוצה'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    let {rows}=await client.query(`SELECT * FROM groups WHERE name=$1 AND type='class' ORDER BY id LIMIT 1`,[name]);
    let study=rows[0];
    if(!study){({rows}=await client.query(`INSERT INTO groups(name,type) VALUES($1,'class') RETURNING *`,[name]));study=rows[0]}
    await client.query(`INSERT INTO groups(name,type,goal_target) SELECT $1,'dorm',$2 WHERE NOT EXISTS(SELECT 1 FROM groups WHERE name=$1 AND type='dorm')`,[name,study.goal_target||500]);
    await client.query('COMMIT');
    res.json(study);
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});

app.put('/api/admin/groups/:id',auth,admin,async(req,res)=>{
  const id=Number(req.params.id),name=String(req.body.name||'').trim();
  if(!name)return res.status(400).json({error:'יש להזין שם קבוצה'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const {rows:grows}=await client.query('SELECT * FROM groups WHERE id=$1',[id]);const g=grows[0];
    if(!g){await client.query('ROLLBACK');return res.status(404).json({error:'not_found'})}
    await client.query('UPDATE groups SET name=$1 WHERE name=$2 AND type IN (\'class\',\'dorm\')',[name,g.name]);
    const {rows}=await client.query('SELECT * FROM groups WHERE id=$1',[id]);
    await client.query('COMMIT');res.json(rows[0]);
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});

app.put('/api/admin/groups/:id/goal',auth,admin,async(req,res)=>{
  const target=Math.round(Number(req.body.target));if(!target||target<1)return res.status(400).json({error:'יעד חייב להיות מספר חיובי'});
  const id=Number(req.params.id);
  const {rows:grows}=await pool.query('SELECT name FROM groups WHERE id=$1',[id]);if(!grows[0])return res.status(404).json({error:'not_found'});
  await pool.query('UPDATE groups SET goal_target=$1 WHERE name=$2 AND type IN (\'class\',\'dorm\')',[target,grows[0].name]);
  const {rows}=await pool.query('SELECT * FROM groups WHERE id=$1',[id]);res.json(rows[0]);
});

app.delete('/api/admin/groups/:id',auth,admin,async(req,res)=>{
  const id=Number(req.params.id);
  const {rows}=await pool.query('SELECT name FROM groups WHERE id=$1',[id]);
  if(rows[0])await pool.query('DELETE FROM groups WHERE name=$1 AND type IN (\'class\',\'dorm\')',[rows[0].name]);
  res.json({ok:true});
});

app.post('/api/admin/students',auth,admin,async(req,res)=>{const name=String(req.body.name||'').trim();if(!name)return res.status(400).json({error:'name_required'});const {rows}=await pool.query('INSERT INTO students(name) VALUES($1) RETURNING *',[name]);res.json(rows[0])});
app.put('/api/admin/students/:id',auth,admin,async(req,res)=>{const {rows}=await pool.query('UPDATE students SET name=$1 WHERE id=$2 RETURNING *',[String(req.body.name||'').trim(),Number(req.params.id)]);res.json(rows[0])});
app.delete('/api/admin/students/:id',auth,admin,async(req,res)=>{await pool.query('DELETE FROM students WHERE id=$1',[Number(req.params.id)]);res.json({ok:true})});

app.post('/api/admin/groups/:gid/students/:sid',auth,admin,async(req,res)=>{
  const gid=Number(req.params.gid),sid=Number(req.params.sid);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('INSERT INTO group_students(group_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[gid,sid]);
    const other=await pairedGroup(client,gid);
    if(other)await client.query('INSERT INTO group_students(group_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[other,sid]);
    await client.query('COMMIT');res.json({ok:true});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});

app.delete('/api/admin/groups/:gid/students/:sid',auth,admin,async(req,res)=>{
  const gid=Number(req.params.gid),sid=Number(req.params.sid);
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const other=await pairedGroup(client,gid);
    await client.query('DELETE FROM group_students WHERE group_id=$1 AND student_id=$2',[gid,sid]);
    if(other)await client.query('DELETE FROM group_students WHERE group_id=$1 AND student_id=$2',[other,sid]);
    await client.query('COMMIT');res.json({ok:true});
  }catch(e){await client.query('ROLLBACK');throw e}finally{client.release()}
});

app.post('/api/admin/users',auth,admin,async(req,res)=>{
  const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),phone=String(req.body.whatsapp_phone||'').trim(),password=String(req.body.password||''),role=req.body.role;
  if(!name||!email||password.length<8||!['admin','study','dorm'].includes(role))return res.status(400).json({error:'יש למלא שם, אימייל, תפקיד וסיסמה של 8 תווים לפחות'});
  if(role==='admin'){
    if(!MANAGEMENT_PASSWORD)return res.status(500).json({error:'סיסמת ניהול ראשית עדיין לא הוגדרה בשרת'});
    if(!validManagementPassword(req.body.management_password))return res.status(403).json({error:'סיסמת הניהול הראשית שגויה'});
  }
  const hash=await bcrypt.hash(password,12);
  const {rows}=await pool.query('INSERT INTO users(name,email,whatsapp_phone,password_hash,role) VALUES($1,$2,$3,$4,$5) RETURNING id,name,email,whatsapp_phone,role,active',[name,email,phone||null,hash,role]);
  res.json(rows[0]);
});
app.put('/api/admin/users/:id',auth,admin,async(req,res)=>{
  const id=Number(req.params.id),name=String(req.body.name||'').trim(),role=req.body.role,active=!!req.body.active;
  if(!['admin','study','dorm'].includes(role))return res.status(400).json({error:'תפקיד לא תקין'});
  const {rows:existing}=await pool.query('SELECT role FROM users WHERE id=$1',[id]);
  if(!existing[0])return res.status(404).json({error:'משתמש לא נמצא'});
  if(role==='admin'&&existing[0].role!=='admin'){
    if(!MANAGEMENT_PASSWORD)return res.status(500).json({error:'סיסמת ניהול ראשית עדיין לא הוגדרה בשרת'});
    if(!validManagementPassword(req.body.management_password))return res.status(403).json({error:'סיסמת הניהול הראשית שגויה'});
  }
  const {rows}=await pool.query('UPDATE users SET name=$1,role=$2,active=$3 WHERE id=$4 RETURNING id,name,email,role,active',[name,role,active,id]);
  res.json(rows[0]);
});
app.put('/api/admin/users/:id/email',auth,admin,async(req,res)=>{const id=Number(req.params.id),email=String(req.body.email||'').trim().toLowerCase();if(!email)return res.status(400).json({error:'email_required'});const {rows}=await pool.query('UPDATE users SET email=$1 WHERE id=$2 RETURNING id,name,email,role,active',[email,id]);res.json(rows[0])});
app.put('/api/admin/users/:id/whatsapp',auth,admin,async(req,res)=>{const id=Number(req.params.id),phone=String(req.body.phone||'').replace(/[^0-9+]/g,'');const {rows}=await pool.query('UPDATE users SET whatsapp_phone=$1 WHERE id=$2 RETURNING id,whatsapp_phone',[phone||null,id]);res.json(rows[0])});
app.put('/api/admin/users/:id/reminder',auth,admin,async(req,res)=>{
  const id=Number(req.params.id),time=String(req.body.time||'').trim();
  const enabled=req.body.enabled!==false;
  const emailEnabled=!!req.body.email_enabled,whatsappEnabled=!!req.body.whatsapp_enabled;
  if(enabled&&emailEnabled===whatsappEnabled)return res.status(400).json({error:'כאשר התזכורת פעילה חובה לבחור דרך אחת: אימייל או WhatsApp'});
  if(enabled&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))return res.status(400).json({error:'יש לבחור שעה תקינה'});
  const {rows:check}=await pool.query('SELECT email,whatsapp_phone FROM users WHERE id=$1',[id]);
  if(!check[0])return res.status(404).json({error:'משתמש לא נמצא'});
  if(enabled&&emailEnabled&&!check[0].email)return res.status(400).json({error:'למשתמש אין כתובת אימייל'});
  if(enabled&&whatsappEnabled&&!check[0].whatsapp_phone)return res.status(400).json({error:'למשתמש אין מספר WhatsApp'});
  const safeTime=/^([01]\d|2[0-3]):[0-5]\d$/.test(time)?time:'20:00';
  const {rows}=await pool.query(`UPDATE users SET reminder_enabled=$1,reminder_email_enabled=$2,reminder_whatsapp_enabled=$3,reminder_time=$4,reminder_timezone='Asia/Jerusalem' WHERE id=$5 RETURNING id,reminder_enabled,reminder_email_enabled,reminder_whatsapp_enabled,reminder_time,reminder_timezone`,[enabled,enabled&&emailEnabled,enabled&&whatsappEnabled,safeTime,id]);
  res.json(rows[0]);
});

app.put('/api/admin/users/:id/password',auth,admin,async(req,res)=>{const id=Number(req.params.id),password=String(req.body.password||'');if(password.length<8)return res.status(400).json({error:'הסיסמה חייבת להכיל לפחות 8 תווים'});const hash=await bcrypt.hash(password,12);await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,id]);res.json({ok:true})});
app.delete('/api/admin/users/:id',auth,admin,async(req,res)=>{const id=Number(req.params.id);if(id===req.user.id)return res.status(400).json({error:'לא ניתן למחוק את המשתמש שבו אתה מחובר'});await pool.query('DELETE FROM users WHERE id=$1',[id]);res.json({ok:true})});
app.post('/api/admin/users/:uid/groups/:gid',auth,admin,async(req,res)=>{await pool.query('INSERT INTO user_groups(user_id,group_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[Number(req.params.uid),Number(req.params.gid)]);res.json({ok:true})});
app.delete('/api/admin/users/:uid/groups/:gid',auth,admin,async(req,res)=>{await pool.query('DELETE FROM user_groups WHERE user_id=$1 AND group_id=$2',[Number(req.params.uid),Number(req.params.gid)]);res.json({ok:true})});


app.post('/api/admin/users/:id/reminder/send-now',auth,admin,async(req,res)=>{
  const id=Number(req.params.id);
  const {rows}=await pool.query(`SELECT id,name,email,whatsapp_phone,active,reminder_email_enabled,reminder_whatsapp_enabled FROM users WHERE id=$1`,[id]);
  const u=rows[0];
  if(!u)return res.status(404).json({error:'משתמש לא נמצא'});
  if(!u.active)return res.status(400).json({error:'המשתמש אינו פעיל'});
  const appUrl=process.env.APP_URL||'https://natzor-lashon.onrender.com';
  const channels=[];
  if(u.reminder_email_enabled!==false) channels.push('email');
  if(u.reminder_whatsapp_enabled) channels.push('whatsapp');
  if(!channels.length)return res.status(400).json({error:'לא נבחרה דרך תזכורת'});
  try{
    // Re-use the normal reminder sender without changing today's scheduled state:
    // temporarily make this user due, execute, then restore the original state.
    const client=await pool.connect();
    try{
      await client.query('BEGIN');
      const {rows:savedRows}=await client.query(`SELECT reminder_enabled,reminder_time,reminder_timezone,reminder_last_sent_date FROM users WHERE id=$1 FOR UPDATE`,[id]);
      const saved=savedRows[0];
      const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jerusalem',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
      const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));
      const hm=`${o.hour}:${o.minute}`;
      await client.query(`UPDATE users SET reminder_enabled=true,reminder_time=$1,reminder_timezone='Asia/Jerusalem',reminder_last_sent_date=NULL WHERE id=$2`,[hm,id]);
      await client.query('COMMIT');
      const result=await sendDueReminders(pool);
      await pool.query(`UPDATE users SET reminder_enabled=$1,reminder_time=$2,reminder_timezone=$3,reminder_last_sent_date=$4 WHERE id=$5`,
        [saved.reminder_enabled,saved.reminder_time,saved.reminder_timezone,saved.reminder_last_sent_date,id]);
      return res.json({ok:true,...result});
    }catch(e){
      try{await client.query('ROLLBACK')}catch{}
      throw e;
    }finally{client.release()}
  }catch(e){
    console.error('manual reminder send failed',e);
    return res.status(500).json({error:'שליחת התזכורת נכשלה'});
  }
});

// Free external schedulers (for example cron-job.org) can POST here every 5 minutes.
app.post('/api/cron/reminders',async(req,res)=>{
  console.log('CRON /api/cron/reminders received', new Date().toISOString());
  const secret=process.env.CRON_SECRET;
  if(!secret){console.error('CRON_SECRET is not configured');return res.status(503).type('text/plain').send('NO_SECRET')}
  const authHeader=String(req.headers.authorization||'');
  if(authHeader!==`Bearer ${secret}`){console.warn('CRON unauthorized request');return res.status(401).type('text/plain').send('UNAUTHORIZED')}
  try{
    const result=await sendDueReminders(pool);
    console.log('CRON reminders completed', result);
    return res.status(200).type('text/plain').send(`OK ${result.sent}`);
  }catch(e){
    console.error('CRON reminder error',e);
    return res.status(500).type('text/plain').send('REMINDER_FAILED');
  }
});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'שגיאת שרת'})});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

ensureV8Schema()
  .then(()=>syncStudyDormGroups())
  .then(()=>console.log('V8 schema ready; study/dorm groups synchronized'))
  .catch(e=>console.error('Initial group sync failed',e))
  .finally(()=>app.listen(process.env.PORT||3000,()=>console.log('Natzor Lashon running')));

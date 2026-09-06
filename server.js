import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

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

function signUser(u){
  return jwt.sign({id:u.id,name:u.name,email:u.email,role:u.role},JWT_SECRET,{expiresIn:'12h'});
}
function auth(req,res,next){
  try{
    const token=req.cookies.natzor_token;
    if(!token) return res.status(401).json({error:'not_authenticated'});
    req.user=jwt.verify(token,JWT_SECRET);
    next();
  }catch{ res.status(401).json({error:'not_authenticated'}); }
}
function admin(req,res,next){ if(req.user?.role!=='admin') return res.status(403).json({error:'admin_only'}); next(); }
function cookieOpts(){
  return {httpOnly:true,sameSite:'strict',secure:process.env.NODE_ENV==='production',maxAge:12*60*60*1000};
}

app.post('/api/auth/login', async(req,res)=>{
  const email=String(req.body.email||'').trim().toLowerCase();
  const password=String(req.body.password||'');
  const {rows}=await pool.query('SELECT * FROM users WHERE email=$1 AND active=true',[email]);
  if(!rows[0] || !(await bcrypt.compare(password,rows[0].password_hash))) return res.status(401).json({error:'פרטי התחברות שגויים'});
  const u=rows[0];
  res.cookie('natzor_token',signUser(u),cookieOpts()).json({id:u.id,name:u.name,email:u.email,role:u.role});
});
app.post('/api/auth/logout',(req,res)=>res.clearCookie('natzor_token',cookieOpts()).json({ok:true}));
app.get('/api/me',auth,(req,res)=>res.json(req.user));

app.get('/api/groups',auth, async(req,res)=>{
  let type=req.query.type;
  if(!['class','dorm'].includes(type)) return res.status(400).json({error:'bad_type'});
  if(req.user.role==='admin'){
    const {rows}=await pool.query('SELECT * FROM groups WHERE type=$1 AND active=true ORDER BY name',[type]); return res.json(rows);
  }
  const allowed = (req.user.role==='study' && type==='class') || (req.user.role==='dorm' && type==='dorm');
  if(!allowed) return res.json([]);
  const {rows}=await pool.query(`
    SELECT g.* FROM groups g JOIN user_groups ug ON ug.group_id=g.id
    WHERE ug.user_id=$1 AND g.type=$2 AND g.active=true ORDER BY g.name
  `,[req.user.id,type]);
  res.json(rows);
});

app.get('/api/groups/:id/students',auth, async(req,res)=>{
  const gid=Number(req.params.id);
  const {rows:grows}=await pool.query('SELECT * FROM groups WHERE id=$1 AND active=true',[gid]);
  const g=grows[0]; if(!g) return res.status(404).json({error:'not_found'});
  if(req.user.role!=='admin'){
    const allowed=(req.user.role==='study'&&g.type==='class')||(req.user.role==='dorm'&&g.type==='dorm');
    if(!allowed) return res.status(403).json({error:'forbidden'});
    const {rowCount}=await pool.query('SELECT 1 FROM user_groups WHERE user_id=$1 AND group_id=$2',[req.user.id,gid]);
    if(!rowCount) return res.status(403).json({error:'forbidden'});
  }
  const {rows}=await pool.query(`
    SELECT s.id,s.name,COALESCE(SUM(CASE WHEN r.report_type='plus' THEN 1 ELSE -1 END),0)::int AS score,
      EXISTS(SELECT 1 FROM reports r2 WHERE r2.student_id=s.id AND r2.report_type='plus' AND r2.hour_slot=date_trunc('hour',now())) AS plus_locked,
      EXISTS(SELECT 1 FROM reports r3 WHERE r3.student_id=s.id AND r3.report_type='minus' AND r3.hour_slot=date_trunc('hour',now())) AS minus_locked
    FROM students s JOIN group_students gs ON gs.student_id=s.id
    LEFT JOIN reports r ON r.student_id=s.id
    WHERE gs.group_id=$1 AND s.active=true GROUP BY s.id,s.name ORDER BY s.name
  `,[gid]);
  res.json(rows);
});

app.post('/api/reports',auth, async(req,res)=>{
  const studentId=Number(req.body.studentId), type=req.body.type, area=req.body.area;
  if(!studentId || !['plus','minus'].includes(type) || !['class','dorm'].includes(area)) return res.status(400).json({error:'bad_request'});
  if(req.user.role!=='admin'){
    if(req.user.role==='study' && area!=='class') return res.status(403).json({error:'forbidden'});
    if(req.user.role==='dorm' && area!=='dorm') return res.status(403).json({error:'forbidden'});
  }
  try{
    const {rows}=await pool.query(`
      INSERT INTO reports(student_id,reporter_id,report_type,area)
      VALUES($1,$2,$3,$4) RETURNING *
    `,[studentId,req.user.id,type,area]);
    res.json(rows[0]);
  }catch(e){
    if(e.code==='23505') return res.status(409).json({error:'כבר בוצע דיווח מסוג זה לתלמיד בשעה הנוכחית'});
    throw e;
  }
});

app.get('/api/admin/dashboard',auth,admin,async(req,res)=>{
  const [students,users,reports,summary]=await Promise.all([
    pool.query('SELECT * FROM students WHERE active=true ORDER BY name'),
    pool.query(`SELECT u.id,u.name,u.email,u.role,u.active,
      COALESCE(json_agg(ug.group_id) FILTER (WHERE ug.group_id IS NOT NULL),'[]') AS group_ids
      FROM users u LEFT JOIN user_groups ug ON ug.user_id=u.id
      GROUP BY u.id ORDER BY u.name`),
    pool.query(`SELECT r.id,s.name student_name,u.name reporter_name,r.report_type,r.area,r.created_at
      FROM reports r JOIN students s ON s.id=r.student_id JOIN users u ON u.id=r.reporter_id ORDER BY r.created_at DESC LIMIT 200`),
    pool.query(`SELECT COUNT(*)::int reports,
      COUNT(*) FILTER(WHERE report_type='plus')::int plus,
      COUNT(*) FILTER(WHERE report_type='minus')::int minus FROM reports`)
  ]);
  res.json({students:students.rows,users:users.rows,reports:reports.rows,summary:summary.rows[0]});
});

app.get('/api/admin/groups',auth,admin,async(req,res)=>{
  const {rows}=await pool.query(`
    SELECT g.*, COALESCE(json_agg(json_build_object('id',s.id,'name',s.name) ORDER BY s.name) FILTER(WHERE s.id IS NOT NULL),'[]') members
    FROM groups g LEFT JOIN group_students gs ON gs.group_id=g.id LEFT JOIN students s ON s.id=gs.student_id
    WHERE g.active=true GROUP BY g.id ORDER BY g.type,g.name`);
  res.json(rows);
});
app.post('/api/admin/groups',auth,admin,async(req,res)=>{
  const {name,type}=req.body; if(!name||!['class','dorm'].includes(type)) return res.status(400).json({error:'bad_request'});
  const {rows}=await pool.query('INSERT INTO groups(name,type) VALUES($1,$2) RETURNING *',[name.trim(),type]); res.json(rows[0]);
});
app.put('/api/admin/groups/:id',auth,admin,async(req,res)=>{
  const {rows}=await pool.query('UPDATE groups SET name=$1 WHERE id=$2 RETURNING *',[String(req.body.name||'').trim(),Number(req.params.id)]);res.json(rows[0]);
});
app.delete('/api/admin/groups/:id',auth,admin,async(req,res)=>{
  await pool.query('DELETE FROM groups WHERE id=$1',[Number(req.params.id)]);res.json({ok:true});
});

app.post('/api/admin/students',auth,admin,async(req,res)=>{
  const name=String(req.body.name||'').trim(); if(!name)return res.status(400).json({error:'name_required'});
  const {rows}=await pool.query('INSERT INTO students(name) VALUES($1) RETURNING *',[name]);res.json(rows[0]);
});
app.put('/api/admin/students/:id',auth,admin,async(req,res)=>{
  const {rows}=await pool.query('UPDATE students SET name=$1 WHERE id=$2 RETURNING *',[String(req.body.name||'').trim(),Number(req.params.id)]);res.json(rows[0]);
});
app.delete('/api/admin/students/:id',auth,admin,async(req,res)=>{
  await pool.query('DELETE FROM students WHERE id=$1',[Number(req.params.id)]);res.json({ok:true});
});
app.post('/api/admin/groups/:gid/students/:sid',auth,admin,async(req,res)=>{
  await pool.query('INSERT INTO group_students(group_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[Number(req.params.gid),Number(req.params.sid)]);res.json({ok:true});
});
app.delete('/api/admin/groups/:gid/students/:sid',auth,admin,async(req,res)=>{
  await pool.query('DELETE FROM group_students WHERE group_id=$1 AND student_id=$2',[Number(req.params.gid),Number(req.params.sid)]);res.json({ok:true});
});

app.post('/api/admin/users',auth,admin,async(req,res)=>{
  const name=String(req.body.name||'').trim(),email=String(req.body.email||'').trim().toLowerCase(),password=String(req.body.password||''),role=req.body.role;
  if(!name||!email||password.length<8||!['admin','study','dorm'].includes(role)) return res.status(400).json({error:'יש למלא שם, אימייל, תפקיד וסיסמה של 8 תווים לפחות'});
  const hash=await bcrypt.hash(password,12);
  const {rows}=await pool.query('INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,$4) RETURNING id,name,email,role,active',[name,email,hash,role]);res.json(rows[0]);
});
app.put('/api/admin/users/:id',auth,admin,async(req,res)=>{
  const id=Number(req.params.id),name=String(req.body.name||'').trim(),role=req.body.role,active=!!req.body.active;
  const {rows}=await pool.query('UPDATE users SET name=$1,role=$2,active=$3 WHERE id=$4 RETURNING id,name,email,role,active',[name,role,active,id]);res.json(rows[0]);
});

app.put('/api/admin/users/:id/email',auth,admin,async(req,res)=>{
  const id=Number(req.params.id), email=String(req.body.email||'').trim().toLowerCase();
  if(!email) return res.status(400).json({error:'email_required'});
  const {rows}=await pool.query('UPDATE users SET email=$1 WHERE id=$2 RETURNING id,name,email,role,active',[email,id]);
  res.json(rows[0]);
});
app.put('/api/admin/users/:id/password',auth,admin,async(req,res)=>{
  const id=Number(req.params.id), password=String(req.body.password||'');
  if(password.length<8) return res.status(400).json({error:'הסיסמה חייבת להכיל לפחות 8 תווים'});
  const hash=await bcrypt.hash(password,12);
  await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[hash,id]);
  res.json({ok:true});
});
app.delete('/api/admin/users/:id',auth,admin,async(req,res)=>{
  const id=Number(req.params.id);
  if(id===req.user.id) return res.status(400).json({error:'לא ניתן למחוק את המשתמש שבו אתה מחובר'});
  await pool.query('DELETE FROM users WHERE id=$1',[id]);
  res.json({ok:true});
});

app.post('/api/admin/users/:uid/groups/:gid',auth,admin,async(req,res)=>{
  await pool.query('INSERT INTO user_groups(user_id,group_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[Number(req.params.uid),Number(req.params.gid)]);res.json({ok:true});
});
app.delete('/api/admin/users/:uid/groups/:gid',auth,admin,async(req,res)=>{
  await pool.query('DELETE FROM user_groups WHERE user_id=$1 AND group_id=$2',[Number(req.params.uid),Number(req.params.gid)]);res.json({ok:true});
});

app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:'שגיאת שרת'});});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(process.env.PORT||3000,()=>console.log('Natzor Lashon running'));

import 'dotenv/config';
import fs from 'fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized:false } : false });

const schema = fs.readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');
await pool.query(schema);

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) throw new Error('ADMIN_EMAIL / ADMIN_PASSWORD חסרים בקובץ הסביבה');

const hash = await bcrypt.hash(password, 12);
await pool.query(`
  INSERT INTO users(name,email,password_hash,role)
  VALUES($1,$2,$3,'admin')
  ON CONFLICT(email) DO UPDATE SET password_hash=EXCLUDED.password_hash, role='admin', active=true
`, ['מנהל', email.toLowerCase(), hash]);

console.log('Database initialized. Admin user ready:', email);
await pool.end();

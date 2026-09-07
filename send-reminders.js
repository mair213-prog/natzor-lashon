import 'dotenv/config';
import pg from 'pg';
import { sendDueReminders } from './reminders.js';
const { Pool } = pg;
const pool = new Pool({connectionString:process.env.DATABASE_URL,ssl:process.env.NODE_ENV==='production'?{rejectUnauthorized:false}:false});
const result=await sendDueReminders(pool);
console.log(`Reminder run complete. Sent ${result.sent} email(s).`);
await pool.end();

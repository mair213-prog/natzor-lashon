import nodemailer from 'nodemailer';

function localParts(timeZone='Asia/Jerusalem'){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return {date:`${o.year}-${o.month}-${o.day}`,time:`${o.hour}:${o.minute}`};
}
function mins(hm){const [h,m]=hm.split(':').map(Number);return h*60+m}

export async function sendDueReminders(pool){
  const required=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','MAIL_FROM'];
  for(const k of required) if(!process.env[k]) throw new Error(`${k} is required`);

  const transporter=nodemailer.createTransport({
    host:process.env.SMTP_HOST,
    port:Number(process.env.SMTP_PORT),
    secure:String(process.env.SMTP_SECURE||'false').toLowerCase()==='true',
    auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}
  });

  const {rows}=await pool.query(`SELECT id,name,email,reminder_time,reminder_timezone,reminder_last_sent_date
    FROM users WHERE active=true AND reminder_enabled=true AND reminder_time IS NOT NULL`);
  let sent=0;
  for(const u of rows){
    const now=localParts(u.reminder_timezone||'Asia/Jerusalem');
    const rt=String(u.reminder_time).slice(0,5);
    const diff=mins(now.time)-mins(rt);
    if(diff<0 || diff>=6) continue; // intended for a scheduler that runs every 5 minutes
    const last=u.reminder_last_sent_date?String(u.reminder_last_sent_date).slice(0,10):'';
    if(last===now.date) continue;
    const appUrl=process.env.APP_URL||'https://natzor-lashon.onrender.com';
    await transporter.sendMail({
      from:process.env.MAIL_FROM,
      to:u.email,
      subject:'תזכורת יומית – נצור לשונך',
      text:`שלום ${u.name},\n\nזו תזכורת יומית להיכנס למערכת נצור לשונך ולבצע דיווח.\n${appUrl}\n\nתודה!`,
      html:`<div dir="rtl" style="font-family:Arial,sans-serif"><h2>תזכורת יומית – נצור לשונך</h2><p>שלום ${String(u.name).replace(/[<>&"]/g,'')},</p><p>זו תזכורת יומית להיכנס למערכת ולבצע דיווח.</p><p><a href="${appUrl}">כניסה למערכת נצור לשונך</a></p></div>`
    });
    await pool.query('UPDATE users SET reminder_last_sent_date=$1 WHERE id=$2',[now.date,u.id]);
    sent++;
  }
  return {sent};
}

import nodemailer from 'nodemailer';

let firebaseAdminPromise=null;
async function firebaseAdmin(){
  if(firebaseAdminPromise)return firebaseAdminPromise;
  firebaseAdminPromise=(async()=>{try{const raw=process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;if(!raw)return null;const serviceAccount=JSON.parse(Buffer.from(raw,'base64').toString('utf8'));const mod=await import('firebase-admin');const admin=mod.default||mod;if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(serviceAccount)});return admin}catch(e){console.error('Reminder Firebase init failed',e);return null}})();
  return firebaseAdminPromise;
}
async function sendPushReminder(pool,u){
  const {rows}=await pool.query('SELECT token FROM fcm_tokens WHERE user_id=$1',[u.id]);
  const tokens=rows.map(r=>r.token).filter(Boolean);if(!tokens.length)throw new Error(`No FCM token for user ${u.id}`);
  const admin=await firebaseAdmin();if(!admin)throw new Error('Firebase Admin is not configured');
  const title='תזכורת יומית – נצור לשונך',body=`שלום ${u.name}, הגיע הזמן לעדכן את הדיווחים להיום.`;
  let sent=0;
  for(let i=0;i<tokens.length;i+=500){const batch=tokens.slice(i,i+500);const r=await admin.messaging().sendEachForMulticast({tokens:batch,data:{title,body,url:'/'},android:{priority:'high'}});sent+=r.successCount;for(let j=0;j<r.responses.length;j++){const x=r.responses[j];if(!x.success&&['messaging/registration-token-not-registered','messaging/invalid-registration-token'].includes(x.error?.code))await pool.query('DELETE FROM fcm_tokens WHERE token=$1',[batch[j]]).catch(()=>{})}}
  return sent;
}

function localParts(timeZone='Asia/Jerusalem'){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
  const o=Object.fromEntries(parts.map(p=>[p.type,p.value]));
  return {date:`${o.year}-${o.month}-${o.day}`,time:`${o.hour}:${o.minute}`};
}
function mins(hm){const [h,m]=hm.split(':').map(Number);return h*60+m}
function normalizePhone(phone){
  let p=String(phone||'').trim().replace(/[^0-9+]/g,'');
  // Meta WhatsApp Cloud API expects E.164 digits (country code, no leading +).
  if(p.startsWith('+')) p=p.slice(1);
  if(p.startsWith('00972')) p='972'+p.slice(5);
  else if(p.startsWith('9720')) p='972'+p.slice(4);
  else if(p.startsWith('0')) p='972'+p.slice(1);
  // Also accept an Israeli mobile number entered without the leading 0.
  else if(/^5\d{8}$/.test(p)) p='972'+p;
  if(!/^9725\d{8}$/.test(p) && !/^\d{8,15}$/.test(p)) throw new Error('מספר WhatsApp אינו בפורמט תקין');
  return p;
}
function mailer(){
  const required=['SMTP_HOST','SMTP_PORT','SMTP_USER','SMTP_PASS','MAIL_FROM'];
  for(const k of required) if(!process.env[k]) throw new Error(`${k} is required for email reminders`);
  return nodemailer.createTransport({
    host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT),
    secure:String(process.env.SMTP_SECURE||'false').toLowerCase()==='true',
    auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS}
  });
}
async function sendWhatsApp(u,appUrl){
  const token=process.env.WHATSAPP_TOKEN;
  const phoneNumberId=process.env.WHATSAPP_PHONE_NUMBER_ID;
  const template=process.env.WHATSAPP_TEMPLATE_NAME||'natzor_daily_reminder';
  const language=process.env.WHATSAPP_TEMPLATE_LANGUAGE||'he';
  const graphVersion=process.env.WHATSAPP_GRAPH_VERSION||'v23.0';
  if(!token||!phoneNumberId) throw new Error('WhatsApp is enabled but WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not configured');
  const to=normalizePhone(u.whatsapp_phone);
  if(!to) throw new Error(`WhatsApp phone is missing for user ${u.id}`);
  const body={
    messaging_product:'whatsapp',to,type:'template',
    template:{name:template,language:{code:language},
      components:[{type:'body',parameters:[
        {type:'text',text:String(u.name||'')}
      ]}]
    }
  };
  const r=await fetch(`https://graph.facebook.com/${graphVersion}/${phoneNumberId}/messages`,{
    method:'POST',headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(body)
  });
  const responseText=await r.text();
  if(!r.ok) throw new Error(`WhatsApp send failed (${r.status}): ${responseText.slice(0,300)}`);
  let meta={};
  try{meta=JSON.parse(responseText)}catch{}
  const messageId=meta?.messages?.[0]?.id||null;
  console.log('WhatsApp accepted by Meta',{userId:u.id,to,messageId});
  return {accepted:true,to,messageId};
}
export async function sendDueReminders(pool){
  const {rows}=await pool.query(`SELECT id,name,email,whatsapp_phone,reminder_time,reminder_timezone,reminder_last_sent_date,
    reminder_email_enabled,reminder_push_enabled,reminder_whatsapp_enabled
    FROM users WHERE active=true AND reminder_enabled=true AND reminder_time IS NOT NULL`);
  let sent=0,emailSent=0,pushSent=0,whatsappSent=0;
  for(const u of rows){
    const now=localParts(u.reminder_timezone||'Asia/Jerusalem'), rt=String(u.reminder_time).slice(0,5);
    const diff=mins(now.time)-mins(rt);
    if(diff<0||diff>=6) continue;
    const last=u.reminder_last_sent_date?String(u.reminder_last_sent_date).slice(0,10):'';
    if(last===now.date) continue;
    const appUrl=process.env.APP_URL||'https://natzor-lashon.onrender.com';
    if(u.reminder_email_enabled){
      const transporter=mailer();
      await transporter.sendMail({
        from:process.env.MAIL_FROM,to:u.email,subject:'תזכורת יומית – נצור לשונך',
        text:`שלום ${u.name},\n\nזו תזכורת יומית להיכנס למערכת נצור לשונך ולבצע דיווח.\n${appUrl}\n\nבוחרים לדבר נקי`,
        html:`<div dir="rtl" style="font-family:Arial,sans-serif"><h2>תזכורת יומית – נצור לשונך</h2><p>שלום ${String(u.name).replace(/[<>&"]/g,'')},</p><p>זו תזכורת יומית להיכנס למערכת ולבצע דיווח.</p><p><a href="${appUrl}">כניסה למערכת</a></p><p><b>בוחרים לדבר נקי</b></p></div>`
      }); emailSent++;
    }
    if(u.reminder_push_enabled){pushSent+=await sendPushReminder(pool,u)}
    if(u.reminder_whatsapp_enabled){await sendWhatsApp(u,appUrl);whatsappSent++}
    await pool.query('UPDATE users SET reminder_last_sent_date=$1 WHERE id=$2',[now.date,u.id]);
    sent++;
  }
  return {sent,emailSent,pushSent,whatsappSent};
}

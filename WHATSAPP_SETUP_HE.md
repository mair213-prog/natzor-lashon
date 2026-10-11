# חיבור WhatsApp Business לתזכורות – נצור לשונך

הקוד בגרסה זו מוכן לשליחה דרך WhatsApp Business Cloud API.
כדי שהשליחה תפעל בפועל צריך חשבון Meta Business עם WhatsApp Business Platform ומספר שולח מאושר.

## משתני Environment שצריך להוסיף ב-Render
WHATSAPP_TOKEN
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_TEMPLATE_NAME = natzor_daily_reminder
WHATSAPP_TEMPLATE_LANGUAGE = he
WHATSAPP_GRAPH_VERSION = גרסת Graph API הפעילה בחשבון Meta שלך

## תבנית WhatsApp
יש ליצור ב-Meta תבנית מסוג Utility בשם:
natzor_daily_reminder

שפת התבנית: Hebrew / he

נוסח מומלץ:
שלום {{1}},
זו תזכורת יומית להיכנס למערכת "נצור לשונך" ולבצע דיווח.
כניסה למערכת: {{2}}
בוחרים לדבר נקי

אחרי שהתבנית מאושרת והמשתנים נמצאים ב-Render:
במערכת > מנהל > ניהול > צוות
1. מזינים מספר WhatsApp.
2. מסמנים WhatsApp בתזכורת.
3. שומרים.
4. אפשר ללחוץ "שלח עכשיו לבדיקה".

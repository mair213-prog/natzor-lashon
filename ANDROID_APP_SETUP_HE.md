# אפליקציית Android – נצור לשונך

התיקייה android-app היא פרויקט Android Studio מוכן שמציג את אותה מערכת מקוונת,
כך שאין בסיס נתונים נפרד ואין צורך לעדכן את האפליקציה בכל שינוי קטן באתר.

## בנייה
1. פותחים את התיקייה android-app ב-Android Studio.
2. מתקינים Android SDK 36 אם Android Studio מבקש.
3. ממתינים ל-Gradle Sync.
4. לבדיקה: Run על מכשיר Android.
5. לחנות: Build > Generate Signed App Bundle / APK > Android App Bundle.
6. יוצרים מפתח חתימה ושומרים אותו במקום בטוח.
7. מעלים את קובץ ה-AAB ל-Google Play Console.

הפרויקט מכוון ל-targetSdk 36, בהתאם לדרישת Google Play לאפליקציות חדשות
החל מ-31.8.2026.

## מכשירים כשרים
יש שלושה מסלולי גישה:
- אתר רגיל: https://natzor-lashon.onrender.com
- PWA: התקנה דרך הדפדפן במכשיר שתומך בכך.
- APK / אפליקציית Android: למכשירים/חנויות שמאפשרים התקנת האפליקציה.

במכשיר עם סינון, ייתכן שצריך לבקש מהסינון לאשר את הדומיין
natzor-lashon.onrender.com ואת האפליקציה עצמה.
מכשיר כשר שחוסם דפדפן, WebView או התקנת אפליקציות חיצוניות לא ניתן לעקוף באמצעות קוד.

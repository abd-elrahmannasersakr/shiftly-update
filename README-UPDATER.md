# دليل إعداد نظام التحديث التلقائي — Shiftly

## 1. ضبط بيانات GitHub في `updater.js`

افتح `updater.js` وعدّل هذين السطرين في أعلى الملف:

```js
const GITHUB_OWNER = 'YOUR_GITHUB_USERNAME'; // ← اسم حسابك على GitHub
const GITHUB_REPO  = 'shiftly';              // ← اسم المستودع
```

---

## 2. رفع إصدار جديد على GitHub

### أ) رفع كود التطبيق
```bash
git add .
git commit -m "feat: release v1.3.0"
git tag v1.3.0
git push origin main --tags
```

### ب) بناء ملفات التثبيت
```bash
npm run build:win
# يُنتج في مجلد dist/:
#   Shiftly-Portable-ia32.exe
#   Shiftly-Setup-ia32.exe
```

### ج) إنشاء Release على GitHub
1. افتح مستودعك على GitHub
2. اضغط **Releases** ← **Draft a new release**
3. اختر الـ tag: `v1.3.0`
4. ارفع الملفين:
   - `Shiftly-Portable-ia32.exe`
   - `Shiftly-Setup-ia32.exe`
5. اكتب ملاحظات الإصدار
6. اضغط **Publish release**

---

## 3. آلية عمل النظام

| الحالة | ما يحدث |
|--------|---------|
| عند بدء التشغيل | يتحقق بصمت بعد 5 ثوانٍ |
| كل 6 ساعات | تحقق تلقائي في الخلفية |
| يوجد تحديث | حوار يعرض ملاحظات الإصدار + زر تنزيل |
| نقر زر 🔄 في الشريط | تحقق فوري مع رسالة نتيجة |
| نقطة حمراء على الزر | تنبيه بوجود تحديث لم يُثبَّت بعد |

---

## 4. سلوك التحديث حسب نوع البناء

### NSIS Installer (مُثبَّت)
- يُنزَّل ملف `Setup.exe`
- يُشغَّل تلقائياً بوضع الصمت `/S`
- يُغلق التطبيق ويُثبَّت الإصدار الجديد تلقائياً

### Portable
- يُنزَّل الملف في مجلد Temp
- يُعرَض للمستخدم مع زر لفتح مجلد التنزيل
- يُشغّله المستخدم يدوياً

---

## 5. المستودع العام أم الخاص؟

- **مستودع عام (Public):** يعمل بدون أي إعداد إضافي ✅
- **مستودع خاص (Private):** أضف `Authorization` header في `updater.js`:

```js
headers: {
  'User-Agent': `Shiftly/${CURRENT_VERSION}`,
  'Accept': 'application/vnd.github+json',
  'Authorization': 'Bearer ghp_YOUR_PERSONAL_ACCESS_TOKEN'
}
```

---

## 6. الملفات المُضافة/المُعدَّلة

| الملف | التغيير |
|-------|---------|
| `updater.js` | ملف جديد — كامل منطق التحديث |
| `main.js` | استيراد وتفعيل الـ updater |
| `preload.js` | كشف قنوات `update:check` و`update:status` |
| `src/index.html` | زر التحديث + نقطة التنبيه + script الاستماع |

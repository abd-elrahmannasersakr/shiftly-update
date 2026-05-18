# نظام إدارة الحضور والرواتب

تطبيق سطح مكتب لإدارة حضور الموظفين والرواتب، مبني باستخدام:

- **Electron** (متوافق مع Windows 7)
- **HTML + CSS + JavaScript** (Vanilla, بدون frameworks)
- **SQLite** (قاعدة بيانات محلية offline-first)
- **واجهة عربية بالكامل + RTL**

---

## 🚀 التشغيل

### المتطلبات
- Node.js 16+ (يفضل 16 أو 18 لتوافق Electron 22 مع Windows 7)
- npm

### الخطوات

```bash
cd electron-attendance-app
npm install
npm start
```

> إذا واجهت مشكلة في بناء `better-sqlite3`، شغل:
> ```bash
> npm run rebuild
> ```

---

## 🗂 هيكل المشروع

```
electron-attendance-app/
├── main.js                  # Electron main process + IPC bridge
├── preload.js               # Bridge: window.api
├── package.json
├── db/
│   ├── database.js          # SQLite init
│   ├── schema.js            # CREATE TABLE statements
│   └── api.js               # All business logic (CRUD, salary calc)
└── src/
    ├── index.html           # Main shell
    ├── styles/
    │   ├── main.css         # Layout, sidebar, topbar
    │   └── components.css   # Cards, tables, tabs, modals, toasts
    └── js/
        ├── utils.js         # Helpers (toast, modal, formatters)
        ├── api.js           # Wrapper around window.api
        ├── app.js           # Router, sidebar, role switcher
        ├── employee/
        │   ├── attendance.js
        │   ├── salary.js
        │   ├── advances.js
        │   └── messages.js
        └── manager/
            ├── employees.js
            ├── dashboard.js
            └── tabs/
                ├── messages.js
                ├── cleaning.js
                ├── adjustments.js
                ├── revenue.js
                └── salary.js
```

---

## 💾 قاعدة البيانات

يتم حفظ قاعدة البيانات تلقائياً في:
- **Windows**: `%APPDATA%/attendance-payroll-app/attendance.db`
- **macOS**: `~/Library/Application Support/attendance-payroll-app/attendance.db`
- **Linux**: `~/.config/attendance-payroll-app/attendance.db`

### الجداول
- `employees` — الموظفون
- `attendance` — الحضور (وردتين)
- `cleaning` — حالة التنظيف
- `salary_adjustments` — الخصومات والمكافآت
- `advances` — السلف
- `messages` — الرسائل من المدير
- `revenues` — الإيرادات اليومية

جميع الجداول مرتبطة بـ `employee_id` مع `ON DELETE CASCADE`.

---

## 🧮 معادلة حساب الراتب

```
الإجمالي = الراتب الأساسي + (الساعات × سعر الساعة) + المكافآت
الصافي  = الإجمالي − الخصومات − السلف
```

---

## 🖥 الواجهات

### 1) واجهة الموظف (4 أقسام في القائمة الجانبية)
1. **الحضور والانصراف** — تسجيل الورديتين + تسجيل التنظيف + سجل كامل
2. **الراتب** — ملخص للقراءة فقط
3. **السلف** — إضافة سلفة + سجل
4. **الرسائل** — صندوق وارد بحالة مقروءة/غير مقروءة

### 2) واجهة المدير (قسم رئيسي واحد)
- **الموظفون** — قائمة بطاقات (إجمالي الساعات + صافي الراتب)
  - عند الضغط على بطاقة → لوحة تحكم بـ 5 تبويبات:
    1. الرسائل (إرسال + متابعة القراءة)
    2. التنظيف الشهري
    3. الخصومات والمكافآت + سجل
    4. الإيرادات + إدخال حضور يدوي + سجل
    5. الراتب (ملخص شامل)

---

## ✅ الميزات

- Offline-first (لا يحتاج إنترنت)
- حفظ تلقائي في SQLite
- سجلات زمنية (chronological)
- التحقق من المدخلات + معالجة الأخطاء
- بحث وفلترة
- واجهة نظيفة (Cards + Tabs + Dashboard)
- متوافق مع Windows 7 (Electron 22.x + Node 16)

---

## 🔐 تسجيل الدخول

عند فتح التطبيق لأول مرة، سيظهر شاشة تسجيل دخول.

**الحساب الافتراضي للمدير:**
- اسم المستخدم: `admin`
- كلمة المرور: `admin123`

### كيف يعمل النظام
- **المدير** يدخل بحسابه ويرى قائمة الموظفين، ويستطيع إضافة موظفين جدد.
- عند إضافة موظف جديد، يجب على المدير تعيين **اسم مستخدم وكلمة مرور** للموظف.
- **الموظف** يدخل بحسابه الخاص ويرى فقط بياناته (الحضور، الراتب، السلف، الرسائل).
- المدير يستطيع تعديل بيانات دخول أي موظف بالضغط على أيقونة 🔑 في بطاقته.

### كلمات المرور
- مخزّنة بشكل مشفّر باستخدام HMAC-SHA256 مع salt عشوائي لكل مستخدم.
- لا تُحفظ كلمات المرور كنص صريح أبداً.
# shiftly-update

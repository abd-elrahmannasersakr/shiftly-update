# Electron Attendance & Payroll App (Arabic / RTL)

Standalone Electron desktop app — runs locally with `npm start`. Cannot be previewed in Replit's web environment.

## Stack
- Electron 22, vanilla HTML/CSS/JS (modules attached to `window` globals)
- `better-sqlite3` for storage (`db/database.js`, `db/schema.js`, `db/api.js`)
- IPC bridge in `preload.js` exposes a fixed channel list to the renderer as `window.api`
- All UI is Arabic, RTL

## Recent changes
1. **Add Employee form** — removed `base_salary` and job-title (`role`) inputs. DB columns kept and default to `0` / `''` for backward compat.
2. **Login** — username text input replaced with a dropdown of all accounts (manager + employees). New IPC: `auth:listAccounts` returns `{id, username, role, label, sub}` (no hashes).
3. **Manager sidebar** — 3 separate items: **الموظفون / السياسات / الحوافز** (each opens its own independent page). Policies = points system, Incentives = money system — clear separation.
4. **Policies page** — explanatory hint texts removed. Added **"تطبيق سياسة على موظف"** button in the header that opens a modal to pick an employee + policy + date + notes. Reuses the existing `appliedPolicies:apply` IPC and `applied_policies` table (functionally equivalent to the suggested `employee_policies` table).
5. **Incentives page** — removed the per-row "تعديل النسبة" button and the entire Actions column; the page is now a clean read-only summary.
6. **Per-employee dashboard tabs** — current set: messages, cleaning, adjustments, revenue, **policies (new, focused)**, salary. The new "السياسات" tab has a single primary action — "+ تطبيق سياسة على هذا الموظف" — which opens a modal where the user picks a policy from the dropdown (no manual numeric entry; points come from the policy itself). Same-policy-same-day duplicate is detected and confirmed before applying. History list with delete is shown below.
7. **Salary tab (admin only)** — full redesign:
   - Top stats grid (hours / bonuses / deductions / net).
   - Two professional period cards (الفترة الأولى / الفترة الثانية), each with **Cash + Credit** inputs and a read-only auto-calculated **Total**, plus a gradient grand-total. Persisted per-employee in `localStorage`.
   - Old breakdown table ("سجل الراتب") **removed**.
   - New **"📄 فتح ورقة الراتب"** sheet trigger button (right side of its card). Clicking it opens a vertical Label/Input sheet (modal) with: ساعات العمل الشهرية (read-only, summed from current-month attendance), ساعات إضافية (editable), إجمالي الساعات (read-only = monthly+overtime), الحافز الأساسي (editable), السلفة (read-only, from advances table), صافي الراتب (read-only, highlighted: total_hours × hourly_rate + incentive − advance). All calculations update live; editable values are persisted per-employee per-month in `localStorage`.
8. **Tabs CSS** — modernized with hover lift, smooth transitions, focus ring, gradient active state, larger padding, and emoji-friendly inline-flex layout.

## Default login
- Manager: `admin` / `admin123` (created on first DB init)

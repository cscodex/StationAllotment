# Mobile Readiness Audit — StationAllotment Frontend

Assessed: 2026-03-18 | Criteria: responsive CSS breakpoints (`sm:` / `md:`), table overflow handling, and appropriate grid layouts for small screens.

**Status legend:**
- ✅ **Ready** — Has breakpoints, overflow handling, and no layout-breaking wide elements
- ⚠️ **Partial** — Has some responsive classes but missing key protections (e.g. wide table without overflow scroll)
- ❌ **Not Ready** — Wide layout elements with zero or near-zero mobile breakpoints

---

## Page Status Table

| Page | File | Table Cols | `sm:`/`md:` Classes | Overflow Safe | Mobile Status | Key Issues |
|------|------|-----------|----------------------|---------------|---------------|------------|
| Login | `login.tsx` | 0 | None | N/A | ✅ Ready | Simple centered card, no issues |
| 404 Not Found | `not-found.tsx` | 0 | None | N/A | ✅ Ready | Simple message, no layout issues |
| Dashboard | `dashboard.tsx` | 0 | None | ✅ Yes | ✅ Ready | Card grid collapses to 1-col |
| Profile Settings | `profile.tsx` | 0 | `md:` × 2 | ✅ Yes | ✅ Ready | Form layout adapts well |
| Notifications | `notifications.tsx` | 0 | None | ✅ Yes | ✅ Ready | List-based, scrolls correctly |
| Student Details | `student-details.tsx` | 0 | `sm:` × 1, `md:` × 2 | ✅ Yes | ✅ Ready | Info cards adapt to screen |
| Allocation | `allocation.tsx` | 0 | `sm:` × 1, `md:` × 1 | ✅ Yes | ✅ Ready | Result cards, no table overflow risk |
| District Analysis | `district-analysis.tsx` | 0 | `md:` × 7 | ✅ Yes | ✅ Ready | Charts with responsive grid |
| Reports | `reports.tsx` | 0 | `md:` × 4 | ✅ Yes | ✅ Ready | Charts and summary cards |
| Vacancies | `vacancies.tsx` | 7 | `md:` × 2 | ✅ Yes (3×) | ⚠️ Partial | Table has overflow-auto but no column reduction on mobile |
| Student Preference Mgmt | `student-preference-management.tsx` | ~10 | `sm:` × 16, `md:` × 7 | ✅ Yes | ⚠️ Partial | Wide table but has overflow scroll; mobile card view implemented |
| District Admin | `district-admin.tsx` | 10 | `sm:` × 6, `md:` × 2 | ✅ Yes | ⚠️ Partial | Filter bar improved; table scrollable; action buttons can still overflow |
| Export Results | `export-results.tsx` | 0 | None | ✅ Yes | ⚠️ Partial | No breakpoints for button layout, minor wrapping risk |
| Manage District Admins | `manage-district-admins.tsx` | 7 | None | ✅ Yes | ❌ Not Ready | Wide table with no sm/md breakpoints; no column hiding on mobile |
| District Admin List | `district-admin-list.tsx` | 6 | None | ✅ Yes | ❌ Not Ready | Table with 6 cols and zero responsive classes |
| Audit Log | `audit-log.tsx` | 7 | None | ✅ Yes | ❌ Not Ready | 7-column table, no responsive handling; key admin tool |
| Counseling Rounds | `counseling-rounds.tsx` | 7 | None | ✅ Yes | ❌ Not Ready | 7-column table with no breakpoints; filters stack badly |
| Students | `students.tsx` | 22 | None | ✅ Yes | ❌ Not Ready | **Worst offender**: 22 table columns, zero responsive CSS |
| File Management | `file-management.tsx` | 8 | None | ✅ Yes | ❌ Not Ready | 8-column table with no responsive classes |
| Year Sessions | `year-sessions.tsx` | 6 | None | ✅ Yes | ❌ Not Ready | Wide table, no breakpoints, small admin page |
| Test Cases | `test-cases.tsx` | 6 | None | ✅ Yes | ❌ Not Ready | Dev/test page, low mobile priority but currently broken |

---

## Summary

| Status | Count | Pages |
|--------|-------|-------|
| ✅ Ready | 8 | Login, Not Found, Dashboard, Profile, Notifications, Student Details, Allocation, District Analysis, Reports |
| ⚠️ Partial | 4 | Vacancies, Student Preference Mgmt, District Admin, Export Results |
| ❌ Not Ready | 9 | Manage District Admins, District Admin List, Audit Log, Counseling Rounds, Students, File Management, Year Sessions, Test Cases |

---

## Priority Fixes

### High Priority (used by most users)
1. **`students.tsx`** — 22-column table, completely unresponsive. Needs overflow-auto + column hiding or card view on mobile.
2. **`counseling-rounds.tsx`** — Key admin flow page, 7-column table with no mobile breakpoints.
3. **`audit-log.tsx`** — Used by central admins, 7 columns with no responsive layout.

### Medium Priority (admin-specific pages)
4. **`manage-district-admins.tsx`** — 7 columns, no breakpoints.
5. **`district-admin-list.tsx`** — 6 columns, no breakpoints.
6. **`file-management.tsx`** — 8 columns, no breakpoints.

### Low Priority (rarely accessed on mobile)
7. **`year-sessions.tsx`** — Admin config page, 6 columns.
8. **`test-cases.tsx`** — Internal testing page.

---

## Recommendations

- **Tables**: Wrap all `<Table>` components in `<div className="overflow-auto">` (already done for district-admin). Add `hidden sm:table-cell` to lower-priority columns to reduce visible columns on mobile.
- **Search/Filter bars**: Convert fixed `flex` rows to `flex-wrap` or `flex-col sm:flex-row` so they don't overflow.
- **Mobile card view**: For the most complex tables (students, counseling-rounds), consider a "card mode" that swaps the table for stacked cards on `sm` and below.

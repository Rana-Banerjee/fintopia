# Fintopia

Monorepo: `frontend/` (Next.js 16.2.4, React 19.2.4, Recharts, Tailwind v4 on :3000) + `backend/` (FastAPI, SQLAlchemy, SQLite on :8000).

## Commands

```bash
# Frontend (from frontend/)
npm run dev          # :3000
npm run build
npm run lint
npx tsc --noEmit     # typecheck

# Backend (from backend/)
pip install -r requirements.txt
python -m uvicorn main:app --reload  # :8000
python -c "import main"              # verify imports
```

Frontend calls `http://localhost:8000` (hardcoded in `lib/api.ts:1`). CORS restricts to `http://localhost:3000`.

## Key Files

- `backend/main.py` — all endpoints + migration logic (1461 lines)
- `backend/models.py` — AssetLiability, MonthValue, IncomeExpense, IncomeExpenseValue, Event, EventImpact
- `backend/schemas.py` — Pydantic schemas (200 lines)
- `backend/database.py` — SQLAlchemy engine/session setup
- `frontend/app/page.tsx` — single-file UI (2570 lines)
- `frontend/lib/api.ts` — API client (263 lines)
- `events.md` — implementation plan for Events feature (for reference)

## Database

- SQLite at `backend/fintopia.db`, created on first `create_all()`.
- Startup migration (`main.py:43-136`): runs raw SQL `ALTER TABLE` / `DROP TABLE` wrapped in try/except. Table was renamed from `items` to `assets_liabilities`.
- `Base.metadata.create_all()` at `main.py:41` creates new tables automatically.
- Models have `is_loan` boolean flag on both `AssetLiability` and `IncomeExpense` tables. Loans are distinguished from regular liabilities/expenses by `is_loan=true`, not by checking `loan_balance` or `interest_rate` nullability.

## Loan Feature

- Created through Settings → **Loans** tab (separate from Liabilities).
- Loan entry stored in `assets_liabilities` with `is_loan=true`, fields: `loan_balance`, `interest_rate`, `emi_start_month/year`, `emi_end_month/year`, `fixed_emi_amount`.
- Loan appears on dashboard in separate "Loans" section - liability shown as loan_balance amount, not as separate liability/expense rows.
- Validation: interest_rate, emi_start_month/year, emi_end_month/year are mandatory for loans.
- Validation: fixed_emi_amount is mandatory if EMI start date is in the past.
- Deleting a loan cascades to linked loan expenses (if any were created previously).

## Persistence

- localStorage keys: `itemOrder` (asset/liability drag order), `ieOrder` (income/expense drag order), `expandedGroups`.

## Events Feature

- Models: `Event`, `EventImpact` with cascade delete.
- Event impacts apply to asset/liability/income/expense/loan_balance/loan_emi targets.
- Creating/updating/deleting an event triggers `regenerate_after()` which deletes and rebuilds affected snapshots.
- Backend debug logging: `/tmp/generate_months_debug.log` and `print()` to stdout (visible in uvicorn logs).

## Testing

None configured.

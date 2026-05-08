# Fintopia AGENTS.md

## Architecture

Monorepo with two apps:
- `frontend/` - Next.js 16, React 19, Recharts, TailwindCSS (port 3000)
- `backend/` - FastAPI, SQLAlchemy, SQLite (port 8000)
- Database: `backend/fintopia.db` (SQLite)

## Developer Commands

```bash
# Frontend (run from frontend/ directory)
npm run dev    # dev server on :3000
npm run build  # production build
npm run lint   # eslint
npx tsc --noEmit  # typecheck (no script in package.json)

# Backend (run from backend/ directory)
pip install -r requirements.txt
python -m uvicorn main:app --reload  # dev server on :8000
```

## Running the App

Run both services in separate terminals:
1. Backend: `cd backend && python -m uvicorn main:app --reload`
2. Frontend: `cd frontend && npm run dev`

Frontend calls backend at `http://localhost:8000` (CORS restricted to `http://localhost:3000`).

## Testing

None configured. Add tests if needed.

## Item Persistence

- Drag-and-drop item order and group expansion state are stored in `localStorage` keys `itemOrder` and `expandedGroups`.

## Key Files

- `backend/main.py` - FastAPI app, all endpoints
- `backend/database.py` - SQLAlchemy engine, session, Base
- `backend/models.py` - SQLAlchemy models (Item, MonthValue, IncomeExpense, IncomeExpenseValue)
- `backend/schemas.py` - Pydantic schemas
- `frontend/app/page.tsx` - Main UI component
- `frontend/lib/api.ts` - Backend API client

## Database

- Migrations run via raw SQL ALTER TABLE statements in `main.py:27-38` on every backend startup. New tables created via `Base.metadata.create_all()` at `main.py:25`.
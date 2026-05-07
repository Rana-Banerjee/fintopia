# Fintopia AGENTS.md

## Architecture

Monorepo with two apps:
- `frontend/` - Next.js 16, React 19, Recharts, TailwindCSS (port 3000)
- `backend/` - FastAPI, SQLAlchemy, SQLite (port 8000)
- Database: `backend/fintopia.db` (SQLite)

## Developer Commands

```bash
# Frontend
cd frontend && npm run dev      # dev server on :3000
cd frontend && npm run build  # production build
cd frontend && npm run lint   # eslint

# Backend
cd backend && python -m uvicorn main:app --reload  # dev server on :8000
pip install -r requirements.txt                     # install deps
```

## Running the App

Both services must run simultaneously:
1. Backend: `uvicorn main:app --reload` (creates tables on startup)
2. Frontend: `npm run dev`

Frontend calls backend at `http://localhost:8000` (CORS restricted to `http://localhost:3000`).

## Testing

None configured. Add tests if needed.

## Key Features Implemented

### Drag and Drop (dnd-kit)
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` installed
- SortableItem component with drag handle (⋮⋮)
- Item order persisted to localStorage

### Graph Features
- Collapsible graph section with `graphCollapsed` state
- Toggle buttons to show/hide individual lines (via `visibleLines` state)
- Line order: Net Worth, Total Assets, Total Liabilities, then individual categories
- Taller graph (500px) with tooltip offset adjustments

### Summary Display
- Row 1: Net Worth card (centered, purple accent)
- Row 2: Two-column grid - Assets (total + 4 categories) and Liabilities (total + 2 categories)

### Key Files

- `backend/main.py` - FastAPI app, all endpoints
- `backend/models.py` - SQLAlchemy models (Item, MonthValue)
- `backend/schemas.py` - Pydantic schemas
- `frontend/app/page.tsx` - Main UI component
- `frontend/lib/api.ts` - Backend API client
- `frontend/package.json` - Dependencies including @dnd-kit
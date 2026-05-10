# Events Feature — Implementation Plan

## Overview

Add an **Events** feature to the Fintopia dashboard. Events are one-time or recurring occurrences that add/deduct fixed amounts from assets, liabilities, income items, expense items, or loan balances/EMIs. When an event modifies a month value, all subsequent generated months are automatically recalculated.

## Design Decisions

- **Recurring pattern**: First occurrence is at `start_month/start_year`. Subsequent at `start + n * frequency_months` for n = 1 to `duration-1`. Example: start Apr, freq 3, duration 4 → fires Apr, Jul, Oct, Jan.
- **Regeneration**: Auto-cascading. When a stored month value changes or an event is created/updated/deleted, all subsequent snapshots are regenerated.
- **Storage strategy**: `month_values` and `income_expense_values` store the **final event-applied** values (not raw base values). Regeneration uses stored values as the new rolling base.

---

## Module 1: Backend — Database Models

**File**: `backend/models.py`

Add two new SQLAlchemy models:

```python
class Event(Base):
    __tablename__ = "events"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    is_recurring = Column(Boolean, default=False)
    start_month = Column(Integer, nullable=True)
    start_year = Column(Integer, nullable=True)
    frequency_months = Column(Integer, nullable=True)  # e.g. 3 for every 3 months
    duration = Column(Integer, default=1)  # number of occurrences

    impacts = relationship("EventImpact", back_populates="event", cascade="all, delete-orphan")


class EventImpact(Base):
    __tablename__ = "event_impacts"
    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    target_type = Column(String, nullable=False)  # "asset"|"liability"|"income"|"expense"|"loan_balance"|"loan_emi"
    target_id = Column(String, nullable=False)     # item_id or income_expense_id
    amount = Column(Float, nullable=False)
    is_additive = Column(Boolean, default=True)   # True = add, False = deduct

    event = relationship("Event", back_populates="impacts")
```

**Verification**: Run `python -c "from models import Event, EventImpact; print('OK')"` from the `backend/` directory.

---

## Module 2: Backend — Pydantic Schemas

**File**: `backend/schemas.py`

Add schemas mirroring the models:

```python
class EventImpactBase(BaseModel):
    target_type: str
    target_id: str
    amount: float
    is_additive: bool = True


class EventImpactCreate(EventImpactBase):
    pass


class EventImpactSchema(EventImpactBase):
    id: int

    class Config:
        from_attributes = True


class EventBase(BaseModel):
    name: str
    is_recurring: bool = False
    start_month: Optional[int] = None
    start_year: Optional[int] = None
    frequency_months: Optional[int] = None
    duration: int = 1


class EventCreate(EventBase):
    impacts: list[EventImpactCreate] = []


class EventSchema(EventBase):
    id: str
    impacts: list[EventImpactSchema] = []

    class Config:
        from_attributes = True
```

**Verification**: Run `python -c "from schemas import EventCreate, EventSchema; print('OK')"` from the `backend/` directory.

---

## Module 3: Backend — Event Utility Functions

**File**: `backend/main.py` (new functions added before existing endpoints)

### 3a. Compute event occurrences

```python
def get_event_occurrences(event):
    """Return list of (month, year) tuples when this event fires.
    Single event: [(start_month, start_year)]
    Recurring: start + n*freq for n in range(duration)"""
    if not event.is_recurring:
        return [(event.start_month, event.start_year)]
    
    occurrences = []
    m, y = event.start_month, event.start_year
    for _ in range(event.duration):
        occurrences.append((m, y))
        # Advance by frequency_months
        m = m + event.frequency_months
        while m > 12:
            m -= 12
            y += 1
    return occurrences
```

### 3b. Check if event applies to a specific month

```python
def event_applies_in_month(event, month, year):
    """Return True if this event has an occurrence on the given month/year."""
    for m, y in get_event_occurrences(event):
        if m == month and y == year:
            return True
    return False
```

### 3c. Apply event impacts to a values dict

```python
def apply_event_impacts(impacts, value_map, balance_map, month, year):
    """Apply event impacts to value maps. Returns (modified_value_map, modified_balance_map)."""
    vm = dict(value_map)
    bm = dict(balance_map) if balance_map else {}
    for imp in impacts:
        if not event_applies_in_month(imp.event, month, year):
            continue
        sign = 1 if imp.is_additive else -1
        delta = imp.amount * sign
        if imp.target_type in ("asset", "liability"):
            vm[imp.target_id] = vm.get(imp.target_id, 0) + delta
        elif imp.target_type in ("income", "expense"):
            vm[imp.target_id] = vm.get(imp.target_id, 0) + delta
        elif imp.target_type == "loan_balance":
            bm[imp.target_id] = bm.get(imp.target_id, 0) + delta
        elif imp.target_type == "loan_emi":
            bm[imp.target_id] = bm.get(imp.target_id, 0) + delta
    return vm, bm
```

---

## Module 4: Backend — CRUD Endpoints

**File**: `backend/main.py`

Add after existing item/IE endpoints:

```python
@app.get("/events", response_model=List[EventSchema])
def get_events(db: Session = Depends(get_db)):
    return db.query(EventModel).all()


@app.post("/events", response_model=EventSchema)
def create_event(event: EventCreate, db: Session = Depends(get_db)):
    impacts_data = event.impacts
    event_data = event.model_dump(exclude={"impacts"})
    db_event = EventModel(id=uuid.uuid4().hex, **event_data)
    db.add(db_event)
    db.flush()
    for imp in impacts_data:
        db_imp = EventImpactModel(event_id=db_event.id, **imp.model_dump())
        db.add(db_imp)
    db.commit()
    db.refresh(db_event)
    # Trigger cascading regeneration
    regenerate_all_after_now(db)
    return db_event


@app.put("/events/{event_id}", response_model=EventSchema)
def update_event(event_id: str, event: EventCreate, db: Session = Depends(get_db)):
    db_event = db.query(EventModel).filter(EventModel.id == event_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")
    event_data = event.model_dump(exclude={"impacts"})
    for k, v in event_data.items():
        setattr(db_event, k, v)
    db.query(EventImpactModel).filter(EventImpactModel.event_id == event_id).delete()
    for imp in event.impacts:
        db_imp = EventImpactModel(event_id=event_id, **imp.model_dump())
        db.add(db_imp)
    db.commit()
    # Trigger cascading regeneration
    regenerate_all_after_now(db)
    return db_event


@app.delete("/events/{event_id}")
def delete_event(event_id: str, db: Session = Depends(get_db)):
    db_event = db.query(EventModel).filter(EventModel.id == event_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")
    db.query(EventImpactModel).filter(EventImpactModel.event_id == event_id).delete()
    db.delete(db_event)
    db.commit()
    # Trigger cascading regeneration
    regenerate_all_after_now(db)
    return {"message": "Event deleted"}
```

---

## Module 5: Backend — Cascading Regeneration

**File**: `backend/main.py`

Add a regeneration function that invalidates all snapshots after a given month and rebuilds them:

```python
def regenerate_all_after_now(db: Session, from_month: int = None, from_year: int = None):
    """Delete all month_values and ie_values for months after from_month/from_year,
    then rebuild them by calling generate_months from the last valid snapshot."""
    # Implementation steps:
    # 1. Find the last valid (non-future) snapshot before from_month/year
    # 2. Delete all month_values and ie_values for months >= from_month/year
    # 3. Call generate_months logic from the last valid month, for all deleted months
    # 4. Commit
```

**Key insight**: This function will be called by:
- `save_month_values` (after saving a changed month value)
- `save_income_expense_values` (after saving changed IE values)
- `save_loan_outstanding_balances` (after saving loan balances)
- `create_event`, `update_event`, `delete_event` (after event mutations)

---

## Module 6: Backend — Integrate Events into Existing Read Endpoints

**File**: `backend/main.py`

### 6a. `get_month_values`

After loading stored item values, load active events for the month and apply impacts. The endpoint already returns the stored value, but it needs to show the event-adjusted value:

```python
@app.get("/month-values/{month}/{year}", response_model=MonthValuesResponse)
def get_month_values(month: int, year: int, db: Session = Depends(get_db)):
    # ... existing logic for loan_ids and values ...
    # Apply events to value_map
    events = db.query(EventModel).all()
    active_impacts = []
    for e in events:
        if event_applies_in_month(e, month, year):
            for imp in e.impacts:
                active_impacts.append(imp)
    value_map, _ = apply_event_impacts(active_impacts, value_map, {}, month, year)
    # ... rest unchanged ...
```

### 6b. `get_summary`

Apply the same event impact logic when aggregating values for the summary:

```python
# After building value_map and ie_value_map, before computing totals:
events = db.query(EventModel).all()
active_impacts = []
for e in events:
    if event_applies_in_month(e, month, year):
        for imp in e.impacts:
            active_impacts.append(imp)
value_map, ie_balance_map = apply_event_impacts(
    active_impacts, value_map, ie_balance_map, month, year
)
```

### 6c. `save_month_values` — trigger regeneration

After saving, call regeneration:

```python
@app.put("/month-values/{month}/{year}")
def save_month_values(month: int, year: int, data: dict, db: Session = Depends(get_db)):
    # ... existing save logic ...
    db.commit()
    regenerate_all_after_now(db, month, year)
    return {"message": "Month values saved"}
```

**Important**: Similar changes needed in `save_income_expense_values` and `save_loan_outstanding_balances` to trigger regeneration.

---

## Module 7: Backend — Migration (Startup)

**File**: `backend/main.py` (existing startup section at lines 37-119)

Add `Event` and `EventImpact` to the import and ensure `Base.metadata.create_all()` handles them. The `create_all` call at line 37 will create new tables automatically. No raw SQL needed.

---

## Module 8: Frontend — API Client

**File**: `frontend/lib/api.ts`

Add interfaces and API functions:

```typescript
export interface EventImpact {
  id?: number;
  target_type: string; // "asset"|"liability"|"income"|"expense"|"loan_balance"|"loan_emi"
  target_id: string;
  amount: number;
  is_additive: boolean;
}

export interface Event {
  id: string;
  name: string;
  is_recurring: boolean;
  start_month: number | null;
  start_year: number | null;
  frequency_months: number | null;
  duration: number;
  impacts: EventImpact[];
}

export async function getEvents(): Promise<Event[]> { ... }
export async function createEvent(event: Omit<Event, "id">): Promise<Event> { ... }
export async function updateEvent(id: string, event: Omit<Event, "id">): Promise<Event> { ... }
export async function deleteEvent(id: string): Promise<void> { ... }
```

---

## Module 9: Frontend — Events Tab State

**File**: `frontend/app/page.tsx`

Add new state variables following the existing pattern:

```typescript
const [eventsTab, setEventsTab] = useState<"list" | "form">("list");
const [events, setEvents] = useState<Event[]>([]);
const [eventForm, setEventForm] = useState({
  name: "",
  is_recurring: false,
  start_month: "",
  start_year: "",
  frequency_months: "",
  duration: "1",
  impacts: [] as EventImpact[],
});
const [editingEventId, setEditingEventId] = useState<string | null>(null);
const [eventsSettingsTab, setEventsSettingsTab] = useState<"assets"|"liabilities"|"income"|"expenses"|"loans"|"events">("events");
```

Add `getEvents`, `createEvent`, `updateEvent`, `deleteEvent` to the data-fetching `useEffect` and to the imports from `api.ts`.

---

## Module 10: Frontend — Events UI Section

**File**: `frontend/app/page.tsx`

Add inside the settings modal, after the existing `loan_expenses` tab content:

### 10a. Tab button

```tsx
<button
  key="events"
  onClick={() => {
    setEventsSettingsTab("events");
    setActiveTab("settings"); // or navigate to events section
  }}
  className={`px-4 py-2 font-medium whitespace-nowrap ${
    eventsSettingsTab === "events"
      ? "border-b-2 border-blue-600 text-blue-600"
      : "text-gray-500 hover:text-gray-700"
  }`}
>
  Events
</button>
```

### 10b. Events list view (when `eventsSettingsTab === "events" && !editingEventId`)

- Display each event card showing: name, recurring/single, occurrence dates, list of impacts with target names.
- "Edit" and "Delete" buttons per event.
- "Add Event" button to enter form mode.

### 10c. Event form (when `eventsSettingsTab === "events" && editingEventId` or new event)

- **Name**: text input.
- **Recurring toggle**: checkbox/switch for `is_recurring`.
- **Start month/year**: two inputs (month number, year number).
- **Frequency** (visible when recurring): input for `frequency_months`.
- **Duration** (visible when recurring): input for `duration` (default 1).
- **Impacts section**: dynamic list of impact rows. Each row has:
  - `target_type` dropdown: asset | liability | income | expense | loan_balance | loan_emi
  - `target_id` dropdown: filtered list of items matching the target_type
  - `amount`: number input
  - `is_additive` toggle: adds (true) or deducts (false)
  - Remove button for the row
- "Add Impact" button to add a new impact row.
- Submit: calls `createEvent` or `updateEvent`.
- Cancel: resets form, returns to list.

### 10d. Impact target filtering

- `target_type === "asset"`: show only asset items (`item_type === "asset"`)
- `target_type === "liability"`: show only liability items (`item_type === "liability"`)
- `target_type === "income"`: show only income IE items (`ie_type === "income"`)
- `target_type === "expense"`: show only non-loan expense IE items (`ie_type === "expense"`)
- `target_type === "loan_balance"`: show only loan IE items (those with `interest_rate`)
- `target_type === "loan_emi"`: show only loan IE items

---

## Module 11: Frontend — Fetch event names for targets

**File**: `frontend/app/page.tsx`

Helper to resolve target IDs to display names for the events list view:

```typescript
function getEventTargetLabel(target_type: string, target_id: string): string {
  if (target_type === "asset" || target_type === "liability") {
    return items.find(i => i.id === target_id)?.name ?? target_id;
  }
  if (target_type === "income" || target_type === "expense" || target_type === "loan_balance" || target_type === "loan_emi") {
    return incomeExpenses.find(ie => ie.id === target_id)?.name ?? target_id;
  }
  return target_id;
}
```

---

## Module 12: Backend — `save_income_expense_values` Regeneration Trigger

**File**: `backend/main.py`

Find the `save_income_expense_values` endpoint and add `regenerate_all_after_now(db, month, year)` after commit, mirroring the change to `save_month_values`.

---

## Module 13: Backend — `save_loan_outstanding_balances` Regeneration Trigger

**File**: `backend/main.py`

Find the `save_loan_outstanding_balances` endpoint and add `regenerate_all_after_now(db, month, year)` after commit.

---

## Module 14: Verify End-to-End Flow

After all modules are complete, test the following scenarios:

1. **Single event**: Create a one-time event that deducts 5000 from an asset in the current month. Verify the asset value decreases by 5000 in that month, and all subsequent months show the modified value carried forward.
2. **Recurring event**: Create a recurring event starting in 3 months, every 6 months, duration 4. Verify it fires at the correct months.
3. **Event with multiple impacts**: Create an event that deducts from a liability and adds to an asset simultaneously. Verify both changes appear.
4. **Regeneration cascade**: Modify a stored month value manually. Verify all subsequent months recalculate correctly.
5. **Delete event**: Delete an event and verify all affected months revert to their pre-event values.
6. **Summary**: Verify summary totals reflect event impacts.
7. **Generate months after event**: Generate new months after an event exists. Verify events apply correctly to new months.

---

## Module 15: Lint & Typecheck

**Frontend**: Run `cd frontend && npm run lint && npx tsc --noEmit`.
**Backend**: Run `python -c "import main"`.

Fix any errors before declaring the feature complete.

---

## File Changes Summary

| File | Change |
|------|--------|
| `backend/models.py` | Add `Event`, `EventImpact` models |
| `backend/schemas.py` | Add Event/EventImpact Pydantic schemas |
| `backend/main.py` | Add utility functions, CRUD endpoints, regeneration function, event integration into `get_month_values`/`get_summary`/`save_month_values`/`save_income_expense_values`/`save_loan_outstanding_balances` |
| `frontend/lib/api.ts` | Add Event/EventImpact interfaces and API functions |
| `frontend/app/page.tsx` | Add events tab, form, list, state, impact filtering |
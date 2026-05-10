from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import and_, text
from typing import List
import uuid
import logging
from database import engine, get_db, Base
from models import (
    Item as ItemModel,
    MonthValue as MonthValueModel,
    IncomeExpense as IncomeExpenseModel,
    IncomeExpenseValue as IncomeExpenseValueModel,
    Event as EventModel,
    EventImpact as EventImpactModel,
)
from schemas import (
    ItemCreate,
    Item as ItemSchema,
    MonthValueCreate,
    MonthValue as MonthValueSchema,
    MonthValuesResponse,
    Summary,
    IncomeExpenseCreate,
    IncomeExpense as IncomeExpenseSchema,
    IncomeExpenseValuesResponse,
    GenerateMonthsRequest,
    GenerateMonthsResponse,
    EventCreate,
    EventSchema,
)

LOG_FILE = "/tmp/generate_months_debug.log"


def log_msg(msg):
    with open(LOG_FILE, "a") as f:
        f.write(f"{msg}\n")


Base.metadata.create_all(bind=engine)

with engine.connect() as conn:
    for col, col_type in [
        ("start_month", "INTEGER"),
        ("start_year", "INTEGER"),
        ("end_month", "INTEGER"),
        ("end_year", "INTEGER"),
    ]:
        try:
            conn.execute(text(f"ALTER TABLE items ADD COLUMN {col} {col_type}"))
            conn.commit()
        except Exception:
            pass

    for col, col_type in [
        ("interest_rate", "REAL"),
        ("emi_start_month", "INTEGER"),
        ("emi_start_year", "INTEGER"),
        ("emi_end_month", "INTEGER"),
        ("emi_end_year", "INTEGER"),
        ("balance_disbursed", "REAL"),
        ("associated_asset_id", "TEXT"),
        ("is_fixed_emi", "INTEGER"),
        ("fixed_emi_amount", "REAL"),
    ]:
        try:
            conn.execute(
                text(f"ALTER TABLE income_expenses ADD COLUMN {col} {col_type}")
            )
            conn.commit()
        except Exception:
            pass

    try:
        conn.execute(
            text(
                "ALTER TABLE income_expense_values ADD COLUMN balance_outstanding REAL"
            )
        )
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(
            text("ALTER TABLE income_expenses DROP COLUMN IF EXISTS total_loan_amount")
        )
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(
            text("ALTER TABLE income_expenses DROP COLUMN IF EXISTS tenure_months")
        )
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(
            text(
                "ALTER TABLE income_expenses DROP COLUMN IF EXISTS bank_contribution_till_date"
            )
        )
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(
            text("ALTER TABLE income_expenses DROP COLUMN IF EXISTS tagged_od_account")
        )
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(text("DROP TABLE IF EXISTS bank_contributions"))
        conn.commit()
    except Exception:
        pass

app = FastAPI(title="Fintopia API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.post("/items", response_model=ItemSchema)
def create_item(item: ItemCreate, db: Session = Depends(get_db)):
    db_item = ItemModel(id=uuid.uuid4().hex, **item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@app.get("/items", response_model=List[ItemSchema])
def get_items(db: Session = Depends(get_db)):
    return db.query(ItemModel).order_by(ItemModel.id).all()


@app.delete("/items/{item_id}")
def delete_item(item_id: str, db: Session = Depends(get_db)):
    item = db.query(ItemModel).filter(ItemModel.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.query(MonthValueModel).filter(MonthValueModel.item_id == item_id).delete()
    db.delete(item)
    db.commit()
    return {"message": "Item deleted"}


@app.put("/items/{item_id}", response_model=ItemSchema)
def update_item(item_id: str, item: ItemCreate, db: Session = Depends(get_db)):
    db_item = db.query(ItemModel).filter(ItemModel.id == item_id).first()
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    db_item.name = item.name
    db_item.item_type = item.item_type
    db_item.liquidity = item.liquidity
    db_item.appreciation_rate = item.appreciation_rate
    db_item.appreciation_frequency = item.appreciation_frequency
    db_item.start_month = item.start_month
    db_item.start_year = item.start_year
    db_item.end_month = item.end_month
    db_item.end_year = item.end_year
    db.commit()
    db.refresh(db_item)
    return db_item


@app.get("/month-values/{month}/{year}", response_model=MonthValuesResponse)
def get_month_values(month: int, year: int, db: Session = Depends(get_db)):
    loan_ids = {
        l.id
        for l in db.query(IncomeExpenseModel)
        .filter(IncomeExpenseModel.interest_rate.isnot(None))
        .all()
    }
    values = (
        db.query(MonthValueModel)
        .filter(and_(MonthValueModel.month == month, MonthValueModel.year == year))
        .all()
    )
    value_map = {v.item_id: v.value for v in values if v.item_id not in loan_ids}
    ie_values = (
        db.query(IncomeExpenseValueModel)
        .filter(
            and_(
                IncomeExpenseValueModel.month == month,
                IncomeExpenseValueModel.year == year,
            )
        )
        .all()
    )
    ie_map = {v.item_id: v.value for v in ie_values}

    impacts = get_active_impacts_for_month(db, month, year)
    if impacts:
        value_map, _ = apply_event_impacts(impacts, value_map, {}, month, year)
        for imp in impacts:
            if imp.target_type in ("income", "expense"):
                sign = 1 if imp.is_additive else -1
                ie_map[imp.target_id] = ie_map.get(imp.target_id, 0) + imp.amount * sign

    return MonthValuesResponse(
        month=month,
        year=year,
        values=[{"item_id": k, "value": v} for k, v in value_map.items()],
    )


@app.put("/month-values/{month}/{year}")
def save_month_values(month: int, year: int, data: dict, db: Session = Depends(get_db)):
    loan_ids = {
        l.id
        for l in db.query(IncomeExpenseModel)
        .filter(IncomeExpenseModel.interest_rate.isnot(None))
        .all()
    }
    for item_id, value in data.items():
        if item_id in loan_ids:
            continue
        existing = (
            db.query(MonthValueModel)
            .filter(
                and_(
                    MonthValueModel.month == month,
                    MonthValueModel.year == year,
                    MonthValueModel.item_id == item_id,
                )
            )
            .first()
        )

        if existing:
            existing.value = value
        else:
            new_value = MonthValueModel(
                month=month, year=year, item_id=item_id, value=value
            )
            db.add(new_value)

    db.commit()
    return {"message": "Month values saved"}


@app.get("/snapshots", response_model=List[dict])
def get_snapshots(db: Session = Depends(get_db)):
    results = (
        db.query(MonthValueModel.month, MonthValueModel.year)
        .distinct()
        .order_by(MonthValueModel.year, MonthValueModel.month)
        .all()
    )
    return [{"month": r.month, "year": r.year} for r in results]


@app.delete("/snapshots/{month}/{year}")
def delete_snapshot(month: int, year: int, db: Session = Depends(get_db)):
    db.query(MonthValueModel).filter(
        and_(MonthValueModel.month == month, MonthValueModel.year == year)
    ).delete()
    db.query(IncomeExpenseValueModel).filter(
        and_(
            IncomeExpenseValueModel.month == month, IncomeExpenseValueModel.year == year
        )
    ).delete()
    db.commit()
    return {"message": "Snapshot deleted"}


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
    regenerate_after(db, event.start_month, event.start_year)
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
    regenerate_after(db, event.start_month, event.start_year)
    return db_event


@app.delete("/events/{event_id}")
def delete_event(event_id: str, db: Session = Depends(get_db)):
    db_event = db.query(EventModel).filter(EventModel.id == event_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")
    start_month = db_event.start_month
    start_year = db_event.start_year
    db.query(EventImpactModel).filter(EventImpactModel.event_id == event_id).delete()
    db.delete(db_event)
    db.commit()
    regenerate_after(db, start_month, start_year)
    return {"message": "Event deleted"}


def get_summary(month: int, year: int, db: Session):
    items = db.query(ItemModel).all()
    loan_ids = {
        l.id
        for l in db.query(IncomeExpenseModel)
        .filter(IncomeExpenseModel.interest_rate.isnot(None))
        .all()
    }
    values = (
        db.query(MonthValueModel)
        .filter(and_(MonthValueModel.month == month, MonthValueModel.year == year))
        .all()
    )
    value_map = {v.item_id: v.value for v in values if v.item_id not in loan_ids}
    current_assets = 0.0
    liquid_liabilities = 0.0
    semi_liquid_assets = 0.0
    retirement_assets = 0.0
    property_assets = 0.0
    fixed_liabilities = 0.0
    loan_liabilities = 0.0
    for item in items:
        value = value_map.get(item.id, 0.0)
        if item.item_type == "asset":
            if item.liquidity == "liquid":
                current_assets += value
            elif item.liquidity == "semi-liquid":
                semi_liquid_assets += value
            elif item.liquidity == "retirement":
                retirement_assets += value
            elif item.liquidity == "fixed":
                property_assets += value
        elif item.item_type == "liability":
            if item.liquidity == "liquid":
                liquid_liabilities += value
            elif item.liquidity == "fixed":
                fixed_liabilities += value
    ie_items = db.query(IncomeExpenseModel).all()
    ie_values = (
        db.query(IncomeExpenseValueModel)
        .filter(
            and_(
                IncomeExpenseValueModel.month == month,
                IncomeExpenseValueModel.year == year,
            )
        )
        .all()
    )
    ie_value_map = {v.item_id: v.value for v in ie_values}
    ie_balance_map = {
        v.item_id: v.balance_outstanding
        for v in ie_values
        if v.balance_outstanding is not None
    }
    total_income = 0.0
    total_expense = 0.0
    loan_interest = 0.0
    loan_emi = 0.0
    for item in ie_items:
        if not is_active_in_month(item, month, year):
            continue
        if not applies_this_month(item, month):
            continue
        if item.ie_type == "income":
            total_income += ie_value_map.get(item.id, 0.0)
        elif item.ie_type == "expense":
            if item.interest_rate and item.emi_start_month and item.emi_start_year:
                is_pre_emi = (year < item.emi_start_year) or (
                    year == item.emi_start_year and month < item.emi_start_month
                )
                is_active_emi = (year > item.emi_start_year) or (
                    year == item.emi_start_year and month >= item.emi_start_month
                )
                has_ended = (
                    item.emi_end_year
                    and item.emi_end_month
                    and (
                        (year > item.emi_end_year)
                        or (year == item.emi_end_year and month > item.emi_end_month)
                    )
                )
                if has_ended:
                    continue
                loan_value = ie_balance_map.get(item.id) or ie_value_map.get(item.id, 0)
                if is_pre_emi and loan_value > 0:
                    loan_interest += round(loan_value * (item.interest_rate / 100) / 12)
                elif is_active_emi:
                    loan_emi += round(item.fixed_emi_amount or 0)
                loan_liabilities += round(loan_value)
            else:
                total_expense += ie_value_map.get(item.id, 0.0)
    impacts = get_active_impacts_for_month(db, month, year)
    if impacts:
        value_map, ie_balance_map = apply_event_impacts(
            impacts, value_map, ie_balance_map, month, year
        )
        for imp in impacts:
            if imp.target_type in ("income", "expense"):
                sign = 1 if imp.is_additive else -1
                ie_value_map[imp.target_id] = (
                    ie_value_map.get(imp.target_id, 0) + imp.amount * sign
                )
                if imp.target_type == "income":
                    total_income += imp.amount * sign
                else:
                    total_expense += imp.amount * sign
    total_assets = (
        current_assets + semi_liquid_assets + retirement_assets + property_assets
    )
    total_liabilities = liquid_liabilities + fixed_liabilities + loan_liabilities
    net_worth = total_assets - total_liabilities
    net_cashflow = total_income - total_expense - loan_interest - loan_emi
    net_cash = (current_assets + semi_liquid_assets) - liquid_liabilities + net_cashflow
    return Summary(
        net_worth=net_worth,
        net_cash=net_cash,
        current_assets=current_assets,
        liquid_liabilities=liquid_liabilities,
        semi_liquid_assets=semi_liquid_assets,
        retirement_assets=retirement_assets,
        property_assets=property_assets,
        fixed_liabilities=fixed_liabilities,
        loan_liabilities=loan_liabilities,
        total_income=total_income,
        total_expense=total_expense,
        loan_interest=loan_interest,
        loan_emi=loan_emi,
        net_cashflow=net_cashflow,
    )


@app.get("/summary", response_model=Summary)
def get_summary_endpoint(month: int, year: int, db: Session = Depends(get_db)):
    return get_summary(month, year, db)


@app.post("/income-expenses", response_model=IncomeExpenseSchema)
def create_income_expense(item: IncomeExpenseCreate, db: Session = Depends(get_db)):
    db_item = IncomeExpenseModel(id=uuid.uuid4().hex, **item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@app.get("/income-expenses", response_model=List[IncomeExpenseSchema])
def get_income_expenses(db: Session = Depends(get_db)):
    return (
        db.query(IncomeExpenseModel)
        .order_by(
            IncomeExpenseModel.ie_type, IncomeExpenseModel.order, IncomeExpenseModel.id
        )
        .all()
    )


@app.delete("/income-expenses/{item_id}")
def delete_income_expense(item_id: str, db: Session = Depends(get_db)):
    item = db.query(IncomeExpenseModel).filter(IncomeExpenseModel.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.query(IncomeExpenseValueModel).filter(
        IncomeExpenseValueModel.item_id == item_id
    ).delete()
    db.delete(item)
    db.commit()
    return {"message": "Income/Expense deleted"}


@app.put("/income-expenses/{item_id}", response_model=IncomeExpenseSchema)
def update_income_expense(
    item_id: str, item: IncomeExpenseCreate, db: Session = Depends(get_db)
):
    db_item = (
        db.query(IncomeExpenseModel).filter(IncomeExpenseModel.id == item_id).first()
    )
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    for k, v in item.model_dump().items():
        setattr(db_item, k, v)
    db.commit()
    db.refresh(db_item)
    return db_item


@app.get(
    "/income-expenses/values/{month}/{year}", response_model=IncomeExpenseValuesResponse
)
def get_income_expense_values(month: int, year: int, db: Session = Depends(get_db)):
    values = (
        db.query(IncomeExpenseValueModel)
        .filter(
            and_(
                IncomeExpenseValueModel.month == month,
                IncomeExpenseValueModel.year == year,
            )
        )
        .all()
    )
    return IncomeExpenseValuesResponse(
        month=month,
        year=year,
        values=[{"item_id": v.item_id, "value": v.value} for v in values],
    )


@app.put("/income-expenses/values/{month}/{year}")
def save_income_expense_values(
    month: int, year: int, data: dict, db: Session = Depends(get_db)
):
    for item_id, value in data.items():
        existing = (
            db.query(IncomeExpenseValueModel)
            .filter(
                and_(
                    IncomeExpenseValueModel.month == month,
                    IncomeExpenseValueModel.year == year,
                    IncomeExpenseValueModel.item_id == item_id,
                )
            )
            .first()
        )
        if existing:
            existing.value = value
        else:
            db.add(
                IncomeExpenseValueModel(
                    month=month, year=year, item_id=item_id, value=value
                )
            )
    db.commit()
    return {"message": "Income/Expense values saved"}


@app.get("/loan-outstanding-balance/{month}/{year}")
def get_loan_outstanding_balance(month: int, year: int, db: Session = Depends(get_db)):
    loans = (
        db.query(IncomeExpenseModel)
        .filter(IncomeExpenseModel.interest_rate.isnot(None))
        .all()
    )
    loan_ids = [l.id for l in loans]
    values = (
        db.query(IncomeExpenseValueModel)
        .filter(
            and_(
                IncomeExpenseValueModel.month == month,
                IncomeExpenseValueModel.year == year,
                IncomeExpenseValueModel.item_id.in_(loan_ids),
            )
        )
        .all()
    )
    return {
        v.item_id: v.balance_outstanding
        if v.balance_outstanding is not None
        else v.value
        for v in values
    }


@app.put("/loan-outstanding-balance/{month}/{year}")
def save_loan_outstanding_balance(
    month: int, year: int, data: dict, db: Session = Depends(get_db)
):
    for item_id, value in data.items():
        existing = (
            db.query(IncomeExpenseValueModel)
            .filter(
                and_(
                    IncomeExpenseValueModel.month == month,
                    IncomeExpenseValueModel.year == year,
                    IncomeExpenseValueModel.item_id == item_id,
                )
            )
            .first()
        )
        if existing:
            existing.balance_outstanding = value
        else:
            db.add(
                IncomeExpenseValueModel(
                    month=month,
                    year=year,
                    item_id=item_id,
                    value=0,
                    balance_outstanding=value,
                )
            )
    db.commit()
    return {"message": "Loan outstanding balances saved"}


def is_active_in_month(item, month, year):
    start = item.start_year and (
        item.start_year < year
        or (item.start_year == year and item.start_month and item.start_month <= month)
    )
    if item.start_year and item.start_month and not start:
        return False
    if item.end_year:
        end = item.end_year > year or (
            item.end_year == year and item.end_month and item.end_month >= month
        )
        if not end:
            return False
    return True


def applies_this_month(item, month):
    freq = item.frequency
    if freq == "monthly":
        return True
    elif freq == "bi_monthly":
        return month % 2 == 0
    elif freq == "quarterly":
        return month in [1, 4, 7, 10]
    elif freq == "semi_annual":
        return month in [4, 10]
    elif freq == "yearly":
        return month == 4
    return False


def get_next_month(month, year):
    if month == 12:
        return (1, year + 1)
    return (month + 1, year)


def is_appreciation_month(frequency, month):
    if frequency == "monthly":
        return True
    elif frequency == "bi_monthly":
        return month % 2 == 0
    elif frequency == "quarterly":
        return month in [1, 4, 7, 10]
    elif frequency == "semi_annual":
        return month in [4, 10]
    elif frequency == "yearly":
        return month == 4
    return False


def apply_appreciation(value, rate, frequency, month):
    if not rate or rate == 0:
        return value
    if not is_appreciation_month(frequency, month):
        return value

    divisors = {
        "monthly": 12,
        "bi_monthly": 6,
        "quarterly": 4,
        "semi_annual": 2,
        "yearly": 1,
    }
    divisor = divisors.get(frequency, 1)
    periodic_rate = rate / divisor

    return round(value * (1 + periodic_rate / 100))


def calculate_loan_components(balance, annual_rate, fixed_emi):
    if not balance or balance <= 0:
        return {"interest": 0, "principal": 0, "new_balance": 0}
    if not annual_rate or not fixed_emi:
        return {"interest": 0, "principal": 0, "new_balance": balance}
    monthly_rate = annual_rate / 100 / 12
    interest = round(balance * monthly_rate)
    principal = fixed_emi - interest
    new_balance = max(0, round(balance - principal))
    return {"interest": interest, "principal": principal, "new_balance": new_balance}


def get_event_occurrences(event):
    if not event.is_recurring:
        return [(event.start_month, event.start_year)]
    occurrences = []
    m, y = event.start_month, event.start_year
    for _ in range(event.duration):
        occurrences.append((m, y))
        m = m + event.frequency_months
        while m > 12:
            m -= 12
            y += 1
    return occurrences


def event_applies_in_month(event, month, year):
    for m, y in get_event_occurrences(event):
        if m == month and y == year:
            return True
    return False


def apply_event_impacts(impacts, value_map, balance_map, month, year):
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


def get_active_impacts_for_month(db, month, year):
    events = db.query(EventModel).all()
    active = []
    for e in events:
        if event_applies_in_month(e, month, year):
            for imp in e.impacts:
                active.append(imp)
    return active


def regenerate_after(db: Session, month: int, year: int):
    all_snapshots = (
        db.query(MonthValueModel.month, MonthValueModel.year)
        .distinct()
        .order_by(MonthValueModel.year, MonthValueModel.month)
        .all()
    )
    after = [
        (s.month, s.year)
        for s in all_snapshots
        if (s.year > year) or (s.year == year and s.month > month)
    ]
    if not after:
        return
    for m, y in after:
        db.query(MonthValueModel).filter(
            and_(MonthValueModel.month == m, MonthValueModel.year == y)
        ).delete(synchronize_session=False)
        db.query(IncomeExpenseValueModel).filter(
            and_(IncomeExpenseValueModel.month == m, IncomeExpenseValueModel.year == y)
        ).delete(synchronize_session=False)
    db.commit()

    prev_m, prev_y = month, year
    sorted_after = sorted(after, key=lambda s: (s[1], s[0]))
    for gen_m, gen_y in sorted_after:
        _regenerate_single_month(db, prev_m, prev_y, gen_m, gen_y)
        prev_m, prev_y = gen_m, gen_y


def _regenerate_single_month(
    db: Session,
    src_m: int,
    src_y: int,
    tgt_m: int,
    tgt_y: int,
):
    loan_ids = {
        l.id
        for l in db.query(IncomeExpenseModel)
        .filter(IncomeExpenseModel.interest_rate.isnot(None))
        .all()
    }

    item_values = (
        db.query(MonthValueModel)
        .filter(and_(MonthValueModel.month == src_m, MonthValueModel.year == src_y))
        .all()
    )
    prev_item_values = {
        v.item_id: v.value for v in item_values if v.item_id not in loan_ids
    }

    current_asset_values = {}
    items = db.query(ItemModel).all()
    for item in items:
        if not is_active_in_month(item, tgt_m, tgt_y):
            continue
        if item.id in loan_ids:
            continue
        prev_value = prev_item_values.get(item.id, 0)
        new_value = apply_appreciation(
            prev_value, item.appreciation_rate, item.appreciation_frequency, tgt_m
        )
        current_asset_values[item.id] = new_value

    ie_values = (
        db.query(IncomeExpenseValueModel)
        .filter(
            and_(
                IncomeExpenseValueModel.month == src_m,
                IncomeExpenseValueModel.year == src_y,
            )
        )
        .all()
    )
    prev_ie_values = {v.item_id: v.value for v in ie_values}
    prev_ie_balances = {
        v.item_id: (
            v.balance_outstanding if v.balance_outstanding is not None else v.value
        )
        for v in ie_values
    }

    new_ie_values = {}
    ie_items = db.query(IncomeExpenseModel).all()
    for item in ie_items:
        if not is_active_in_month(item, tgt_m, tgt_y):
            continue
        prev_value = prev_ie_values.get(item.id, 0)
        new_balance = None
        is_loan = item.interest_rate and item.emi_start_year

        if is_loan:
            if not prev_ie_balances.get(item.id):
                continue
            outstanding = prev_ie_balances[item.id]
            is_pre_emi = item.emi_start_year and (
                tgt_y < item.emi_start_year
                or (
                    tgt_y == item.emi_start_year and tgt_m < (item.emi_start_month or 1)
                )
            )
            if is_pre_emi or not item.fixed_emi_amount:
                new_value = round(outstanding * item.interest_rate / 1200)
                new_balance = outstanding
            else:
                comps = calculate_loan_components(
                    outstanding, item.interest_rate, item.fixed_emi_amount
                )
                new_balance = comps["new_balance"]
                new_value = item.fixed_emi_amount
        else:
            new_value = apply_appreciation(
                prev_value, item.appreciation_rate, item.appreciation_frequency, tgt_m
            )

        new_ie_values[item.id] = new_value

    ie_with_asset = (
        db.query(IncomeExpenseModel)
        .filter(IncomeExpenseModel.associated_asset_id.isnot(None))
        .all()
    )
    for ie_item in ie_with_asset:
        if not is_active_in_month(ie_item, tgt_m, tgt_y):
            continue
        if not applies_this_month(ie_item, tgt_m):
            continue
        asset_id = ie_item.associated_asset_id
        if not asset_id or asset_id not in current_asset_values:
            continue
        value = new_ie_values.get(ie_item.id, 0)
        if ie_item.ie_type == "income":
            current_asset_values[asset_id] += value
        elif ie_item.ie_type == "expense":
            current_asset_values[asset_id] -= value

    impacts = get_active_impacts_for_month(db, tgt_m, tgt_y)
    if impacts:
        current_asset_values, _ = apply_event_impacts(
            impacts, current_asset_values, {}, tgt_m, tgt_y
        )
        for imp in impacts:
            if imp.target_type in ("income", "expense"):
                sign = 1 if imp.is_additive else -1
                new_ie_values[imp.target_id] = (
                    new_ie_values.get(imp.target_id, 0) + imp.amount * sign
                )

    for item_id, value in current_asset_values.items():
        existing = (
            db.query(MonthValueModel)
            .filter(
                and_(
                    MonthValueModel.month == tgt_m,
                    MonthValueModel.year == tgt_y,
                    MonthValueModel.item_id == item_id,
                )
            )
            .first()
        )
        if existing:
            existing.value = value
        else:
            db.add(
                MonthValueModel(month=tgt_m, year=tgt_y, item_id=item_id, value=value)
            )

    for item_id, value in new_ie_values.items():
        existing = (
            db.query(IncomeExpenseValueModel)
            .filter(
                and_(
                    IncomeExpenseValueModel.month == tgt_m,
                    IncomeExpenseValueModel.year == tgt_y,
                    IncomeExpenseValueModel.item_id == item_id,
                )
            )
            .first()
        )
        if existing:
            existing.value = value
        else:
            db.add(
                IncomeExpenseValueModel(
                    month=tgt_m, year=tgt_y, item_id=item_id, value=value
                )
            )

    db.commit()


@app.post("/generate-months/{month}/{year}", response_model=GenerateMonthsResponse)
def generate_months(
    month: int, year: int, request: GenerateMonthsRequest, db: Session = Depends(get_db)
):
    """Generate forecasted values for a series of future months.

    Steps:
    1. Normalize the requested month count to between 1 and 12.
    2. Determine the set of loan-based items to exclude from regular asset appreciation.
    3. For each generated month:
       a. Move to the next month.
       b. Carry forward and appreciate asset values.
       c. Carry forward and update income/expense values, including loan EMI logic.
       d. Reconcile any income/expense items linked to assets.
       e. Persist the calculated values and commit the transaction.
    """
    num_months = request.num_months
    if num_months < 1:
        num_months = 1
    if num_months > 12:
        num_months = 12

    generated = []
    current_month = month
    current_year = year

    # Identify all loan-related income/expense entries so they can be handled separately
    # from regular item appreciation and month value generation.
    loan_ids = {
        l.id
        for l in db.query(IncomeExpenseModel)
        .filter(IncomeExpenseModel.interest_rate.isnot(None))
        .all()
    }

    current_asset_values = {}

    for _ in range(num_months):
        source_month = current_month
        source_year = current_year

        # Advance to the next month before generating values for that target month.
        current_month, current_year = get_next_month(current_month, current_year)

        # Load the previous month's item values so appreciation can be applied from the
        # source month to the new target month.
        item_values = (
            db.query(MonthValueModel)
            .filter(
                and_(
                    MonthValueModel.month == source_month,
                    MonthValueModel.year == source_year,
                )
            )
            .all()
        )
        prev_item_values = {
            v.item_id: v.value for v in item_values if v.item_id not in loan_ids
        }

        items = db.query(ItemModel).all()
        print(
            f"\n=== Generating Month {current_month}/{current_year} from {source_month}/{source_year} ==="
        )
        for item in items:
            if not is_active_in_month(item, current_month, current_year):
                continue
            if item.id in loan_ids:
                continue

            prev_value = prev_item_values.get(item.id, 0)
            new_value = apply_appreciation(
                prev_value,
                item.appreciation_rate,
                item.appreciation_frequency,
                current_month,
            )

            print(
                f"[{item.name}] prev={prev_value}, appreciation_rate={item.appreciation_rate}, freq={item.appreciation_frequency} -> new={new_value}"
            )

            current_asset_values[item.id] = new_value

        # Load previous month income/expense values so recurring amounts and loan balances
        # can be rolled forward into the target month.
        ie_values = (
            db.query(IncomeExpenseValueModel)
            .filter(
                and_(
                    IncomeExpenseValueModel.month == source_month,
                    IncomeExpenseValueModel.year == source_year,
                )
            )
            .all()
        )
        prev_ie_values = {v.item_id: v.value for v in ie_values}
        prev_ie_balances = {
            v.item_id: v.balance_outstanding
            if v.balance_outstanding is not None
            else v.value
            for v in ie_values
        }

        loan_balance_outstanding = {}

        # Track newly calculated IE values for this month (for asset link calculation)
        new_ie_values = {}

        ie_items = db.query(IncomeExpenseModel).all()
        for item in ie_items:
            if not is_active_in_month(item, current_month, current_year):
                continue

            prev_value = prev_ie_values.get(item.id, 0)
            new_balance = None

            is_loan = item.interest_rate and item.emi_start_year

            if is_loan:
                if not prev_ie_balances.get(item.id):
                    print(
                        f"[Loan-{item.name}] skipping: no balance_outstanding in source month"
                    )
                    continue

                outstanding = prev_ie_balances[item.id]

                is_pre_emi = item.emi_start_year and (
                    current_year < item.emi_start_year
                    or (
                        current_year == item.emi_start_year
                        and current_month < (item.emi_start_month or 1)
                    )
                )

                if is_pre_emi or not item.fixed_emi_amount:
                    new_value = round(outstanding * item.interest_rate / 1200)
                    new_balance = outstanding
                    print(
                        f"[Loan-{item.name}] pre_emi: outstanding={outstanding}, interest={new_value}, rate={item.interest_rate}"
                    )
                else:
                    comps = calculate_loan_components(
                        outstanding, item.interest_rate, item.fixed_emi_amount
                    )
                    new_balance = comps["new_balance"]
                    loan_balance_outstanding[item.id] = new_balance

                    print(
                        f"[Loan-{item.name}] outstanding={outstanding}, emi={item.fixed_emi_amount}, rate={item.interest_rate}"
                    )
                    print(
                        f"  -> principal={comps['principal']}, interest={comps['interest']}, new_balance={new_balance}"
                    )
                    new_value = item.fixed_emi_amount
            else:
                freq = item.appreciation_frequency
                new_value = apply_appreciation(
                    prev_value,
                    item.appreciation_rate,
                    freq,
                    current_month,
                )
                print(
                    f"[IE-{item.name}] prev={prev_value}, appreciation_rate={item.appreciation_rate}, freq={freq} -> new={new_value}"
                )

            existing = (
                db.query(IncomeExpenseValueModel)
                .filter(
                    and_(
                        IncomeExpenseValueModel.month == current_month,
                        IncomeExpenseValueModel.year == current_year,
                        IncomeExpenseValueModel.item_id == item.id,
                    )
                )
                .first()
            )
            new_balance = new_balance if is_loan else None
            if existing:
                existing.value = new_value
                existing.balance_outstanding = new_balance
            else:
                new_val = IncomeExpenseValueModel(
                    month=current_month,
                    year=current_year,
                    item_id=item.id,
                    value=new_value,
                    balance_outstanding=new_balance,
                )
                db.add(new_val)

            # Track for asset link calculation
            new_ie_values[item.id] = new_value

        ie_items = (
            db.query(IncomeExpenseModel)
            .filter(IncomeExpenseModel.associated_asset_id.isnot(None))
            .all()
        )
        print(f"[AssetLink] Found {len(ie_items)} items with associated_asset_id")
        log_msg(
            f"[AssetLink] Found {len(ie_items)} items in month {current_month}/{current_year}"
        )

        for ie_item in ie_items:
            if not is_active_in_month(ie_item, current_month, current_year):
                print(
                    f"[AssetLink] SKIP {ie_item.name}: not active in {current_month}/{current_year}"
                )
                continue
            if not applies_this_month(ie_item, current_month):
                print(f"[AssetLink] SKIP {ie_item.name}: does not apply this month")
                continue

            asset_id = ie_item.associated_asset_id
            if not asset_id:
                continue
            if asset_id not in current_asset_values:
                log_msg(
                    f"[AssetLink] SKIP {ie_item.name}: asset_id {asset_id} not in current_asset_values (keys: {list(current_asset_values.keys())})"
                )
                continue

            # Use new_ie_values (calculated for this target month)
            value = new_ie_values.get(ie_item.id, 0)

            log_msg(
                f"[AssetLink-{ie_item.name}] type={ie_item.ie_type}, value={value}, current_asset_values before={current_asset_values.get(asset_id)}"
            )
            if ie_item.ie_type == "income":
                current_asset_values[asset_id] = (
                    current_asset_values.get(asset_id, 0) + value
                )
                print(
                    f"  -> added {value} to asset {asset_id}, new asset value: {current_asset_values[asset_id]}"
                )
            elif ie_item.ie_type == "expense":
                current_asset_values[asset_id] = (
                    current_asset_values.get(asset_id, 0) - value
                )
                print(
                    f"  -> deducted {value} from asset {asset_id}, new asset value: {current_asset_values[asset_id]}"
                )
            log_msg(f"[AssetLink] Final current_asset_values: {current_asset_values}")

        for asset_id, asset_value in current_asset_values.items():
            log_msg(f"[Final-Asset-{asset_id}] value={asset_value}")
            existing = (
                db.query(MonthValueModel)
                .filter(
                    and_(
                        MonthValueModel.month == current_month,
                        MonthValueModel.year == current_year,
                        MonthValueModel.item_id == asset_id,
                    )
                )
                .all()
            )
            print(f"  -> found {len(existing)} existing record(s)")
            if len(existing) > 1:
                for dup in existing[1:]:
                    db.delete(dup)
            if existing:
                existing[0].value = asset_value
            else:
                new_val = MonthValueModel(
                    month=current_month,
                    year=current_year,
                    item_id=asset_id,
                    value=asset_value,
                )
                print(f"  -> inserting new record for {asset_id}")
                db.add(new_val)

        # Persist all generated values for the new month and record the generated month.
        db.commit()
        generated.append({"month": current_month, "year": current_year})

    return GenerateMonthsResponse(generated=generated)

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import and_, text
from typing import List
from datetime import datetime
import uuid
import logging
from database import engine, get_db, Base
from models import (
    AssetLiability as AssetLiabilityModel,
    MonthValue as MonthValueModel,
    IncomeExpense as IncomeExpenseModel,
    IncomeExpenseValue as IncomeExpenseValueModel,
    Event as EventModel,
    EventImpact as EventImpactModel,
)
from schemas import (
    AssetLiabilityCreate,
    AssetLiability as AssetLiabilitySchema,
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
    try:
        conn.execute(text("ALTER TABLE items RENAME TO assets_liabilities"))
        conn.commit()
    except Exception:
        pass

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

    for col, col_type in [
        ("loan_balance", "REAL"),
        ("interest_rate", "REAL"),
        ("emi_start_month", "INTEGER"),
        ("emi_start_year", "INTEGER"),
        ("emi_end_month", "INTEGER"),
        ("emi_end_year", "INTEGER"),
        ("fixed_emi_amount", "REAL"),
    ]:
        try:
            conn.execute(
                text(f"ALTER TABLE assets_liabilities ADD COLUMN {col} {col_type}")
            )
            conn.commit()
        except Exception:
            pass

    for col, col_type in [("is_loan", "INTEGER")]:
        try:
            conn.execute(
                text(f"ALTER TABLE assets_liabilities ADD COLUMN {col} {col_type}")
            )
            conn.commit()
        except Exception:
            pass

    try:
        conn.execute(
            text("ALTER TABLE assets_liabilities ADD COLUMN associated_asset_id TEXT")
        )
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(text("ALTER TABLE income_expenses ADD COLUMN is_loan INTEGER"))
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(
            text(
                "UPDATE assets_liabilities SET is_loan = 1 WHERE loan_balance IS NOT NULL"
            )
        )
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(
            text("UPDATE assets_liabilities SET is_loan = 0 WHERE is_loan IS NULL")
        )
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(
            text(
                "UPDATE income_expenses SET is_loan = 1 WHERE interest_rate IS NOT NULL"
            )
        )
        conn.commit()
    except Exception:
        pass

    try:
        conn.execute(
            text("UPDATE income_expenses SET is_loan = 0 WHERE is_loan IS NULL")
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

    for col, col_type in [
        ("interest_amount", "REAL"),
        ("principal_amount", "REAL"),
    ]:
        try:
            conn.execute(
                text(f"ALTER TABLE income_expense_values ADD COLUMN {col} {col_type}")
            )
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


@app.post("/assets-liabilities", response_model=AssetLiabilitySchema)
def create_asset_liability(item: AssetLiabilityCreate, db: Session = Depends(get_db)):
    if item.is_loan:
        if not item.interest_rate:
            raise HTTPException(
                status_code=400, detail="Interest rate is required for loans"
            )
        if (
            not item.emi_start_month
            or not item.emi_start_year
            or not item.emi_end_month
            or not item.emi_end_year
        ):
            raise HTTPException(
                status_code=400, detail="EMI start and end dates are required for loans"
            )
        if item.loan_balance is None:
            item = item.model_copy(update={"loan_balance": 0})
        emi_start = datetime(item.emi_start_year, item.emi_start_month, 1)
        if emi_start <= datetime.now() and not item.fixed_emi_amount:
            raise HTTPException(
                status_code=400,
                detail="Fixed EMI amount is required when EMI has already started",
            )

    if item.associated_asset_id:
        if item.is_loan and item.associated_asset_id == item.id:
            raise HTTPException(
                status_code=400, detail="Loan cannot be associated with itself"
            )
        target = (
            db.query(AssetLiabilityModel)
            .filter(AssetLiabilityModel.id == item.associated_asset_id)
            .first()
        )
        if not target:
            raise HTTPException(status_code=400, detail="Associated asset not found")
        if target.is_loan:
            raise HTTPException(
                status_code=400, detail="Cannot associate with another loan"
            )
        if target.item_type != "asset":
            raise HTTPException(
                status_code=400, detail="Associated item must be an asset"
            )
        if target.liquidity != "liquid":
            raise HTTPException(
                status_code=400, detail="Associated asset must be a liquid asset"
            )

    db_item = AssetLiabilityModel(id=uuid.uuid4().hex, **item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)

    if db_item.is_loan:
        ie_item = IncomeExpenseModel(
            id=uuid.uuid4().hex,
            name=f"{db_item.name} EMI",
            ie_type="expense",
            is_loan=True,
            associated_asset_id=db_item.id,
            frequency="monthly",
            order=0,
        )
        db.add(ie_item)
        db.commit()

    return db_item


@app.get("/assets-liabilities", response_model=List[AssetLiabilitySchema])
def get_assets_liabilities(db: Session = Depends(get_db)):
    return db.query(AssetLiabilityModel).order_by(AssetLiabilityModel.id).all()


@app.delete("/assets-liabilities/{item_id}")
def delete_asset_liability(item_id: str, db: Session = Depends(get_db)):
    item = (
        db.query(AssetLiabilityModel).filter(AssetLiabilityModel.id == item_id).first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Asset/Liability not found")
    linked_ie_items = (
        db.query(IncomeExpenseModel)
        .filter(IncomeExpenseModel.associated_asset_id == item_id)
        .all()
    )
    for ie_item in linked_ie_items:
        db.query(IncomeExpenseValueModel).filter(
            IncomeExpenseValueModel.item_id == ie_item.id
        ).delete()
    db.query(IncomeExpenseModel).filter(
        IncomeExpenseModel.associated_asset_id == item_id
    ).delete()
    db.query(MonthValueModel).filter(MonthValueModel.item_id == item_id).delete()
    db.delete(item)
    db.commit()
    return {"message": "Asset/Liability deleted"}


@app.put("/assets-liabilities/{item_id}", response_model=AssetLiabilitySchema)
def update_asset_liability(
    item_id: str, item: AssetLiabilityCreate, db: Session = Depends(get_db)
):
    if item.is_loan:
        if not item.interest_rate:
            raise HTTPException(
                status_code=400, detail="Interest rate is required for loans"
            )
        if (
            not item.emi_start_month
            or not item.emi_start_year
            or not item.emi_end_month
            or not item.emi_end_year
        ):
            raise HTTPException(
                status_code=400, detail="EMI start and end dates are required for loans"
            )
        emi_start = datetime(item.emi_start_year, item.emi_start_month, 1)
        if emi_start <= datetime.now() and not item.fixed_emi_amount:
            raise HTTPException(
                status_code=400,
                detail="Fixed EMI amount is required when EMI has already started",
            )

    if item.associated_asset_id:
        if item.is_loan and item.associated_asset_id == item_id:
            raise HTTPException(
                status_code=400, detail="Loan cannot be associated with itself"
            )
        target = (
            db.query(AssetLiabilityModel)
            .filter(AssetLiabilityModel.id == item.associated_asset_id)
            .first()
        )
        if not target:
            raise HTTPException(status_code=400, detail="Associated asset not found")
        if target.is_loan:
            raise HTTPException(
                status_code=400, detail="Cannot associate with another loan"
            )
        if target.item_type != "asset":
            raise HTTPException(
                status_code=400, detail="Associated item must be an asset"
            )
        if target.liquidity != "liquid":
            raise HTTPException(
                status_code=400, detail="Associated asset must be a liquid asset"
            )

    db_item = (
        db.query(AssetLiabilityModel).filter(AssetLiabilityModel.id == item_id).first()
    )
    if not db_item:
        raise HTTPException(status_code=404, detail="Asset/Liability not found")
    for k, v in item.model_dump().items():
        setattr(db_item, k, v)
    db.commit()
    db.refresh(db_item)

    return db_item


@app.get("/month-values/{month}/{year}", response_model=MonthValuesResponse)
def get_month_values(month: int, year: int, db: Session = Depends(get_db)):
    values = (
        db.query(MonthValueModel)
        .filter(and_(MonthValueModel.month == month, MonthValueModel.year == year))
        .all()
    )
    value_map = {v.item_id: v.value for v in values}
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
        .filter(IncomeExpenseModel.is_loan == True)
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


@app.post("/events/{event_id}/apply")
def apply_event(event_id: str, db: Session = Depends(get_db)):
    db_event = db.query(EventModel).filter(EventModel.id == event_id).first()
    if not db_event:
        raise HTTPException(status_code=404, detail="Event not found")
    if db_event.start_month is None or db_event.start_year is None:
        raise HTTPException(status_code=400, detail="Event has no start date")
    regenerate_after(db, db_event.start_month, db_event.start_year)
    return {"message": "Event applied"}


def get_summary(month: int, year: int, db: Session):
    items = db.query(AssetLiabilityModel).all()
    values = (
        db.query(MonthValueModel)
        .filter(and_(MonthValueModel.month == month, MonthValueModel.year == year))
        .all()
    )
    value_map = {v.item_id: v.value for v in values}

    loan_assets = {item.id: item for item in items if item.is_loan}

    current_assets = 0.0
    liquid_liabilities = 0.0
    semi_liquid_assets = 0.0
    retirement_assets = 0.0
    property_assets = 0.0
    fixed_liabilities = 0.0
    loan_liabilities = 0.0
    for item in items:
        if item.id in loan_assets:
            loan_liabilities += value_map.get(item.id, 0.0)
            continue
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
    ie_interest_map = {v.item_id: v.interest_amount for v in ie_values}
    ie_principal_map = {v.item_id: v.principal_amount for v in ie_values}
    total_income = 0.0
    total_expense = 0.0
    loan_interest = 0.0
    loan_emi = 0.0

    ie_items_by_loan = {}
    regular_ie_items = []
    for item in ie_items:
        if not is_active_in_month(item, month, year):
            continue
        if not applies_this_month(item, month):
            continue
        if item.associated_asset_id and item.associated_asset_id in loan_assets:
            if item.associated_asset_id not in ie_items_by_loan:
                ie_items_by_loan[item.associated_asset_id] = []
            ie_items_by_loan[item.associated_asset_id].append(item)
        else:
            regular_ie_items.append(item)

    for item in regular_ie_items:
        if item.ie_type == "income":
            total_income += ie_value_map.get(item.id, 0.0)
        elif item.ie_type == "expense":
            total_expense += ie_value_map.get(item.id, 0.0)

    for loan_id, loan_items in ie_items_by_loan.items():
        loan = loan_assets[loan_id]
        is_pre_emi = loan.emi_start_year and (
            year < loan.emi_start_year
            or (year == loan.emi_start_year and month < (loan.emi_start_month or 1))
        )
        is_active_emi = loan.emi_start_year and (
            year > loan.emi_start_year
            or (year == loan.emi_start_year and month >= (loan.emi_start_month or 1))
        )
        has_ended = (
            loan.emi_end_year
            and loan.emi_end_month
            and (
                (year > loan.emi_end_year)
                or (year == loan.emi_end_year and month > loan.emi_end_month)
            )
        )
        if has_ended:
            continue
        for item in loan_items:
            ie_value = ie_value_map.get(item.id, 0)
            total_expense += ie_value
            loan_interest += ie_interest_map.get(item.id) or 0
            loan_emi += ie_principal_map.get(item.id) or 0
    impacts = get_active_impacts_for_month(db, month, year)
    if impacts:
        value_map, _ = apply_event_impacts(impacts, value_map, {}, month, year)
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
    net_cashflow = total_income - total_expense
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
        ie_item = (
            db.query(IncomeExpenseModel)
            .filter(IncomeExpenseModel.id == item_id)
            .first()
        )
        interest_amount = None
        principal_amount = None
        if ie_item and ie_item.associated_asset_id:
            loan = (
                db.query(AssetLiabilityModel)
                .filter(AssetLiabilityModel.id == ie_item.associated_asset_id)
                .first()
            )
            if loan and loan.is_loan:
                month_values = (
                    db.query(MonthValueModel)
                    .filter(
                        and_(
                            MonthValueModel.month == month,
                            MonthValueModel.year == year,
                            MonthValueModel.item_id == loan.id,
                        )
                    )
                    .first()
                )
                loan_balance = (
                    month_values.value if month_values else (loan.loan_balance or 0)
                )
                interest_amount = round(loan_balance * (loan.interest_rate or 0) / 1200)
                is_pre_emi = loan.emi_start_year and (
                    year < loan.emi_start_year
                    or (
                        year == loan.emi_start_year
                        and month < (loan.emi_start_month or 1)
                    )
                )
                is_active_emi = loan.emi_start_year and (
                    year > loan.emi_start_year
                    or (
                        year == loan.emi_start_year
                        and month >= (loan.emi_start_month or 1)
                    )
                )
                has_ended = (
                    loan.emi_end_year
                    and loan.emi_end_month
                    and (
                        (year > loan.emi_end_year)
                        or (year == loan.emi_end_year and month > loan.emi_end_month)
                    )
                )
                if has_ended:
                    interest_amount = 0
                    principal_amount = 0
                elif is_pre_emi:
                    principal_amount = 0
                elif is_active_emi:
                    principal_amount = max(0, value - interest_amount)
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
            existing.interest_amount = interest_amount
            existing.principal_amount = principal_amount
        else:
            db.add(
                IncomeExpenseValueModel(
                    month=month,
                    year=year,
                    item_id=item_id,
                    value=value,
                    interest_amount=interest_amount,
                    principal_amount=principal_amount,
                )
            )
    db.commit()
    return {"message": "Income/Expense values saved"}


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


@app.post("/regenerate-all")
def regenerate_all(db: Session = Depends(get_db)):
    all_snapshots = (
        db.query(MonthValueModel.month, MonthValueModel.year)
        .distinct()
        .order_by(MonthValueModel.year, MonthValueModel.month)
        .all()
    )
    if not all_snapshots:
        return {"message": "No snapshots to regenerate"}
    first_snapshot = all_snapshots[0]
    regenerate_after(db, first_snapshot.month, first_snapshot.year)
    return {"message": "All months regenerated"}


def _regenerate_single_month(
    db: Session,
    src_m: int,
    src_y: int,
    tgt_m: int,
    tgt_y: int,
):
    print(f"\n{'=' * 60}")
    print(f"_regenerate_single_month: {src_m}/{src_y} -> {tgt_m}/{tgt_y}")
    print(f"{'=' * 60}")

    loan_assets = {
        item.id: item for item in db.query(AssetLiabilityModel).all() if item.is_loan
    }
    loan_ids = set(loan_assets.keys())
    print(f"[Setup] Found {len(loan_ids)} loans: {loan_ids}")

    item_values = (
        db.query(MonthValueModel)
        .filter(and_(MonthValueModel.month == src_m, MonthValueModel.year == src_y))
        .all()
    )
    prev_item_values = {v.item_id: v.value for v in item_values}
    print(f"[Setup] Loaded {len(prev_item_values)} previous asset values")

    current_asset_values = {}
    items = db.query(AssetLiabilityModel).all()
    print(f"[Assets] Processing {len(items)} items")
    for item in items:
        if not is_active_in_month(item, tgt_m, tgt_y):
            print(f"[Assets] SKIP {item.name}: not active in {tgt_m}/{tgt_y}")
            continue

        if item.id in loan_ids:
            loan = loan_assets[item.id]
            prev_loan_balance = prev_item_values.get(item.id, 0)
            print(
                f"[Loan-{item.name}] prev_balance={prev_loan_balance}, interest_rate={loan.interest_rate}%, emi={loan.fixed_emi_amount}, emi_start={loan.emi_start_month}/{loan.emi_start_year}, emi_end={loan.emi_end_month}/{loan.emi_end_year}"
            )

            is_pre_emi = loan.emi_start_year and (
                tgt_y < loan.emi_start_year
                or (
                    tgt_y == loan.emi_start_year and tgt_m < (loan.emi_start_month or 1)
                )
            )
            is_active_emi = loan.emi_start_year and (
                tgt_y > loan.emi_start_year
                or (
                    tgt_y == loan.emi_start_year
                    and tgt_m >= (loan.emi_start_month or 1)
                )
            )
            has_ended = (
                loan.emi_end_year
                and loan.emi_end_month
                and (
                    tgt_y > loan.emi_end_year
                    or (tgt_y == loan.emi_end_year and tgt_m > loan.emi_end_month)
                )
            )
            print(
                f"[Loan-{item.name}] is_pre_emi={is_pre_emi}, is_active_emi={is_active_emi}, has_ended={has_ended}"
            )

            if has_ended or not prev_loan_balance:
                current_asset_values[item.id] = prev_loan_balance
                print(f"[Loan-{item.name}] END: no change, balance={prev_loan_balance}")
                continue

            interest = round(prev_loan_balance * (loan.interest_rate or 0) / 1200)
            print(
                f"[Loan-{item.name}] Computed interest: {prev_loan_balance} * {loan.interest_rate or 0} / 1200 = {interest}"
            )

            if is_pre_emi:
                current_asset_values[item.id] = prev_loan_balance
                print(
                    f"[Loan-{item.name}] PRE-EMI: balance unchanged at {prev_loan_balance}"
                )
                if loan.associated_asset_id:
                    associated_val = current_asset_values.get(
                        loan.associated_asset_id, 0
                    )
                    current_asset_values[loan.associated_asset_id] = (
                        associated_val - interest
                    )
                    print(
                        f"[Loan-{item.name}] PRE-EMI: deducted interest={interest} from associated_asset_id={loan.associated_asset_id}, new asset value={current_asset_values[loan.associated_asset_id]}"
                    )
            elif is_active_emi:
                emi = loan.fixed_emi_amount or 0
                principal = max(0, emi - interest)
                new_balance = max(0, prev_loan_balance - principal)
                current_asset_values[item.id] = new_balance
                print(
                    f"[Loan-{item.name}] ACTIVE-EMI: emi={emi}, principal={principal}, new_balance={new_balance}"
                )
                if loan.associated_asset_id:
                    associated_val = current_asset_values.get(
                        loan.associated_asset_id, 0
                    )
                    current_asset_values[loan.associated_asset_id] = (
                        associated_val - emi
                    )
                    print(
                        f"[Loan-{item.name}] ACTIVE-EMI: deducted full emi={emi} from associated_asset_id={loan.associated_asset_id}, new asset value={current_asset_values[loan.associated_asset_id]}"
                    )
            else:
                current_asset_values[item.id] = prev_loan_balance
                print(
                    f"[Loan-{item.name}] NO-EMI: balance unchanged at {prev_loan_balance}"
                )
            continue
        prev_value = prev_item_values.get(item.id, 0)
        new_value = apply_appreciation(
            prev_value, item.appreciation_rate, item.appreciation_frequency, tgt_m
        )
        print(
            f"[Asset-{item.name}] prev={prev_value}, appreciation_rate={item.appreciation_rate}, freq={item.appreciation_frequency}, month={tgt_m} -> new={new_value}"
        )
        current_asset_values[item.id] = new_value

    print(f"[Assets] Final asset values after processing: {current_asset_values}")
    print(f"[Assets] Total assets: {len(current_asset_values)}")

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
    print(
        f"[IE-Setup] Loaded {len(prev_ie_values)} previous IE values from {src_m}/{src_y}"
    )

    new_ie_values = {}
    print(f"[IE-Processing] Starting income/expense processing")

    # First calculate interest/principal for loan-linked IE items
    ie_items_linked_to_loans = (
        db.query(IncomeExpenseModel)
        .filter(IncomeExpenseModel.associated_asset_id.in_(loan_ids))
        .all()
    )
    print(f"[IE-Loan] Found {len(ie_items_linked_to_loans)} IE items linked to loans")
    for ie_item in ie_items_linked_to_loans:
        if not is_active_in_month(ie_item, tgt_m, tgt_y):
            print(f"[IE-Loan-{ie_item.name}] SKIP: not active in {tgt_m}/{tgt_y}")
            continue
        if not applies_this_month(ie_item, tgt_m):
            print(f"[IE-Loan-{ie_item.name}] SKIP: does not apply this month")
            continue

        loan = loan_assets.get(ie_item.associated_asset_id)
        if not loan:
            continue

        loan_balance = current_asset_values.get(ie_item.associated_asset_id, 0)
        print(
            f"[IE-Loan-{ie_item.name}] loan_balance={loan_balance}, loan_interest_rate={loan.interest_rate}%"
        )

        is_pre_emi = loan.emi_start_year and (
            tgt_y < loan.emi_start_year
            or (tgt_y == loan.emi_start_year and tgt_m < (loan.emi_start_month or 1))
        )
        is_active_emi = loan.emi_start_year and (
            tgt_y > loan.emi_start_year
            or (tgt_y == loan.emi_start_year and tgt_m >= (loan.emi_start_month or 1))
        )
        has_ended = (
            loan.emi_end_year
            and loan.emi_end_month
            and (
                tgt_y > loan.emi_end_year
                or (tgt_y == loan.emi_end_year and tgt_m > loan.emi_end_month)
            )
        )

        if has_ended or not loan_balance:
            new_ie_values[ie_item.id] = 0
            print(f"[IE-Loan-{ie_item.name}] END: loan ended or no balance, value=0")
            continue

        interest = round(loan_balance * (loan.interest_rate or 0) / 1200)
        print(
            f"[IE-Loan-{ie_item.name}] computed interest: {loan_balance} * {loan.interest_rate or 0} / 1200 = {interest}"
        )

        if is_pre_emi:
            new_ie_values[ie_item.id] = interest
            print(f"[IE-Loan-{ie_item.name}] PRE-EMI: value={interest} (interest only)")
        elif is_active_emi:
            emi = loan.fixed_emi_amount or 0
            principal = max(0, emi - interest)
            new_ie_values[ie_item.id] = principal
            print(
                f"[IE-Loan-{ie_item.name}] ACTIVE-EMI: emi={emi}, principal={principal}, value={principal}"
            )

    # Then process regular IE items
    ie_items = db.query(IncomeExpenseModel).all()
    print(f"[IE-Regular] Processing {len(ie_items)} regular IE items")
    for item in ie_items:
        if not is_active_in_month(item, tgt_m, tgt_y):
            print(f"[IE-Regular-{item.name}] SKIP: not active in {tgt_m}/{tgt_y}")
            continue
        if item.associated_asset_id and item.associated_asset_id in loan_ids:
            print(f"[IE-Regular-{item.name}] SKIP: linked to loan (handled separately)")
            continue
        prev_value = prev_ie_values.get(item.id, 0)
        new_value = apply_appreciation(
            prev_value, item.appreciation_rate, item.appreciation_frequency, tgt_m
        )
        print(
            f"[IE-Regular-{item.name}] prev={prev_value}, rate={item.appreciation_rate}, freq={item.appreciation_frequency} -> new={new_value}"
        )
        new_ie_values[item.id] = new_value

    print(f"[IE-Regular] Final IE values: {new_ie_values}")

    ie_with_asset = (
        db.query(IncomeExpenseModel)
        .filter(IncomeExpenseModel.associated_asset_id.isnot(None))
        .all()
    )
    print(f"[AssetLink] Found {len(ie_with_asset)} IE items with associated assets")
    for ie_item in ie_with_asset:
        if ie_item.associated_asset_id in loan_ids:
            print(f"[AssetLink-{ie_item.name}] SKIP: linked to loan")
            continue
        if not is_active_in_month(ie_item, tgt_m, tgt_y):
            print(f"[AssetLink-{ie_item.name}] SKIP: not active in {tgt_m}/{tgt_y}")
            continue
        if not applies_this_month(ie_item, tgt_m):
            print(f"[AssetLink-{ie_item.name}] SKIP: does not apply this month")
            continue
        asset_id = ie_item.associated_asset_id
        if not asset_id or asset_id not in current_asset_values:
            print(
                f"[AssetLink-{ie_item.name}] SKIP: asset_id={asset_id} not in current_asset_values"
            )
            continue
        value = new_ie_values.get(ie_item.id, 0)
        print(
            f"[AssetLink-{ie_item.name}] type={ie_item.ie_type}, value={value}, asset_before={current_asset_values.get(asset_id)}"
        )
        if ie_item.ie_type == "income":
            current_asset_values[asset_id] += value
            print(
                f"[AssetLink-{ie_item.name}] ADDED {value} to asset {asset_id}, new value={current_asset_values[asset_id]}"
            )
        elif ie_item.ie_type == "expense":
            current_asset_values[asset_id] -= value
            print(
                f"[AssetLink-{ie_item.name}] DEDUCTED {value} from asset {asset_id}, new value={current_asset_values[asset_id]}"
            )

    print(f"[AssetLink] Final asset values after IE linking: {current_asset_values}")

    impacts = get_active_impacts_for_month(db, tgt_m, tgt_y)
    print(
        f"[Events] Found {len(impacts) if impacts else 0} event impacts for {tgt_m}/{tgt_y}"
    )
    if impacts:
        print(f"[Events] Processing {len(impacts)} event impacts:")
        for imp in impacts:
            print(
                f"  - {imp.name}: target_type={imp.target_type}, target_id={imp.target_id}, amount={imp.amount}, is_additive={imp.is_additive}"
            )

        current_asset_values, _ = apply_event_impacts(
            impacts, current_asset_values, {}, tgt_m, tgt_y
        )
        print(f"[Events] Asset values after event impacts: {current_asset_values}")

        for imp in impacts:
            if imp.target_type in ("income", "expense"):
                sign = 1 if imp.is_additive else -1
                old_val = new_ie_values.get(imp.target_id, 0)
                new_ie_values[imp.target_id] = old_val + imp.amount * sign
                print(
                    f"[Events] {imp.name}: updated IE target_id={imp.target_id}, old={old_val}, change={imp.amount * sign}, new={new_ie_values[imp.target_id]}"
                )

    print(f"[Events] Final IE values after events: {new_ie_values}")

    print(
        f"[Persist] Saving {len(current_asset_values)} asset values for {tgt_m}/{tgt_y}"
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
            print(f"[Persist] Asset {item_id}: updated value={value}")
        else:
            db.add(
                MonthValueModel(month=tgt_m, year=tgt_y, item_id=item_id, value=value)
            )
            print(f"[Persist] Asset {item_id}: inserted new value={value}")

    print(f"[Persist] Saving {len(new_ie_values)} IE values for {tgt_m}/{tgt_y}")
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
            print(f"[Persist] IE {item_id}: updated value={value}")
        else:
            db.add(
                IncomeExpenseValueModel(
                    month=tgt_m, year=tgt_y, item_id=item_id, value=value
                )
            )
            print(f"[Persist] IE {item_id}: inserted new value={value}")

    print(f"[Persist] Committing to database...")
    db.commit()
    print(f"[Persist] Done! _regenerate_single_month completed for {tgt_m}/{tgt_y}")


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
    print(f"\n{'=' * 60}")
    print(
        f"generate_months START: month={month}, year={year}, num_months={request.num_months}"
    )
    print(f"{'=' * 60}")

    num_months = request.num_months
    if num_months < 1:
        num_months = 1
    if num_months > 12:
        num_months = 12
    print(f"[Config] Normalized num_months to: {num_months}")

    generated = []
    current_month = month
    current_year = year

    # Identify all loan-related income/expense entries so they can be handled separately
    loan_assets = {
        item.id: item for item in db.query(AssetLiabilityModel).all() if item.is_loan
    }
    loan_ids = set(loan_assets.keys())
    print(f"[Setup] Found {len(loan_ids)} loans: {loan_ids}")

    for loan_id, loan in loan_assets.items():
        print(
            f"  - Loan {loan.name}: interest_rate={loan.interest_rate}%, emi={loan.fixed_emi_amount}, associated_asset_id={loan.associated_asset_id}"
        )

    current_asset_values = {}

    for _ in range(num_months):
        source_month = current_month
        source_year = current_year

        # Advance to the next month before generating values for that target month.
        current_month, current_year = get_next_month(current_month, current_year)

        print("Next Month: " + str(current_month) + "/" + str(current_year))

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
        print("Previous Item Values: " + str(prev_item_values))
        items = db.query(AssetLiabilityModel).all()
        print(
            f"\n=== Generating Month {current_month}/{current_year} from {source_month}/{source_year} ==="
        )
        for item in items:
            if not is_active_in_month(item, current_month, current_year):
                continue

            if item.id in loan_ids:
                loan = loan_assets[item.id]
                prev_loan_balance = prev_item_values.get(item.id, 0)

                is_pre_emi = loan.emi_start_year and (
                    current_year < loan.emi_start_year
                    or (
                        current_year == loan.emi_start_year
                        and current_month < (loan.emi_start_month or 1)
                    )
                )
                is_active_emi = loan.emi_start_year and (
                    current_year > loan.emi_start_year
                    or (
                        current_year == loan.emi_start_year
                        and current_month >= (loan.emi_start_month or 1)
                    )
                )
                has_ended = (
                    loan.emi_end_year
                    and loan.emi_end_month
                    and (
                        current_year > loan.emi_end_year
                        or (
                            current_year == loan.emi_end_year
                            and current_month > loan.emi_end_month
                        )
                    )
                )

                if has_ended or not prev_loan_balance:
                    current_asset_values[item.id] = prev_loan_balance
                    print(
                        f"[Loan-{item.name}] ended or no balance: {prev_loan_balance}"
                    )
                    continue

                interest = round(prev_loan_balance * (loan.interest_rate or 0) / 1200)

                if is_pre_emi:
                    current_asset_values[item.id] = prev_loan_balance
                    if loan.associated_asset_id:
                        associated_val = current_asset_values.get(
                            loan.associated_asset_id, 0
                        )
                        current_asset_values[loan.associated_asset_id] = (
                            associated_val - interest
                        )
                        print(
                            f"[Loan-{item.name}] pre-emi: deducted interest={interest} from associated_asset={loan.associated_asset_id}"
                        )
                    print(
                        f"[Loan-{item.name}] pre-emi: balance={prev_loan_balance}, interest={interest}"
                    )
                elif is_active_emi:
                    emi = loan.fixed_emi_amount or 0
                    principal = max(0, emi - interest)
                    new_balance = max(0, prev_loan_balance - principal)
                    current_asset_values[item.id] = new_balance
                    if loan.associated_asset_id:
                        associated_val = current_asset_values.get(
                            loan.associated_asset_id, 0
                        )
                        current_asset_values[loan.associated_asset_id] = (
                            associated_val - emi
                        )
                        print(
                            f"[Loan-{item.name}] active: deducted emi={emi} from associated_asset={loan.associated_asset_id}"
                        )
                    print(
                        f"[Loan-{item.name}] active: balance={prev_loan_balance}, interest={interest}, principal={principal}, emi={emi}, new_balance={new_balance}"
                    )
                else:
                    current_asset_values[item.id] = prev_loan_balance
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

        print(f"[Assets] Final asset values after processing: {current_asset_values}")
        print(f"[Assets] Total assets: {len(current_asset_values)}")

        # Load previous month income/expense values
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

        # Track newly calculated IE values
        new_ie_values = {}

        # First, calculate interest/principal values for loan-linked IE items
        ie_items_linked_to_loans = (
            db.query(IncomeExpenseModel)
            .filter(IncomeExpenseModel.associated_asset_id.in_(loan_ids))
            .all()
        )
        print(
            f"[IE-Loan] Found {len(ie_items_linked_to_loans)} IE items linked to loans"
        )
        for ie_item in ie_items_linked_to_loans:
            if not is_active_in_month(ie_item, current_month, current_year):
                print(
                    f"[IE-Loan-{ie_item.name}] SKIP: not active in {current_month}/{current_year}"
                )
                continue
            if not applies_this_month(ie_item, current_month):
                print(f"[IE-Loan-{ie_item.name}] SKIP: does not apply this month")
                continue

            loan_id = ie_item.associated_asset_id
            loan = loan_assets.get(loan_id)
            if not loan:
                continue

            loan_balance = current_asset_values.get(loan_id, 0)
            print(
                f"[IE-Loan-{ie_item.name}] loan_balance={loan_balance}, loan_interest_rate={loan.interest_rate}%"
            )

            is_pre_emi = loan.emi_start_year and (
                current_year < loan.emi_start_year
                or (
                    current_year == loan.emi_start_year
                    and current_month < (loan.emi_start_month or 1)
                )
            )
            is_active_emi = loan.emi_start_year and (
                current_year > loan.emi_start_year
                or (
                    current_year == loan.emi_start_year
                    and current_month >= (loan.emi_start_month or 1)
                )
            )
            has_ended = (
                loan.emi_end_year
                and loan.emi_end_month
                and (
                    current_year > loan.emi_end_year
                    or (
                        current_year == loan.emi_end_year
                        and current_month > loan.emi_end_month
                    )
                )
            )

            if has_ended or not loan_balance:
                new_ie_values[ie_item.id] = {
                    "value": 0,
                    "interest_amount": 0,
                    "principal_amount": 0,
                }
                print(
                    f"[IE-Loan-{ie_item.name}] END: loan ended or no balance, value=0"
                )
                continue

            interest = round(loan_balance * (loan.interest_rate or 0) / 1200)
            print(
                f"[IE-Loan-{ie_item.name}] computed interest: {loan_balance} * {loan.interest_rate or 0} / 1200 = {interest}"
            )

            if is_pre_emi:
                new_ie_values[ie_item.id] = {
                    "value": interest,
                    "interest_amount": interest,
                    "principal_amount": 0,
                }
                print(
                    f"[IE-Loan-{ie_item.name}] PRE-EMI: value={interest} (interest only)"
                )
            elif is_active_emi:
                emi = loan.fixed_emi_amount or 0
                principal = max(0, emi - interest)
                new_ie_values[ie_item.id] = {
                    "value": interest + principal,
                    "interest_amount": interest,
                    "principal_amount": principal,
                }
                print(
                    f"[IE-Loan-{ie_item.name}] ACTIVE-EMI: emi={emi}, principal={principal}, value={principal}"
                )

        # Then process regular IE items (not linked to loans)
        ie_items = db.query(IncomeExpenseModel).all()
        print(f"[IE-Regular] Processing {len(ie_items)} regular IE items")
        for item in ie_items:
            if not is_active_in_month(item, current_month, current_year):
                print(
                    f"[IE-Regular-{item.name}] SKIP: not active in {current_month}/{current_year}"
                )
                continue
            if not applies_this_month(item, current_month):
                print(f"[IE-Regular-{item.name}] SKIP: does not apply this month")
                continue
            if item.associated_asset_id and item.associated_asset_id in loan_ids:
                print(
                    f"[IE-Regular-{item.name}] SKIP: linked to loan (handled separately)"
                )
                continue

            prev_value = prev_ie_values.get(item.id, 0)
            freq = item.appreciation_frequency
            new_value = apply_appreciation(
                prev_value,
                item.appreciation_rate,
                freq,
                current_month,
            )
            new_ie_values[item.id] = {
                "value": new_value,
                "interest_amount": None,
                "principal_amount": None,
            }
            print(
                f"[IE-Regular-{item.name}] prev={prev_value}, appreciation_rate={item.appreciation_rate}, freq={freq} -> new={new_value}"
            )

        print(f"[IE-Regular] Final IE values: {new_ie_values}")

        # Save all IE values
        for item_id, ie_data in new_ie_values.items():
            existing = (
                db.query(IncomeExpenseValueModel)
                .filter(
                    and_(
                        IncomeExpenseValueModel.month == current_month,
                        IncomeExpenseValueModel.year == current_year,
                        IncomeExpenseValueModel.item_id == item_id,
                    )
                )
                .first()
            )
            if existing:
                existing.value = ie_data["value"]
                existing.interest_amount = ie_data.get("interest_amount")
                existing.principal_amount = ie_data.get("principal_amount")
            else:
                new_val = IncomeExpenseValueModel(
                    month=current_month,
                    year=current_year,
                    item_id=item_id,
                    value=ie_data["value"],
                    interest_amount=ie_data.get("interest_amount"),
                    principal_amount=ie_data.get("principal_amount"),
                )
                db.add(new_val)

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
            if ie_item.associated_asset_id in loan_ids:
                continue
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

        print(
            f"[AssetLink] Final asset values after IE linking: {current_asset_values}"
        )

        print(
            f"[Persist] Saving {len(current_asset_values)} asset values for {current_month}/{current_year}"
        )
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
                print(f"[Persist] Asset {asset_id}: updated value={asset_value}")
            else:
                new_val = MonthValueModel(
                    month=current_month,
                    year=current_year,
                    item_id=asset_id,
                    value=asset_value,
                )
                print(f"  -> inserting new record for {asset_id}")
                print(
                    f"  -> new_val: month={new_val.month}, year={new_val.year}, item_id={new_val.item_id}, value={new_val.value}"
                )
                db.add(new_val)

        # Persist all generated values for the new month and record the generated month.
        print(f"[Persist] Committing to database...")
        db.commit()
        print(f"[Persist] Done! Generated month {current_month}/{current_year}")
        generated.append({"month": current_month, "year": current_year})

    print(f"generate_months COMPLETE: generated {len(generated)} months")
    return GenerateMonthsResponse(generated=generated)

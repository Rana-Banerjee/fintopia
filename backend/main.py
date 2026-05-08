from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import and_, text
from typing import List
from database import engine, get_db, Base
from models import (
    Item as ItemModel,
    MonthValue as MonthValueModel,
    IncomeExpense as IncomeExpenseModel,
    IncomeExpenseValue as IncomeExpenseValueModel,
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
)

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
    db_item = ItemModel(**item.model_dump())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item


@app.get("/items", response_model=List[ItemSchema])
def get_items(db: Session = Depends(get_db)):
    return db.query(ItemModel).order_by(ItemModel.id).all()


@app.delete("/items/{item_id}")
def delete_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(ItemModel).filter(ItemModel.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    db.query(MonthValueModel).filter(MonthValueModel.item_id == item_id).delete()
    db.delete(item)
    db.commit()
    return {"message": "Item deleted"}


@app.put("/items/{item_id}", response_model=ItemSchema)
def update_item(item_id: int, item: ItemCreate, db: Session = Depends(get_db)):
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
    values = (
        db.query(MonthValueModel)
        .filter(and_(MonthValueModel.month == month, MonthValueModel.year == year))
        .all()
    )
    return MonthValuesResponse(
        month=month,
        year=year,
        values=[{"item_id": v.item_id, "value": v.value} for v in values],
    )


@app.put("/month-values/{month}/{year}")
def save_month_values(month: int, year: int, data: dict, db: Session = Depends(get_db)):
    for item_id, value in data.items():
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
    db.commit()
    return {"message": "Snapshot deleted"}


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
    elif freq == "quarterly":
        return month in [4, 7, 10, 12]
    elif freq == "semi_annual":
        return month in [4, 10]
    elif freq == "yearly":
        return month == 4
    return True


@app.get("/summary", response_model=Summary)
def get_summary(month: int, year: int, db: Session = Depends(get_db)):
    items = db.query(ItemModel).all()
    values = (
        db.query(MonthValueModel)
        .filter(and_(MonthValueModel.month == month, MonthValueModel.year == year))
        .all()
    )

    value_map = {v.item_id: v.value for v in values}

    current_assets = 0.0
    liquid_liabilities = 0.0
    semi_liquid_assets = 0.0
    retirement_assets = 0.0
    property_assets = 0.0
    fixed_liabilities = 0.0

    for item in items:
        value = value_map.get(item.id, 0.0)
        liquidity = item.liquidity

        if item.item_type == "asset":
            if liquidity == "liquid":
                current_assets += value
            elif liquidity == "semi-liquid":
                semi_liquid_assets += value
            elif liquidity == "retirement":
                retirement_assets += value
            elif liquidity == "fixed":
                property_assets += value
        elif item.item_type == "liability":
            if liquidity == "liquid":
                liquid_liabilities += value
            elif liquidity == "fixed":
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

    total_income = 0.0
    total_expense = 0.0

    for item in ie_items:
        if not is_active_in_month(item, month, year):
            continue
        if not applies_this_month(item, month):
            continue
        value = ie_value_map.get(item.id, 0.0)
        if item.ie_type == "income":
            total_income += value
        elif item.ie_type == "expense":
            total_expense += value

    total_assets = (
        current_assets + semi_liquid_assets + retirement_assets + property_assets
    )
    total_liabilities = liquid_liabilities + fixed_liabilities
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
        total_income=total_income,
        total_expense=total_expense,
        net_cashflow=net_cashflow,
    )


@app.post("/income-expenses", response_model=IncomeExpenseSchema)
def create_income_expense(item: IncomeExpenseCreate, db: Session = Depends(get_db)):
    db_item = IncomeExpenseModel(**item.model_dump())
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
def delete_income_expense(item_id: int, db: Session = Depends(get_db)):
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
    item_id: int, item: IncomeExpenseCreate, db: Session = Depends(get_db)
):
    db_item = (
        db.query(IncomeExpenseModel).filter(IncomeExpenseModel.id == item_id).first()
    )
    if not db_item:
        raise HTTPException(status_code=404, detail="Item not found")
    db_item.name = item.name
    db_item.ie_type = item.ie_type
    db_item.frequency = item.frequency
    db_item.appreciation_rate = item.appreciation_rate
    db_item.appreciation_frequency = item.appreciation_frequency
    db_item.start_month = item.start_month
    db_item.start_year = item.start_year
    db_item.end_month = item.end_month
    db_item.end_year = item.end_year
    db_item.order = item.order
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
            new_value = IncomeExpenseValueModel(
                month=month, year=year, item_id=int(item_id), value=value
            )
            db.add(new_value)

    db.commit()
    return {"message": "Income/Expense values saved"}

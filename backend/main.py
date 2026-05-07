from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import and_
from typing import List
from database import engine, get_db, Base
from models import Item as ItemModel, MonthValue as MonthValueModel
from schemas import (
    ItemCreate,
    Item as ItemSchema,
    MonthValueCreate,
    MonthValue as MonthValueSchema,
    MonthValuesResponse,
    Summary,
)

Base.metadata.create_all(bind=engine)

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
        else:
            if liquidity == "liquid":
                liquid_liabilities += value
            elif liquidity == "fixed":
                fixed_liabilities += value

    total_assets = (
        current_assets + semi_liquid_assets + retirement_assets + property_assets
    )
    total_liabilities = liquid_liabilities + fixed_liabilities
    net_worth = total_assets - total_liabilities
    net_cash = (current_assets + semi_liquid_assets) - liquid_liabilities

    return Summary(
        net_worth=net_worth,
        net_cash=net_cash,
        current_assets=current_assets,
        liquid_liabilities=liquid_liabilities,
        semi_liquid_assets=semi_liquid_assets,
        retirement_assets=retirement_assets,
        property_assets=property_assets,
        fixed_liabilities=fixed_liabilities,
    )

from pydantic import BaseModel
from typing import Optional


class ItemBase(BaseModel):
    name: str
    item_type: str
    liquidity: Optional[str] = None
    appreciation_rate: Optional[float] = None
    appreciation_frequency: Optional[str] = None


class ItemCreate(ItemBase):
    pass


class Item(ItemBase):
    id: int

    class Config:
        from_attributes = True


class MonthValueBase(BaseModel):
    month: int
    year: int
    item_id: int
    value: float


class MonthValueCreate(MonthValueBase):
    pass


class MonthValue(MonthValueBase):
    id: int

    class Config:
        from_attributes = True


class MonthValuesResponse(BaseModel):
    month: int
    year: int
    values: list[dict]


class Summary(BaseModel):
    net_worth: float
    net_cash: float
    current_assets: float
    liquid_liabilities: float
    semi_liquid_assets: float
    retirement_assets: float
    property_assets: float
    fixed_liabilities: float

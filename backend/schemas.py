from pydantic import BaseModel
from typing import Optional


class ItemBase(BaseModel):
    name: str
    item_type: str
    liquidity: Optional[str] = None
    appreciation_rate: Optional[float] = None
    appreciation_frequency: Optional[str] = None
    start_month: Optional[int] = None
    start_year: Optional[int] = None
    end_month: Optional[int] = None
    end_year: Optional[int] = None


class ItemCreate(ItemBase):
    pass


class Item(ItemBase):
    id: str

    class Config:
        from_attributes = True


class MonthValueBase(BaseModel):
    month: int
    year: int
    item_id: str
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
    loan_liabilities: float
    total_income: float
    total_expense: float
    loan_interest: float
    loan_emi: float
    net_cashflow: float


class IncomeExpenseBase(BaseModel):
    name: str
    ie_type: str
    frequency: str
    appreciation_rate: Optional[float] = None
    appreciation_frequency: Optional[str] = None
    start_month: Optional[int] = None
    start_year: Optional[int] = None
    end_month: Optional[int] = None
    end_year: Optional[int] = None
    order: int = 0
    interest_rate: Optional[float] = None
    emi_start_month: Optional[int] = None
    emi_start_year: Optional[int] = None
    emi_end_month: Optional[int] = None
    emi_end_year: Optional[int] = None
    balance_disbursed: Optional[float] = None
    associated_asset_id: Optional[str] = None
    is_fixed_emi: bool = False
    fixed_emi_amount: Optional[float] = None


class IncomeExpenseCreate(IncomeExpenseBase):
    pass


class IncomeExpense(IncomeExpenseBase):
    id: str

    class Config:
        from_attributes = True


class IncomeExpenseValueBase(BaseModel):
    month: int
    year: int
    item_id: str
    value: float


class IncomeExpenseValueCreate(IncomeExpenseValueBase):
    pass


class IncomeExpenseValue(IncomeExpenseValueBase):
    id: int

    class Config:
        from_attributes = True


class IncomeExpenseValuesResponse(BaseModel):
    month: int
    year: int
    values: list[dict]


class BankContributionBase(BaseModel):
    month: int
    year: int
    amount: float


class BankContributionCreate(BankContributionBase):
    pass


class BankContribution(BankContributionBase):
    id: int
    income_expense_id: str

    class Config:
        from_attributes = True


class BankContributionListResponse(BaseModel):
    contributions: list[BankContribution]

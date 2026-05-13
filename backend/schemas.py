from pydantic import BaseModel, field_validator
from typing import Optional


class AssetLiabilityBase(BaseModel):
    name: str
    item_type: str
    liquidity: Optional[str] = None
    appreciation_rate: Optional[float] = None
    appreciation_frequency: Optional[str] = None
    start_month: Optional[int] = None
    start_year: Optional[int] = None
    end_month: Optional[int] = None
    end_year: Optional[int] = None
    loan_balance: Optional[float] = None
    interest_rate: Optional[float] = None
    emi_start_month: Optional[int] = None
    emi_start_year: Optional[int] = None
    emi_end_month: Optional[int] = None
    emi_end_year: Optional[int] = None
    fixed_emi_amount: Optional[float] = None
    is_loan: bool = False

    @field_validator("is_loan", mode="before")
    @classmethod
    def convert_is_loan(cls, v):
        if isinstance(v, int):
            return bool(v)
        return v


class AssetLiabilityCreate(AssetLiabilityBase):
    pass


class AssetLiability(AssetLiabilityBase):
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
    associated_asset_id: Optional[str] = None
    is_loan: bool = False


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
    interest_amount: float | None = None
    principal_amount: float | None = None


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


class GenerateMonthsRequest(BaseModel):
    num_months: int = 1


class GenerateMonthsResponse(BaseModel):
    generated: list[dict]


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

from sqlalchemy import Column, Integer, String, Float, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from database import Base


class AssetLiability(Base):
    __tablename__ = "assets_liabilities"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    item_type = Column(String, nullable=False)
    liquidity = Column(String, nullable=True)
    appreciation_rate = Column(Float, nullable=True)
    appreciation_frequency = Column(String, nullable=True)
    start_month = Column(Integer, nullable=True)
    start_year = Column(Integer, nullable=True)
    end_month = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)
    loan_balance = Column(Float, nullable=True)
    interest_rate = Column(Float, nullable=True)
    emi_start_month = Column(Integer, nullable=True)
    emi_start_year = Column(Integer, nullable=True)
    emi_end_month = Column(Integer, nullable=True)
    emi_end_year = Column(Integer, nullable=True)
    fixed_emi_amount = Column(Float, nullable=True)
    is_loan = Column(Boolean, default=False)
    associated_asset_id = Column(
        String, ForeignKey("assets_liabilities.id"), nullable=True
    )

    values = relationship("MonthValue", back_populates="item")
    associated_asset = relationship(
        "AssetLiability", foreign_keys=[associated_asset_id]
    )


class MonthValue(Base):
    __tablename__ = "month_values"

    id = Column(Integer, primary_key=True, index=True)
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    item_id = Column(String, ForeignKey("assets_liabilities.id"), nullable=False)
    value = Column(Float, nullable=False)

    item = relationship("AssetLiability", back_populates="values")


class IncomeExpense(Base):
    __tablename__ = "income_expenses"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    ie_type = Column(String, nullable=False)
    frequency = Column(String, nullable=False)
    appreciation_rate = Column(Float, nullable=True)
    appreciation_frequency = Column(String, nullable=True)
    start_month = Column(Integer, nullable=True)
    start_year = Column(Integer, nullable=True)
    end_month = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)
    order = Column(Integer, nullable=False, default=0)
    is_loan = Column(Boolean, default=False)
    associated_asset_id = Column(
        String, ForeignKey("assets_liabilities.id"), nullable=True
    )

    values = relationship("IncomeExpenseValue", back_populates="item")
    associated_asset = relationship(
        "AssetLiability", foreign_keys=[associated_asset_id]
    )


class IncomeExpenseValue(Base):
    __tablename__ = "income_expense_values"

    id = Column(Integer, primary_key=True, index=True)
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    item_id = Column(String, ForeignKey("income_expenses.id"), nullable=False)
    value = Column(Float, nullable=False)
    interest_amount = Column(Float, nullable=True)
    principal_amount = Column(Float, nullable=True)

    item = relationship("IncomeExpense", back_populates="values")


class Event(Base):
    __tablename__ = "events"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    is_recurring = Column(Boolean, default=False)
    start_month = Column(Integer, nullable=True)
    start_year = Column(Integer, nullable=True)
    frequency_months = Column(Integer, nullable=True)
    duration = Column(Integer, default=1)

    impacts = relationship(
        "EventImpact", back_populates="event", cascade="all, delete-orphan"
    )


class EventImpact(Base):
    __tablename__ = "event_impacts"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(String, ForeignKey("events.id"), nullable=False)
    target_type = Column(String, nullable=False)
    target_id = Column(String, nullable=False)
    amount = Column(Float, nullable=False)
    is_additive = Column(Boolean, default=True)

    event = relationship("Event", back_populates="impacts")

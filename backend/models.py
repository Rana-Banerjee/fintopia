from sqlalchemy import Column, Integer, String, Float, ForeignKey
from sqlalchemy.orm import relationship
from database import Base


class Item(Base):
    __tablename__ = "items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    item_type = Column(String, nullable=False)
    liquidity = Column(String, nullable=True)
    appreciation_rate = Column(Float, nullable=True)
    appreciation_frequency = Column(String, nullable=True)
    start_month = Column(Integer, nullable=True)
    start_year = Column(Integer, nullable=True)
    end_month = Column(Integer, nullable=True)
    end_year = Column(Integer, nullable=True)

    values = relationship("MonthValue", back_populates="item")


class MonthValue(Base):
    __tablename__ = "month_values"

    id = Column(Integer, primary_key=True, index=True)
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    value = Column(Float, nullable=False)

    item = relationship("Item", back_populates="values")


class IncomeExpense(Base):
    __tablename__ = "income_expenses"

    id = Column(Integer, primary_key=True, index=True)
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

    values = relationship("IncomeExpenseValue", back_populates="item")


class IncomeExpenseValue(Base):
    __tablename__ = "income_expense_values"

    id = Column(Integer, primary_key=True, index=True)
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    item_id = Column(Integer, ForeignKey("income_expenses.id"), nullable=False)
    value = Column(Float, nullable=False)

    item = relationship("IncomeExpense", back_populates="values")

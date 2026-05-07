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

    values = relationship("MonthValue", back_populates="item")


class MonthValue(Base):
    __tablename__ = "month_values"

    id = Column(Integer, primary_key=True, index=True)
    month = Column(Integer, nullable=False)
    year = Column(Integer, nullable=False)
    item_id = Column(Integer, ForeignKey("items.id"), nullable=False)
    value = Column(Float, nullable=False)

    item = relationship("Item", back_populates="values")

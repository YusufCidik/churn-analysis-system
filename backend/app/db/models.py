from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint, JSON, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    """
    Simple user entity for role-based access and customer assignment.
    Roles: 'admin', 'employee'
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="employee")

    # Relationships
    assigned_customers: Mapped[list["Customer"]] = relationship(
        "Customer", back_populates="assigned_to"
    )


class Customer(Base):
    """
    Persisted record that stores:
    - raw input demographics (as JSONB)
    - model outputs (churn probability, CLV, risk segment, action plan)
    - freshness tracking (`last_updated`)
    """

    __tablename__ = "customers"
    __table_args__ = (UniqueConstraint("customer_unique_id", name="uq_customers_customer_unique_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    customer_unique_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)

    # Model outputs
    churn_probability: Mapped[float | None] = mapped_column(Float, nullable=True)
    predicted_clv: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_segment: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    action_plan: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_commentary: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Assignment logic
    assigned_to_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    assigned_to: Mapped[User | None] = relationship("User", back_populates="assigned_customers")

    # Raw demographics (portability)
    raw_demographics: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict)

    # Freshness tracking
    last_updated: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        index=True,
    )

    # Common telco demographic/feature columns (optional typed columns)
    gender: Mapped[str | None] = mapped_column(String(32), nullable=True)
    Partner: Mapped[str | None] = mapped_column(String(32), nullable=True)
    Dependents: Mapped[str | None] = mapped_column(String(32), nullable=True)
    PhoneService: Mapped[str | None] = mapped_column(String(32), nullable=True)
    MultipleLines: Mapped[str | None] = mapped_column(String(64), nullable=True)
    InternetService: Mapped[str | None] = mapped_column(String(64), nullable=True)
    OnlineSecurity: Mapped[str | None] = mapped_column(String(64), nullable=True)
    OnlineBackup: Mapped[str | None] = mapped_column(String(64), nullable=True)
    DeviceProtection: Mapped[str | None] = mapped_column(String(64), nullable=True)
    TechSupport: Mapped[str | None] = mapped_column(String(64), nullable=True)
    StreamingTV: Mapped[str | None] = mapped_column(String(64), nullable=True)
    StreamingMovies: Mapped[str | None] = mapped_column(String(64), nullable=True)
    Contract: Mapped[str | None] = mapped_column(String(64), nullable=True)
    PaperlessBilling: Mapped[str | None] = mapped_column(String(32), nullable=True)
    PaymentMethod: Mapped[str | None] = mapped_column(String(64), nullable=True)
    contract_tenure: Mapped[str | None] = mapped_column(String(64), nullable=True)
    charge_segment: Mapped[str | None] = mapped_column(String(64), nullable=True)

    tenure: Mapped[float | None] = mapped_column(Float, nullable=True)
    MonthlyCharges: Mapped[float | None] = mapped_column(Float, nullable=True)
    TotalCharges: Mapped[float | None] = mapped_column(Float, nullable=True)
    spending_velocity: Mapped[float | None] = mapped_column(Float, nullable=True)
    tenure_loyalty: Mapped[float | None] = mapped_column(Float, nullable=True)


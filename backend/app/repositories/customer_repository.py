from __future__ import annotations

from typing import Any

from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..db.models import Customer, User


def upsert_customers(db: Session, customers: list[dict[str, Any]]) -> int:
    """
    Upsert customers by `customer_unique_id`.

    Works for both PostgreSQL and SQLite (dev fallback) using dialect-specific INSERT ... ON CONFLICT.
    """
    if not customers:
        return 0

    values = []
    for c in customers:
        raw = c.get("raw_demographics", c.get("demographics", {})) or {}
        values.append(
            {
                "customer_unique_id": c["customer_unique_id"],
                "churn_probability": c.get("churn_probability"),
                "predicted_clv": c.get("predicted_clv"),
                "risk_segment": c.get("risk_segment"),
                "action_plan": c.get("action_plan"),
                "ai_commentary": c.get("ai_commentary"),
                "raw_demographics": raw,
                "last_updated": func.now(),
                # Typed demo/feature fields for faster dashboard usage.
                "gender": raw.get("gender"),
                "Partner": raw.get("Partner"),
                "Dependents": raw.get("Dependents"),
                "PhoneService": raw.get("PhoneService"),
                "MultipleLines": raw.get("MultipleLines"),
                "InternetService": raw.get("InternetService"),
                "OnlineSecurity": raw.get("OnlineSecurity"),
                "OnlineBackup": raw.get("OnlineBackup"),
                "DeviceProtection": raw.get("DeviceProtection"),
                "TechSupport": raw.get("TechSupport"),
                "StreamingTV": raw.get("StreamingTV"),
                "StreamingMovies": raw.get("StreamingMovies"),
                "Contract": raw.get("Contract"),
                "PaperlessBilling": raw.get("PaperlessBilling"),
                "PaymentMethod": raw.get("PaymentMethod"),
                "contract_tenure": raw.get("contract_tenure"),
                "charge_segment": raw.get("charge_segment"),
                "tenure": raw.get("tenure"),
                "MonthlyCharges": raw.get("MonthlyCharges"),
                "TotalCharges": raw.get("TotalCharges"),
                "spending_velocity": raw.get("spending_velocity"),
                "tenure_loyalty": raw.get("tenure_loyalty"),
            }
        )

    dialect_name = db.get_bind().dialect.name
    if dialect_name == "postgresql":
        stmt = pg_insert(Customer).values(values)
    else:
        stmt = sqlite_insert(Customer).values(values)

    update_fields = {
        "churn_probability": stmt.excluded.churn_probability,
        "predicted_clv": stmt.excluded.predicted_clv,
        "risk_segment": stmt.excluded.risk_segment,
        "action_plan": stmt.excluded.action_plan,
        "ai_commentary": stmt.excluded.ai_commentary,
        "raw_demographics": stmt.excluded.raw_demographics,
        "gender": stmt.excluded.gender,
        "Partner": stmt.excluded.Partner,
        "Dependents": stmt.excluded.Dependents,
        "PhoneService": stmt.excluded.PhoneService,
        "MultipleLines": stmt.excluded.MultipleLines,
        "InternetService": stmt.excluded.InternetService,
        "OnlineSecurity": stmt.excluded.OnlineSecurity,
        "OnlineBackup": stmt.excluded.OnlineBackup,
        "DeviceProtection": stmt.excluded.DeviceProtection,
        "TechSupport": stmt.excluded.TechSupport,
        "StreamingTV": stmt.excluded.StreamingTV,
        "StreamingMovies": stmt.excluded.StreamingMovies,
        "Contract": stmt.excluded.Contract,
        "PaperlessBilling": stmt.excluded.PaperlessBilling,
        "PaymentMethod": stmt.excluded.PaymentMethod,
        "contract_tenure": stmt.excluded.contract_tenure,
        "charge_segment": stmt.excluded.charge_segment,
        "tenure": stmt.excluded.tenure,
        "MonthlyCharges": stmt.excluded.MonthlyCharges,
        "TotalCharges": stmt.excluded.TotalCharges,
        "spending_velocity": stmt.excluded.spending_velocity,
        "tenure_loyalty": stmt.excluded.tenure_loyalty,
        "last_updated": func.now(),
    }

    stmt = stmt.on_conflict_do_update(
        index_elements=["customer_unique_id"],
        set_=update_fields,
    )

    db.execute(stmt)
    db.commit()
    return len(values)


def list_customers(db: Session, limit: int = 500) -> list[Customer]:
    """Return the latest customers records."""
    return (
        db.query(Customer)
        .order_by(Customer.last_updated.desc())
        .limit(limit)
        .all()
    )


def assign_customer(db: Session, customer_id: int, user_id: int) -> bool:
    """Assign a customer to a user (employee)."""
    customer = db.query(Customer).filter(Customer.id == customer_id).first()
    if not customer:
        return False
    customer.assigned_to_id = user_id
    db.commit()
    return True


def list_users(db: Session) -> list[User]:
    """List all users (employees/admins)."""
    return db.query(User).all()


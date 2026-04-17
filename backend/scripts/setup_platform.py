from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Any

import pandas as pd
import numpy as np

# Path logic for finding models and data
ROOT_DIR = Path(__file__).resolve().parents[1]
# Note: In Docker, ROOT_DIR is /app. In local dev, it is project_root/backend.

from app.db.database import Base, engine, SessionLocal
from app.db.models import User, Customer
from app.db.security import get_password_hash
from app.ml.engine import TrinityEngine
from app.repositories.customer_repository import upsert_customers


def _to_python_primitives(obj: Any) -> Any:
    """Convert pandas/numpy primitives into JSON-serializable Python types."""
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, np.generic):
        return obj.item()
    try:
        if pd.isna(obj):
            return None
    except Exception:
        pass
    if isinstance(obj, dict):
        return {str(k): _to_python_primitives(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_python_primitives(v) for v in obj]
    return str(obj)


def setup_users(db: SessionLocal):
    """Seed initial users with hashed passwords."""
    # Default password for all seeded users is 'trinity123'
    default_hashed = get_password_hash("trinity123")
    
    users = [
        {"username": "admin", "role": "admin", "email": "admin@trinity.ai", "hashed_password": default_hashed},
        {"username": "jdoe", "role": "employee", "email": "jdoe@trinity.ai", "hashed_password": default_hashed},
        {"username": "asmith", "role": "employee", "email": "asmith@trinity.ai", "hashed_password": default_hashed},
        {"username": "bgates", "role": "employee", "email": "bgates@trinity.ai", "hashed_password": default_hashed},
    ]
    for u_data in users:
        exists = db.query(User).filter(User.username == u_data["username"]).first()
        if not exists:
            user = User(**u_data)
            db.add(user)
        else:
            # Update existing users if they don't have a password
            if not exists.hashed_password:
                exists.hashed_password = default_hashed
                exists.email = u_data["email"]
    db.commit()


def main() -> None:
    parser = argparse.ArgumentParser(description="Trinity Platform Setup & Seeding")
    parser.add_argument(
        "--csv",
        default="data/customers_master.csv",
        help="Path to customers_master.csv",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logger = logging.getLogger("setup_platform")

    csv_path = ROOT_DIR / args.csv
    if not csv_path.exists():
        logger.error("Master CSV not found at %s. Creating empty or skipping.", csv_path)
        return

    # Reset and Create tables (SaaS Setup Mode)
    logger.info("Dropping existing tables to ensure clean schema sync...")
    Base.metadata.drop_all(bind=engine)
    logger.info("Initializing fresh database tables...")
    Base.metadata.create_all(bind=engine)

    db = SessionLocal()
    try:
        logger.info("Seeding users...")
        setup_users(db)

        logger.info("Reading master data from %s", csv_path)
        df = pd.read_csv(csv_path)

        if "customer_unique_id" not in df.columns:
            if "customerID" in df.columns:
                df["customer_unique_id"] = df["customerID"]
            else:
                df["customer_unique_id"] = [f"CUST-{i + 1:04d}" for i in range(len(df))]

        df = df.replace({np.nan: None})

        trinity = TrinityEngine()
        logger.info("Running Trinity Engine analysis on %s rows...", len(df))

        results_for_db = []
        for i in range(len(df)):
            row_dict = _to_python_primitives(df.iloc[i].to_dict())
            pred = trinity.predict_one(row_dict)
            results_for_db.append({
                "customer_unique_id": row_dict["customer_unique_id"],
                "churn_probability": pred.churn_probability,
                "predicted_clv": pred.predicted_clv,
                "risk_segment": pred.risk_segment,
                "action_plan": pred.action_plan,
                "ai_commentary": pred.ai_commentary,
                "raw_demographics": row_dict,
            })

        logger.info("Upserting records to database...")
        upsert_customers(db, results_for_db)
        logger.info("Platform setup complete.")

    finally:
        db.close()


if __name__ == "__main__":
    main()

from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path
from typing import Any

import pandas as pd

# Ensure `backend/` is on the Python path so `import app.*` works.
BACKEND_DIR = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND_DIR))

from app.db.database import Base, engine, SessionLocal
from app.ml.engine import TrinityEngine
from app.repositories.customer_repository import upsert_customers


def _to_python_primitives(obj: Any) -> Any:
    """Convert pandas/numpy primitives into JSON-serializable Python types."""
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    try:
        import numpy as np

        if isinstance(obj, np.generic):
            return obj.item()
        if pd.isna(obj):
            return None
    except Exception:
        pass

    if isinstance(obj, dict):
        return {str(k): _to_python_primitives(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_to_python_primitives(v) for v in obj]
    return str(obj)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed Trinity predictions into DB.")
    parser.add_argument(
        "--csv",
        default="data/customers_master.csv",
        help="Path to customers_master.csv",
    )
    parser.add_argument("--batch-size", type=int, default=200, help="Batch upsert size")
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logger = logging.getLogger("seed_trinity")

    csv_path = Path(args.csv)
    if not csv_path.exists():
        raise FileNotFoundError(f"customers_master csv not found: {csv_path.resolve()}")

    logger.info("Reading: %s", csv_path)
    df = pd.read_csv(csv_path)

    if "customer_unique_id" not in df.columns:
        if "customerID" in df.columns:
            df["customer_unique_id"] = df["customerID"]
        elif "customer_id" in df.columns:
            df["customer_unique_id"] = df["customer_id"]
        else:
            df["customer_unique_id"] = [f"CUST-{i + 1:04d}" for i in range(len(df))]

    df = df.replace({pd.NA: None})
    df = df.where(pd.notnull(df), None)

    # Create tables (dev-friendly). For production, use migrations.
    Base.metadata.create_all(bind=engine)
    trinity = TrinityEngine()

    total = len(df)
    logger.info("Seeding customers: %s", total)

    db = SessionLocal()
    try:
        batch: list[dict[str, Any]] = []
        upserted_total = 0

        for idx in range(total):
            row_dict = _to_python_primitives(df.iloc[idx].to_dict())
            cust_id = str(row_dict.get("customer_unique_id"))

            pred = trinity.predict_one(row_dict)
            out = {
                "customer_unique_id": cust_id,
                "churn_probability": pred.churn_probability,
                "predicted_clv": pred.predicted_clv,
                "risk_segment": pred.risk_segment,
                "action_plan": pred.action_plan,
                "ai_commentary": pred.ai_commentary,
                "raw_demographics": row_dict,
            }
            batch.append(out)

            if len(batch) >= args.batch_size:
                upserted_total += upsert_customers(db, batch)
                batch = []
                logger.info("Upserted so far: %s", upserted_total)

        if batch:
            upserted_total += upsert_customers(db, batch)

        logger.info("Seeding finished. upserted=%s", upserted_total)
    finally:
        db.close()


if __name__ == "__main__":
    main()


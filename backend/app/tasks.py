import logging
from typing import Any
from celery import shared_task

from .db.database import SessionLocal
from .db.models import CustomerRiskHistory, Customer
from .ml.engine import TrinityEngine
from .repositories.customer_repository import upsert_customers

logger = logging.getLogger("trinity_worker")

@shared_task(name="app.tasks.process_customer_batch")
def process_customer_batch(customer_data_list: list[dict[str, Any]]):
    """
    Background task to process a batch of customer records through the Trinity Engine.
    Scales to handle thousands of records without blocking the main API thread.
    """
    if not customer_data_list:
        return {"status": "skipped", "reason": "empty_batch"}

    try:
        trinity = TrinityEngine()
        db = SessionLocal()
        
        results_for_db = []
        history_records = []
        
        logger.info(f"Processing batch of {len(customer_data_list)} customers in background.")
        
        for record in customer_data_list:
            # 1. Run inference
            pred = trinity.predict_one(record)
            
            # 2. Prepare data for upsert
            results_for_db.append({
                "customer_unique_id": record["customer_unique_id"],
                "churn_probability": pred.churn_probability,
                "predicted_clv": pred.predicted_clv,
                "risk_segment": pred.risk_segment,
                "action_plan": pred.action_plan,
                "ai_commentary": pred.ai_commentary,
                "raw_demographics": record,
            })
            
        # 3. Save to database
        upsert_count = upsert_customers(db, results_for_db)
        
        # 4. Create historical snapshots for the timeline feature (SaaS Requirement 5)
        # We need to find the internal IDs of the newly upserted customers to link history
        db_customers = db.query(Customer).filter(
            Customer.customer_unique_id.in_([r["customer_unique_id"] for r in results_for_db])
        ).all()
        
        id_map = {c.customer_unique_id: c.id for c in db_customers}
        
        for r in results_for_db:
            cid = id_map.get(r["customer_unique_id"])
            if cid:
                history_records.append(CustomerRiskHistory(
                    customer_id=cid,
                    churn_probability=r["churn_probability"],
                    predicted_clv=r["predicted_clv"],
                    risk_segment=r["risk_segment"]
                ))
        
        db.bulk_save_objects(history_records)
        db.commit()
        db.close()
        
        logger.info(f"Batch processing complete. Upserted: {upsert_count}")
        return {"status": "success", "processed": len(customer_data_list), "upserted": upsert_count}
        
    except Exception as e:
        logger.error(f"Failed to process batch: {str(e)}")
        if 'db' in locals():
            db.close()
        raise e

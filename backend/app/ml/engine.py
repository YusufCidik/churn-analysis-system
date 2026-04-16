from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import joblib
import numpy as np


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def _safe_str(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


@dataclass(frozen=True)
class TrinityPrediction:
    churn_probability: float
    predicted_clv: float
    risk_segment: str
    action_plan: str
    ai_commentary: str


class TrinityEngine:
    """
    Enterprise "Trinity" inference wrapper.

    Loads `enterprise_trinity_model.pkl` and converts incoming raw JSON into
    the exact feature order expected by the chained models.
    """

    def __init__(self, model_path: Path | None = None) -> None:
        if model_path is None:
            model_path = Path(__file__).resolve().parents[1] / "models" / "enterprise_trinity_model.pkl"

        obj = joblib.load(model_path)
        self.churn_model = obj["churn_model"]
        self.clv_model = obj["clv_model"]
        self.feature_names: list[str] = list(obj["feature_names"])
        self.label_encoders: dict[str, Any] = obj["label_encoders"]
        self.cat_features: list[str] = list(obj.get("cat_features", []))
        self.threshold: float = float(obj.get("threshold", 0.52))

    def _tenure_bucket(self, tenure: float) -> str:
        if tenure < 12:
            return "short"
        if tenure < 24:
            return "mid"
        return "long"

    def _charge_segment(self, monthly_charges: float) -> str:
        # Map to encoder classes: High/Low/Medium/VeryHigh
        if monthly_charges > 95:
            return "VeryHigh"
        if monthly_charges > 70:
            return "High"
        if monthly_charges > 45:
            return "Medium"
        return "Low"

    def _contract_tenure(self, contract: str, tenure: float) -> str:
        bucket = self._tenure_bucket(tenure)
        if contract:
            return f"{contract}_{bucket}"
        return f"Month-to-month_{bucket}"

    def _derive_features(self, customer: dict[str, Any]) -> dict[str, Any]:
        # Ensure derived categorical + numeric features exist.
        out = dict(customer)

        tenure = _safe_float(out.get("tenure", 0))
        monthly = _safe_float(out.get("MonthlyCharges", 0))
        contract = _safe_str(out.get("Contract", ""))

        # Numeric derived features expected by the model.
        total_charges = _safe_float(out.get("TotalCharges", 0))

        if "spending_velocity" in self.feature_names:
            # Formula: MonthlyCharges / TotalCharges
            out["spending_velocity"] = monthly / max(total_charges, 1.0)

        if "tenure_loyalty" in self.feature_names:
            # Formula: tenure / MonthlyCharges
            out["tenure_loyalty"] = tenure / max(monthly, 1.0)

        # Service count features (common in telco churn datasets).
        if "total_services" in self.feature_names and "total_services" not in out:
            service_cols = [
                "OnlineSecurity",
                "OnlineBackup",
                "DeviceProtection",
                "TechSupport",
                "StreamingTV",
                "StreamingMovies",
            ]

            def _is_yes(v: Any) -> bool:
                s = _safe_str(v).lower()
                return s in {"yes", "y", "true", "1"}

            total_services = sum(1 for col in service_cols if _is_yes(out.get(col)))
            out["total_services"] = float(total_services)

        if "value_per_service" in self.feature_names and "value_per_service" not in out:
            total_services = _safe_float(out.get("total_services"), default=0.0)
            out["value_per_service"] = float(monthly / max(total_services, 1.0))

        # Categorical derived features expected by the model.
        if "contract_tenure" in self.feature_names and "contract_tenure" not in out:
            if contract:
                out["contract_tenure"] = self._contract_tenure(contract, tenure)
            else:
                out["contract_tenure"] = self._contract_tenure("Month-to-month", tenure)

        if "charge_segment" in self.feature_names and "charge_segment" not in out:
            out["charge_segment"] = self._charge_segment(monthly)

        return out

    def _encode_row(self, customer: dict[str, Any]) -> np.ndarray:
        derived = self._derive_features(customer)

        row: list[float] = []
        for feature in self.feature_names:
            if feature in self.cat_features:
                encoder = self.label_encoders.get(feature)
                if encoder is None:
                    row.append(0.0)
                    continue
                value = _safe_str(derived.get(feature))
                classes = getattr(encoder, "classes_", None)
                if classes is not None and len(classes) > 0:
                    if value not in classes:
                        # Fallback for unseen categories: map to a stable default (first class).
                        value = str(classes[0])
                try:
                    row.append(float(encoder.transform([value])[0]))
                except Exception:
                    row.append(0.0)
            else:
                row.append(_safe_float(derived.get(feature), default=0.0))

        return np.asarray(row, dtype=float).reshape(1, -1)

    def _risk_segment(self, churn_probability: float) -> str:
        if churn_probability <= 0.30:
            return "Düşük Risk"
        if churn_probability <= self.threshold:
            return "Orta Risk"
        return "KRİTİK"

    def _build_action_plan(self, customer: dict[str, Any], churn_probability: float) -> tuple[str, str]:
        """
        Prescriptive logic for retention offers.
        Returns (action_plan, ai_commentary).
        """
        if churn_probability <= self.threshold:
            action_plan = "Düzenli İzleme + Fiyat/Plan Optimizasyonu (risk düşük)."
            ai_commentary = (
                "Model, churn olasılığının eşik altında kaldığını görüyor. "
                "Bu müşteriyi düşük maliyetle izlemek ve plan uyarlaması yapmak yeterli."
            )
            return action_plan, ai_commentary

        tenure = _safe_float(customer.get("tenure", 0))
        monthly = _safe_float(customer.get("MonthlyCharges", 0))
        contract = _safe_str(customer.get("Contract", ""))
        tech_support = _safe_str(customer.get("TechSupport", ""))

        if contract == "Month-to-month":
            base = "Yıllık Sözleşme Teklif Et"
        elif contract == "One year":
            base = "İki Yıllık Sözleşme Teklif Et"
        elif contract == "Two year":
            base = "Sözleşme Uzatma + Sadakat Paketi"
        else:
            base = "Sözleşme Yenileme Kampanyası"

        if tenure < 12:
            base = f"{base} + Onboarding/Switch-Assist"
        if tech_support.lower() == "no":
            base = f"{base} + Teknik Destek Paketi"
        if monthly >= 95:
            base = f"{base} + Fiyat Sabitleme Teklifi"

        action_plan = base + "."
        ai_commentary = (
            "Model, churn olasılığının eşik üzerinde olduğunu ve belirgin sürücülerin "
            "sözleşme esnekliği, ücret seviyesi ve destek/bağlılık dinamikleri olduğunu söylüyor. "
            "Hızlı aksiyon olarak sözleşme bağlayıcılığı ve destekle birlikte kişiselleştirilmiş teklif önerilir."
        )
        return action_plan, ai_commentary

    def predict_one(self, customer: dict[str, Any]) -> TrinityPrediction:
        X = self._encode_row(customer)
        churn_prob = float(self.churn_model.predict_proba(X)[:, 1][0])
        clv = float(self.clv_model.predict(X)[0])

        risk_segment = self._risk_segment(churn_prob)
        action_plan, ai_commentary = self._build_action_plan(customer, churn_prob)
        return TrinityPrediction(
            churn_probability=churn_prob,
            predicted_clv=clv,
            risk_segment=risk_segment,
            action_plan=action_plan,
            ai_commentary=ai_commentary,
        )

    def simulate_monthly_discount(
        self, customer: dict[str, Any], monthly_discount_percent: float
    ) -> TrinityPrediction:
        monthly = _safe_float(customer.get("MonthlyCharges", 0))
        discount = max(0.0, float(monthly_discount_percent))
        new_monthly = monthly * (1.0 - discount / 100.0)

        updated = dict(customer)
        updated["MonthlyCharges"] = new_monthly

        return self.predict_one(updated)


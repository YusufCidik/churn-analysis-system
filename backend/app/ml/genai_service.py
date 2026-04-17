import os
import google.generativeai as genai
from typing import Dict, Any

# Gemini Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)


def generate_strategic_summary(customer_data: Dict[str, Any], churn_prob: float, clv: float) -> str:
    """
    Generates a human-like strategic retention summary using Google Gemini.
    Combines SHAP values, customer demographics, and financial risk.
    """
    if not GEMINI_API_KEY:
        return "GenAI summary unavailable. Please configure GEMINI_API_KEY."

    model = genai.GenerativeModel('gemini-1.5-flash')
    
    prompt = f"""
    You are a Senior SaaS Retention Consultant. Analyze this customer at risk of churning:
    
    Customer Data: {customer_data}
    Churn Probability: {churn_prob:.2%}
    Projected Lifecycle Value (CLV): ${clv:,.2f}
    
    Task:
    1. Briefly explain WHY this customer is likely to churn based on the data provided (e.g. tenure, contract type, services).
    2. Provide 3 specific, actionable retention strategies (e.g. specific discounts, service upgrades, or proactive support calls).
    3. Keep the tone professional, concise, and executive-ready.
    
    Format the response in Markdown. Do not use generic filler text.
    """
    
    try:
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        return f"Error generating GenAI summary: {str(e)}"

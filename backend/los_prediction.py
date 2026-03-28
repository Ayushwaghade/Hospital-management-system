import pandas as pd
import joblib
import shap
import numpy as np
# ---------------------------------------------------------
# 1. LOAD MODEL & EXPLAINER (Runs once when server starts)
# ---------------------------------------------------------
try:
    model = joblib.load("los_catboost_model.pkl")
    explainer = shap.TreeExplainer(model)
    print("✅ CatBoost LOS Model & SHAP Explainer loaded successfully!")
except Exception as e:
    print(f"⚠️ Warning: Could not load ML model. {e}")
    model = None
    explainer = None

# Expected exact feature order from your Jupyter Notebook
FEATURES = [
    'rcount', 'gender', 'dialysisrenalendstage', 'asthma', 'irondef', 
    'pneum', 'substancedependence', 'psychologicaldisordermajor', 
    'depress', 'psychother', 'fibrosisandother', 'malnutrition', 
    'hemo', 'hematocrit', 'neutrophils', 'sodium', 'glucose', 
    'bloodureanitro', 'creatinine', 'bmi', 'pulse', 'respiration', 
    'secondarydiagnosisnonicd9', 'facid_B', 'facid_C', 'facid_D', 'facid_E'
]

# ---------------------------------------------------------
# 2. PREDICTION FUNCTION
# ---------------------------------------------------------

def predict_los_and_explain(data: dict) -> dict:
    """
    Takes raw patient data, formats it, runs the CatBoost prediction, 
    and generates SHAP values for the frontend chart.
    """
    if not model or not explainer:
        return {"error": "ML Model not loaded on server."}

    # 1. Build the DataFrame row
    row = {}
    for f in FEATURES:
        # Default to 0.0 if a feature is missing from the request
        row[f] = float(data.get(f, 0.0))
        
    df = pd.DataFrame([row])
    
    # 2. Make Prediction & Get Probabilities
    pred_class = int(model.predict(df)[0])
    probs = model.predict_proba(df)[0].tolist()
    
    # 3. Generate SHAP Explanations
    shap_values = explainer.shap_values(df)
    
    # 4. Extract the SHAP values safely based on how SHAP formatted the output
    if isinstance(shap_values, np.ndarray) and len(shap_values.shape) == 3:
        # Format: (n_samples, n_features, n_classes) -> We want [Patient 0, All Features, Predicted Class]
        class_shap_values = shap_values[0, :, pred_class]
    else:
        # Fallback for older SHAP versions that return a list of arrays
        class_shap_values = shap_values[pred_class][0] 
    
    # 5. Format SHAP data for the Recharts frontend
    shap_data = []
    for i, f in enumerate(FEATURES):
        impact = float(class_shap_values[i])
        # Skip features with near-zero impact to keep the UI chart clean
        if abs(impact) > 0.01:
            shap_data.append({
                "feature": f,
                "value": row[f],
                "impact": impact
            })
            
    # Sort by absolute impact (highest impact first)
    shap_data.sort(key=lambda x: abs(x["impact"]), reverse=True)
    
    return {
        "prediction": pred_class,
        "probabilities": [round(p * 100, 2) for p in probs],
        "shap_values": shap_data[:12] # Return only the top 12 most impactful features
    }
import os
import json
from datetime import datetime
import random
from functools import wraps
from dotenv import load_dotenv
from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
from werkzeug.security import generate_password_hash, check_password_hash
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from bson import ObjectId
import requests # <-- Added for the Gemini REST API
from los_prediction import predict_los_and_explain
import logging 
import re
from datetime import timedelta
logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
CORS(app) # Allows your Next.js frontend to communicate with Flask

# Configuration
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "fallback-secret-key")

app.config["JWT_ACCESS_TOKEN_EXPIRES"] = timedelta(days=2)

jwt = JWTManager(app)

# ==========================================
# API KEYS
# ==========================================
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
if not GEMINI_API_KEY:
    print("⚠️ Warning: GEMINI_API_KEY not found in .env file. LLM synthesis will be disabled.")

# MongoDB Connection
client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"))
db = client.smarthospital

# Collections
users_col = db.users
doctors_col = db.doctors
appointments_col = db.appointments
wards_col = db.wards
beds_col = db.beds
patients_col = db.patients

# ==========================================
# HELPER: Serialize MongoDB Objects
# ==========================================
def serialize_doc(doc):
    """Safely converts MongoDB documents to JSON-serializable dictionaries"""
    if not doc:
        return doc
        
    # 1. Convert the main _id to 'id' (Standard for frontend)
    if '_id' in doc:
        doc['id'] = str(doc['_id'])
        del doc['_id']
        
    # 2. Find any other ObjectIds (like wardId) and convert them to strings
    for key in list(doc.keys()):
        if isinstance(doc[key], ObjectId):
            doc[key] = str(doc[key])
            
    return doc

# ==========================================
# 0. CUSTOM RBAC DECORATOR
# ==========================================
def role_required(allowed_roles):
    """Decorator to enforce role-based access control"""
    def decorator(fn):
        @wraps(fn)
        @jwt_required()
        def wrapper(*args, **kwargs):
            current_user_id = get_jwt_identity()
            user = users_col.find_one({"_id": ObjectId(current_user_id)})
            
            if not user or user.get("role") not in allowed_roles:
                return jsonify({"msg": "Unauthorized access. Invalid role."}), 403
            
            return fn(*args, **kwargs)
        return wrapper
    return decorator


# ==========================================
# 1. AUTHENTICATION (Register & Login)
# ==========================================
@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({"msg": "API is running"}), 200

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    if users_col.find_one({"email": data.get("email")}):
        return jsonify({"msg": "Email already exists"}), 400

    hashed_password = generate_password_hash(data.get("password"))
    new_user = {
        "firstName": data.get("firstName"),
        "lastName": data.get("lastName"),
        "email": data.get("email"),
        "password": hashed_password,
        "role": data.get("role", "patient") # admin, staff, patient
    }
    users_col.insert_one(new_user)
    return jsonify({"msg": "User registered successfully"}), 201

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    user = users_col.find_one({"email": data.get("email")})
    
    if user and check_password_hash(user['password'], data.get("password")):
        access_token = create_access_token(identity=str(user['_id']))
        return jsonify({
            "token": access_token, 
            "role": user.get("role"),
            "name": f"{user.get('firstName')} {user.get('lastName')}"
        }), 200
        
    return jsonify({"msg": "Invalid credentials"}), 401


# ==========================================
# 2. OPD QUEUE & DOCTORS
# ==========================================
@app.route('/api/doctors', methods=['GET'])
@jwt_required() # Any logged-in user can view doctors
def get_doctors_and_queues():
    doctors = list(doctors_col.find())
    response = []
    
    for doc in doctors:
        # Calculate real-time queue data for this doctor
        waiting_count = appointments_col.count_documents({
            "doctorId": str(doc['_id']), 
            "status": {"$in": ["Upcoming", "Ready"]}
        })
        
        doc_data = serialize_doc(doc)
        doc_data['patientsWaiting'] = waiting_count
        doc_data['estimatedWaitTime'] = waiting_count * doc.get('avgConsultationTime', 15)
        response.append(doc_data)
        
    return jsonify(response), 200

@app.route('/api/doctors', methods=['POST'])
@role_required(["staff", "admin"])
def add_doctor():
    data = request.json
    new_doc = {
        "name": data.get("name"),
        "department": data.get("department"),
        "specialization": data.get("specialization"),
        "avgConsultationTime": int(data.get("avgConsultationTime", 15)),
        "isAvailable": data.get("isAvailable", False) # Default to false when hired
    }
    doc_id = doctors_col.insert_one(new_doc).inserted_id
    return jsonify({"msg": "Doctor added successfully", "id": str(doc_id)}), 201

@app.route('/api/doctors/<doctor_id>', methods=['PUT', 'DELETE'])
@role_required(["staff", "admin"])
def update_delete_doctor(doctor_id):
    if request.method == 'DELETE':
        doctors_col.delete_one({"_id": ObjectId(doctor_id)})
        return jsonify({"msg": "Doctor removed"}), 200
        
    # PUT request (Used for the Availability Toggle!)
    data = request.json
    update_fields = {}
    
    # Check explicitly for boolean so we can toggle False
    if "isAvailable" in data: 
        update_fields["isAvailable"] = data["isAvailable"]
        
    if "avgConsultationTime" in data: 
        update_fields["avgConsultationTime"] = int(data["avgConsultationTime"])

    if update_fields:
        doctors_col.update_one({"_id": ObjectId(doctor_id)}, {"$set": update_fields})
        
    return jsonify({"msg": "Doctor status updated"}), 200



# ==========================================
# 3. APPOINTMENTS & VIRTUAL WAITING ROOM
# ==========================================
@app.route('/api/appointments', methods=['POST'])
@jwt_required() # Must be logged in to book
def create_appointment():
    current_user_id = get_jwt_identity()
    data = request.json
    doctor_id = data.get("doctorId")
    
    # Generate a random token (e.g., T-1024)
    token = f"T-{random.randint(1000, 9999)}"
    
    # Calculate position in queue for today
    position = appointments_col.count_documents({
        "doctorId": doctor_id,
        "status": {"$in": ["Upcoming", "Ready", "In Consultation"]}
    })
    
    new_apt = {
        "patientId": current_user_id, # Link appointment to the logged-in user!
        "patientName": data.get("patientName"),
        "department": data.get("department"),
        "doctorId": doctor_id,
        "date": data.get("date"),
        "time": data.get("time"),
        "token": token,
        "position": position,
        "status": "Upcoming", # Upcoming, Ready, In Consultation, Completed
        "createdAt": datetime.now()
    }
    
    apt_id = appointments_col.insert_one(new_apt).inserted_id
    
    return jsonify({"msg": "Appointment booked", "token": token, "id": str(apt_id)}), 201

@app.route('/api/queue/waiting-room', methods=['GET'])
@jwt_required()
def get_waiting_room():
    current_user_id = get_jwt_identity()
    user = users_col.find_one({"_id": ObjectId(current_user_id)})
    
    if not user:
        return jsonify({"msg": "User not found"}), 404

    # Patient role: Only fetch their own active appointments
    if user.get("role") == "patient":
        active_apts = list(appointments_col.find({
            "patientId": current_user_id, 
            "status": {"$ne": "Completed"}
        }).sort("position", 1))
    
    # Staff/Admin role: Fetch ALL active appointments across the hospital
    else:
        active_apts = list(appointments_col.find({"status": {"$ne": "Completed"}}).sort("position", 1))
        
    return jsonify([serialize_doc(apt) for apt in active_apts]), 200

@app.route('/api/queue/update-status/<appointment_id>', methods=['PUT'])
@role_required(["staff", "admin"]) # ONLY Receptionist/Admin can modify queues
def update_appointment_status(appointment_id):
    status = request.json.get("status")
    appointments_col.update_one(
        {"_id": ObjectId(appointment_id)},
        {"$set": {"status": status}}
    )
    return jsonify({"msg": "Status updated successfully"}), 200


# ==========================================
# 4. BED AVAILABILITY & STAFF MANAGEMENT
# ==========================================
@app.route('/api/wards', methods=['GET', 'POST'])
@role_required(["staff", "admin"])
def manage_wards():
    if request.method == 'POST':
        data = request.json
        new_ward = {
            "name": data.get("name"),
            "totalBeds": int(data.get("totalBeds", 0)),
            "occupiedBeds": 0,
            "predictedVacancy": "N/A"
        }
        ward_id = wards_col.insert_one(new_ward).inserted_id
        
        # Auto-generate the empty beds for this new ward!
        beds_to_insert = []
        bed_type = "Standard"
        if "ICU" in new_ward["name"].upper(): bed_type = "Ventilator Support"
        elif "MATERNITY" in new_ward["name"].upper() or "PRIVATE" in new_ward["name"].upper(): bed_type = "Private"

        for i in range(1, new_ward["totalBeds"] + 1):
            beds_to_insert.append({
                "wardId": str(ward_id), # Stored as string to match frontend
                "ward": new_ward["name"],
                "bedNumber": str(i),
                "type": bed_type,
                "status": "Available",
                "patient": "-"
            })
            
        if beds_to_insert:
            beds_col.insert_many(beds_to_insert)

        return jsonify({"msg": "Ward and beds created successfully!"}), 201

    # If it's a GET request:
    wards = list(wards_col.find())
    return jsonify([serialize_doc(ward) for ward in wards]), 200


@app.route('/api/beds', methods=['GET', 'POST'])
@role_required(["staff", "admin"])
def manage_beds():
    if request.method == 'POST':
        data = request.json
        new_bed = {
            "wardId": data['wardId'],
            "ward": data['wardName'],
            "bedNumber": data.get('bedNumber', '0'),
            "type": data['type'],
            "status": data.get('status', 'Available'),
            "patient": data.get('patient', '-')
        }
        beds_col.insert_one(new_bed)
        
        # Update ward totals
        wards_col.update_one({"_id": ObjectId(data['wardId'])}, {"$inc": {"totalBeds": 1}})
        if new_bed['status'] == 'Occupied':
            wards_col.update_one({"_id": ObjectId(data['wardId'])}, {"$inc": {"occupiedBeds": 1}})
            
        return jsonify({"msg": "Bed added successfully"}), 201

    # If it's a GET request:
    beds = list(beds_col.find())
    return jsonify([serialize_doc(bed) for bed in beds]), 200


@app.route('/api/beds/<bed_id>', methods=['PUT', 'DELETE'])
@role_required(["staff", "admin"])
def update_or_delete_bed(bed_id):
    if request.method == 'DELETE':
        bed = beds_col.find_one({"_id": ObjectId(bed_id)})
        if bed:
            beds_col.delete_one({"_id": ObjectId(bed_id)})
            
            # Decrease totals on the ward
            wards_col.update_one({"_id": ObjectId(bed['wardId'])}, {"$inc": {"totalBeds": -1}})
            if bed.get('status') == 'Occupied':
                wards_col.update_one({"_id": ObjectId(bed['wardId'])}, {"$inc": {"occupiedBeds": -1}})
                
        return jsonify({"msg": "Bed deleted"}), 200

    # If it's a PUT request (Update Status/Patient):
    data = request.json
    update_fields = {}
    if "status" in data: update_fields["status"] = data["status"]
    if "patient" in data: update_fields["patient"] = data["patient"]
    if "type" in data: update_fields["type"] = data["type"]
    if "patientId" in data: update_fields["patientId"] = data["patientId"] # Capture the patient ID!

    # 1. Get the bed BEFORE we update it so we know its Ward and Number
    old_bed = beds_col.find_one({"_id": ObjectId(bed_id)})
    
    # 2. Update the Bed Collection
    beds_col.update_one({"_id": ObjectId(bed_id)}, {"$set": update_fields})
    
    # 3. SYNCHRONIZE WITH PATIENT COLLECTION
    new_patient_id = data.get("patientId")
    
    # CASE A: A patient was just assigned to this bed
    if new_patient_id and new_patient_id != "":
        bed_string = f"{old_bed.get('ward', 'Ward')} - Bed {old_bed.get('bedNumber', '-')}"
        patients_col.update_one(
            {"_id": ObjectId(new_patient_id)},
            {"$set": {"assignedBed": bed_string}}
        )
        
    # CASE B: The bed was cleared (patient removed)
    elif data.get("patient") == "-" and old_bed and old_bed.get("patientId"):
        patients_col.update_one(
            {"_id": ObjectId(old_bed["patientId"])},
            {"$set": {"assignedBed": "Pending Allocation"}}
        )

    # 4. Recalculate ward occupancy
    bed = beds_col.find_one({"_id": ObjectId(bed_id)})
    if bed:
        ward_id = bed.get("wardId")
        occupied_count = beds_col.count_documents({"wardId": ward_id, "status": "Occupied"})
        wards_col.update_one({"_id": ObjectId(ward_id)}, {"$set": {"occupiedBeds": occupied_count}})
        
    return jsonify({"msg": "Bed status updated"}), 200



# ==========================================
# 5. MACHINE LEARNING + DIRECT LLM API LAYER
# ==========================================
@app.route('/api/predict-los', methods=['POST'])
@jwt_required()
def predict_los():
    data = request.json
    specialist_notes = data.get("specialistNotes", "").strip()
 
    # Phase 1: Run the standard CatBoost ML model
    result = predict_los_and_explain(data)
 
    if "error" in result:
        return jsonify(result), 500
 
    # Phase 2: Direct REST API Call to Gemini
    if specialist_notes and GEMINI_API_KEY:
        # Sanitize: cap length to prevent prompt injection
        specialist_notes = specialist_notes[:1000]
 
        try:
            class_map = {0: "Short (1-3 days)", 1: "Medium (4-6 days)", 2: "Long (7+ days)"}
            base_pred_text = class_map.get(result["prediction"], "Unknown")
 
            # Extract top 8 factors so Gemini has deep mathematical context
            top_factors = ", ".join([
                f"{item['feature']} (Impact: {item['impact']:.3f})"
                for item in result.get("shap_values", [])[:8]
            ])
 
            prompt = f"""You are a senior clinical AI assistant helping refine a machine learning prediction for hospital length of stay (LOS).
 
## ML BASELINE
- Prediction: {base_pred_text}
- Top SHAP feature impacts (positive = lengthens stay, negative = shortens stay):
  {top_factors}
 
## SPECIALIST NOTES (treat as authoritative clinical override)
<specialist_notes>
{specialist_notes}
</specialist_notes>
 
## YOUR TASK
1. Carefully read the specialist notes. Identify any clinical factors the ML model could not see — such as planned procedures, comorbidity severity, social/discharge barriers, or treatment response.
2. Decide if these new factors justify changing the baseline prediction class. Be conservative — only override if the clinical evidence is clear.
3. Construct a blended feature impact list that includes:
   - The most influential original ML features (adjusted if the specialist context changes their weight)
   - New features derived from the specialist notes, assigned a realistic impact score
 
## OUTPUT FORMAT
Return ONLY a valid JSON object — no markdown, no explanation outside the JSON, no trailing text.
The JSON must have exactly these three keys:
 
{{
  "adjusted_prediction": <integer: 0 = Short 1-3 days, 1 = Medium 4-6 days, 2 = Long 7+ days>,
  "clinical_reasoning": "<2-3 sentence explanation covering: what the specialist context added, whether the prediction changed and why, and the dominant clinical driver>",
  "adjusted_feature_impacts": [
    {{"feature": "<name>", "impact": <float>}},
    ...
  ]
}}
 
Rules for adjusted_feature_impacts:
- Use clear, human-readable feature names (e.g. "Planned Surgery", "Diabetes Severity", "Social Discharge Barrier")
- Impact scores must be realistic floats (typically between -1.0 and 1.0)
- Include 8–12 entries, sorted by absolute impact descending
- Assign negative scores to factors that shorten stay, positive to those that lengthen it
"""
 
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key={GEMINI_API_KEY}"
            headers = {"Content-Type": "application/json"}
            payload = {
                "contents": [{
                    "parts": [{"text": prompt}]
                }]
            }
 
            response = requests.post(url, headers=headers, json=payload, timeout=15)
            response.raise_for_status()
 
            response_data = response.json()
            response_text = response_data["candidates"][0]["content"]["parts"][0]["text"].strip()
 
            # Robustly strip markdown code fences regardless of trailing whitespace or newlines
            response_text = re.sub(r"^```(?:json)?\s*|\s*```$", "", response_text, flags=re.DOTALL).strip()
 
            llm_data = json.loads(response_text)
 
            adjusted_impacts = llm_data.get("adjusted_feature_impacts", result.get("shap_values", []))
 
            try:
                adjusted_impacts.sort(key=lambda x: abs(float(x.get("impact", 0))), reverse=True)
            except Exception as e:
                logger.warning("Could not sort adjusted impacts: %s", e)
 
            result["llm_analysis"] = {
                "adjusted_prediction": llm_data.get("adjusted_prediction", result["prediction"]),
                "clinical_reasoning": llm_data.get("clinical_reasoning", "Analysis complete."),
                "adjusted_feature_impacts": adjusted_impacts[:12]
            }
 
        except requests.exceptions.RequestException as e:
            body = e.response.text if (e.response is not None) else "No response body"
            logger.error("Gemini API request failed: %s | Response body: %s", e, body)
            result["llm_analysis"] = {"error": "Failed to connect to AI synthesis service."}
        except Exception as e:
            logger.error("LLM parsing/processing error: %s", e)
            result["llm_analysis"] = {"error": "Failed to generate AI synthesis. Check server logs."}
    else:
        if not GEMINI_API_KEY:
            logger.warning("GEMINI_API_KEY is not set — LLM synthesis is disabled.")
        result["llm_analysis"] = None
 
    return jsonify(result), 200



# ==========================================
# 6. PATIENT REGISTRY & ADMISSIONS
# ==========================================
@app.route('/api/patients', methods=['GET', 'POST'])
@role_required(["staff", "admin"])
def manage_patients():
    if request.method == 'POST':
        data = request.json
        
        new_patient = {
            # 1. Demographics
            "firstName": data.get("firstName"),
            "lastName": data.get("lastName"),
            "age": data.get("age"),
            "gender": data.get("gender"),
            "contact": data.get("contact"),
            "address": data.get("address"),
            
            # 2. Emergency & Financial
            "emergencyName": data.get("emergencyName"),
            "emergencyPhone": data.get("emergencyPhone"),
            "insuranceProvider": data.get("insuranceProvider"),
            "insurancePolicy": data.get("insurancePolicy"),
            
            # 3. Clinical Baseline
            "bloodGroup": data.get("bloodGroup"),
            "allergies": data.get("allergies", "None"),
            "chronicConditions": data.get("chronicConditions", "None"),
            
            # 4. Admission Context
            "chiefComplaint": data.get("chiefComplaint"),
            "department": data.get("department"),
            "attendingDoctor": data.get("attendingDoctor"),
            
            # System Generated
            "admissionDate": datetime.now().strftime("%Y-%m-%d %H:%M"),
            "dischargeDate": "-",
            "status": "Admitted", 
            "assignedBed": "Pending Allocation"
        }
        
        patient_id = patients_col.insert_one(new_patient).inserted_id
        return jsonify({"msg": "Patient admitted successfully", "id": str(patient_id)}), 201

    # If GET request: Return all patients, newest first
    patients = list(patients_col.find().sort("admissionDate", -1))
    return jsonify([serialize_doc(p) for p in patients]), 200

@app.route('/api/patients/<patient_id>', methods=['PUT'])
@role_required(["staff", "admin"])
def update_patient(patient_id):
    data = request.json
    
    # We strip out system fields so the staff can't accidentally overwrite admission dates or bed assignments via this form
    update_fields = {k: v for k, v in data.items() if k not in ["id", "_id", "admissionDate", "dischargeDate", "assignedBed", "status"]}
    
    patients_col.update_one({"_id": ObjectId(patient_id)}, {"$set": update_fields})
    return jsonify({"msg": "Patient record updated successfully"}), 200



@app.route('/api/patients/<patient_id>/discharge', methods=['PUT'])
@role_required(["staff", "admin"])
def discharge_patient(patient_id):
    # 1. Stamp the exact time they leave the hospital
    discharge_time = datetime.now().strftime("%Y-%m-%d %H:%M")
    
    patients_col.update_one(
        {"_id": ObjectId(patient_id)},
        {"$set": {
            "status": "Discharged", 
            "dischargeDate": discharge_time,
            "assignedBed": "Discharged"
        }}
    )
    
    # 2. Auto-Free their Bed (If we linked one)
    # We look for any bed holding this patient's ID and clear it out
    bed = beds_col.find_one({"patientId": patient_id})
    if bed:
        beds_col.update_one(
            {"_id": bed["_id"]},
            {"$set": {"status": "Available", "patient": "-", "patientId": ""}}
        )
        wards_col.update_one({"_id": ObjectId(bed["wardId"])}, {"$inc": {"occupiedBeds": -1}})

    return jsonify({"msg": "Patient officially discharged"}), 200





if __name__ == '__main__':
    app.run(port=int(os.getenv("PORT", 5000)), debug=True)
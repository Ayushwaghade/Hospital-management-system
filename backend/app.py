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
import requests
from los_prediction import predict_los_and_explain
import logging
import re
from datetime import timedelta
from twilio.rest import Client as TwilioClient
from twilio.base.exceptions import TwilioRestException

logger = logging.getLogger(__name__)

load_dotenv()

app = Flask(__name__)
CORS(app)

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

# ==========================================
# TWILIO SETUPHFDJKDFSJK
# ==========================================
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_FROM  = os.getenv("TWILIO_PHONE_FROM")  # e.g. +14155238886

twilio_client = None
if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN and TWILIO_PHONE_FROM:
    twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
    print("✅ Twilio client initialised.")
else:
    print("⚠️ Warning: Twilio credentials not fully set. SMS notifications will be disabled.")

# MongoDB Connection
client = MongoClient(os.getenv("MONGO_URI", "mongodb://localhost:27017/"))
db = client.smarthospital

# Collections
users_col        = db.users
doctors_col      = db.doctors
appointments_col = db.appointments
wards_col        = db.wards
beds_col         = db.beds
patients_col     = db.patients


# ==========================================
# HELPER: Send SMS via Twilio
# ==========================================
def send_sms(to_number: str, body: str) -> bool:
    """
    Send an SMS using Twilio.
    Accepts any common Indian format:
      9322152765  /  09322152765  /  919322152765  /  +919322152765
    Converts to E.164 (+91XXXXXXXXXX) which Twilio requires.
    """
    if not twilio_client:
        logger.warning("Twilio not configured – SMS skipped.")
        return False

    if not to_number or not to_number.strip():
        logger.warning("send_sms called with empty phone number – SMS skipped.")
        return False

    # 1. Strip all non-digit characters
    digits = re.sub(r'\D', '', to_number.strip())

    # 2. Normalise to 10-digit Indian mobile number
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]       # 919322152765  → 9322152765
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]       # 09322152765   → 9322152765

    if len(digits) != 10:
        logger.warning("Invalid phone number – could not normalise to 10 digits: %s", to_number)
        return False

    # 3. Build E.164 format for Twilio
    e164_number = f"+91{digits}"

    try:
        message = twilio_client.messages.create(
            body=body,
            from_=TWILIO_PHONE_FROM,
            to=e164_number
        )
        logger.info("SMS sent via Twilio to %s  SID: %s", e164_number, message.sid)
        return True
    except TwilioRestException as e:
        logger.error("Twilio error sending to %s: %s", e164_number, e)
        return False
    except Exception as e:
        logger.error("Unexpected error in send_sms: %s", e)
        return False


# ==========================================
# HELPER: Serialize MongoDB Objects
# ==========================================
def serialize_doc(doc):
    """Safely converts MongoDB documents to JSON-serializable dictionaries."""
    if not doc:
        return doc
    doc = dict(doc)
    if '_id' in doc:
        doc['id'] = str(doc['_id'])
        del doc['_id']
    for key in list(doc.keys()):
        if isinstance(doc[key], ObjectId):
            doc[key] = str(doc[key])
    return doc


# ==========================================
# HELPER: Auto-expire past appointments
# ==========================================
def expire_past_appointments():
    """Mark appointments whose date has passed as 'Expired' so they stop polluting live queues."""
    today = datetime.now().strftime("%Y-%m-%d")
    result = appointments_col.update_many(
        {
            "date":   {"$lt": today},
            "status": {"$in": ["Upcoming", "Ready"]}
        },
        {"$set": {"status": "Expired"}}
    )
    if result.modified_count > 0:
        logger.info("Auto-expired %d past appointments.", result.modified_count)


# ==========================================
# 0. CUSTOM RBAC DECORATOR
# ==========================================
def role_required(allowed_roles):
    """Decorator to enforce role-based access control."""
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
        "lastName":  data.get("lastName"),
        "email":     data.get("email"),
        "password":  hashed_password,
        "role":      data.get("role", "patient")
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
            "role":  user.get("role"),
            "name":  f"{user.get('firstName')} {user.get('lastName')}"
        }), 200
    return jsonify({"msg": "Invalid credentials"}), 401


# ==========================================
# 2. OPD QUEUE & DOCTORS
# ==========================================
@app.route('/api/doctors', methods=['GET'])
@jwt_required()
def get_doctors_and_queues():
    expire_past_appointments()
    today    = datetime.now().strftime("%Y-%m-%d")
    doctors  = list(doctors_col.find())
    response = []
    for doc in doctors:
        waiting_count = appointments_col.count_documents({
            "doctorId": str(doc['_id']),
            "date":     today,
            "status":   {"$in": ["Upcoming", "Ready"]}
        })
        doc_data = serialize_doc(doc)
        doc_data['patientsWaiting']   = waiting_count
        doc_data['estimatedWaitTime'] = waiting_count * doc.get('avgConsultationTime', 15)
        response.append(doc_data)
    return jsonify(response), 200


@app.route('/api/doctors', methods=['POST'])
@role_required(["staff", "admin"])
def add_doctor():
    data    = request.json
    new_doc = {
        "name":                data.get("name"),
        "department":          data.get("department"),
        "specialization":      data.get("specialization"),
        "avgConsultationTime": int(data.get("avgConsultationTime", 15)),
        "isAvailable":         data.get("isAvailable", False)
    }
    doc_id = doctors_col.insert_one(new_doc).inserted_id
    return jsonify({"msg": "Doctor added successfully", "id": str(doc_id)}), 201


@app.route('/api/doctors/<doctor_id>', methods=['PUT', 'DELETE'])
@role_required(["staff", "admin"])
def update_delete_doctor(doctor_id):
    if request.method == 'DELETE':
        doctors_col.delete_one({"_id": ObjectId(doctor_id)})
        return jsonify({"msg": "Doctor removed"}), 200

    data          = request.json
    update_fields = {}
    if "isAvailable"         in data: update_fields["isAvailable"]         = data["isAvailable"]
    if "avgConsultationTime" in data: update_fields["avgConsultationTime"] = int(data["avgConsultationTime"])
    if update_fields:
        doctors_col.update_one({"_id": ObjectId(doctor_id)}, {"$set": update_fields})
    return jsonify({"msg": "Doctor status updated"}), 200


# ==========================================
# 3. APPOINTMENTS & VIRTUAL WAITING ROOM
# ==========================================
@app.route('/api/appointments', methods=['POST'])
@jwt_required()
def create_appointment():
    current_user_id = get_jwt_identity()
    data            = request.json
    doctor_id       = data.get("doctorId")

    # Validate doctor exists and is on duty
    doctor = doctors_col.find_one({"_id": ObjectId(doctor_id)}) if doctor_id else None
    if not doctor:
        return jsonify({"msg": "Doctor not found."}), 404
    if not doctor.get("isAvailable", False):
        return jsonify({"msg": "This doctor is currently off duty. Please select an available doctor."}), 400

    token    = f"T-{random.randint(1000, 9999)}"
    # Position is per-doctor, per-date (each day starts a fresh queue)
    appointment_date = data.get("date")
    position = appointments_col.count_documents({
        "doctorId": doctor_id,
        "date":     appointment_date,
        "status":   {"$in": ["Upcoming", "Ready"]}
    })

    patient_phone = data.get("phone", "").strip()

    new_apt = {
        "patientId":   current_user_id,
        "patientName": data.get("patientName"),
        "phone":       patient_phone,
        "department":  data.get("department"),
        "doctorId":    doctor_id,
        "date":        data.get("date"),
        "time":        data.get("time"),
        "token":       token,
        "position":    position,
        "status":      "Upcoming",
        "createdAt":   datetime.now()
    }

    apt_id = appointments_col.insert_one(new_apt).inserted_id

    # ── SMS: booking confirmation ──────────────────────────────────────────
    if patient_phone:
        doctor      = doctors_col.find_one({"_id": ObjectId(doctor_id)}) if doctor_id else None
        doctor_name = doctor.get("name", "your doctor") if doctor else "your doctor"
        sms_body = (
            f"Hi {data.get('patientName', 'Patient')}, your appointment has been booked!\n"
            f"Token : {token}\n"
            f"Doctor: Dr. {doctor_name}\n"
            f"Date  : {data.get('date', 'N/A')}  Time: {data.get('time', 'N/A')}\n"
            f"Please arrive 10 minutes early. - SmartHospital"
        )
        send_sms(patient_phone, sms_body)
    # ──────────────────────────────────────────────────────────────────────

    return jsonify({"msg": "Appointment booked", "token": token, "id": str(apt_id)}), 201


@app.route('/api/queue/waiting-room', methods=['GET'])
@jwt_required()
def get_waiting_room():
    expire_past_appointments()
    today           = datetime.now().strftime("%Y-%m-%d")
    current_user_id = get_jwt_identity()
    user            = users_col.find_one({"_id": ObjectId(current_user_id)})
    if not user:
        return jsonify({"msg": "User not found"}), 404

    if user.get("role") == "patient":
        # Show today's + future appointments (exclude completed and expired)
        active_apts = list(appointments_col.find({
            "patientId": current_user_id,
            "status":    {"$nin": ["Completed", "Expired"]},
            "date":      {"$gte": today}
        }).sort("position", 1))
    else:
        # Staff/Admin: only today's live queue
        active_apts = list(appointments_col.find({
            "status": {"$nin": ["Completed", "Expired"]},
            "date":   today
        }).sort("position", 1))

    return jsonify([serialize_doc(apt) for apt in active_apts]), 200


# SMS message templates keyed by the new status value
SMS_TEMPLATES = {
    "Ready": (
        "Hi {name}, it's almost your turn!\n"
        "Token {token} - please make your way to the {dept} reception now.\n"
        "- SmartHospital"
    ),
    "In Consultation": (
        "Hi {name}, the doctor is ready for you now.\n"
        "Token {token} - please proceed to the consultation room.\n"
        "- SmartHospital"
    ),
    "Completed": (
        "Hi {name}, your consultation (Token {token}) is now complete.\n"
        "Thank you for visiting SmartHospital. Get well soon!"
    ),
}

@app.route('/api/queue/update-status/<appointment_id>', methods=['PUT'])
@role_required(["staff", "admin"])
def update_appointment_status(appointment_id):
    new_status = request.json.get("status")

    apt = appointments_col.find_one({"_id": ObjectId(appointment_id)})

    appointments_col.update_one(
        {"_id": ObjectId(appointment_id)},
        {"$set": {"status": new_status}}
    )

    # ── Recalculate queue positions for this doctor's remaining patients ──
    if apt:
        doctor_id = apt.get("doctorId")
        apt_date  = apt.get("date")
        if doctor_id and apt_date:
            remaining = list(appointments_col.find({
                "doctorId": doctor_id,
                "date":     apt_date,
                "status":   {"$in": ["Upcoming", "Ready"]}
            }).sort("createdAt", 1))

            for idx, remaining_apt in enumerate(remaining):
                appointments_col.update_one(
                    {"_id": remaining_apt["_id"]},
                    {"$set": {"position": idx}}
                )
    # ──────────────────────────────────────────────────────────────────────

    # ── SMS: status change notification ───────────────────────────────────
    if apt and new_status in SMS_TEMPLATES:
        phone = apt.get("phone", "")
        if phone:
            template = SMS_TEMPLATES[new_status]
            sms_body = template.format(
                name  = apt.get("patientName", "Patient"),
                token = apt.get("token", ""),
                dept  = apt.get("department", "the relevant"),
            )
            send_sms(phone, sms_body)
    # ──────────────────────────────────────────────────────────────────────

    return jsonify({"msg": "Status updated successfully"}), 200


# ==========================================
# 4. BED AVAILABILITY & STAFF MANAGEMENT
# ==========================================
@app.route('/api/wards', methods=['GET', 'POST'])
@role_required(["staff", "admin"])
def manage_wards():
    if request.method == 'POST':
        data     = request.json
        new_ward = {
            "name":             data.get("name"),
            "totalBeds":        int(data.get("totalBeds", 0)),
            "occupiedBeds":     0,
            "predictedVacancy": "N/A"
        }
        ward_id = wards_col.insert_one(new_ward).inserted_id

        beds_to_insert = []
        bed_type = "Standard"
        if "ICU"         in new_ward["name"].upper(): bed_type = "Ventilator Support"
        elif "MATERNITY" in new_ward["name"].upper() or "PRIVATE" in new_ward["name"].upper(): bed_type = "Private"

        for i in range(1, new_ward["totalBeds"] + 1):
            beds_to_insert.append({
                "wardId":    str(ward_id),
                "ward":      new_ward["name"],
                "bedNumber": str(i),
                "type":      bed_type,
                "status":    "Available",
                "patient":   "-"
            })
        if beds_to_insert:
            beds_col.insert_many(beds_to_insert)
        return jsonify({"msg": "Ward and beds created successfully!"}), 201

    wards = list(wards_col.find())
    return jsonify([serialize_doc(ward) for ward in wards]), 200


@app.route('/api/beds', methods=['GET', 'POST'])
@role_required(["staff", "admin"])
def manage_beds():
    if request.method == 'POST':
        data    = request.json
        new_bed = {
            "wardId":    data['wardId'],
            "ward":      data['wardName'],
            "bedNumber": data.get('bedNumber', '0'),
            "type":      data['type'],
            "status":    data.get('status', 'Available'),
            "patient":   data.get('patient', '-')
        }
        beds_col.insert_one(new_bed)
        wards_col.update_one({"_id": ObjectId(data['wardId'])}, {"$inc": {"totalBeds": 1}})
        if new_bed['status'] == 'Occupied':
            wards_col.update_one({"_id": ObjectId(data['wardId'])}, {"$inc": {"occupiedBeds": 1}})
        return jsonify({"msg": "Bed added successfully"}), 201

    beds = list(beds_col.find())
    return jsonify([serialize_doc(bed) for bed in beds]), 200


@app.route('/api/beds/<bed_id>', methods=['PUT', 'DELETE'])
@role_required(["staff", "admin"])
def update_or_delete_bed(bed_id):
    if request.method == 'DELETE':
        bed = beds_col.find_one({"_id": ObjectId(bed_id)})
        if bed:
            beds_col.delete_one({"_id": ObjectId(bed_id)})
            wards_col.update_one({"_id": ObjectId(bed['wardId'])}, {"$inc": {"totalBeds": -1}})
            if bed.get('status') == 'Occupied':
                wards_col.update_one({"_id": ObjectId(bed['wardId'])}, {"$inc": {"occupiedBeds": -1}})
        return jsonify({"msg": "Bed deleted"}), 200

    data          = request.json
    update_fields = {}
    if "status"    in data: update_fields["status"]    = data["status"]
    if "patient"   in data: update_fields["patient"]   = data["patient"]
    if "type"      in data: update_fields["type"]       = data["type"]
    if "patientId" in data: update_fields["patientId"] = data["patientId"]

    old_bed = beds_col.find_one({"_id": ObjectId(bed_id)})
    beds_col.update_one({"_id": ObjectId(bed_id)}, {"$set": update_fields})

    new_patient_id = data.get("patientId")
    if new_patient_id and new_patient_id != "":
        bed_string = f"{old_bed.get('ward', 'Ward')} - Bed {old_bed.get('bedNumber', '-')}"
        patients_col.update_one(
            {"_id": ObjectId(new_patient_id)},
            {"$set": {"assignedBed": bed_string}}
        )
    elif data.get("patient") == "-" and old_bed and old_bed.get("patientId"):
        patients_col.update_one(
            {"_id": ObjectId(old_bed["patientId"])},
            {"$set": {"assignedBed": "Pending Allocation"}}
        )

    bed = beds_col.find_one({"_id": ObjectId(bed_id)})
    if bed:
        ward_id        = bed.get("wardId")
        occupied_count = beds_col.count_documents({"wardId": ward_id, "status": "Occupied"})
        wards_col.update_one({"_id": ObjectId(ward_id)}, {"$set": {"occupiedBeds": occupied_count}})

    return jsonify({"msg": "Bed status updated"}), 200


# ==========================================
# 5. MACHINE LEARNING + DIRECT LLM API LAYER
# ==========================================
@app.route('/api/predict-los', methods=['POST'])
@jwt_required()
def predict_los():
    data             = request.json
    specialist_notes = data.get("specialistNotes", "").strip()

    result = predict_los_and_explain(data)
    if "error" in result:
        return jsonify(result), 500

    if specialist_notes and GEMINI_API_KEY:
        specialist_notes = specialist_notes[:1000]
        try:
            class_map      = {0: "Short (1-3 days)", 1: "Medium (4-6 days)", 2: "Long (7+ days)"}
            base_pred_text = class_map.get(result["prediction"], "Unknown")
            top_factors    = ", ".join([
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
1. Carefully read the specialist notes. Identify any clinical factors the ML model could not see.
2. Decide if these new factors justify changing the baseline prediction class.
3. Construct a blended feature impact list.

## OUTPUT FORMAT
Return ONLY a valid JSON object — no markdown, no explanation outside the JSON.

{{
  "adjusted_prediction": <integer: 0 = Short 1-3 days, 1 = Medium 4-6 days, 2 = Long 7+ days>,
  "clinical_reasoning": "<2-3 sentence explanation>",
  "adjusted_feature_impacts": [
    {{"feature": "<n>", "impact": <float>}},
    ...
  ]
}}
"""
            url     = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"
            headers = {"Content-Type": "application/json"}
            payload = {"contents": [{"parts": [{"text": prompt}]}]}

            response = requests.post(url, headers=headers, json=payload, timeout=25)
            response.raise_for_status()

            response_data = response.json()
            response_text = response_data["candidates"][0]["content"]["parts"][0]["text"].strip()
            response_text = re.sub(r"^```(?:json)?\s*|\s*```$", "", response_text, flags=re.DOTALL).strip()

            llm_data         = json.loads(response_text)
            adjusted_impacts = llm_data.get("adjusted_feature_impacts", result.get("shap_values", []))
            try:
                adjusted_impacts.sort(key=lambda x: abs(float(x.get("impact", 0))), reverse=True)
            except Exception as e:
                logger.warning("Could not sort adjusted impacts: %s", e)

            result["llm_analysis"] = {
                "adjusted_prediction":      llm_data.get("adjusted_prediction", result["prediction"]),
                "clinical_reasoning":       llm_data.get("clinical_reasoning", "Analysis complete."),
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
        data        = request.json
        new_patient = {
            "firstName":         data.get("firstName"),
            "lastName":          data.get("lastName"),
            "age":               data.get("age"),
            "gender":            data.get("gender"),
            "contact":           data.get("contact"),
            "address":           data.get("address"),
            "emergencyName":     data.get("emergencyName"),
            "emergencyPhone":    data.get("emergencyPhone"),
            "insuranceProvider": data.get("insuranceProvider"),
            "insurancePolicy":   data.get("insurancePolicy"),
            "bloodGroup":        data.get("bloodGroup"),
            "allergies":         data.get("allergies", "None"),
            "chronicConditions": data.get("chronicConditions", "None"),
            "chiefComplaint":    data.get("chiefComplaint"),
            "department":        data.get("department"),
            "attendingDoctor":   data.get("attendingDoctor"),
            "admissionDate":     datetime.now().strftime("%Y-%m-%d %H:%M"),
            "dischargeDate":     "-",
            "status":            "Admitted",
            "assignedBed":       "Pending Allocation"
        }
        patient_id = patients_col.insert_one(new_patient).inserted_id
        return jsonify({"msg": "Patient admitted successfully", "id": str(patient_id)}), 201

    patients = list(patients_col.find().sort("admissionDate", -1))
    return jsonify([serialize_doc(p) for p in patients]), 200


@app.route('/api/patients/<patient_id>', methods=['PUT'])
@role_required(["staff", "admin"])
def update_patient(patient_id):
    data          = request.json
    update_fields = {k: v for k, v in data.items()
                     if k not in ["id", "_id", "admissionDate", "dischargeDate", "assignedBed", "status"]}
    patients_col.update_one({"_id": ObjectId(patient_id)}, {"$set": update_fields})
    return jsonify({"msg": "Patient record updated successfully"}), 200


@app.route('/api/patients/<patient_id>/discharge', methods=['PUT'])
@role_required(["staff", "admin"])
def discharge_patient(patient_id):
    discharge_time = datetime.now().strftime("%Y-%m-%d %H:%M")
    patients_col.update_one(
        {"_id": ObjectId(patient_id)},
        {"$set": {
            "status":        "Discharged",
            "dischargeDate": discharge_time,
            "assignedBed":   "Discharged"
        }}
    )

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
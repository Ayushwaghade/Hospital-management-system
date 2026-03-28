from pymongo import MongoClient

client = MongoClient("mongodb://localhost:27017/")
db = client.smarthospital

def seed_database():
    print("Clearing old data...")
    db.doctors.delete_many({})
    db.wards.delete_many({})
    db.beds.delete_many({})

    # 1. Seed Doctors
    doctors = [
        {"name": "Dr. Sarah Wilson", "department": "Cardiology", "avgConsultationTime": 15},
        {"name": "Dr. James Miller", "department": "Neurology", "avgConsultationTime": 20},
        {"name": "Dr. Elena Rodriguez", "department": "Pediatrics", "avgConsultationTime": 12},
        {"name": "Dr. Robert Chen", "department": "Orthopedics", "avgConsultationTime": 18}
    ]
    doc_ids = db.doctors.insert_many(doctors).inserted_ids
    print("Seeded Doctors.")

    # 2. Seed Wards
    wards = [
        {"name": "General Ward A", "totalBeds": 50, "occupiedBeds": 42, "predictedVacancy": "2 hours"},
        {"name": "ICU Unit 1", "totalBeds": 12, "occupiedBeds": 11, "predictedVacancy": "8 hours"},
        {"name": "Maternity Ward", "totalBeds": 25, "occupiedBeds": 15, "predictedVacancy": "4 hours"}
    ]
    ward_ids = db.wards.insert_many(wards).inserted_ids
    print("Seeded Wards.")

    # 3. Seed Beds based on Wards
    beds = [
        {"wardId": ward_ids[0], "ward": "General Ward A", "type": "Standard", "status": "Occupied", "patient": "Alice Cooper"},
        {"wardId": ward_ids[0], "ward": "General Ward A", "type": "Standard", "status": "Available", "patient": "-"},
        {"wardId": ward_ids[1], "ward": "ICU Unit 1", "type": "Ventilator Support", "status": "Occupied", "patient": "Bob Dylan"},
    ]
    db.beds.insert_many(beds)
    print("Seeded Beds.")

if __name__ == "__main__":
    seed_database()
    print("Database seeding complete!")
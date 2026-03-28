export const doctors = [
  { id: '1', name: 'Dr. Sarah Wilson', department: 'Cardiology', patientsWaiting: 4, avgConsultationTime: 15, estimatedWaitTime: 45 },
  { id: '2', name: 'Dr. James Miller', department: 'Neurology', patientsWaiting: 2, avgConsultationTime: 20, estimatedWaitTime: 40 },
  { id: '3', name: 'Dr. Elena Rodriguez', department: 'Pediatrics', patientsWaiting: 6, avgConsultationTime: 12, estimatedWaitTime: 72 },
  { id: '4', name: 'Dr. Robert Chen', department: 'Orthopedics', patientsWaiting: 3, avgConsultationTime: 18, estimatedWaitTime: 54 },
];

export const wards = [
  { id: '1', name: 'General Ward A', totalBeds: 50, occupiedBeds: 42, predictedVacancy: '2 hours' },
  { id: '2', name: 'ICU Unit 1', totalBeds: 12, occupiedBeds: 11, predictedVacancy: '8 hours' },
  { id: '3', name: 'Maternity Ward', totalBeds: 25, occupiedBeds: 15, predictedVacancy: '4 hours' },
  { id: '4', name: 'Emergency Care', totalBeds: 20, occupiedBeds: 18, predictedVacancy: '1 hour' },
];

export const waitingRoomPatients = [
  { token: 'T-1024', name: 'John Doe', department: 'Cardiology', time: '10:30 AM', position: 2, status: 'Upcoming' },
  { token: 'T-1025', name: 'Jane Smith', department: 'Neurology', time: '10:45 AM', position: 1, status: 'Ready' },
  { token: 'T-1021', name: 'Michael Brown', department: 'Pediatrics', time: '10:15 AM', position: 0, status: 'In Consultation' },
  { token: 'T-1028', name: 'Emily Davis', department: 'Orthopedics', time: '11:00 AM', position: 5, status: 'Upcoming' },
];

export const queueTrend = [
  { time: '08:00', patients: 12 },
  { time: '10:00', patients: 35 },
  { time: '12:00', patients: 48 },
  { time: '14:00', patients: 30 },
  { time: '16:00', patients: 25 },
  { time: '18:00', patients: 15 },
];

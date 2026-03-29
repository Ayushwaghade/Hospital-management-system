"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, CheckCircle2, Clock, Loader2, Phone } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { api } from "@/lib/axios";

interface Doctor {
  id: string;
  name: string;
  department: string;
  avgConsultationTime: number;
  patientsWaiting: number;
  estimatedWaitTime: number;
}

const TIME_SLOTS = [
  { value: "09:00", label: "09:00 AM" },
  { value: "10:00", label: "10:00 AM" },
  { value: "11:00", label: "11:00 AM" },
  { value: "14:00", label: "02:00 PM" },
  { value: "15:00", label: "03:00 PM" },
];

export default function AppointmentBookingPage() {
  const [date, setDate] = useState<Date>();
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Data States
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);

  // Form States
  const [patientName, setPatientName] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [error, setError] = useState("");

  // Result States
  const [bookingResult, setBookingResult] = useState<{ token: string; waitTime: number } | null>(null);

  useEffect(() => {
    const fetchDoctors = async () => {
      try {
        const response = await api.get('/doctors');
        setDoctors(response.data);
      } catch (err) {
        console.error("Failed to load doctors", err);
      } finally {
        setLoadingDoctors(false);
      }
    };
    fetchDoctors();
  }, []);

  const selectedDoctor = doctors.find(doc => doc.id === selectedDoctorId);

  // --- NEW: Time Slot Validation Logic ---
  const isTimeSlotDisabled = (timeVal: string) => {
    if (!date) return true;
    
    const now = new Date();
    const isToday = 
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    // If the selected date is today, disable past times
    if (isToday) {
      const [hours, minutes] = timeVal.split(':').map(Number);
      const currentTimeInMinutes = now.getHours() * 60 + now.getMinutes();
      const slotTimeInMinutes = hours * 60 + minutes;
      
      return slotTimeInMinutes <= currentTimeInMinutes;
    }
    
    return false; // Future dates have all slots open
  };

  // --- NEW: Auto-clear invalid time slot if the date changes ---
  useEffect(() => {
    if (timeSlot && isTimeSlotDisabled(timeSlot)) {
      setTimeSlot("");
    }
  }, [date, timeSlot]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !selectedDoctorId || !timeSlot || !patientName || !phone) {
      setError("Please fill in all fields including phone number.");
      return;
    }

    // Basic 10-digit validation
    const cleanPhone = phone.replace(/\s+/g, "");
    if (!/^\+?[\d]{10,13}$/.test(cleanPhone)) {
      setError("Please enter a valid phone number (10–13 digits, optionally starting with +).");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await api.post('/appointments', {
        patientName: patientName,
        phone:       cleanPhone,
        doctorId:    selectedDoctorId,
        department:  selectedDoctor?.department || "General",
        date:        format(date, "yyyy-MM-dd"),
        time:        timeSlot,
      });

      setBookingResult({
        token:    response.data.token,
        waitTime: selectedDoctor?.estimatedWaitTime || 15,
      });
      setSubmitted(true);
    } catch (err: any) {
      setError(err.response?.data?.msg || "Failed to book appointment.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setPatientName("");
    setPhone("");
    setSelectedDoctorId("");
    setTimeSlot("");
    setDate(undefined);
    setBookingResult(null);
  };

  // ── Confirmation screen ──────────────────────────────────────────────────
  if (submitted && bookingResult) {
    return (
      <DashboardLayout>
        <div className="max-w-2xl mx-auto mt-12 text-center">
          <Card className="border-none shadow-lg">
            <CardContent className="p-12 flex flex-col items-center">
              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-12 h-12 text-emerald-600" />
              </div>
              <h2 className="text-3xl font-bold mb-2">Booking Confirmed!</h2>
              <p className="text-muted-foreground mb-2">
                Your appointment has been successfully scheduled.
              </p>
              <p className="text-sm text-muted-foreground mb-8 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5" />
                A confirmation SMS has been sent to <strong className="ml-1">{phone}</strong>
              </p>

              <div className="w-full bg-secondary/50 rounded-xl p-6 grid grid-cols-2 gap-4 mb-8">
                <div className="text-left">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Token Number</p>
                  <p className="text-3xl font-bold text-primary">{bookingResult.token}</p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Est. Waiting Time</p>
                  <p className="text-3xl font-bold">~{bookingResult.waitTime} mins</p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Live prediction
                  </p>
                </div>
              </div>

              <Button onClick={handleReset} variant="outline" className="w-full md:w-auto">
                Book Another Appointment
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  // ── Booking form ─────────────────────────────────────────────────────────
  return (
    <DashboardLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Book Appointment</h2>
          <p className="text-muted-foreground">Schedule a visit with our specialized doctors</p>
        </div>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle>Appointment Details</CardTitle>
            <CardDescription>
              Fill in the form below to secure your time slot in the queue
            </CardDescription>
          </CardHeader>
          <CardContent>
            {error && (
              <div className="p-3 mb-4 text-sm text-destructive bg-destructive/10 rounded-md">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Patient Name */}
                <div className="space-y-2">
                  <Label htmlFor="patientName">Patient Full Name</Label>
                  <Input
                    id="patientName"
                    placeholder="Enter patient name"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    required
                  />
                </div>

                {/* Phone Number */}
                <div className="space-y-2">
                  <Label htmlFor="phone">
                    Phone Number
                    <span className="ml-1.5 text-xs text-muted-foreground font-normal">
                      (for SMS updates)
                    </span>
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id="phone"
                      type="tel"
                      placeholder="+91 98765 43210"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="pl-9"
                      required
                    />
                  </div>
                </div>

                {/* Doctor Selection */}
                <div className="space-y-2">
                  <Label>Doctor</Label>
                  <Select
                    value={selectedDoctorId}
                    onValueChange={setSelectedDoctorId}
                    required
                    disabled={loadingDoctors}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={loadingDoctors ? "Loading doctors..." : "Choose a doctor"} />
                    </SelectTrigger>
                    <SelectContent>
                      {doctors.map(doc => (
                        <SelectItem key={doc.id} value={doc.id}>
                          {doc.name} — {doc.department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Department Auto-fill */}
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input
                    value={selectedDoctor ? selectedDoctor.department : ""}
                    placeholder="Auto-filled based on doctor"
                    disabled
                    className="bg-secondary/50 cursor-not-allowed"
                  />
                </div>

                {/* Date Selection */}
                <div className="space-y-2">
                  <Label>Preferred Date</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !date && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {date ? format(date, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <Calendar
                        mode="single"
                        selected={date}
                        onSelect={setDate}
                        disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Time Selection */}
                <div className="space-y-2">
                  <Label>Time Slot</Label>
                  <Select value={timeSlot} onValueChange={setTimeSlot} required disabled={!date}>
                    <SelectTrigger>
                      <SelectValue placeholder={!date ? "Select a date first" : "Select time"} />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.map(slot => (
                        <SelectItem 
                          key={slot.value} 
                          value={slot.value}
                          disabled={isTimeSlotDisabled(slot.value)}
                        >
                          {slot.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dynamic Wait Time Hint */}
              <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-lg border border-primary/10 transition-all">
                <Clock className="w-5 h-5 text-primary shrink-0" />
                <p className="text-sm text-muted-foreground">
                  {selectedDoctor ? (
                    <>
                      There are currently{" "}
                      <strong className="text-foreground">{selectedDoctor.patientsWaiting}</strong>{" "}
                      patients in {selectedDoctor.name}'s queue. Estimated wait time is{" "}
                      <strong className="text-foreground">{selectedDoctor.estimatedWaitTime} mins</strong>.
                    </>
                  ) : (
                    "Select a doctor to view real-time queue estimates."
                  )}
                </p>
              </div>

              <Button type="submit" className="w-full md:w-auto px-12" disabled={isSubmitting}>
                {isSubmitting ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Booking...</>
                ) : (
                  "Submit Booking"
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
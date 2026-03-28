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
import { CalendarIcon, CheckCircle2, Clock, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { api } from "@/lib/axios";

// Interface matching the backend doctor response
interface Doctor {
  id: string;
  name: string;
  department: string;
  avgConsultationTime: number;
  patientsWaiting: number;
  estimatedWaitTime: number;
}

export default function AppointmentBookingPage() {
  const [date, setDate] = useState<Date>();
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Data States
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [loadingDoctors, setLoadingDoctors] = useState(true);
  
  // Form States
  const [patientName, setPatientName] = useState("");
  const [selectedDoctorId, setSelectedDoctorId] = useState("");
  const [timeSlot, setTimeSlot] = useState("");
  const [error, setError] = useState("");

  // Result States (from Backend)
  const [bookingResult, setBookingResult] = useState<{ token: string; waitTime: number } | null>(null);

  useEffect(() => {
    // Fetch live doctors list from backend when page loads
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

  // Find the currently selected doctor to auto-fill department and wait times
  const selectedDoctor = doctors.find(doc => doc.id === selectedDoctorId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !selectedDoctorId || !timeSlot || !patientName) {
      setError("Please fill in all fields.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      // Send the booking request to Flask API
      const response = await api.post('/appointments', {
        patientName: patientName,
        doctorId: selectedDoctorId,
        department: selectedDoctor?.department || "General",
        date: format(date, "yyyy-MM-dd"),
        time: timeSlot
      });

      // Save the backend response (Token) and the current estimated wait time
      setBookingResult({
        token: response.data.token,
        waitTime: selectedDoctor?.estimatedWaitTime || 15
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
    setSelectedDoctorId("");
    setTimeSlot("");
    setDate(undefined);
    setBookingResult(null);
  };

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
              <p className="text-muted-foreground mb-8">Your appointment has been successfully scheduled.</p>
              
              <div className="w-full bg-secondary/50 rounded-xl p-6 grid grid-cols-2 gap-4 mb-8">
                <div className="text-left">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Token Number</p>
                  <p className="text-3xl font-bold text-primary">{bookingResult.token}</p>
                </div>
                <div className="text-right flex flex-col items-end">
                  <p className="text-xs text-muted-foreground uppercase font-semibold">Est. Waiting Time</p>
                  <p className="text-3xl font-bold">~{bookingResult.waitTime} mins</p>
                  <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                    <Clock className="w-3 h-3"/> Live prediction
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
            <CardDescription>Fill in the form below to secure your time slot in the queue</CardDescription>
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

                {/* Doctor Selection */}
                <div className="space-y-2">
                  <Label>Doctor</Label>
                  <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId} required disabled={loadingDoctors}>
                    <SelectTrigger>
                      <SelectValue placeholder={loadingDoctors ? "Loading doctors..." : "Choose a doctor"} />
                    </SelectTrigger>
                    <SelectContent>
                      {doctors.map(doc => (
                        <SelectItem key={doc.id} value={doc.id}>
                          {doc.name} - {doc.department}
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
                        variant={"outline"}
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
                        disabled={(d) => d < new Date(new Date().setHours(0, 0, 0, 0))} // Prevent selecting past days
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                {/* Time Selection */}
                <div className="space-y-2">
                  <Label>Time Slot</Label>
                  <Select value={timeSlot} onValueChange={setTimeSlot} required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="09:00">09:00 AM</SelectItem>
                      <SelectItem value="10:00">10:00 AM</SelectItem>
                      <SelectItem value="11:00">11:00 AM</SelectItem>
                      <SelectItem value="14:00">02:00 PM</SelectItem>
                      <SelectItem value="15:00">03:00 PM</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Dynamic Wait Time Hint */}
              <div className="flex items-center gap-3 p-4 bg-primary/5 rounded-lg border border-primary/10 transition-all">
                <Clock className="w-5 h-5 text-primary" />
                <p className="text-sm text-muted-foreground">
                  {selectedDoctor ? (
                    <>
                      There are currently <strong className="text-foreground">{selectedDoctor.patientsWaiting}</strong> patients in {selectedDoctor.name}'s queue. 
                      Estimated wait time is <strong className="text-foreground">{selectedDoctor.estimatedWaitTime} mins</strong>.
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
"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Monitor, RefreshCcw, Clock, Loader2, CalendarDays, Activity, CheckCircle2 } from "lucide-react";
import { api } from "@/lib/axios";
import { Button } from "@/components/ui/button";

interface Appointment {
  id: string;
  token: string;
  patientName: string;
  department: string;
  position: number;
  status: string;
  doctorId: string;
  date?: string; 
  time?: string;
}

export default function WaitingRoomPage() {
  const [timeLeft, setTimeLeft] = useState(0);
  const [lastQueueLength, setLastQueueLength] = useState<number | null>(null); // Tracks live queue to dynamically adjust timer
  const [patients, setPatients] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false); 
  const [role, setRole] = useState<string | null>(null);
  
  const [queueStats, setQueueStats] = useState({ avgWait: 0, completed: 0 });

  const fetchWaitingRoom = async (showMainSpinner = true) => {
    if (showMainSpinner) setLoading(true);
    else setIsRefreshing(true);

    try {
      // 1. Fetch both Patients AND Doctors (so we can see live doctor stats)
      const [queueRes, docsRes] = await Promise.all([
        api.get('/queue/waiting-room'),
        api.get('/doctors')
      ]);
      
      const patientsData = queueRes.data;
      const doctors = docsRes.data;
      setPatients(patientsData);

      const currentRole = localStorage.getItem("role");

      // --- 2. PATIENT LOGIC: Calculate exact personal wait time ---
      if (currentRole === "patient" && patientsData.length > 0) {
        const myAppt = patientsData[0];
        const myDoc = doctors.find((d: any) => d.id === myAppt.doctorId);

        if (myAppt.status === "In Consultation" || myAppt.status === "Completed") {
          setTimeLeft(0);
          setLastQueueLength(0);
        } else if (myAppt.status === "Ready") {
          setTimeLeft(0); 
          setLastQueueLength(-1); // Special flag for "Ready"
        } else if (myDoc) {
          // Use the patient's personal queue position for accurate individual wait time
          const myPosition = myAppt.position ?? 1;
          const avgTime = myDoc.avgConsultationTime || 15;

          // If position changes (e.g., a patient ahead finishes), resync the timer
          if (lastQueueLength !== myPosition) {
            setTimeLeft(myPosition * avgTime * 60);
            setLastQueueLength(myPosition);
          }
        }
      }

      // --- 3. STAFF/ADMIN LOGIC: Calculate hospital-wide stats ---
      if (currentRole === "staff" || currentRole === "admin") {
        let calculatedAvgWait = 0;
        const docsWithQueues = doctors.filter((d: any) => d.patientsWaiting > 0);
        
        if (docsWithQueues.length > 0) {
          // Calculate average wait time based on the specific consultation times of active doctors
          const totalWaitTime = docsWithQueues.reduce((acc: number, doc: any) => 
            acc + (doc.patientsWaiting * (doc.avgConsultationTime || 15)), 0
          );
          calculatedAvgWait = Math.round(totalWaitTime / docsWithQueues.length);
        }

        let estimatedCompleted = 0;
        doctors.forEach((doc: any) => {
          const docPatients = patientsData.filter((p: Appointment) => p.doctorId === doc.id);
          if (docPatients.length > 0) {
            const maxPosition = Math.max(...docPatients.map((p: Appointment) => p.position));
            estimatedCompleted += Math.max(0, maxPosition - docPatients.length);
          }
        });

        setQueueStats({ avgWait: calculatedAvgWait, completed: estimatedCompleted });
      }
    } catch (error) {
      console.error("Failed to fetch waiting room data:", error);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    setRole(localStorage.getItem("role"));
    
    fetchWaitingRoom(true);

    // BACKGROUND POLLING: Auto-refresh data every 10 seconds
    const pollInterval = setInterval(() => {
      fetchWaitingRoom(false);
    }, 10000);

    // Visual Timer countdown logic
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => {
      clearInterval(pollInterval);
      clearInterval(timer);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Ready": return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "In Consultation": return "bg-blue-100 text-blue-700 border-blue-200";
      case "Upcoming": return "bg-secondary text-secondary-foreground border-transparent";
      default: return "";
    }
  };

  const getTodayDateString = () => new Date().toLocaleDateString('en-CA'); 
  const myAppointment = role === "patient" && patients.length > 0 ? patients[0] : null;
  const isFutureAppointment = myAppointment?.date ? myAppointment.date > getTodayDateString() : false;

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Virtual Waiting Room</h2>
          <p className="text-muted-foreground">
            {role === "patient" ? "Track your appointment status in real-time." : "Live overview of all active patient queues."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2 border-none shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Monitor className="w-5 h-5 text-primary" />
                Live Waiting List
                {isRefreshing && <span className="text-xs font-normal text-muted-foreground ml-2 animate-pulse">(Live Syncing...)</span>}
              </CardTitle>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => fetchWaitingRoom(true)} 
                disabled={loading || isRefreshing}
              >
                <RefreshCcw className={`w-4 h-4 text-muted-foreground ${loading || isRefreshing ? 'animate-spin' : ''}`} />
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center p-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : patients.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground bg-secondary/20 rounded-lg border border-dashed">
                  No patients currently in the waiting room.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Token</TableHead>
                      <TableHead>Patient Name</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patients.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-bold text-primary">{p.token}</TableCell>
                        <TableCell>{p.patientName}</TableCell>
                        <TableCell>{p.department}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-secondary text-xs font-bold">
                            {p.position}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getStatusColor(p.status)}>
                            {p.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* Stats Column */}
          <div className="space-y-6">
            <Card className={`border-none shadow-sm text-primary-foreground transition-all duration-500 ${
              isFutureAppointment ? 'bg-slate-700' : 
              myAppointment?.status === 'Ready' ? 'bg-emerald-600' : 
              'bg-primary'
            }`}>
              <CardContent className="p-6 text-center">
                
                {/* 1. PATIENT VIEW: Future Appointment */}
                {role === "patient" && isFutureAppointment ? (
                  <>
                    <CalendarDays className="w-10 h-10 mx-auto mb-4 opacity-75" />
                    <h3 className="text-sm font-medium opacity-90 mb-1">Scheduled for Later</h3>
                    <div className="text-2xl font-bold tracking-tight mt-2">
                      {myAppointment?.date}
                    </div>
                    <div className="text-sm opacity-80 mt-1">
                      {myAppointment?.time || "Time TBD"}
                    </div>
                  </>

                // 2. PATIENT VIEW: It's Their Turn!
                ) : role === "patient" && myAppointment?.status === "Ready" ? (
                  <div className="animate-in fade-in zoom-in duration-500">
                    <CheckCircle2 className="w-12 h-12 mx-auto mb-4 text-emerald-200" />
                    <h3 className="text-lg font-bold mb-1">It's Your Turn!</h3>
                    <div className="text-sm text-emerald-100 mt-2">
                      Please proceed to the doctor's cabin.
                    </div>
                  </div>

                // 3. PATIENT VIEW: In Consultation
                ) : role === "patient" && myAppointment?.status === "In Consultation" ? (
                  <div>
                    <Activity className="w-10 h-10 mx-auto mb-4 text-blue-200 animate-pulse" />
                    <h3 className="text-lg font-bold mb-1">In Consultation</h3>
                    <div className="text-sm opacity-80 mt-1">Meeting with the doctor.</div>
                  </div>

                // 4. PATIENT VIEW: Today's Appointment (Ticking Clock)
                ) : role === "patient" ? (
                  <>
                    <Clock className="w-10 h-10 mx-auto mb-4 opacity-75" />
                    <h3 className="text-sm font-medium opacity-90 mb-1">Estimated Wait for Your Turn</h3>
                    <div className="text-5xl font-bold font-mono tracking-tighter mt-2">
                      {patients.length > 0 ? formatTime(timeLeft) : "0:00"}
                    </div>
                  </>

                // 5. STAFF/ADMIN VIEW: Static Dashboard Metric
                ) : (
                  <>
                    <Activity className="w-10 h-10 mx-auto mb-4 opacity-75" />
                    <h3 className="text-sm font-medium opacity-90 mb-1">Live Average Wait Time</h3>
                    <div className="text-4xl font-bold font-mono tracking-tighter">
                      {patients.length > 0 ? `${queueStats.avgWait} Mins` : "0 Mins"}
                    </div>
                  </>
                )}

              </CardContent>
            </Card>

            {/* Only show full queue stats to staff/admin */}
            {role !== "patient" && (
              <Card className="border-none shadow-sm">
                <CardHeader>
                  <CardTitle className="text-md">Queue Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Total Waiting</span>
                    <span className="font-bold">{patients.length}</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Avg Wait Today</span>
                    <span className="font-bold">{queueStats.avgWait} min</span>
                  </div>
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Consultations Done</span>
                    <span className="font-bold text-emerald-600">{queueStats.completed}</span>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
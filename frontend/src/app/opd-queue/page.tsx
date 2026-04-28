"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Users, Clock, MoreHorizontal, Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { api } from "@/lib/axios";

// Interfaces matching your Flask backend
interface Doctor {
  id: string;
  name: string;
  department: string;
  avgConsultationTime: number;
  patientsWaiting: number;
  estimatedWaitTime: number;
  isAvailable: boolean;
}

interface Appointment {
  id: string;
  doctorId: string;
  token: string;
  patientName: string;
  status: string;
  position: number;
}

export default function OpdQueuePage() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [allPatients, setAllPatients] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // Fetch both doctors and active patients
  const fetchData = async () => {
    setLoading(true);
    try {
      const [docsRes, patientsRes] = await Promise.all([
        api.get('/doctors'),
        api.get('/queue/waiting-room')
      ]);
      setDoctors(docsRes.data);
      setAllPatients(patientsRes.data);
    } catch (error) {
      console.error("Failed to fetch queue data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle advancing a patient's status
  const handleUpdateStatus = async (appointmentId: string, currentStatus: string) => {
    setUpdatingId(appointmentId);
    
    // Determine the next logical step in the queue
    let newStatus = "";
    if (currentStatus === "Upcoming") newStatus = "Ready";
    else if (currentStatus === "Ready") newStatus = "In Consultation";
    else if (currentStatus === "In Consultation") newStatus = "Completed";

    try {
      await api.put(`/queue/update-status/${appointmentId}`, { status: newStatus });
      await fetchData(); // Refresh everything to update counts and times
    } catch (error) {
      console.error("Failed to update status:", error);
    } finally {
      setUpdatingId(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Ready": return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "In Consultation": return "bg-blue-100 text-blue-700 border-blue-200 animate-pulse";
      case "Upcoming": return "bg-secondary text-secondary-foreground";
      default: return "";
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">OPD Queues</h2>
            <p className="text-muted-foreground">Real-time status and queue management</p>
          </div>
          <Button onClick={fetchData} disabled={loading} variant="outline" className="gap-2">
            <RefreshCcwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh Queues
          </Button>
        </div>

        {loading && doctors.length === 0 ? (
          <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {doctors.map((doc) => {
              // Filter patients specific to this doctor
              const docPatients = allPatients.filter(p => p.doctorId === doc.id);
              const nextPatient = docPatients.find(p => p.status === "Ready" || p.status === "Upcoming");
              const currentPatient = docPatients.find(p => p.status === "In Consultation");

              return (
                <Card key={doc.id} className={`border-none shadow-sm overflow-hidden hover:shadow-md transition-shadow flex flex-col ${
                  !doc.isAvailable ? 'opacity-60' : ''
                }`}>
                  <CardHeader className="bg-primary/5 pb-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{doc.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{doc.department}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={doc.isAvailable 
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                          : 'bg-gray-50 text-gray-500 border-gray-200'
                        }>
                          {doc.isAvailable ? "On Duty" : "Off Duty"}
                        </Badge>
                        <Badge variant="outline" className="bg-background">
                          {doc.avgConsultationTime}m / patient
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6 space-y-4 flex-1 flex flex-col">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="w-3 h-3" /> Waiting
                        </p>
                        <p className="text-2xl font-bold text-primary">{doc.patientsWaiting}</p>
                      </div>
                      <div className="space-y-1 text-right">
                        <p className="text-xs text-muted-foreground flex items-center gap-1 justify-end">
                          <Clock className="w-3 h-3" /> Est. Wait
                        </p>
                        <p className="text-2xl font-bold">{doc.estimatedWaitTime}m</p>
                      </div>
                    </div>

                    <div className="space-y-2 py-2">
                      <div className="flex justify-between text-xs font-medium">
                        <span className="text-muted-foreground">Current: <span className="text-foreground">{currentPatient ? currentPatient.token : "None"}</span></span>
                        <span className="text-muted-foreground">Next: <span className="text-foreground">{nextPatient ? nextPatient.token : "None"}</span></span>
                      </div>
                      <Progress value={docPatients.length > 0 ? 65 : 0} className="h-1.5" />
                    </div>

                    <div className="mt-auto pt-4">
                      {/* MANAGE QUEUE DIALOG */}
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button className="w-full font-semibold">Manage Queue</Button>
                        </DialogTrigger>
                        <DialogContent className="max-w-3xl">
                          <DialogHeader>
                            <DialogTitle>{doc.name}'s Queue</DialogTitle>
                          </DialogHeader>
                          
                          {docPatients.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">No patients currently waiting.</div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Token</TableHead>
                                  <TableHead>Patient</TableHead>
                                  <TableHead>Status</TableHead>
                                  <TableHead className="text-right">Action</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {docPatients.map(patient => (
                                  <TableRow key={patient.id}>
                                    <TableCell className="font-bold">{patient.token}</TableCell>
                                    <TableCell>{patient.patientName}</TableCell>
                                    <TableCell>
                                      <Badge className={getStatusColor(patient.status)} variant="outline">
                                        {patient.status}
                                      </Badge>
                                    </TableCell>
                                    <TableCell className="text-right">
                                      <Button 
                                        size="sm" 
                                        onClick={() => handleUpdateStatus(patient.id, patient.status)}
                                        disabled={updatingId === patient.id}
                                        variant={patient.status === "In Consultation" ? "default" : "secondary"}
                                      >
                                        {updatingId === patient.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                          <>
                                            {patient.status === "Upcoming" && "Mark Ready"}
                                            {patient.status === "Ready" && "Call In"}
                                            {patient.status === "In Consultation" && <><CheckCircle2 className="w-4 h-4 mr-1"/> Complete</>}
                                          </>
                                        )}
                                      </Button>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </DialogContent>
                      </Dialog>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

// Simple local component for the refresh icon
function RefreshCcwIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
      <path d="M16 21v-5h5" />
    </svg>
  );
}
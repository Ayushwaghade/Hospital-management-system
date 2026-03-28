"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserPlus, Stethoscope, Clock, Trash2, Activity, Power } from "lucide-react";
import { api } from "@/lib/axios";

const DEPARTMENTS = ["Cardiology", "Orthopedics", "Neurology", "Pediatrics", "Oncology", "General Medicine"];

export default function DoctorManagementPage() {
  const [doctors, setDoctors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // New Doctor Form State
  const [newDoctor, setNewDoctor] = useState({
    name: "",
    department: "",
    specialization: "",
    avgConsultationTime: "15"
  });

  const fetchDoctors = async () => {
    try {
      const res = await api.get('/doctors');
      setDoctors(res.data);
    } catch (error) {
      console.error("Failed to fetch doctors:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDoctors();
  }, []);

  const handleAddDoctor = async () => {
    if (!newDoctor.name || !newDoctor.department) return alert("Name and Department are required!");
    
    try {
      await api.post('/doctors', {
        ...newDoctor,
        name: `Dr. ${newDoctor.name}`, // Auto-append "Dr."
        isAvailable: false // Default off-duty
      });
      setNewDoctor({ name: "", department: "", specialization: "", avgConsultationTime: "15" });
      fetchDoctors(); // Refresh list
    } catch (error) {
      console.error("Failed to add doctor", error);
    }
  };

  const toggleAvailability = async (doctorId: string, currentStatus: boolean) => {
    try {
      // Optimistic UI Update (Feels instant to the user)
      setDoctors(doctors.map(doc => 
        doc.id === doctorId ? { ...doc, isAvailable: !currentStatus } : doc
      ));

      // Background API Call
      await api.put(`/doctors/${doctorId}`, {
        isAvailable: !currentStatus
      });
    } catch (error) {
      console.error("Failed to update status", error);
      fetchDoctors(); // Revert if failed
    }
  };

  const deleteDoctor = async (doctorId: string) => {
    if (!confirm("Are you sure you want to remove this doctor from the system?")) return;
    try {
      await api.delete(`/doctors/${doctorId}`);
      fetchDoctors();
    } catch (error) {
      console.error("Failed to delete doctor", error);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Stethoscope className="w-6 h-6 text-primary" />
            Doctor Roster & Availability
          </h2>
          <p className="text-muted-foreground">Manage hospital staff, departments, and live duty status.</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* LEFT: LIVE DOCTOR ROSTER */}
          <div className="xl:col-span-8 space-y-4">
            {loading ? (
              <Card className="p-8 flex justify-center items-center h-64"><Activity className="w-8 h-8 animate-spin text-primary opacity-50" /></Card>
            ) : doctors.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">No doctors found in the system. Add one to begin.</Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {doctors.map((doc) => (
                  <Card key={doc.id} className={`border-l-4 transition-all ${doc.isAvailable ? 'border-l-emerald-500 shadow-sm' : 'border-l-gray-300 opacity-80'}`}>
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{doc.name}</CardTitle>
                          <CardDescription className="flex items-center gap-1 mt-1">
                            <Badge variant="secondary" className="text-xs font-normal">{doc.department}</Badge>
                            {doc.specialization && <span className="text-xs text-muted-foreground border-l pl-1 ml-1">{doc.specialization}</span>}
                          </CardDescription>
                        </div>
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-red-500 hover:bg-red-50 -mt-2 -mr-2" onClick={() => deleteDoctor(doc.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between mt-2 pt-4 border-t border-border/50">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock className="w-4 h-4" />
                          <span>{doc.avgConsultationTime} min / pt</span>
                        </div>
                        
                        {/* THE LIVE TOGGLE SWITCH */}
                        <div className="flex items-center gap-2">
                          <Label className={`text-xs font-bold uppercase tracking-wider ${doc.isAvailable ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                            {doc.isAvailable ? "On Duty" : "Off Duty"}
                          </Label>
                          <Switch 
                            checked={doc.isAvailable || false} 
                            onCheckedChange={() => toggleAvailability(doc.id, doc.isAvailable)}
                            className={doc.isAvailable ? "!bg-emerald-500" : ""}
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: ADD NEW DOCTOR FORM */}
          <Card className="xl:col-span-4 border-none shadow-sm h-fit sticky top-6">
            <CardHeader className="bg-primary/5 pb-4 border-b">
              <CardTitle className="text-lg flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-primary" />
                Onboard New Doctor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-6">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-muted-foreground bg-secondary px-3 py-2 rounded-md">Dr.</span>
                  <Input 
                    placeholder="Jane Doe" 
                    value={newDoctor.name} 
                    onChange={(e) => setNewDoctor({...newDoctor, name: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Department</Label>
                <Select value={newDoctor.department} onValueChange={(v) => setNewDoctor({...newDoctor, department: v})}>
                  <SelectTrigger><SelectValue placeholder="Select Department" /></SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map(dep => <SelectItem key={dep} value={dep}>{dep}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Specialization (Optional)</Label>
                <Input 
                  placeholder="e.g. Pediatric Cardiology" 
                  value={newDoctor.specialization} 
                  onChange={(e) => setNewDoctor({...newDoctor, specialization: e.target.value})}
                />
              </div>

              <div className="space-y-2">
                <Label>Avg. Consultation Time (Mins)</Label>
                <Input 
                  type="number" 
                  value={newDoctor.avgConsultationTime} 
                  onChange={(e) => setNewDoctor({...newDoctor, avgConsultationTime: e.target.value})}
                />
                <p className="text-xs text-muted-foreground">Used by the Virtual Waiting Room to calculate live patient wait times.</p>
              </div>

              <Button onClick={handleAddDoctor} className="w-full mt-2">
                <UserPlus className="w-4 h-4 mr-2" />
                Add to Roster
              </Button>
            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
}
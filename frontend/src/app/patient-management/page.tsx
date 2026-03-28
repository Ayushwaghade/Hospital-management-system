"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Users, UserPlus, LogOut, Loader2, Search, AlertCircle, FileText, Edit, X } from "lucide-react";
import { api } from "@/lib/axios";

const EMPTY_FORM = {
  firstName: "", lastName: "", age: "", gender: "", contact: "", address: "",
  emergencyName: "", emergencyPhone: "", insuranceProvider: "", insurancePolicy: "",
  bloodGroup: "", allergies: "", chronicConditions: "",
  chiefComplaint: "", department: "", attendingDoctor: ""
};

export default function PatientManagementPage() {
  const [patients, setPatients] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [departments, setDepartments] = useState<string[]>([]); // NEW: Dynamic departments state
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("personal");
  
  // State to track if we are editing an existing patient
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);

  const fetchData = async () => {
    try {
      const [patientsRes, doctorsRes] = await Promise.all([
        api.get('/patients'),
        api.get('/doctors')
      ]);
      setPatients(patientsRes.data);
      
      const doctorsData = doctorsRes.data;
      setDoctors(doctorsData);

      // Extract unique departments from the dynamically loaded doctors
      const uniqueDeps = Array.from(
        new Set(doctorsData.map((doc: any) => doc.department).filter(Boolean))
      ) as string[];
      
      // Ensure "Emergency (ER)" is always an option just in case
      if (!uniqueDeps.includes("Emergency (ER)")) {
        uniqueDeps.unshift("Emergency (ER)");
      }
      setDepartments(uniqueDeps.sort());

    } catch (error) {
      console.error("Failed to fetch data", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  // Handle clicking the Edit button on the table
  const handleEditClick = (patient: any) => {
    setFormData({
      firstName: patient.firstName || "",
      lastName: patient.lastName || "",
      age: patient.age || "",
      gender: patient.gender || "",
      contact: patient.contact || "",
      address: patient.address || "",
      emergencyName: patient.emergencyName || "",
      emergencyPhone: patient.emergencyPhone || "",
      insuranceProvider: patient.insuranceProvider || "",
      insurancePolicy: patient.insurancePolicy || "",
      bloodGroup: patient.bloodGroup || "",
      allergies: patient.allergies || "",
      chronicConditions: patient.chronicConditions || "",
      chiefComplaint: patient.chiefComplaint || "",
      department: patient.department || "",
      attendingDoctor: patient.attendingDoctor || ""
    });
    setEditingId(patient.id);
    setActiveTab("personal"); // Send them back to the first tab to review
  };

  // Cancel edit mode
  const handleCancelEdit = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setActiveTab("personal");
  };

  // Handles both Create and Update
  const handleSubmit = async () => {
    if (!formData.firstName || !formData.age || !formData.chiefComplaint) {
      return alert("Please fill in the required fields (Name, Age, Chief Complaint).");
    }
    try {
      if (editingId) {
        await api.put(`/patients/${editingId}`, formData);
      } else {
        await api.post('/patients', formData);
      }
      
      setFormData(EMPTY_FORM);
      setEditingId(null);
      setActiveTab("personal");
      fetchData();
    } catch (error) {
      console.error("Failed to save patient", error);
    }
  };

  const handleDischarge = async (patientId: string) => {
    if (!confirm("Discharge this patient? This will automatically free their assigned bed.")) return;
    try {
      await api.put(`/patients/${patientId}/discharge`);
      fetchData();
    } catch (error) {
      console.error("Failed to discharge patient", error);
    }
  };

  const filteredPatients = patients.filter(p => 
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
    p.contact.includes(searchTerm)
  );

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Users className="w-6 h-6 text-primary" />
            Patient Registry & Admissions
          </h2>
          <p className="text-muted-foreground">Comprehensive Electronic Health Record (EHR) generation and admission routing.</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* LEFT: PATIENT DATABASE TABLE */}
          <Card className="xl:col-span-7 border-none shadow-sm h-fit">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle>Master Patient List</CardTitle>
                <CardDescription>Active admissions and historical records.</CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                <Input 
                  placeholder="Search name or phone..." 
                  className="pl-9 bg-secondary/30"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
              ) : (
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader className="bg-secondary/50">
                      <TableRow>
                        <TableHead>Patient Details</TableHead>
                        <TableHead>Clinical Context</TableHead>
                        <TableHead>Status & Bed</TableHead>
                        <TableHead className="text-right">Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPatients.length === 0 ? (
                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No patients found.</TableCell></TableRow>
                      ) : (
                        filteredPatients.map((p) => (
                          <TableRow key={p.id} className={editingId === p.id ? "bg-primary/5" : ""}>
                            <TableCell>
                              <div className="font-bold text-primary">{p.firstName} {p.lastName}</div>
                              <div className="text-xs text-muted-foreground">{p.age} yrs • {p.gender}</div>
                              <div className="text-xs text-muted-foreground">{p.contact}</div>
                            </TableCell>
                            <TableCell>
                              <div className="font-medium text-sm line-clamp-1">{p.chiefComplaint || "No complaint logged"}</div>
                              <div className="text-xs text-muted-foreground mt-1">Dr. {p.attendingDoctor || "Unassigned"} • {p.department}</div>
                              {p.allergies && p.allergies !== "None" && (
                                <Badge variant="destructive" className="mt-1 text-[10px] h-4 px-1">Allergy: {p.allergies}</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={p.status === "Admitted" ? "default" : "secondary"} className={p.status === "Admitted" ? "bg-emerald-500 hover:bg-emerald-600 mb-1" : "mb-1"}>
                                {p.status}
                              </Badge>
                              {p.status === "Admitted" ? (
                                <div className="text-xs font-medium text-muted-foreground">Bed: {p.assignedBed}</div>
                              ) : (
                                <div className="text-[10px] text-muted-foreground">Left: {p.dischargeDate}</div>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2 items-center">
                                <Button variant="ghost" size="icon" onClick={() => handleEditClick(p)}>
                                  <Edit className="w-4 h-4 text-muted-foreground hover:text-primary" />
                                </Button>
                                
                                {p.status === "Admitted" && (
                                  <Button variant="outline" size="sm" onClick={() => handleDischarge(p.id)} className="border-rose-200 text-rose-600 hover:bg-rose-50">
                                    <LogOut className="w-3 h-3 mr-1" /> Discharge
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* RIGHT: COMPREHENSIVE REGISTRATION/EDIT FORM */}
          <Card className={`xl:col-span-5 shadow-sm h-fit sticky top-20 transition-all ${editingId ? "border-primary border-2" : "border-none"}`}>
            <CardHeader className={`${editingId ? "bg-primary/10" : "bg-primary/5"} pb-4 border-b flex flex-row items-center justify-between`}>
              <CardTitle className="text-lg flex items-center gap-2">
                {editingId ? <Edit className="w-5 h-5 text-primary" /> : <FileText className="w-5 h-5 text-primary" />}
                {editingId ? "Edit Patient Record" : "Admission & EHR Generation"}
              </CardTitle>
              {editingId && (
                <Button variant="ghost" size="sm" onClick={handleCancelEdit} className="h-8 text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4 mr-1" /> Cancel
                </Button>
              )}
            </CardHeader>
            <CardContent className="pt-4">
              
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-4">
                  <TabsTrigger value="personal">Personal</TabsTrigger>
                  <TabsTrigger value="medical">Medical</TabsTrigger>
                  <TabsTrigger value="admission">Admission</TabsTrigger>
                </TabsList>

                {/* TAB 1: Personal & Emergency */}
                <TabsContent value="personal" className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2"><Label>First Name *</Label><Input name="firstName" value={formData.firstName} onChange={handleInputChange} /></div>
                    <div className="space-y-2"><Label>Last Name</Label><Input name="lastName" value={formData.lastName} onChange={handleInputChange} /></div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2"><Label>Age *</Label><Input type="number" name="age" value={formData.age} onChange={handleInputChange} /></div>
                    <div className="col-span-2 space-y-2"><Label>Gender *</Label>
                      <Select value={formData.gender} onValueChange={(v) => setFormData({...formData, gender: v})}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent><SelectItem value="Male">Male</SelectItem><SelectItem value="Female">Female</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-2"><Label>Phone Number</Label><Input name="contact" value={formData.contact} onChange={handleInputChange} /></div>
                  
                  <div className="border-t pt-4 mt-4">
                    <h4 className="text-sm font-semibold mb-3 text-rose-600 flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Emergency Contact</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Name</Label><Input name="emergencyName" value={formData.emergencyName} onChange={handleInputChange} /></div>
                      <div className="space-y-2"><Label>Phone</Label><Input name="emergencyPhone" value={formData.emergencyPhone} onChange={handleInputChange} /></div>
                    </div>
                  </div>
                  <Button type="button" variant="secondary" className="w-full mt-2" onClick={() => setActiveTab("medical")}>Next: Medical Baseline →</Button>
                </TabsContent>

                {/* TAB 2: Clinical Baseline & Insurance */}
                <TabsContent value="medical" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Blood Group</Label>
                    <Select value={formData.bloodGroup} onValueChange={(v) => setFormData({...formData, bloodGroup: v})}>
                      <SelectTrigger><SelectValue placeholder="Select Blood Group" /></SelectTrigger>
                      <SelectContent>
                        {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-rose-600">Known Allergies (Medications/Food)</Label>
                    <Input name="allergies" value={formData.allergies} onChange={handleInputChange} placeholder="e.g. Penicillin, Peanuts (Leave blank if none)" />
                  </div>
                  <div className="space-y-2">
                    <Label>Chronic Conditions</Label>
                    <Input name="chronicConditions" value={formData.chronicConditions} onChange={handleInputChange} placeholder="e.g. Type 2 Diabetes, Hypertension" />
                  </div>
                  
                  <div className="border-t pt-4 mt-4">
                    <h4 className="text-sm font-semibold mb-3">Insurance Details</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2"><Label>Provider</Label><Input name="insuranceProvider" value={formData.insuranceProvider} onChange={handleInputChange} placeholder="e.g. BlueCross"/></div>
                      <div className="space-y-2"><Label>Policy #</Label><Input name="insurancePolicy" value={formData.insurancePolicy} onChange={handleInputChange} /></div>
                    </div>
                  </div>
                  <Button type="button" variant="secondary" className="w-full mt-2" onClick={() => setActiveTab("admission")}>Next: Admission Details →</Button>
                </TabsContent>

                {/* TAB 3: Admission Routing */}
                <TabsContent value="admission" className="space-y-4">
                  <div className="space-y-2">
                    <Label>Chief Complaint / Reason for Admission *</Label>
                    <textarea 
                      name="chiefComplaint"
                      value={formData.chiefComplaint}
                      onChange={handleInputChange}
                      placeholder="e.g. Severe chest pain radiating to left arm, shortness of breath."
                      className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Admitting Department</Label>
                      <Select value={formData.department} onValueChange={(v) => setFormData({...formData, department: v})}>
                        <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        <SelectContent>
                          {departments.map(dep => <SelectItem key={dep} value={dep}>{dep}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Attending Doctor</Label>
                      <Select value={formData.attendingDoctor} onValueChange={(v) => setFormData({...formData, attendingDoctor: v})}>
                        <SelectTrigger><SelectValue placeholder="Select Doctor" /></SelectTrigger>
                        <SelectContent>
                          {doctors.length === 0 ? (
                            <SelectItem value="none" disabled>No doctors available</SelectItem>
                          ) : (
                            doctors.map(doc => (
                              <SelectItem key={doc.id} value={doc.name.replace("Dr. ", "")}>
                                Dr. {doc.name.replace("Dr. ", "")} {doc.specialization ? `- ${doc.specialization}` : (doc.department ? `- ${doc.department}` : "")}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="pt-4">
                    <Button onClick={handleSubmit} className={`w-full h-12 shadow-md ${editingId ? "bg-blue-600 hover:bg-blue-700" : "bg-primary hover:bg-primary/90"}`}>
                      {editingId ? <Edit className="w-5 h-5 mr-2" /> : <UserPlus className="w-5 h-5 mr-2" />} 
                      {editingId ? "Save Changes" : "Complete Admission"}
                    </Button>
                    {!editingId && (
                      <p className="text-[11px] text-center text-muted-foreground mt-3 leading-tight">
                        Submitting generates an EHR record. To allocate a physical room, please navigate to the <strong>Bed Availability</strong> module after admission.
                      </p>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

            </CardContent>
          </Card>

        </div>
      </div>
    </DashboardLayout>
  );
}
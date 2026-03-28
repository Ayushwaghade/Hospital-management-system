"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Plus, Trash2, Edit, Loader2, BedDouble, AlertCircle, UserCheck } from "lucide-react";
import { api } from "@/lib/axios";

interface Bed {
  id: string;
  wardId: string;
  ward: string;
  bedNumber?: string;
  type: string;
  status: string;
  patient: string;
  patientId?: string;
}

interface Ward {
  id: string;
  name: string;
  totalBeds: number;
  occupiedBeds: number;
}

export default function StaffBedManagementPage() {
  const [beds, setBeds] = useState<Bed[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [pendingPatients, setPendingPatients] = useState<any[]>([]); // NEW: State for unassigned patients
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [activeWardTab, setActiveWardTab] = useState<string>("");

  // Bed Dialog States
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({
    id: "", wardId: "", wardName: "", bedNumber: "", type: "Standard", patient: "-", status: "Available", patientId: ""
  });

  // Ward Dialog States
  const [isWardDialogOpen, setIsWardDialogOpen] = useState(false);
  const [wardFormData, setWardFormData] = useState({ name: "", totalBeds: "" });
  const [isSubmittingWard, setIsSubmittingWard] = useState(false);

  const fetchData = async () => {
    try {
      // Fetch Beds, Wards, and Patients simultaneously
      const [bedsRes, wardsRes, patientsRes] = await Promise.all([
        api.get('/beds'),
        api.get('/wards'),
        api.get('/patients').catch(() => ({ data: [] })) // Safe catch in case route isn't ready
      ]);
      
      setBeds(bedsRes.data);
      setWards(wardsRes.data);
      
      // Filter out patients who are Admitted but have no bed yet
      const unassigned = patientsRes.data.filter((p: any) => 
        p.status === "Admitted" && p.assignedBed === "Pending Allocation"
      );
      setPendingPatients(unassigned);
      
      if (wardsRes.data.length > 0 && !activeWardTab) {
        setActiveWardTab(wardsRes.data[0].id);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const toggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === "Available" ? "Occupied" : "Available";
    setUpdatingId(id);
    try {
      await api.put(`/beds/${id}`, { status: newStatus });
      setBeds(beds.map(b => b.id === id ? { ...b, status: newStatus } : b));
      fetchData(); 
    } catch (error) {
      console.error("Failed to update status", error);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this bed?")) return;
    setUpdatingId(id);
    try {
      await api.delete(`/beds/${id}`);
      setBeds(beds.filter(b => b.id !== id));
      fetchData(); 
    } catch (error) {
      console.error("Failed to delete bed", error);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOpenAdd = () => {
    const currentWard = wards.find(w => w.id === activeWardTab) || wards[0];
    setFormData({ 
      id: "", wardId: currentWard?.id || "", wardName: currentWard?.name || "", 
      bedNumber: "", type: "Standard", patient: "-", status: "Available", patientId: "" 
    });
    setIsEditing(false);
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (bed: Bed) => {
    setFormData({ ...bed, wardName: bed.ward, bedNumber: bed.bedNumber || "", patientId: bed.patientId || "" });
    setIsEditing(true);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      if (isEditing) {
        // Auto-detect if we are assigning a patient or clearing the bed
        const isOccupying = formData.patient !== "-";
        const targetPatient = pendingPatients.find(p => `${p.firstName} ${p.lastName}` === formData.patient);
        
        await api.put(`/beds/${formData.id}`, {
          type: formData.type,
          patient: formData.patient,
          patientId: targetPatient ? targetPatient.id : "",
          status: isOccupying ? "Occupied" : "Available"
        });

      } else {
        await api.post('/beds', formData);
      }
      
      await fetchData(); 
      setIsDialogOpen(false);
    } catch (error) {
      console.error("Failed to save bed", error);
    }
  };

  const handleSaveWard = async () => {
    if (!wardFormData.name || !wardFormData.totalBeds) return;
    setIsSubmittingWard(true);
    try {
      await api.post('/wards', wardFormData);
      await fetchData(); 
      setIsWardDialogOpen(false);
      setWardFormData({ name: "", totalBeds: "" });
    } catch (error) {
      console.error("Failed to add ward", error);
    } finally {
      setIsSubmittingWard(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Staff Bed Management</h2>
            <p className="text-muted-foreground">Map admitted patients to physical ward beds</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" className="gap-2" onClick={() => setIsWardDialogOpen(true)}>
              <Plus className="w-4 h-4" /> Add Ward
            </Button>
            <Button className="gap-2" onClick={handleOpenAdd}>
              <Plus className="w-4 h-4" /> Add Bed
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
        ) : (
          <>
            {/* NEW: PENDING PATIENTS ALERT CARD */}
            {pendingPatients.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/50 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-amber-800 text-md flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    Action Required: Pending Bed Allocations ({pendingPatients.length})
                  </CardTitle>
                  <CardDescription className="text-amber-700/80">
                    The following patients have been admitted but do not have a bed assigned. Edit an available bed below to map them.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {pendingPatients.map(p => (
                      <Badge key={p.id} variant="outline" className="bg-white border-amber-200 text-amber-900 py-1.5 px-3">
                        <UserCheck className="w-3 h-3 mr-2 text-amber-600" />
                        {p.firstName} {p.lastName} • {p.department}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {wards.length === 0 ? (
              <Card className="border-dashed bg-secondary/20">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                  <BedDouble className="w-12 h-12 mb-4 opacity-50" />
                  <p>No Wards found. Please configure hospital wards first.</p>
                </CardContent>
              </Card>
            ) : (
              <Tabs value={activeWardTab} onValueChange={setActiveWardTab} className="w-full">
                <div className="flex items-center justify-between mb-4">
                  <TabsList className="flex flex-wrap h-auto overflow-x-auto justify-start bg-transparent border-b w-full rounded-none px-0">
                    {wards.map((ward) => (
                      <TabsTrigger 
                        key={ward.id} 
                        value={ward.id}
                        className="data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:bg-transparent rounded-none px-6 py-3 font-medium"
                      >
                        {ward.name}
                        <Badge variant="secondary" className={`ml-2 text-xs ${ward.totalBeds - ward.occupiedBeds > 0 ? 'bg-emerald-100 text-emerald-700' : ''}`}>
                          {ward.totalBeds - ward.occupiedBeds} Free
                        </Badge>
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </div>

                {wards.map((ward) => {
                  const wardBeds = beds
                    .filter(b => b.wardId === ward.id || b.ward === ward.name)
                    .sort((a, b) => (parseInt(a.bedNumber || "0")) - (parseInt(b.bedNumber || "0")));
                  
                  return (
                    <TabsContent key={ward.id} value={ward.id} className="mt-0 focus-visible:outline-none">
                      <Card className="border-none shadow-sm">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                          <div>
                            <CardTitle>{ward.name} Inventory</CardTitle>
                            <CardDescription>Total Beds: {ward.totalBeds} | Occupied: {ward.occupiedBeds}</CardDescription>
                          </div>
                          <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search patient..." className="pl-9 w-[200px]" />
                          </div>
                        </CardHeader>
                        <CardContent>
                          {wardBeds.length === 0 ? (
                            <div className="text-center text-muted-foreground py-8 border rounded-lg bg-secondary/10 mt-4">
                              No beds allocated to this ward yet.
                            </div>
                          ) : (
                            <div className="rounded-md border">
                              <Table>
                                <TableHeader className="bg-secondary/50">
                                  <TableRow>
                                    <TableHead className="w-[100px]">Bed No.</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Patient Name</TableHead>
                                    <TableHead>Occupancy</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {wardBeds.map((bed) => (
                                    <TableRow key={bed.id}>
                                      <TableCell className="font-bold text-primary">
                                        {bed.bedNumber ? `Bed ${bed.bedNumber}` : '-'}
                                      </TableCell>
                                      <TableCell className="font-medium">{bed.type}</TableCell>
                                      <TableCell>{bed.patient}</TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <Switch 
                                            checked={bed.status === "Occupied"} 
                                            onCheckedChange={() => toggleStatus(bed.id, bed.status)}
                                            disabled={updatingId === bed.id}
                                          />
                                          {updatingId === bed.id && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant={bed.status === "Available" ? "secondary" : "default"} className={bed.status === "Available" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : ""}>
                                          {bed.status}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex justify-end gap-2">
                                          <Button variant="ghost" size="icon" onClick={() => handleOpenEdit(bed)} disabled={updatingId === bed.id}>
                                            <Edit className="w-4 h-4" />
                                          </Button>
                                          <Button variant="ghost" size="icon" className="text-destructive" onClick={() => handleDelete(bed.id)} disabled={updatingId === bed.id}>
                                            <Trash2 className="w-4 h-4" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}
          </>
        )}

        {/* Add New Ward Modal */}
        <Dialog open={isWardDialogOpen} onOpenChange={setIsWardDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Ward</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Ward Name</Label>
                <Input value={wardFormData.name} onChange={(e) => setWardFormData({ ...wardFormData, name: e.target.value })} placeholder="e.g. Emergency ICU" />
              </div>
              <div className="space-y-2">
                <Label>Total Bed Capacity</Label>
                <Input type="number" min="1" value={wardFormData.totalBeds} onChange={(e) => setWardFormData({ ...wardFormData, totalBeds: e.target.value })} placeholder="e.g. 20" />
                <p className="text-xs text-muted-foreground pt-1">The system will automatically generate all empty beds.</p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsWardDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveWard} disabled={isSubmittingWard}>
                {isSubmittingWard ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Create Ward
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add / Edit Bed Modal */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditing ? "Bed Assignment & Details" : "Add New Bed"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Ward Assignment</Label>
                  <Select disabled={isEditing} value={formData.wardId} onValueChange={(val) => {
                      const selectedWard = wards.find(w => w.id === val);
                      setFormData({ ...formData, wardId: val, wardName: selectedWard?.name || "" });
                    }}>
                    <SelectTrigger><SelectValue placeholder="Select a ward" /></SelectTrigger>
                    <SelectContent>{wards.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Bed Number</Label>
                  <Input disabled={isEditing} value={formData.bedNumber} onChange={(e) => setFormData({ ...formData, bedNumber: e.target.value })} placeholder="e.g. 51" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Bed Type</Label>
                <Select value={formData.type} onValueChange={(val) => setFormData({ ...formData, type: val })}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard">Standard</SelectItem>
                    <SelectItem value="Ventilator Support">Ventilator Support</SelectItem>
                    <SelectItem value="Private">Private</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* NEW: MAP PATIENT DROPDOWN */}
              {isEditing && (
                <div className="space-y-2 pt-2 border-t">
                  <Label className="text-primary flex items-center gap-2">
                    <UserCheck className="w-4 h-4" /> Map Patient to this Bed
                  </Label>
                  <Select value={formData.patient} onValueChange={(val) => setFormData({ ...formData, patient: val })}>
                    <SelectTrigger className={formData.patient !== "-" ? "border-primary bg-primary/5" : ""}>
                      <SelectValue placeholder="Select patient..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="-">None (Clear Bed)</SelectItem>
                      
                      {/* Show current patient if already occupied, even if they aren't in the pending list */}
                      {formData.patient !== "-" && !pendingPatients.find(p => `${p.firstName} ${p.lastName}` === formData.patient) && (
                        <SelectItem value={formData.patient}>{formData.patient} (Currently Assigned)</SelectItem>
                      )}

                      {/* Map the pending patients */}
                      {pendingPatients.map(p => (
                        <SelectItem key={p.id} value={`${p.firstName} ${p.lastName}`}>
                          {p.firstName} {p.lastName} • {p.department}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Selecting a patient automatically changes the bed status to Occupied.
                  </p>
                </div>
              )}
              
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSave}>Save Bed Assignment</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
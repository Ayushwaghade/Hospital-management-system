"use client";

import { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, Bed, Calendar, Activity, TrendingUp, Loader2, Stethoscope } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Bar, BarChart, XAxis, YAxis } from "recharts";
import { api } from "@/lib/axios";

// TypeScript interfaces
interface Ward {
  id: string;
  name: string;
  totalBeds: number;
  occupiedBeds: number;
}

interface Appointment {
  id: string;
  doctorName?: string;
  department: string;
  date: string;
  time: string;
  token: string;
  status: string;
}

export default function DashboardPage() {
  const [role, setRole] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Staff/Admin Data States
  const [stats, setStats] = useState({ waiting: 0, freeBeds: 0, totalBeds: 0, avgWait: 0, activeStaff: 0 });
  const [wards, setWards] = useState<Ward[]>([]);
  const [chartData, setChartData] = useState<{time: string, patients: number}[]>([]); // NEW: Live Chart State

  // Patient Data States
  const [myAppointments, setMyAppointments] = useState<Appointment[]>([]);

  useEffect(() => {
    const storedRole = localStorage.getItem("role");
    const storedName = localStorage.getItem("name");
    setRole(storedRole);
    setName(storedName);

    const fetchDashboardData = async () => {
      try {
        if (storedRole === "patient") {
          // Fetch only the patient's personal active appointments
          const res = await api.get("/queue/waiting-room");
          setMyAppointments(res.data);
        } else if (storedRole === "staff" || storedRole === "admin") {
          // Fetch hospital-wide statistics AND live queue data for the chart
          const [doctorsRes, wardsRes, queueRes] = await Promise.all([
            api.get("/doctors"),
            api.get("/wards"),
            api.get("/queue/waiting-room") // Added this to fetch live patients
          ]);

          const doctors = doctorsRes.data;
          const wardsData = wardsRes.data;
          const queueData = queueRes.data;

          const totalWaiting = doctors.reduce((acc: number, doc: any) => acc + doc.patientsWaiting, 0);
          const totalFreeBeds = wardsData.reduce((acc: number, ward: Ward) => acc + (ward.totalBeds - ward.occupiedBeds), 0);
          const totalBeds = wardsData.reduce((acc: number, ward: Ward) => acc + ward.totalBeds, 0);
          
          // Calculate Real-Time Average Wait Time
          let calculatedAvgWait = 0;
          if (totalWaiting > 0) {
            const totalWaitTime = doctors.reduce((acc: number, doc: any) => acc + doc.estimatedWaitTime, 0);
            const docsWithQueues = doctors.filter((d: any) => d.patientsWaiting > 0).length;
            calculatedAvgWait = docsWithQueues > 0 ? Math.round(totalWaitTime / docsWithQueues) : 0;
          }

          setStats({ 
            waiting: totalWaiting, 
            freeBeds: totalFreeBeds, 
            totalBeds: totalBeds,
            avgWait: calculatedAvgWait,
            activeStaff: doctors.length // Count actual doctors in the system
          });
          
          setWards(wardsData);

          // ==========================================
          // GENERATE REAL-TIME CHART DATA
          // ==========================================
          const timeSlots: Record<string, number> = {};
          
          // Pre-fill standard clinic hours (9 AM to 5 PM) so the chart looks full even if empty
          const standardHours = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"];
          standardHours.forEach(h => timeSlots[h] = 0);

          // Group actual patients by their appointment hour
          queueData.forEach((apt: Appointment) => {
            if (apt.time) {
              const hour = apt.time.split(":")[0] + ":00"; // e.g. "14:30" becomes "14:00"
              timeSlots[hour] = (timeSlots[hour] || 0) + 1;
            }
          });

          // Format the data for Recharts (Convert "14:00" to "2 PM")
          const formattedChartData = Object.keys(timeSlots).sort().map(time => {
            const [h] = time.split(":");
            const hour = parseInt(h);
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12;
            return {
              time: `${displayHour} ${ampm}`,
              patients: timeSlots[time]
            };
          });

          setChartData(formattedChartData);
        }
      } catch (error) {
        console.error("Failed to fetch dashboard data:", error);
      } finally {
        setLoading(false);
      }
    };

    if (storedRole) {
      fetchDashboardData();
    }
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  // ==========================================
  // PATIENT DASHBOARD VIEW
  // ==========================================
  if (role === "patient") {
    return (
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h2 className="text-3xl font-bold tracking-tight">Welcome, {name}</h2>
            <p className="text-muted-foreground">Here is your healthcare overview for today.</p>
          </div>

          <h3 className="text-xl font-semibold mt-8 mb-4">Your Active Appointments</h3>
          {myAppointments.length === 0 ? (
            <Card className="border-dashed shadow-sm bg-secondary/20">
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Calendar className="w-12 h-12 text-muted-foreground mb-4 opacity-50" />
                <p className="text-lg font-medium">No upcoming appointments</p>
                <p className="text-muted-foreground text-sm mb-4">You don't have any appointments scheduled currently.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myAppointments.map((apt) => (
                <Card key={apt.id} className="border-none shadow-sm border-l-4 border-l-primary">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex justify-between">
                      {apt.department}
                      <span className="text-sm px-2 py-1 bg-primary/10 text-primary rounded-md">{apt.token}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 text-sm">
                      <p className="flex items-center gap-2"><Calendar className="w-4 h-4 text-muted-foreground"/> {apt.date} at {apt.time}</p>
                      <p className="flex items-center gap-2"><Activity className="w-4 h-4 text-muted-foreground"/> Status: <strong className="text-emerald-600">{apt.status}</strong></p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </DashboardLayout>
    );
  }

  // ==========================================
  // STAFF / ADMIN DASHBOARD VIEW
  // ==========================================
  const kpis = [
    { title: "OPD Waiting Queue", value: stats.waiting.toString(), sub: "Patients currently waiting", icon: Users, color: "bg-blue-500/10 text-blue-600" },
    { title: "Available Beds", value: `${stats.freeBeds}/${stats.totalBeds}`, sub: "Across all wards", icon: Bed, color: "bg-amber-500/10 text-amber-600" },
    { title: "Avg Wait Time", value: `${stats.avgWait}m`, sub: "Current queue average", icon: Clock, color: "bg-teal-500/10 text-teal-600" },
    { title: "Active Doctors", value: stats.activeStaff.toString(), sub: "Registered in system", icon: Stethoscope, color: "bg-purple-500/10 text-purple-600" },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Hospital Overview</h2>
          <p className="text-muted-foreground">Real-time metrics for Smart Hospital operations.</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {kpis.map((kpi) => (
            <Card key={kpi.title} className="border-none shadow-sm">
              <CardContent className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${kpi.color}`}>
                    <kpi.icon className="w-5 h-5" />
                  </div>
                  <TrendingUp className="w-4 h-4 text-emerald-500" />
                </div>
                <div>
                  <h3 className="text-sm font-medium text-muted-foreground">{kpi.title}</h3>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold">{kpi.value}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{kpi.sub}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Charts & Progress */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-primary" />
                Patient Flow Trend (Today)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ChartContainer config={{ patients: { label: "Patients", color: "hsl(var(--primary))" }}}>
                  {/* NOW USING THE LIVE chartData INSTEAD OF MOCK DATA */}
                  <BarChart data={chartData}>
                    <XAxis dataKey="time" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} allowDecimals={false} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Bar dataKey="patients" fill="var(--color-patients)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ChartContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bed className="w-5 h-5 text-primary" />
                Live Bed Occupancy
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {wards.length > 0 ? wards.map((ward) => {
                const occupancyPercentage = ward.totalBeds > 0 ? Math.round((ward.occupiedBeds / ward.totalBeds) * 100) : 0;
                return (
                  <div key={ward.id} className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{ward.name}</span>
                      <span className="text-muted-foreground">{occupancyPercentage}% Occupied</span>
                    </div>
                    <Progress value={occupancyPercentage} className="h-2" />
                  </div>
                );
              }) : (
                <div className="text-center text-muted-foreground py-8 border border-dashed rounded-lg bg-secondary/10">
                  No ward data available. Configure wards in Staff Management.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
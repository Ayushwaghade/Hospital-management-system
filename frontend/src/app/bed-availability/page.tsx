"use client";

import { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Bed, AlertCircle, Clock, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/axios";

// Interface matching the backend Ward response
interface Ward {
  id: string;
  name: string;
  totalBeds: number;
  occupiedBeds: number;
  predictedVacancy: string;
}

export default function BedAvailabilityPage() {
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchWards = async () => {
    setLoading(true);
    try {
      const response = await api.get('/wards');
      setWards(response.data);
    } catch (error) {
      console.error("Failed to fetch wards:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWards();
  }, []);

  // Dynamically calculate the total free beds across all wards
  const totalFree = wards.reduce((acc, ward) => acc + (ward.totalBeds - ward.occupiedBeds), 0);
  
  // Check if any ICU is critically full (> 90%)
  const isIcuCritical = wards.some(ward => 
    ward.name.toLowerCase().includes("icu") && 
    (ward.totalBeds > 0 && (ward.occupiedBeds / ward.totalBeds) > 0.9)
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Bed Availability</h2>
            <p className="text-muted-foreground">Current status and predicted vacancies across all wards</p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={fetchWards} disabled={loading}>
              <RefreshCcw className={`w-4 h-4 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-50 text-sm py-1">
              {totalFree} Total Free
            </Badge>
            {isIcuCritical && (
              <Badge variant="outline" className="border-destructive text-destructive bg-destructive/10 text-sm py-1">
                ICU Critical
              </Badge>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : wards.length === 0 ? (
          <div className="text-center text-muted-foreground py-12 bg-secondary/20 rounded-lg border border-dashed">
            No wards configured in the system.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {wards.map((ward) => {
              // Prevent division by zero if totalBeds is 0
              const occupancy = ward.totalBeds > 0 
                ? Math.round((ward.occupiedBeds / ward.totalBeds) * 100) 
                : 0;
              const isCritical = occupancy > 90;

              return (
                <Card key={ward.id} className={`border-none shadow-sm transition-all ${isCritical ? 'ring-1 ring-destructive/50 bg-destructive/5' : ''}`}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{ward.name}</CardTitle>
                      <Bed className={`w-5 h-5 ${isCritical ? 'text-destructive' : 'text-primary'}`} />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Occupancy</span>
                      <span className={`font-bold ${isCritical ? 'text-destructive' : ''}`}>{occupancy}%</span>
                    </div>
                    <Progress value={occupancy} className={`h-2 ${isCritical ? '[&>div]:bg-destructive' : ''}`} />
                    
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      <div className="p-3 bg-secondary/50 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground">Available</p>
                        <p className={`text-xl font-bold ${isCritical ? 'text-destructive' : ''}`}>
                          {ward.totalBeds - ward.occupiedBeds}
                        </p>
                      </div>
                      <div className="p-3 bg-secondary/50 rounded-lg text-center">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-xl font-bold">{ward.totalBeds}</p>
                      </div>
                    </div>

                    {isCritical && (
                      <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/20 font-medium">
                        <AlertCircle className="w-3 h-3 flex-shrink-0" />
                        Critical Low Availability
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-4 bg-primary/5 p-2 rounded">
                      <Clock className="w-3 h-3 flex-shrink-0 text-primary" />
                      Next vacancy: <span className="font-semibold text-foreground">{ward.predictedVacancy || "Unknown"}</span>
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
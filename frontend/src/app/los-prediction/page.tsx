"use client";

import { useState } from "react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { BrainCircuit, Loader2, Activity, AlertCircle, Sparkles, Stethoscope, Plus, Trash2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, ReferenceLine } from "recharts";
import { api } from "@/lib/axios";

const SPECIALTIES = [
  "Orthopedics", "Cardiology", "Neurology", "Pulmonology", "Oncology", "General / Other"
];

export default function LOSPredictionPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Core 23 ML Predictors
  const [formData, setFormData] = useState({
    gender: "1",
    rcount: "0",
  
    // Body & Vitals
    bmi: "30",
    pulse: "72",
    respiration: "16",
  
    // Lab values
    hematocrit: "14",     // (your dataset → hemoglobin)
    neutrophils: "55",
    sodium: "140",
    glucose: "95",
    bloodureanitro: "12",
    creatinine: "1.0",
  
    // Disease flags
    dialysisrenalendstage: "0",
    asthma: "0",
    irondef: "0",
    pneum: "0",
    substancedependence: "0",
    psychologicaldisordermajor: "0",
    depress: "0",
    psychother: "0",
    fibrosisandother: "0",
    malnutrition: "0",
    hemo: "0",
    secondarydiagnosisnonicd9: "0",
  
    // Optional UI field
    generalNotes: ""
  });
  // State for Specialization and Dynamic Fields
  const [selectedSpecialty, setSelectedSpecialty] = useState<string | null>(null);
  const [customFields, setCustomFields] = useState([
    { id: Date.now(), key: "", value: "" }
  ]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData({ ...formData, [name]: value });
  };

  // --- Dynamic Field Handlers ---
  const addCustomField = () => {
    setCustomFields([...customFields, { id: Date.now(), key: "", value: "" }]);
  };

  const removeCustomField = (idToRemove: number) => {
    setCustomFields(customFields.filter(field => field.id !== idToRemove));
  };

  const updateCustomField = (id: number, field: "key" | "value", newValue: string) => {
    setCustomFields(customFields.map(item => 
      item.id === id ? { ...item, [field]: newValue } : item
    ));
  };

  const runPrediction = async () => {
    setLoading(true);
    try {
      // 1. Start with the specialization
      let finalSpecialistNotes = selectedSpecialty ? `Patient Department: ${selectedSpecialty}. ` : "";

      // 2. Add the dynamic Key-Value fields
      const dynamicNotesString = customFields
        .filter(f => f.key.trim() !== "" && f.value.trim() !== "") 
        .map(f => `${f.key.trim()}: ${f.value.trim()}`)
        .join(". ");
      
      if (dynamicNotesString) {
        finalSpecialistNotes += dynamicNotesString + ". ";
      }

      // 3. Add any unstructured general notes
      if (formData.generalNotes.trim()) {
        finalSpecialistNotes += formData.generalNotes.trim();
      }

      // 4. Build the final payload
      const payload = {
        ...formData,
        facid_B: "0", facid_C: "0", facid_D: "0", facid_E: "0",
        specialistNotes: finalSpecialistNotes.trim()
      };
      
      const res = await api.post('/predict-los', payload);
      setResult(res.data);
    } catch (error) {
      console.error("Prediction failed:", error);
      alert("Failed to run prediction. Check console for details.");
    } finally {
      setLoading(false);
    }
  };

  const getPredictionText = (predClass: number) => {
    switch (predClass) {
      case 0: return { text: "Short Stay (1–3 days)", color: "text-emerald-600", bg: "bg-emerald-100", border: "border-emerald-200" };
      case 1: return { text: "Medium Stay (4–6 days)", color: "text-amber-600", bg: "bg-amber-100", border: "border-amber-200" };
      case 2: return { text: "Long Stay (7+ days)", color: "text-rose-600", bg: "bg-rose-100", border: "border-rose-200" };
      default: return { text: "Unknown", color: "text-gray-600", bg: "bg-gray-100", border: "border-gray-200" };
    }
  };

  // Determine which chart data to use based on LLM response
  const activeChartData = (result?.llm_analysis && result?.llm_analysis?.adjusted_feature_impacts) 
    ? result.llm_analysis.adjusted_feature_impacts 
    : result?.shap_values;

  return (
    <DashboardLayout>
      <div className="space-y-6 pb-12">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-primary" />
            Hybrid AI Length of Stay Predictor
          </h2>
          <p className="text-muted-foreground">CatBoost Baseline + LLM Contextual Synthesis</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* LEFT: COMPREHENSIVE INPUT FORM */}
          <Card className="xl:col-span-8 border-none shadow-sm">
            <CardHeader>
              <CardTitle>Patient Clinical Data</CardTitle>
              <CardDescription>Enter vitals, labs, and history. Facility is set to Default (A).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              
              {/* SECTION 1: Vitals & Basics */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground border-b pb-2">Vitals & Demographics</h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="space-y-2">
                    <Label>Gender</Label>
                    <Select value={formData.gender} onValueChange={(v) => handleSelectChange("gender", v)}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent><SelectItem value="1">Male</SelectItem><SelectItem value="0">Female</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2"><Label>Prior Readmits</Label><Input type="number" name="rcount" value={formData.rcount} onChange={handleInputChange} /></div>
                  <div className="space-y-2"><Label>BMI</Label><Input type="number" name="bmi" value={formData.bmi} onChange={handleInputChange} /></div>
                  <div className="space-y-2"><Label>Pulse</Label><Input type="number" name="pulse" value={formData.pulse} onChange={handleInputChange} /></div>
                  <div className="space-y-2"><Label>Respiration</Label><Input type="number" name="respiration" value={formData.respiration} onChange={handleInputChange} /></div>
                </div>
              </div>

              {/* SECTION 2: Labs */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground border-b pb-2">Laboratory Results</h3>
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                  <div className="space-y-2"><Label>Hematocrit</Label><Input type="number" name="hematocrit" value={formData.hematocrit} onChange={handleInputChange} /></div>
                  <div className="space-y-2"><Label>Neutrophils</Label><Input type="number" name="neutrophils" value={formData.neutrophils} onChange={handleInputChange} /></div>
                  <div className="space-y-2"><Label>Sodium</Label><Input type="number" name="sodium" value={formData.sodium} onChange={handleInputChange} /></div>
                  <div className="space-y-2"><Label>Glucose</Label><Input type="number" name="glucose" value={formData.glucose} onChange={handleInputChange} /></div>
                  <div className="space-y-2"><Label>BUN</Label><Input type="number" name="bloodureanitro" value={formData.bloodureanitro} onChange={handleInputChange} /></div>
                  <div className="space-y-2"><Label>Creatinine</Label><Input type="number" name="creatinine" value={formData.creatinine} onChange={handleInputChange} /></div>
                </div>
              </div>

              {/* SECTION 3: Binary Clinical Flags */}
              <div>
                <h3 className="text-sm font-semibold mb-3 text-muted-foreground border-b pb-2">Clinical History (Yes/No)</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { key: "dialysisrenalendstage", label: "Dialysis (ESRD)" },
                    { key: "asthma", label: "Asthma" },
                    { key: "irondef", label: "Iron Deficiency" },
                    { key: "pneum", label: "Pneumonia" },
                    { key: "substancedependence", label: "Substance Dep." },
                    { key: "psychologicaldisordermajor", label: "Psych Major" },
                    { key: "depress", label: "Depression" },
                    { key: "psychother", label: "Psych Other" },
                    { key: "fibrosisandother", label: "Fibrosis" },
                    { key: "malnutrition", label: "Malnutrition" },
                    { key: "hemo", label: "Blood Disorder" },
                    { key: "secondarydiagnosisnonicd9", label: "Non-ICD9 Sec Diag" }
                  ].map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label className="text-xs">{field.label}</Label>
                      <Select value={(formData as any)[field.key]} onValueChange={(v) => handleSelectChange(field.key, v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue/></SelectTrigger>
                        <SelectContent><SelectItem value="1">Yes</SelectItem><SelectItem value="0">No</SelectItem></SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>

              {/* SECTION 4: DYNAMIC LLM BUILDER */}
              <div className="pt-2">
                <div className="bg-primary/5 p-5 rounded-xl border border-primary/20 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-md font-bold flex items-center gap-2 text-primary">
                      <Stethoscope className="w-5 h-5" />
                      Specialist Clinical Context
                    </h3>
                  </div>
                  
                  {/* Part A: Specialization Selector */}
                  <div className="mb-6">
                    <Label className="text-sm font-semibold text-primary/80 mb-2 block">1. Patient Department</Label>
                    <div className="flex flex-wrap gap-2">
                      {SPECIALTIES.map((spec) => (
                        <Button 
                          key={spec}
                          variant={selectedSpecialty === spec ? "default" : "outline"}
                          onClick={() => setSelectedSpecialty(spec)}
                          className="rounded-full"
                          size="sm"
                        >
                          {spec}
                        </Button>
                      ))}
                    </div>
                  </div>

                  {/* Part B: Dynamic Field Rows */}
                  <div className="mb-4">
                    <Label className="text-sm font-semibold text-primary/80 mb-2 block">2. Custom Parameters</Label>
                    <div className="space-y-3">
                      {customFields.map((field) => (
                        <div key={field.id} className="flex items-center gap-3">
                          <div className="flex-1">
                            <Input 
                              placeholder="Parameter (e.g. Fracture Type)" 
                              className="bg-background font-medium"
                              value={field.key}
                              onChange={(e) => updateCustomField(field.id, "key", e.target.value)}
                            />
                          </div>
                          <div className="flex-1">
                            <Input 
                              placeholder="Value (e.g. Compound)" 
                              className="bg-background"
                              value={field.value}
                              onChange={(e) => updateCustomField(field.id, "value", e.target.value)}
                            />
                          </div>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => removeCustomField(field.id)}
                            className="text-muted-foreground hover:text-red-500 hover:bg-red-50"
                            disabled={customFields.length === 1 && !field.key && !field.value} 
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                    
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={addCustomField}
                      className="border-primary/20 text-primary hover:bg-primary/10 mt-3"
                    >
                      <Plus className="w-4 h-4 mr-2" /> Add Parameter
                    </Button>
                  </div>

                  {/* Part C: Optional Text Area */}
                  <div className="mt-6 pt-4 border-t border-primary/10">
                    <Label className="text-sm font-semibold text-primary/80 mb-2 block">3. Additional Notes (Optional)</Label>
                    <textarea 
                      name="generalNotes"
                      placeholder="e.g. Patient requires complex two-stage surgery..."
                      className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      value={formData.generalNotes}
                      onChange={handleInputChange}
                    />
                  </div>
                </div>
              </div>

              <Button onClick={runPrediction} disabled={loading} className="w-full h-12 text-lg mt-4 shadow-md">
                {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Sparkles className="w-5 h-5 mr-2" />}
                Run Hybrid AI Analysis
              </Button>
            </CardContent>
          </Card>

          {/* RIGHT: PREDICTION RESULTS */}
          <div className="xl:col-span-4 space-y-6">
            {!result ? (
              <Card className="border-dashed bg-secondary/10 h-full flex flex-col justify-center items-center text-muted-foreground p-8 text-center min-h-[400px]">
                <BrainCircuit className="w-16 h-16 mb-4 opacity-20" />
                <p>Submit patient data to view ML baselines and Generative AI synthesis.</p>
              </Card>
            ) : (
              <>
                {/* LLM SYNTHESIS CARD */}
                {result.llm_analysis && (
                  <Card className={`border-2 shadow-md ${getPredictionText(result.llm_analysis.adjusted_prediction).border}`}>
                    <CardHeader className={`pb-4 ${getPredictionText(result.llm_analysis.adjusted_prediction).bg}`}>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold uppercase tracking-wider flex items-center gap-2">
                          <Sparkles className="w-4 h-4" /> AI Adjusted Prediction
                        </CardTitle>
                      </div>
                      <h3 className={`text-2xl font-bold mt-2 ${getPredictionText(result.llm_analysis.adjusted_prediction).color}`}>
                        {getPredictionText(result.llm_analysis.adjusted_prediction).text}
                      </h3>
                    </CardHeader>
                    <CardContent className="p-4 pt-4 bg-card">
                      <p className="text-sm font-semibold mb-1">Clinical Context Applied:</p>
                      <p className="text-sm text-muted-foreground leading-relaxed italic mb-3 pb-3 border-b border-border">
                        "{[
                          selectedSpecialty ? `Department: ${selectedSpecialty}` : "",
                          customFields.filter(f => f.key && f.value).map(f => `${f.key}: ${f.value}`).join(". "), 
                          formData.generalNotes
                        ].filter(Boolean).join(". ") || 'No external context provided.'}"
                      </p>
                      <p className="text-sm font-semibold mb-1">AI Reasoning:</p>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {result.llm_analysis.clinical_reasoning}
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* ML BASELINE CARD */}
                <Card className="border-none shadow-sm overflow-hidden">
                  <div className={`p-4 ${getPredictionText(result.prediction).bg} opacity-80`}>
                    <p className="text-xs font-semibold uppercase tracking-wider mb-1 opacity-70">Raw ML Baseline (CatBoost)</p>
                    <h3 className={`text-xl font-bold ${getPredictionText(result.prediction).color}`}>
                      {getPredictionText(result.prediction).text}
                    </h3>
                  </div>
                  <CardContent className="p-4 space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs"><span className="text-emerald-700">Short</span><span>{result.probabilities[0]}%</span></div>
                      <Progress value={result.probabilities[0]} className="h-1.5 [&>div]:bg-emerald-500" />
                      
                      <div className="flex justify-between text-xs pt-1"><span className="text-amber-700">Medium</span><span>{result.probabilities[1]}%</span></div>
                      <Progress value={result.probabilities[1]} className="h-1.5 [&>div]:bg-amber-500" />
                      
                      <div className="flex justify-between text-xs pt-1"><span className="text-rose-700">Long</span><span>{result.probabilities[2]}%</span></div>
                      <Progress value={result.probabilities[2]} className="h-1.5 [&>div]:bg-rose-500" />
                    </div>
                  </CardContent>
                </Card>

                {/* DYNAMIC SHAP EXPLAINER CARD */}
                <Card className="border-none shadow-sm">
                  <CardHeader className="pb-2 px-4">
                    <CardTitle className="text-sm flex items-center justify-between">
                      {result.llm_analysis && result.llm_analysis.adjusted_feature_impacts ? (
                        <span className="flex items-center gap-2 text-primary">
                          <Sparkles className="w-4 h-4" /> AI-Adjusted Feature Impact
                        </span>
                      ) : (
                        "Raw SHAP Feature Impact"
                      )}
                      <AlertCircle className="w-4 h-4 text-muted-foreground" />
                    </CardTitle>
                    {result.llm_analysis && result.llm_analysis.adjusted_feature_impacts && (
                      <CardDescription className="text-xs mt-1">
                        Chart includes ML baselines + synthesized specialist parameters.
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="px-2">
                    <div className="h-[250px] w-full mt-2">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={activeChartData} layout="vertical" margin={{ top: 0, right: 20, left: 35, bottom: 0 }}>
                          <XAxis type="number" hide />
                          <YAxis dataKey="feature" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10 }} width={80} />
                          <RechartsTooltip 
                            formatter={(val: number) => [Number(val).toFixed(3), "Impact"]}
                            labelStyle={{ color: "black", fontSize: "12px" }}
                            itemStyle={{ fontSize: "12px" }}
                          />
                          <ReferenceLine x={0} stroke="#cbd5e1" />
                          <Bar dataKey="impact" radius={[0, 4, 4, 0]} barSize={12}>
                            {activeChartData?.map((entry: any, index: number) => (
                              <Cell key={`cell-${index}`} fill={Number(entry.impact) > 0 ? "#ef4444" : "#10b981"} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
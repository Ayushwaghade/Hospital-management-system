'use server';
/**
 * @fileOverview A Genkit flow for predicting a patient's Length-of-Stay (LOS) and explaining the influencing factors.
 *
 * - losPredictionExplanation - A function that handles the LOS prediction process.
 * - LOSPredictionExplanationInput - The input type for the losPredictionExplanation function.
 * - LOSPredictionExplanationOutput - The return type for the losPredictionExplanation function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const LOSPredictionExplanationInputSchema = z.object({
  age: z.number().int().min(0).max(120).describe('The age of the patient in years.'),
  gender: z.enum(['Male', 'Female', 'Other']).describe('The gender of the patient.'),
  diagnosis: z.string().describe('The primary diagnosis for the patient\'s admission.'),
  vitals: z.string().describe('Key vital signs for the patient (e.g., Blood Pressure, Heart Rate, Temperature, Oxygen Saturation).'),
  comorbidities: z.string().describe('Any pre-existing medical conditions or comorbidities of the patient (e.g., Diabetes, Hypertension, COPD).'),
});
export type LOSPredictionExplanationInput = z.infer<typeof LOSPredictionExplanationInputSchema>;

const LOSPredictionExplanationOutputSchema = z.object({
  predictedStayCategory: z.enum(['Short', 'Medium', 'Long', 'Extended']).describe('The predicted category for the patient\'s length of stay.'),
  estimatedDays: z.number().int().min(1).describe('The estimated number of days the patient will stay in the hospital.'),
  keyInfluencingFactors: z.array(z.string()).describe('A list of key factors that influenced the length of stay prediction.'),
  explanation: z.string().describe('A detailed explanation of the prediction and how the factors contribute.'),
});
export type LOSPredictionExplanationOutput = z.infer<typeof LOSPredictionExplanationOutputSchema>;

export async function losPredictionExplanation(input: LOSPredictionExplanationInput): Promise<LOSPredictionExplanationOutput> {
  return losPredictionExplanationFlow(input);
}

const losPredictionPrompt = ai.definePrompt({
  name: 'losPredictionPrompt',
  input: { schema: LOSPredictionExplanationInputSchema },
  output: { schema: LOSPredictionExplanationOutputSchema },
  prompt: `You are an expert medical predictive assistant. Your task is to predict the Length-of-Stay (LOS) for a patient based on the provided data.

Output a prediction category (Short, Medium, Long, Extended), an estimated number of days, a list of key influencing factors, and a detailed explanation.

Here is the patient data:
Age: {{{age}}}
Gender: {{{gender}}}
Diagnosis: {{{diagnosis}}}
Vitals: {{{vitals}}}
Comorbidities: {{{comorbidities}}}`,
});

const losPredictionExplanationFlow = ai.defineFlow(
  {
    name: 'losPredictionExplanationFlow',
    inputSchema: LOSPredictionExplanationInputSchema,
    outputSchema: LOSPredictionExplanationOutputSchema,
  },
  async (input) => {
    const { output } = await losPredictionPrompt(input);
    return output!;
  }
);

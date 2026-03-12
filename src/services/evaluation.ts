import { GoogleGenAI, Type } from "@google/genai";
import { EvaluationResult } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export async function evaluateSimulation(transcript: string, scenarioDetails: string): Promise<EvaluationResult> {
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `
      Evalúa la siguiente entrevista de conciliación de medicación realizada por un farmacéutico residente.
      
      Escenario: ${scenarioDetails}
      Transcripción: ${transcript}
      
      Debes devolver un JSON con la siguiente estructura:
      {
        "checklist": {
          "presentation": boolean (se ha presentado correctamente),
          "comprehension": boolean (ha verificado que el paciente entiende el alta),
          "e_prescription": boolean (ha revisado la receta electrónica),
          "adherence": boolean (ha realizado test de adherencia o preguntado cómo toma la medicación),
          "aids": boolean (ha ofrecido ayudas como pastilleros o alarmas),
          "closure": boolean (ha cerrado la llamada correctamente)
        },
        "score": number (1-10),
        "feedback": string (resumen cualitativo),
        "human_touch": string (evaluación del trato humanizado),
        "synthesis_capacity": string (evaluación de la capacidad de síntesis)
      }
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          checklist: {
            type: Type.OBJECT,
            properties: {
              presentation: { type: Type.BOOLEAN },
              comprehension: { type: Type.BOOLEAN },
              e_prescription: { type: Type.BOOLEAN },
              adherence: { type: Type.BOOLEAN },
              aids: { type: Type.BOOLEAN },
              closure: { type: Type.BOOLEAN }
            }
          },
          score: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
          human_touch: { type: Type.STRING },
          synthesis_capacity: { type: Type.STRING }
        },
        required: ["checklist", "score", "feedback", "human_touch", "synthesis_capacity"]
      }
    }
  });

  return JSON.parse(response.text);
}

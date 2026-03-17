import { GoogleGenAI, Type } from "@google/genai";
import { EvaluationResult } from "../types";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey! });

export async function evaluateSimulation(transcript: string, scenario: any): Promise<EvaluationResult> {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash"
    contents: `
      Evalúa la siguiente entrevista de conciliación de medicación realizada por un farmacéutico residente.
      
      Título del Escenario: ${scenario.title}
      Contexto clínico: ${scenario.description}
      Medicación relacionada: ${scenario.medication}
      Medicación habitual: ${scenario.usual_medication}
      Objetivos específicos: ${scenario.objectives}
      Problema (PRM) a detectar: ${scenario.prm}
      
      Transcripción: ${transcript}
      
      Debes evaluar si el farmacéutico ha cumplido los objetivos específicos planteados.
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

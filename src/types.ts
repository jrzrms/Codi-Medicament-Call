export interface Scenario {
  id: number;
  title: string;
  description: string;
  patient_profile: 'Paciente' | 'Cuidador';
  gender: 'Masculino' | 'Femenino';
  language: 'Español' | 'Catalán';
  medication: string;
  usual_medication: string;
  objectives: string;
  prm: string;
  tips: string;
  speaking_speed: 'Lento' | 'Normal' | 'Rápido';
}

export interface Simulation {
  id: number;
  scenario_id: number;
  timestamp: string;
  transcript: string;
  evaluation: string; // JSON string
  score: number;
  scenario_title?: string;
}

export interface EvaluationResult {
  checklist: {
    presentation: boolean;
    comprehension: boolean;
    e_prescription: boolean;
    adherence: boolean;
    aids: boolean;
    closure: boolean;
  };
  score: number;
  feedback: string;
  human_touch: string;
  synthesis_capacity: string;
}

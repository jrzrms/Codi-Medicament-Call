import Database from 'better-sqlite3';
import path from 'path';

const db = new Database('pharma_call.db');

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS scenarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    patient_profile TEXT NOT NULL, -- 'Paciente' | 'Cuidador'
    gender TEXT NOT NULL, -- 'Masculino' | 'Femenino'
    language TEXT NOT NULL, -- 'Español' | 'Catalán'
    medication TEXT NOT NULL,
    prm TEXT NOT NULL, -- Problemas Relacionados con los Medicamentos
    tips TEXT NOT NULL,
    speaking_speed TEXT DEFAULT 'Normal' -- 'Lento' | 'Normal' | 'Rápido'
  );

  CREATE TABLE IF NOT EXISTS simulations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scenario_id INTEGER,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    transcript TEXT,
    evaluation TEXT,
    score INTEGER,
    FOREIGN KEY(scenario_id) REFERENCES scenarios(id)
  );

  CREATE TABLE IF NOT EXISTS surveys (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    simulation_id INTEGER,
    realism INTEGER,
    usability INTEGER,
    utility INTEGER,
    feedback_quality INTEGER,
    added_value INTEGER,
    comments TEXT,
    duration INTEGER,
    FOREIGN KEY(simulation_id) REFERENCES simulations(id)
  );
`);

// Migration: Ensure surveys table has new columns
const tableInfo = db.prepare("PRAGMA table_info(surveys)").all() as any[];
const columns = tableInfo.map(c => c.name);
  
  if (!columns.includes('realism')) {
    db.exec(`
      ALTER TABLE surveys ADD COLUMN realism INTEGER;
      ALTER TABLE surveys ADD COLUMN usability INTEGER;
      ALTER TABLE surveys ADD COLUMN utility INTEGER;
      ALTER TABLE surveys ADD COLUMN feedback_quality INTEGER;
      ALTER TABLE surveys ADD COLUMN added_value INTEGER;
      ALTER TABLE surveys ADD COLUMN duration INTEGER;
    `);
    // Remove old rating column if it exists (SQLite doesn't support DROP COLUMN easily, so we just leave it or ignore it)
  }

// Seed initial scenarios
const existingScenarios = db.prepare('SELECT title FROM scenarios').all() as { title: string }[];
const existingTitles = new Set(existingScenarios.map(s => s.title));

const scenariosToSeed = [
  {
    title: 'Sangrado Digestivo (Riesgo de Anticoagulación)',
    description: 'Paciente que acudió a urgencias por melenas (heces negras y pegajosas).',
    profile: 'Paciente',
    gender: 'Masculino',
    lang: 'Español',
    meds: 'Anticoagulantes orales (Sintrom, Apixabán, Rivaroxabán)',
    prm: 'El paciente está tomando AINEs (como Ibuprofeno) por su cuenta para un dolor de rodilla, lo que ha provocado el sangrado al interactuar con el anticoagulante.',
    tips: 'Vigilar heces negras, evitar estrictamente AINEs, avisar ante hematomas espontáneos.',
    speed: 'Normal'
  },
  {
    title: 'Convulsiones (Falta de Adherencia)',
    description: 'Ingreso por crisis convulsiva tónico-clónica.',
    profile: 'Cuidador',
    gender: 'Femenino',
    lang: 'Catalán',
    meds: 'Antiepilépticos (Levetiracetam, Valproato)',
    prm: 'El paciente confiesa que "se sentía bien" y decidió dejar de tomar la medicación o reducir la dosis por su cuenta.',
    tips: 'Importancia de la toma a la misma hora, uso de alarmas, nunca suspender el tratamiento sin supervisión médica.',
    speed: 'Rápido'
  },
  {
    title: 'Hiperglicemia (Descompensación Diabética)',
    description: 'Paciente diabético que ingresa con niveles de glucosa muy elevados.',
    profile: 'Paciente',
    gender: 'Femenino',
    lang: 'Español',
    meds: 'Insulina o Antidiabéticos orales (Metformina, Gliclazida)',
    prm: 'Error en la técnica de administración de insulina o confusión entre la insulina lenta y la rápida.',
    tips: 'Revisar técnica de inyección, rotación de zonas, hidratación adecuada y cuidado de los pies.',
    speed: 'Lento'
  },
  {
    title: 'Crisis Hipertensiva (Olvido Terapéutico)',
    description: 'Ingreso por cefalea intensa y tensión arterial de 190/110 mmHg.',
    profile: 'Paciente',
    gender: 'Masculino',
    lang: 'Catalán',
    meds: 'Antihipertensivos (Enalapril, Amlodipino, Losartán)',
    prm: 'El paciente olvidó llevarse la medicación de viaje o dejó de tomarla porque "le hacía orinar mucho" (si toma diuréticos).',
    tips: 'Dieta baja en sal, registro diario de tensión, evitar la automedicación con antigripales.',
    speed: 'Normal'
  },
  {
    title: 'Estreñimiento (Efecto Secundario de Opioides)',
    description: 'Dolor abdominal agudo y ausencia de deposición durante 5 días tras cirugía.',
    profile: 'Paciente',
    gender: 'Femenino',
    lang: 'Español',
    meds: 'Tramadol u otros opioides para el dolor post-operatorio.',
    prm: 'El paciente no sabe que el fármaco para el dolor causa estreñimiento y no está siguiendo las pautas dietéticas o laxantes recomendadas.',
    tips: 'Aumentar fibra, beber mucha agua, actividad física suave.',
    speed: 'Normal'
  },
  {
    title: 'Somnolencia y Caídas (Sedación por Psicofármacos)',
    description: 'Paciente anciano que ingresa tras una caída en casa; presenta mucha sedación diurna.',
    profile: 'Cuidador',
    gender: 'Masculino',
    lang: 'Catalán',
    meds: 'Antipsicóticos (Quetiapina) o Benzodiacepinas.',
    prm: 'Duplicidad terapéutica (está tomando un fármaco antiguo de casa y el nuevo del hospital que son de la misma familia).',
    tips: 'Tomar la medicación sedante por la noche, prevención de caídas (quitar alfombras), evitar conducir.',
    speed: 'Lento'
  },
  {
    title: 'Bradicardia (Toxicidad por Betabloqueantes)',
    description: 'Mareos, sensación de desmayo y pulso por debajo de 50 lpm.',
    profile: 'Paciente',
    gender: 'Masculino',
    lang: 'Español',
    meds: 'Bisoprolol o Carvedilol.',
    prm: 'El paciente ha duplicado la dosis por error al no entender el cambio de marca comercial (confusión entre genérico y marca).',
    tips: 'Control de pulso, no suspender bruscamente, vigilar mareos al levantarse (hipotensión ortostática).',
    speed: 'Normal'
  }
];

const insert = db.prepare(`
  INSERT INTO scenarios (title, description, patient_profile, gender, language, medication, prm, tips, speaking_speed)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

for (const s of scenariosToSeed) {
  if (!existingTitles.has(s.title)) {
    insert.run(s.title, s.description, s.profile, s.gender, s.lang, s.meds, s.prm, s.tips, s.speed);
  }
}

export default db;

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.resolve(process.cwd(), 'pharma_call.db');
const db = new Database(dbPath);

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
    usual_medication TEXT,
    objectives TEXT,
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

// Migration: Ensure scenarios table has new columns
const scenarioTableInfo = db.prepare("PRAGMA table_info(scenarios)").all() as any[];
const scenarioColumns = scenarioTableInfo.map(c => c.name);

if (!scenarioColumns.includes('usual_medication')) {
  db.exec(`
    ALTER TABLE scenarios ADD COLUMN usual_medication TEXT;
    ALTER TABLE scenarios ADD COLUMN objectives TEXT;
  `);
}

// Seed initial scenarios from JSON file
const scenariosPath = path.resolve(process.cwd(), 'data', 'scenarios.json');
let initialScenarios = [];
try {
  const data = fs.readFileSync(scenariosPath, 'utf8');
  initialScenarios = JSON.parse(data);
} catch (error) {
  console.error('Error loading initial scenarios:', error);
}

const existingScenarios = db.prepare('SELECT title FROM scenarios').all() as { title: string }[];
const existingTitles = new Set(existingScenarios.map(s => s.title));

const insert = db.prepare(`
  INSERT INTO scenarios (title, description, patient_profile, gender, language, medication, usual_medication, objectives, prm, tips, speaking_speed)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const update = db.prepare(`
  UPDATE scenarios 
  SET description = ?, patient_profile = ?, gender = ?, language = ?, medication = ?, usual_medication = ?, objectives = ?, prm = ?, tips = ?, speaking_speed = ?
  WHERE title = ?
`);

for (const s of initialScenarios) {
  if (!existingTitles.has(s.title)) {
    insert.run(
      s.title, 
      s.description, 
      s.patient_profile, 
      s.gender, 
      s.language, 
      s.medication,
      s.usual_medication,
      s.objectives,
      s.prm, 
      s.tips, 
      s.speaking_speed
    );
  } else {
    update.run(
      s.description, 
      s.patient_profile, 
      s.gender, 
      s.language, 
      s.medication,
      s.usual_medication,
      s.objectives,
      s.prm, 
      s.tips, 
      s.speaking_speed,
      s.title
    );
  }
}

export default db;

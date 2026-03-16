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

// Seed initial scenarios from JSON file
import initialScenarios from './data/scenarios.json' assert { type: 'json' };

const existingScenarios = db.prepare('SELECT title FROM scenarios').all() as { title: string }[];
const existingTitles = new Set(existingScenarios.map(s => s.title));

const insert = db.prepare(`
  INSERT INTO scenarios (title, description, patient_profile, gender, language, medication, prm, tips, speaking_speed)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      s.prm, 
      s.tips, 
      s.speaking_speed
    );
  }
}

export default db;

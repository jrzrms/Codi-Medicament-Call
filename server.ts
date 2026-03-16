import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import db from "./src/db.ts";
import nodemailer from "nodemailer";
import { google } from "googleapis";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/scenarios", (req, res) => {
    try {
      const scenarios = db.prepare("SELECT * FROM scenarios").all();
      if (scenarios.length > 0) {
        return res.json(scenarios);
      }
    } catch (error) {
      console.error("Database error fetching scenarios:", error);
    }

    // Fallback to JSON file if DB is empty or fails (common on read-only platforms like Vercel)
    const scenariosPath = path.resolve(process.cwd(), 'data', 'scenarios.json');
    try {
      const data = fs.readFileSync(scenariosPath, 'utf8');
      const initialScenarios = JSON.parse(data);
      // Map JSON structure to match DB structure (adding IDs)
      const mappedScenarios = initialScenarios.map((s: any, index: number) => ({
        id: index + 1,
        ...s
      }));
      res.json(mappedScenarios);
    } catch (error) {
      console.error("Error loading fallback scenarios:", error);
      res.json([]);
    }
  });

  app.post("/api/scenarios", (req, res) => {
    const { title, description, patient_profile, gender, language, medication, usual_medication, objectives, prm, tips, speaking_speed } = req.body;
    const info = db.prepare(`
      INSERT INTO scenarios (title, description, patient_profile, gender, language, medication, usual_medication, objectives, prm, tips, speaking_speed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, description, patient_profile, gender, language, medication, usual_medication, objectives, prm, tips, speaking_speed);
    res.json({ id: info.lastInsertRowid });
  });

  app.post("/api/simulations", (req, res) => {
    const { scenario_id, transcript, evaluation, score } = req.body;
    const info = db.prepare(`
      INSERT INTO simulations (scenario_id, transcript, evaluation, score)
      VALUES (?, ?, ?, ?)
    `).run(scenario_id, transcript, JSON.stringify(evaluation), score);
    res.json({ id: info.lastInsertRowid });
  });

  app.get("/api/history", (req, res) => {
    const history = db.prepare(`
      SELECT s.*, sc.title as scenario_title 
      FROM simulations s 
      JOIN scenarios sc ON s.scenario_id = sc.id 
      ORDER BY s.timestamp DESC
    `).all();
    res.json(history);
  });

  // ElevenLabs Proxy
  app.post("/api/tts", async (req, res) => {
    const { text, voice_id } = req.body;
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return res.status(400).json({ error: "ElevenLabs API Key not configured" });
    }

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice_id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": apiKey,
        },
        body: JSON.stringify({
          text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!response.ok) throw new Error("ElevenLabs API error");

      const arrayBuffer = await response.arrayBuffer();
      res.set("Content-Type", "audio/mpeg");
      res.send(Buffer.from(arrayBuffer));
    } catch (error) {
      console.error("TTS Error:", error);
      res.status(500).json({ error: "Failed to generate speech" });
    }
  });

  // Survey & Email
  app.post("/api/survey", async (req, res) => {
    const { 
      simulation_id, 
      realism, 
      usability, 
      utility, 
      feedback_quality, 
      added_value, 
      comments,
      duration,
      scenario_title
    } = req.body;
    
    try {
      db.prepare(`
        INSERT INTO surveys (simulation_id, realism, usability, utility, feedback_quality, added_value, comments, duration)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(simulation_id, realism, usability, utility, feedback_quality, added_value, comments, duration);

      // Admin Notification
      if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        const adminEmail = process.env.ADMIN_EMAIL || "jrzrms@gmail.com";

        const mailOptions = {
          from: process.env.EMAIL_USER,
          to: adminEmail,
          subject: `Nueva Evaluación de Satisfacción - ${scenario_title}`,
          html: `
            <h2>Resumen de Evaluación de Satisfacción</h2>
            <p><strong>Escenario:</strong> ${scenario_title}</p>
            <p><strong>Duración de la llamada:</strong> ${Math.floor(duration / 60)}m ${duration % 60}s</p>
            <hr/>
            <ul>
              <li><strong>Realismo de la Simulación:</strong> ${realism}/10</li>
              <li><strong>Usabilidad de la Interfaz:</strong> ${usability}/10</li>
              <li><strong>Utilidad Clínica:</strong> ${utility}/10</li>
              <li><strong>Calidad del Feedback:</strong> ${feedback_quality}/10</li>
              <li><strong>Valoración General:</strong> ${added_value}/10</li>
            </ul>
            <p><strong>Comentarios:</strong> ${comments || 'Sin comentarios'}</p>
          `
        };

        transporter.sendMail(mailOptions).catch(err => console.error("Email error:", err));
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Survey Error:", error);
      res.status(500).json({ error: "Failed to save survey" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();

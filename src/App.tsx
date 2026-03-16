import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Phone, 
  PhoneOff, 
  Mic, 
  MicOff, 
  ChevronRight, 
  Filter, 
  History, 
  Plus, 
  CheckCircle2, 
  AlertCircle,
  MessageSquare,
  Star,
  Languages,
  User,
  Zap,
  ArrowLeft,
  Target,
  Pill
} from 'lucide-react';
import { Scenario, Simulation, EvaluationResult } from './types';
import { cn, formatTime } from './lib/utils';
import { AudioStreamer, MicRecorder } from './services/audio';
import { GoogleGenAI, Modality } from '@google/genai';
import { evaluateSimulation } from './services/evaluation';
import ReactMarkdown from 'react-markdown';
import scenariosData from './data/scenarios.json';

// --- Components ---

const ScenarioCard = ({ scenario, onSelect }: { scenario: Scenario, onSelect: (s: Scenario) => void }) => (
  <motion.div 
    whileHover={{ scale: 1.02 }}
    whileTap={{ scale: 0.98 }}
    onClick={() => onSelect(scenario)}
    className="bg-gray-50 border border-gray-200 p-6 rounded-2xl cursor-pointer hover:border-violet-500/50 transition-colors group"
  >
    <div className="flex justify-between items-start mb-4">
      <div className="flex gap-2">
        <span className={cn(
          "px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider",
          scenario.language === 'Español' ? "bg-blue-500/20 text-blue-600" : "bg-yellow-500/20 text-yellow-700"
        )}>
          {scenario.language}
        </span>
        <span className="bg-emerald-500/20 text-emerald-600 px-2 py-1 rounded-md text-[10px] uppercase font-bold tracking-wider">
          {scenario.patient_profile}
        </span>
      </div>
      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-violet-500 transition-colors" />
    </div>
    <h3 className="text-xl font-semibold text-gray-900 mb-2">{scenario.title}</h3>
    <p className="text-gray-600 text-sm line-clamp-2 mb-4">{scenario.description}</p>
    <div className="flex items-center gap-4 text-xs text-gray-400">
      <div className="flex items-center gap-1">
        <User className="w-3 h-3" />
        {scenario.gender}
      </div>
      <div className="flex items-center gap-1">
        <Zap className="w-3 h-3" />
        {scenario.speaking_speed}
      </div>
    </div>
  </motion.div>
);

const AudioVisualizer = ({ active }: { active: boolean }) => {
  return (
    <div className="flex items-center justify-center gap-1 h-12">
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          animate={active ? {
            height: [10, 40, 15, 35, 10],
          } : { height: 4 }}
          transition={{
            duration: 1,
            repeat: Infinity,
            delay: i * 0.1,
            ease: "easeInOut"
          }}
          className="w-1 bg-violet-500 rounded-full"
        />
      ))}
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [view, setView] = useState<'dashboard' | 'simulator' | 'evaluation' | 'history' | 'guides'>('dashboard');
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [history, setHistory] = useState<Simulation[]>([]);
  const [filters, setFilters] = useState({ profile: '', gender: '', speed: '', lang: '' });

  // Simulator State
  const [isCalling, setIsCalling] = useState(false);
  const [timer, setTimer] = useState(0);
  const [transcript, setTranscript] = useState<{ role: string, text: string }[]>([]);
  const [currentEvaluation, setCurrentEvaluation] = useState<EvaluationResult | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [currentSimulationId, setCurrentSimulationId] = useState<number | null>(null);

  // Survey State
  const [surveyData, setSurveyData] = useState({
    realism: 0,
    usability: 0,
    utility: 0,
    feedback_quality: 0,
    added_value: 0,
    comments: ''
  });
  const [isSubmittingSurvey, setIsSubmittingSurvey] = useState(false);
  const [surveySubmitted, setSurveySubmitted] = useState(false);

  const audioStreamer = useRef(new AudioStreamer());
  const micRecorder = useRef<MicRecorder | null>(null);
  const sessionRef = useRef<any>(null);
  const isStoppingRef = useRef(false);

  useEffect(() => {
    fetchScenarios();
    fetchHistory();
  }, []);

const fetchScenarios = () => {
  // Ya no hace falta async/await ni fetch
  // scenariosData es el contenido de tu JSON local
  setScenarios(scenariosData as Scenario[]);
};
  const fetchHistory = async () => {
    const res = await fetch('/api/history');
    const data = await res.json();
    setHistory(data);
  };

  const startCall = async () => {
    if (!selectedScenario) return;
    
    isStoppingRef.current = false;
    setIsCalling(true);
    setTimer(0);
    setTranscript([]);
    await audioStreamer.current.start();

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
    
    const systemPrompt = `
      Actúa como un ${selectedScenario.patient_profile} de ${selectedScenario.gender === 'Masculino' ? 'edad avanzada' : 'edad avanzada'}.
      Idioma: ${selectedScenario.language}.
      Velocidad de habla: ${selectedScenario.speaking_speed}.
      
      Contexto clínico: ${selectedScenario.description}.
      Medicación relacionada: ${selectedScenario.medication}.
      Medicación habitual: ${selectedScenario.usual_medication}.
      Objetivos de la entrevista (para tu conocimiento): ${selectedScenario.objectives}.
      Problemas (PRM): ${selectedScenario.prm}.
      
      Instrucciones de personalidad:
      - Sé natural, usa muletillas ("eh...", "pues...", "mire usted").
      - Muestra dudas realistas sobre tu medicación.
      - Si la velocidad es 'Rápido', habla de forma apresurada y algo nerviosa.
      - No te salgas del personaje. Estás recibiendo una llamada del farmacéutico del hospital para revisar tu medicación tras el alta.
      - Responde de forma concisa pero humana.
    `;

    const sessionPromise = ai.live.connect({
      model: "gemini-2.5-flash-native-audio-preview-12-2025",
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction: systemPrompt,
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedScenario.gender === 'Masculino' ? 'Fenrir' : 'Kore' } }
        }
      },
      callbacks: {
        onopen: () => {
          micRecorder.current = new MicRecorder((base64) => {
            sessionPromise.then(session => {
              session.sendRealtimeInput({ media: { data: base64, mimeType: 'audio/pcm;rate=16000' } });
            });
          });
          micRecorder.current.start();
        },
        onmessage: async (msg) => {
          if (msg.serverContent?.modelTurn?.parts?.[0]?.inlineData) {
            audioStreamer.current.playChunk(msg.serverContent.modelTurn.parts[0].inlineData.data);
          }
          // Handle model transcription
          if (msg.serverContent?.modelTurn?.parts?.[0]?.text) {
             setTranscript(prev => [...prev, { role: 'IA', text: msg.serverContent!.modelTurn!.parts[0].text! }]);
          }
          // Handle user transcription
          if (msg.serverContent?.inputTranscription?.text && msg.serverContent.inputTranscription.finished) {
             setTranscript(prev => [...prev, { role: 'Usuario', text: msg.serverContent!.inputTranscription!.text! }]);
          }
        },
        onclose: () => stopCall()
      }
    });

    sessionRef.current = await sessionPromise;
  };

  const stopCall = async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    setIsCalling(false);
    micRecorder.current?.stop();
    audioStreamer.current.stop();
    sessionRef.current?.close();

    // Trigger evaluation
    setCurrentEvaluation(null);
    setIsEvaluating(true);
    setView('evaluation');
    setSurveySubmitted(false);
    setSurveyData({ realism: 0, usability: 0, utility: 0, feedback_quality: 0, added_value: 0, comments: '' });
    
    const fullTranscript = transcript.map(t => `${t.role}: ${t.text}`).join('\n');
    const callDuration = timer;

    try {
      const evalResult = await evaluateSimulation(fullTranscript, selectedScenario);
      setCurrentEvaluation(evalResult);
      
      // Save to DB
      const simRes = await fetch('/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario_id: selectedScenario?.id,
          transcript: fullTranscript,
          evaluation: evalResult,
          score: evalResult.score
        })
      });
      const simData = await simRes.json();
      setCurrentSimulationId(simData.id);
      fetchHistory();
    } catch (error) {
      console.error("Evaluation failed", error);
    } finally {
      setIsEvaluating(false);
    }
  };

  const submitSurvey = async () => {
    if (!currentSimulationId || !selectedScenario) return;
    setIsSubmittingSurvey(true);
    try {
      await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulation_id: currentSimulationId,
          ...surveyData,
          duration: timer,
          scenario_title: selectedScenario.title
        })
      });
      setSurveySubmitted(true);
    } catch (error) {
      console.error("Survey submission failed", error);
    } finally {
      setIsSubmittingSurvey(false);
    }
  };

  useEffect(() => {
    let interval: any;
    if (isCalling) {
      interval = setInterval(() => setTimer(t => t + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isCalling]);

  const filteredScenarios = scenarios.filter(s => {
    return (!filters.profile || s.patient_profile === filters.profile) &&
           (!filters.gender || s.gender === filters.gender) &&
           (!filters.speed || s.speaking_speed === filters.speed) &&
           (!filters.lang || s.language === filters.lang);
  });

  const [isAddingScenario, setIsAddingScenario] = useState(false);
  const [newScenario, setNewScenario] = useState<Partial<Scenario>>({
    title: '',
    description: '',
    patient_profile: 'Paciente',
    gender: 'Masculino',
    language: 'Español',
    medication: '',
    usual_medication: '',
    objectives: '',
    prm: '',
    tips: '',
    speaking_speed: 'Normal'
  });

  const handleAddScenario = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/scenarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newScenario)
    });
    if (res.ok) {
      setIsAddingScenario(false);
      fetchScenarios();
      setNewScenario({
        title: '',
        description: '',
        patient_profile: 'Paciente',
        gender: 'Masculino',
        language: 'Español',
        medication: '',
        prm: '',
        tips: '',
        speaking_speed: 'Normal'
      });
    }
  };

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans selection:bg-violet-500/30">
      {/* Header */}
      <header className="border-b border-gray-200 bg-white/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('dashboard')}>
            <div className="w-10 h-10 bg-gradient-to-br from-violet-600 to-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-violet-500/20">
              <Phone className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">Codi Medicament <span className="text-violet-600">Simulator</span></h1>
          </div>
          <nav className="flex items-center gap-6">
            <button 
              onClick={() => setView('dashboard')}
              className={cn("text-sm font-medium transition-colors", view === 'dashboard' ? "text-violet-600" : "text-gray-500 hover:text-gray-900")}
            >
              Escenarios
            </button>
            <button 
              onClick={() => setView('guides')}
              className={cn("text-sm font-medium transition-colors", view === 'guides' ? "text-violet-600" : "text-gray-500 hover:text-gray-900")}
            >
              Guías
            </button>
            <button 
              onClick={() => setView('history')}
              className={cn("text-sm font-medium transition-colors", view === 'history' ? "text-violet-600" : "text-gray-500 hover:text-gray-900")}
            >
              Historial
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-12">
        <AnimatePresence mode="wait">
          {view === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
                <div>
                  <h2 className="text-4xl font-bold mb-2">Escenarios Clínicos</h2>
                  <p className="text-gray-500">Selecciona un caso para comenzar la simulación de conciliación.</p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <select 
                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-violet-500"
                    onChange={(e) => setFilters(f => ({ ...f, profile: e.target.value }))}
                  >
                    <option value="">Todos los Perfiles</option>
                    <option value="Paciente">Paciente</option>
                    <option value="Cuidador">Cuidador</option>
                  </select>
                  <select 
                    className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-violet-500"
                    onChange={(e) => setFilters(f => ({ ...f, lang: e.target.value }))}
                  >
                    <option value="">Idiomas</option>
                    <option value="Español">Español</option>
                    <option value="Catalán">Catalán</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredScenarios.map(s => (
                  <ScenarioCard 
                    key={s.id} 
                    scenario={s} 
                    onSelect={(scenario) => {
                      setSelectedScenario(scenario);
                      setView('simulator');
                    }} 
                  />
                ))}
                <motion.div 
                  whileHover={{ scale: 1.02 }}
                  onClick={() => setIsAddingScenario(true)}
                  className="border-2 border-dashed border-gray-200 p-6 rounded-2xl flex flex-col items-center justify-center text-gray-300 hover:text-gray-400 hover:border-gray-300 cursor-pointer transition-all"
                >
                  <Plus className="w-8 h-8 mb-2" />
                  <span className="font-semibold">Nuevo Escenario</span>
                </motion.div>
              </div>

              {/* Add Scenario Modal */}
              <AnimatePresence>
                {isAddingScenario && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setIsAddingScenario(false)}
                      className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                    />
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.9, y: 20 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, y: 20 }}
                      className="bg-white border border-gray-200 rounded-3xl p-8 w-full max-w-2xl relative z-10 shadow-2xl overflow-y-auto max-h-[90vh]"
                    >
                      <h3 className="text-2xl font-bold mb-6">Crear Nuevo Escenario</h3>
                      <form onSubmit={handleAddScenario} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Título</label>
                            <input 
                              required
                              value={newScenario.title}
                              onChange={e => setNewScenario({...newScenario, title: e.target.value})}
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:border-violet-500 outline-none" 
                            />
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Perfil</label>
                            <select 
                              value={newScenario.patient_profile}
                              onChange={e => setNewScenario({...newScenario, patient_profile: e.target.value as any})}
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:border-violet-500 outline-none"
                            >
                              <option value="Paciente">Paciente</option>
                              <option value="Cuidador">Cuidador</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-400 uppercase">Descripción del Caso</label>
                          <textarea 
                            required
                            value={newScenario.description}
                            onChange={e => setNewScenario({...newScenario, description: e.target.value})}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:border-violet-500 outline-none h-24" 
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Género</label>
                            <select 
                              value={newScenario.gender}
                              onChange={e => setNewScenario({...newScenario, gender: e.target.value as any})}
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:border-violet-500 outline-none"
                            >
                              <option value="Masculino">Masculino</option>
                              <option value="Femenino">Femenino</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Idioma</label>
                            <select 
                              value={newScenario.language}
                              onChange={e => setNewScenario({...newScenario, language: e.target.value as any})}
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:border-violet-500 outline-none"
                            >
                              <option value="Español">Español</option>
                              <option value="Catalán">Catalán</option>
                            </select>
                          </div>
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-gray-400 uppercase">Velocidad</label>
                            <select 
                              value={newScenario.speaking_speed}
                              onChange={e => setNewScenario({...newScenario, speaking_speed: e.target.value as any})}
                              className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:border-violet-500 outline-none"
                            >
                              <option value="Lento">Lento</option>
                              <option value="Normal">Normal</option>
                              <option value="Rápido">Rápido</option>
                            </select>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-400 uppercase">Medicación Relacionada con el Ingreso</label>
                          <input 
                            value={newScenario.medication}
                            onChange={e => setNewScenario({...newScenario, medication: e.target.value})}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:border-violet-500 outline-none" 
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-400 uppercase">Medicación Habitual (5-10 fármacos)</label>
                          <textarea 
                            rows={3}
                            value={newScenario.usual_medication}
                            onChange={e => setNewScenario({...newScenario, usual_medication: e.target.value})}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:border-violet-500 outline-none" 
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-400 uppercase">Objetivos de la Entrevista</label>
                          <textarea 
                            rows={3}
                            value={newScenario.objectives}
                            onChange={e => setNewScenario({...newScenario, objectives: e.target.value})}
                            className="w-full bg-gray-50 border border-gray-200 rounded-xl p-3 text-sm focus:border-violet-500 outline-none" 
                          />
                        </div>
                        <div className="flex justify-end gap-3 mt-8">
                          <button 
                            type="button"
                            onClick={() => setIsAddingScenario(false)}
                            className="px-6 py-3 rounded-xl font-bold text-gray-400 hover:text-gray-900 transition-colors"
                          >
                            Cancelar
                          </button>
                          <button 
                            type="submit"
                            className="bg-violet-600 hover:bg-violet-700 text-white px-8 py-3 rounded-xl font-bold shadow-lg shadow-violet-500/20 transition-all"
                          >
                            Guardar Escenario
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {view === 'simulator' && selectedScenario && (
            <motion.div 
              key="simulator"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="max-w-4xl mx-auto space-y-6"
            >
              {/* Briefing Section at the top */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <motion.div 
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm"
                >
                  <h4 className="text-[10px] font-bold text-violet-600 uppercase tracking-wider flex items-center gap-2 mb-3">
                    <Target className="w-3 h-3" />
                    Objetivos de la Entrevista
                  </h4>
                  <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {selectedScenario.objectives || 'No definidos'}
                  </div>
                </motion.div>
                <motion.div 
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="bg-white rounded-3xl p-6 border border-gray-200 shadow-sm space-y-4"
                >
                  <div>
                    <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider flex items-center gap-2 mb-2">
                      <Pill className="w-3 h-3" />
                      Medicación Actual (Habitual)
                    </h4>
                    <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                      {selectedScenario.usual_medication || 'No definida'}
                    </div>
                  </div>
                  {selectedScenario.medication && (
                    <div className="pt-4 border-t border-gray-100">
                      <h4 className="text-[10px] font-bold text-blue-600 uppercase tracking-wider flex items-center gap-2 mb-2">
                        <Zap className="w-3 h-3" />
                        Relacionada con el Ingreso
                      </h4>
                      <div className="text-sm text-gray-600 leading-relaxed">
                        {selectedScenario.medication}
                      </div>
                    </div>
                  )}
                </motion.div>
              </div>

              <div className="bg-gray-50 rounded-3xl overflow-hidden border border-gray-200 shadow-2xl">
                <div className="p-8 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-violet-600/10 to-transparent">
                  <div className="flex items-center gap-4">
                    <button onClick={() => setView('dashboard')} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                      <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                      <h3 className="text-xl font-bold">{selectedScenario.title}</h3>
                      <p className="text-gray-400 text-sm">Llamada en curso • {formatTime(timer)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                    <span className="text-xs font-bold text-emerald-500 uppercase tracking-widest">Live</span>
                  </div>
                </div>

                <div className="p-12 flex flex-col items-center justify-center min-h-[400px]">
                  <div className="relative mb-12">
                    <div className="w-32 h-32 bg-violet-500/20 rounded-full flex items-center justify-center relative z-10">
                      <User className="w-12 h-12 text-violet-600" />
                    </div>
                    {isCalling && (
                      <>
                        <motion.div 
                          animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                          transition={{ duration: 2, repeat: Infinity }}
                          className="absolute inset-0 bg-violet-500/20 rounded-full -z-0"
                        />
                        <motion.div 
                          animate={{ scale: [1, 2, 1], opacity: [0.3, 0, 0.3] }}
                          transition={{ duration: 3, repeat: Infinity }}
                          className="absolute inset-0 bg-violet-500/10 rounded-full -z-0"
                        />
                      </>
                    )}
                  </div>

                  <h4 className="text-2xl font-bold mb-2">{selectedScenario.patient_profile}</h4>
                  <p className="text-gray-400 mb-8">{selectedScenario.gender}, {selectedScenario.language}</p>

                  <AudioVisualizer active={isCalling} />

                  <div className="mt-12 flex gap-6">
                    {!isCalling ? (
                      <button 
                        onClick={startCall}
                        className="bg-emerald-500 hover:bg-emerald-600 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 transition-all shadow-lg shadow-emerald-500/20"
                      >
                        <Phone className="w-5 h-5" />
                        Iniciar Llamada
                      </button>
                    ) : (
                      <button 
                        onClick={stopCall}
                        className="bg-red-500 hover:bg-red-600 text-white px-8 py-4 rounded-2xl font-bold flex items-center gap-3 transition-all shadow-lg shadow-red-500/20"
                      >
                        <PhoneOff className="w-5 h-5" />
                        Finalizar
                      </button>
                    )}
                  </div>
                </div>

                {/* Real-time Transcript Mockup */}
                <div className="p-6 bg-gray-100 border-t border-gray-200 max-h-48 overflow-y-auto">
                  <p className="text-[10px] uppercase font-bold text-gray-400 mb-4 tracking-widest">Transcripción en tiempo real</p>
                  <div className="space-y-3">
                    {transcript.map((t, i) => (
                      <div key={i} className={cn("text-sm", t.role === 'IA' ? "text-violet-600" : "text-gray-600")}>
                        <span className="font-bold mr-2">{t.role}:</span>
                        {t.text}
                      </div>
                    ))}
                    {transcript.length === 0 && <p className="text-gray-300 italic text-sm">Esperando interacción...</p>}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'evaluation' && (
            <motion.div 
              key="evaluation"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold">Evaluación de la Simulación</h2>
                <button 
                  onClick={() => setView('dashboard')}
                  className="text-white/40 hover:text-white flex items-center gap-2 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Volver al Dashboard
                </button>
              </div>

              {isEvaluating ? (
                <div className="bg-gray-50 rounded-3xl p-12 flex flex-col items-center justify-center border border-gray-200">
                  <div className="w-16 h-16 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-6" />
                  <h3 className="text-xl font-bold mb-2">Analizando desempeño clínico...</h3>
                  <p className="text-gray-500">Gemini está procesando la transcripción y evaluando los criterios.</p>
                </div>
              ) : currentEvaluation && (
                <div className="space-y-6">
                  {/* Score Header */}
                  <div className="bg-gradient-to-br from-violet-600 to-indigo-700 rounded-3xl p-8 flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl">
                    <div className="text-center md:text-left">
                      <div className="text-5xl font-black mb-2">{currentEvaluation.score}<span className="text-white/40 text-2xl">/10</span></div>
                      <p className="text-white/80 font-medium">Puntuación Global de Conciliación</p>
                    </div>
                    <div className="flex gap-4">
                      <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl text-center min-w-[120px]">
                        <div className="text-xs font-bold uppercase tracking-widest text-white/60 mb-1">Humanidad</div>
                        <div className="font-bold text-white">{currentEvaluation.human_touch}</div>
                      </div>
                      <div className="bg-white/10 backdrop-blur-md p-4 rounded-2xl text-center min-w-[120px]">
                        <div className="text-xs font-bold uppercase tracking-widest text-white/60 mb-1">Síntesis</div>
                        <div className="font-bold text-white">{currentEvaluation.synthesis_capacity}</div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Checklist */}
                    <div className="md:col-span-1 bg-gray-50 rounded-3xl p-8 border border-gray-200">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-6">Checklist de Criterios</h4>
                      <div className="space-y-4">
                        {[
                          { key: 'presentation', label: 'Presentación' },
                          { key: 'comprehension', label: 'Comprensión Alta' },
                          { key: 'e_prescription', label: 'Receta Electrónica' },
                          { key: 'adherence', label: 'Test Adherencia' },
                          { key: 'aids', label: 'Oferta Ayudas' },
                          { key: 'closure', label: 'Cierre Correcto' }
                        ].map(item => (
                          <div key={item.key} className="flex items-center justify-between">
                            <span className="text-sm text-gray-800">{item.label}</span>
                            {currentEvaluation.checklist[item.key as keyof typeof currentEvaluation.checklist] ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                            ) : (
                              <AlertCircle className="w-5 h-5 text-red-500" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Feedback */}
                    <div className="md:col-span-2 bg-gray-50 rounded-3xl p-8 border border-gray-200">
                      <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-6">Feedback Detallado</h4>
                      <div className="prose max-w-none text-gray-800 text-sm leading-relaxed">
                        <ReactMarkdown>{currentEvaluation.feedback}</ReactMarkdown>
                      </div>
                    </div>
                  </div>
                  
                  {/* Survey Form */}
                  <div className="bg-gray-50 rounded-3xl p-8 border border-gray-200">
                    <h4 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-6">Encuesta de Satisfacción</h4>
                    
                    {surveySubmitted ? (
                      <div className="text-center py-8">
                        <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                        <h5 className="text-xl font-bold text-gray-900 mb-2">¡Gracias por tu feedback!</h5>
                        <p className="text-gray-500">Tus respuestas nos ayudan a mejorar la herramienta.</p>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {[
                          { key: 'realism', label: 'Realismo de la Simulación', desc: '¿La voz, las respuestas y el comportamiento se sintieron naturales?' },
                          { key: 'usability', label: 'Usabilidad de la Interfaz', desc: '¿Fue fácil iniciar la llamada y navegar por la aplicación?' },
                          { key: 'utility', label: 'Utilidad Clínica', desc: '¿El paciente simulado te ha planteado problemas reales con sus medicamentos?' },
                          { key: 'feedback_quality', label: 'Calidad del Feedback', desc: '¿El informe de la IA fue preciso y útil para tu aprendizaje?' },
                          { key: 'added_value', label: 'Valoración General', desc: '¿En general, cómo valoras esta llamada para tu formación?' }
                        ].map((pillar) => (
                          <div key={pillar.key} className="space-y-3">
                            <div className="flex justify-between items-end">
                              <div>
                                <h5 className="font-bold text-gray-900">{pillar.label}</h5>
                                <p className="text-xs text-gray-500">{pillar.desc}</p>
                              </div>
                              <span className="text-lg font-black text-violet-600">
                                {surveyData[pillar.key as keyof typeof surveyData] || '-'}
                                <span className="text-gray-300 text-sm font-normal">/10</span>
                              </span>
                            </div>
                            <div className="flex justify-between gap-1">
                              {[1,2,3,4,5,6,7,8,9,10].map(val => (
                                <button
                                  key={val}
                                  onClick={() => setSurveyData(prev => ({ ...prev, [pillar.key]: val }))}
                                  className={cn(
                                    "flex-1 h-10 rounded-lg text-xs font-bold transition-all",
                                    surveyData[pillar.key as keyof typeof surveyData] === val
                                      ? "bg-violet-600 text-white shadow-lg shadow-violet-500/30 scale-110 z-10"
                                      : "bg-gray-100 text-gray-400 hover:bg-gray-200"
                                  )}
                                >
                                  {val}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-gray-400 uppercase">Comentarios Adicionales</label>
                          <textarea 
                            value={surveyData.comments}
                            onChange={e => setSurveyData(prev => ({ ...prev, comments: e.target.value }))}
                            placeholder="Sugerencias de mejora o reporte de errores..."
                            className="w-full bg-gray-100 border border-gray-200 rounded-2xl p-4 text-sm focus:outline-none focus:border-violet-500 h-32"
                          />
                        </div>

                        <button 
                          onClick={submitSurvey}
                          disabled={isSubmittingSurvey || Object.values(surveyData).some(v => typeof v === 'number' && v === 0)}
                          className={cn(
                            "w-full py-4 rounded-2xl font-bold transition-all flex items-center justify-center gap-2",
                            isSubmittingSurvey || Object.values(surveyData).some(v => typeof v === 'number' && v === 0)
                              ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                              : "bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-500/20"
                          )}
                        >
                          {isSubmittingSurvey ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <>
                              <MessageSquare className="w-5 h-5" />
                              Enviar Evaluación
                            </>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {view === 'guides' && (
            <motion.div 
              key="guides"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div>
                <h2 className="text-4xl font-bold mb-2">Guías y Recomendaciones</h2>
                <p className="text-white/40">Recursos esenciales para la práctica de la conciliación farmacéutica.</p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Decálogo */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-gray-50 rounded-3xl p-8 border border-gray-200 shadow-xl">
                    <h3 className="text-2xl font-bold mb-8 flex items-center gap-3">
                      <Star className="w-6 h-6 text-yellow-500" />
                      Decálogo de la Entrevista: 10 Imprescindibles
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {[
                        { id: '01', title: 'Presentación clara', desc: 'Nombre, cargo y centro desde el que llamas.' },
                        { id: '02', title: 'Validación del interlocutor', desc: 'Confirmar que hablas con el paciente o cuidador principal.' },
                        { id: '03', title: 'Verificación de la comprensión', desc: '¿Entiende por qué estuvo en urgencias?' },
                        { id: '04', title: 'Revisión de la Receta', desc: 'Confirmar que ha podido recoger la medicación.' },
                        { id: '05', title: 'Conciliación de la medicación', desc: 'Detectar duplicidades o falta de fármacos habituales.' },
                        { id: '06', title: 'Evaluación de la adherencia', desc: 'Uso del test ARMS-7 o preguntas abiertas sobre olvidos.' },
                        { id: '07', title: 'Detección de PSM', desc: 'Preguntar específicamente por síntomas relacionados con el motivo de ingreso.' },
                        { id: '08', title: 'Uso de lenguaje sencillo', desc: 'Evitar tecnicismos médicos que confundan al paciente.' },
                        { id: '09', title: 'Plan de acción y ayudas', desc: 'Sugerir pastilleros, alarmas o calendarios si es necesario.' },
                        { id: '10', title: 'Cierre y próximos pasos', desc: 'Resumir consejos clave y recordar próximas citas o contactos.' }
                      ].map((item) => (
                        <div key={item.id} className="flex gap-4 group">
                          <span className="text-violet-600 font-mono font-bold text-lg">{item.id}</span>
                          <div>
                            <h4 className="font-bold text-gray-900 group-hover:text-violet-600 transition-colors">{item.title}</h4>
                            <p className="text-sm text-gray-500 leading-relaxed">{item.desc}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Enlaces y Documentación */}
                <div className="space-y-6">
                  <div className="bg-gray-50 rounded-3xl p-8 border border-gray-200 shadow-xl">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                      <Languages className="w-5 h-5 text-emerald-600" />
                      Consejos para Pacientes
                    </h3>
                    <a 
                      href="https://codimedicament.santpau.cat/ca/pacients-i-cuidadors/" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-4 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-all group"
                    >
                      <span className="text-sm font-medium">Web Codi Medicament</span>
                      <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all" />
                    </a>
                  </div>

                  <div className="bg-gray-50 rounded-3xl p-8 border border-gray-200 shadow-xl">
                    <h3 className="text-xl font-bold mb-6 flex items-center gap-3">
                      <Plus className="w-5 h-5 text-violet-600" />
                      Documentación de Ayuda
                    </h3>
                    <div className="space-y-3">
                      <a 
                        href="https://www.sefh.es/mapex/images/Guia-profesionales-TF_VF.pdf" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-4 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-all group"
                      >
                        <span className="text-sm font-medium">Guías Telefarmacia SEFH</span>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-violet-600 group-hover:translate-x-1 transition-all" />
                      </a>
                      <a 
                        href="https://www.sefh.es/mapex/images/Guia-profesionales-TF_VF.pdf" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center justify-between p-4 bg-gray-100 rounded-2xl hover:bg-gray-200 transition-all group"
                      >
                        <span className="text-sm font-medium">Protocolos Codi Medicament</span>
                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-violet-600 group-hover:translate-x-1 transition-all" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div 
              key="history"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <h2 className="text-4xl font-bold mb-12">Historial de Simulaciones</h2>
              <div className="space-y-4">
                {history.map(sim => (
                  <div key={sim.id} className="bg-gray-50 border border-gray-200 p-6 rounded-2xl flex items-center justify-between hover:border-gray-300 transition-colors">
                    <div className="flex items-center gap-6">
                      <div className={cn(
                        "w-12 h-12 rounded-xl flex items-center justify-center font-bold text-xl",
                        sim.score >= 8 ? "bg-emerald-500/20 text-emerald-600" : sim.score >= 5 ? "bg-yellow-500/20 text-yellow-700" : "bg-red-500/20 text-red-600"
                      )}>
                        {sim.score}
                      </div>
                      <div>
                        <h4 className="font-bold">{sim.scenario_title}</h4>
                        <p className="text-xs text-gray-400">{new Date(sim.timestamp).toLocaleString()}</p>
                      </div>
                    </div>
                    <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-400 hover:text-gray-900">
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>
                ))}
                {history.length === 0 && (
                  <div className="text-center py-20 text-white/20">
                    <History className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>No hay simulaciones registradas aún.</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

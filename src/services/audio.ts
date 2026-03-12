import { GoogleGenAI, Modality } from "@google/genai";

export class AudioStreamer {
  private audioContext: AudioContext | null = null;
  private nextStartTime: number = 0;
  private sampleRate: number = 24000;

  constructor() {}

  async start() {
    this.audioContext = new AudioContext({ sampleRate: this.sampleRate });
    await this.audioContext.resume();
    this.nextStartTime = this.audioContext.currentTime;
  }

  stop() {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }

  async playChunk(base64Data: string) {
    if (!this.audioContext) return;

    const binaryString = atob(base64Data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    // PCM 16-bit to Float32
    const int16Array = new Int16Array(bytes.buffer);
    const float32Array = new Float32Array(int16Array.length);
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768.0;
    }

    const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, this.sampleRate);
    audioBuffer.getChannelData(0).set(float32Array);

    const source = this.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext.destination);

    const startTime = Math.max(this.nextStartTime, this.audioContext.currentTime);
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
  }
}

export class MicRecorder {
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private onAudio: (base64: string) => void;

  constructor(onAudio: (base64: string) => void) {
    this.onAudio = onAudio;
  }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.audioContext = new AudioContext({ sampleRate: 16000 });
    await this.audioContext.resume();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

    source.connect(this.processor);
    this.processor.connect(this.audioContext.destination);

    this.processor.onaudioprocess = (e) => {
      const inputData = e.inputBuffer.getChannelData(0);
      // Float32 to Int16
      const int16Array = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        int16Array[i] = Math.max(-1, Math.min(1, inputData[i])) * 32767;
      }
      
      // Convert to base64 more robustly
      const uint8Array = new Uint8Array(int16Array.buffer);
      let binary = '';
      const len = uint8Array.byteLength;
      for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);
      this.onAudio(base64);
    };
  }

  stop() {
    this.stream?.getTracks().forEach(t => t.stop());
    this.processor?.disconnect();
    this.audioContext?.close();
  }
}

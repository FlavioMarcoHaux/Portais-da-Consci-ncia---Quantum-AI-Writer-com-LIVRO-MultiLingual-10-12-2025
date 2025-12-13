

export type Language = 'pt' | 'en' | 'es';

export interface Subchapter {
  id: string;
  title: string;
  description?: string;
  content?: string; // The generated content
  isGenerating?: boolean;
}

export interface Chapter {
  id: string;
  title: string;
  subchapters: Subchapter[];
}

export interface BookStructure {
  title: string;
  subtitle: string;
  chapters: Chapter[];
}

export enum GenerationStatus {
  IDLE = 'IDLE',
  GENERATING = 'GENERATING',
  COMPLETE = 'COMPLETE',
  ERROR = 'ERROR',
  SPEAKING = 'SPEAKING',
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  id: string;
}

// Roteiro de Texto (Visualização)
export interface PodcastSegment {
  speaker: string; // "Milton Dilts" or "Roberta Erickson"
  voiceId: string; // "Enceladus" or "Aoede"
  text: string;
  tone?: string;
}

// Novo: Bloco de Áudio Consolidado (5 min)
export interface PodcastAudioBlock {
  id: string;
  label: string; // "Bloco 1 (0-5 min)"
  audioBase64: string | null;
  status: GenerationStatus;
  transcript: string; // O texto consolidado deste bloco
}

export interface MarketingStrategy {
  optimizedTitle: string;
  description: string;
  tags: string; // Comma separated
  chapters: string; // Formatted timestamp list
  viralHook: string; // Short sentence
}

// Persistência de Dados
export interface MarketingData {
  strategy: MarketingStrategy | null;
  customTopic: string;
  imagePrompt: string;
  generatedImage: string | null;
}

export interface PodcastData {
  segments: PodcastSegment[];
  audioBlocks: PodcastAudioBlock[]; // Blocos de áudio gerados
  durationMinutes: number;
  customTopic: string;
  isDeep: boolean;
}

// --- MODULE: WRITER & MENTOR ---

export interface BookContent {
  fullText: string;
  sections: string[]; // Chunks gerados progressivamente
  generatedAt: number;
  audiobookUrl: string | null; // Blob URL ou Base64
}

export interface LectureContent {
  script: string;
  audioUrl: string | null; // Blob URL ou Base64
  generatedAt: number;
}

export interface WriterData {
  book: BookContent | null;
  lecture: LectureContent | null;
  statusBook: GenerationStatus;
  statusLecture: GenerationStatus;
  statusAudioBook: GenerationStatus;
  statusAudioLecture: GenerationStatus;
}


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

// Novo tipo para o roteiro do Podcast
export interface PodcastSegment {
  speaker: string; // "Milton Dilts" or "Roberta Erickson"
  voiceId: string; // "Enceladus" or "Aoede"
  text: string;
  tone?: string;
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

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ContentArea } from './components/ContentArea';
import { getBookStructure } from './bookStructure';
import { Chapter, Subchapter, MarketingData, PodcastData, WriterData, ChatMessage, Language, GenerationStatus } from './types';

function App() {
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [currentSubchapter, setCurrentSubchapter] = useState<Subchapter | null>(null);
  const [language, setLanguage] = useState<Language>('pt');
  
  // Mobile Sidebar State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  // Dynamic Book Structure based on Language
  const bookStructure = getBookStructure(language);

  // ------------------------------------------------------------------
  // GLOBAL STATE MANAGEMENT (Data Persistence)
  // ------------------------------------------------------------------

  // 1. Marketing Cache
  const [marketingCache, setMarketingCache] = useState<Record<string, MarketingData>>(() => {
    try {
        const saved = localStorage.getItem('quantum_marketing_cache');
        return saved ? JSON.parse(saved) : {};
    } catch (e) { return {}; }
  });

  // 2. Podcast Cache
  const [podcastCache, setPodcastCache] = useState<Record<string, PodcastData>>(() => {
    try {
        const saved = localStorage.getItem('quantum_podcast_cache');
        return saved ? JSON.parse(saved) : {};
    } catch (e) { return {}; }
  });

  // 3. Writer Cache
  const [writerCache, setWriterCache] = useState<Record<string, WriterData>>(() => {
    try {
        const saved = localStorage.getItem('quantum_writer_cache');
        return saved ? JSON.parse(saved) : {};
    } catch (e) { return {}; }
  });

  // 4. Chat History
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>(() => {
    try {
        const saved = localStorage.getItem('quantum_chat_history');
        const parsed = saved ? JSON.parse(saved) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  });

  // ------------------------------------------------------------------
  // SAFE PERSISTENCE LOGIC (Prevents QuotaExceededError Crash)
  // ------------------------------------------------------------------
  
  const safeSave = (key: string, data: any) => {
      try {
          // Custom replacer to filter out huge Base64 strings to avoid exceeding 5MB LocalStorage limit
          const json = JSON.stringify(data, (k, v) => {
              if (typeof v === 'string' && v.length > 50000) { // Limit ~50KB per string field
                  return null; // Discard heavy audio data from persistence
              }
              return v;
          });
          localStorage.setItem(key, json);
      } catch (e) {
          console.warn(`[Quantum Storage] Quota Exceeded or Error saving ${key}. Heavy data dropped.`);
      }
  };

  useEffect(() => {
    safeSave('quantum_marketing_cache', marketingCache);
  }, [marketingCache]);

  useEffect(() => {
    safeSave('quantum_podcast_cache', podcastCache);
  }, [podcastCache]);

  useEffect(() => {
    safeSave('quantum_writer_cache', writerCache);
  }, [writerCache]);

  useEffect(() => {
    safeSave('quantum_chat_history', chatHistory);
  }, [chatHistory]);

  // ------------------------------------------------------------------
  // HANDLERS
  // ------------------------------------------------------------------
  
  // Update current selection names when language changes (if selected)
  useEffect(() => {
      if (currentSubchapter && currentChapter) {
          const newChap = bookStructure.chapters.find(c => c.id === currentChapter.id);
          const newSub = newChap?.subchapters.find(s => s.id === currentSubchapter.id);
          if (newChap && newSub) {
              setCurrentChapter(newChap);
              setCurrentSubchapter(newSub);
          }
      }
  }, [language]);

  const handleSelectSubchapter = (chapter: Chapter, subchapter: Subchapter) => {
    setCurrentChapter(chapter);
    setCurrentSubchapter(subchapter);
    setIsMobileMenuOpen(false);
  };

  const getCacheKey = (subId: string) => `${subId}_${language}`;

  const activeBaseId = currentSubchapter?.id || 'free-roam';
  const activeCacheKey = getCacheKey(activeBaseId);

  const updateMarketingData = (data: Partial<MarketingData>) => {
    setMarketingCache(prev => {
        const current = prev[activeCacheKey] || {};
        return { ...prev, [activeCacheKey]: { ...current, ...data } as MarketingData };
    });
  };

  const updatePodcastData = (data: Partial<PodcastData>) => {
    setPodcastCache(prev => {
        const current = prev[activeCacheKey] || {};
        return { ...prev, [activeCacheKey]: { ...current, ...data } as PodcastData };
    });
  };

  const updateWriterData = (data: Partial<WriterData>) => {
    setWriterCache(prev => {
        const current = (prev[activeCacheKey] || {}) as WriterData;
        return { 
            ...prev, 
            [activeCacheKey]: { 
                ...current, 
                ...data,
                book: data.book ? { ...(current.book || {}), ...data.book } : current.book,
                lecture: data.lecture ? { ...(current.lecture || {}), ...data.lecture } : current.lecture
            } as WriterData 
        };
    });
  };

  const defaultMarketingData: MarketingData = {
      strategy: null, customTopic: "", imagePrompt: "", generatedImage: null
  };

  const defaultPodcastData: PodcastData = {
      segments: [], audioBlocks: [], durationMinutes: 5, customTopic: "", isDeep: false
  };

  const defaultWriterData: WriterData = {
      book: null, lecture: null, 
      statusBook: GenerationStatus.IDLE, 
      statusLecture: GenerationStatus.IDLE,
      statusAudioBook: GenerationStatus.IDLE,
      statusAudioLecture: GenerationStatus.IDLE
  };

  const activeMarketingData = { ...defaultMarketingData, ...(marketingCache[activeCacheKey] || {}) };
  const activePodcastData = { ...defaultPodcastData, ...(podcastCache[activeCacheKey] || {}) };
  const activeWriterData = { ...defaultWriterData, ...(writerCache[activeCacheKey] || {}) };

  // Ensure arrays exist
  if (!activePodcastData.segments) activePodcastData.segments = [];
  if (!activePodcastData.audioBlocks) activePodcastData.audioBlocks = [];

  return (
    <div className="flex h-screen w-full bg-[#050505] overflow-hidden selection:bg-indigo-500/30 relative">
      
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-30 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <Sidebar 
        book={bookStructure} 
        currentSubchapter={currentSubchapter}
        onSelectSubchapter={handleSelectSubchapter}
        currentLanguage={language}
        onSetLanguage={setLanguage}
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
      />
      
      <ContentArea 
        chapter={currentChapter}
        subchapter={currentSubchapter}
        language={language}
        
        marketingData={activeMarketingData}
        podcastData={activePodcastData}
        writerData={activeWriterData}
        chatHistory={chatHistory}
        
        onUpdateMarketing={updateMarketingData}
        onUpdatePodcast={updatePodcastData}
        onUpdateWriter={updateWriterData}
        onUpdateChat={setChatHistory}

        onToggleSidebar={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      />
    </div>
  );
}

export default App;
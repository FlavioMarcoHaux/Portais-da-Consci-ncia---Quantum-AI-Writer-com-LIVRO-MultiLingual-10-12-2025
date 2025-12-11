import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ContentArea } from './components/ContentArea';
import { BOOK_STRUCTURE } from './bookStructure';
import { Chapter, Subchapter, MarketingData, PodcastData, WriterData, ChatMessage, Language, GenerationStatus } from './types';

function App() {
  const [currentChapter, setCurrentChapter] = useState<Chapter | null>(null);
  const [currentSubchapter, setCurrentSubchapter] = useState<Subchapter | null>(null);
  const [language, setLanguage] = useState<Language>('pt');
  
  // Mobile Sidebar State
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
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

  // 3. Writer Cache (New)
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
  // PERSISTENCE EFFECTS
  // ------------------------------------------------------------------
  useEffect(() => {
    localStorage.setItem('quantum_marketing_cache', JSON.stringify(marketingCache));
  }, [marketingCache]);

  useEffect(() => {
    localStorage.setItem('quantum_podcast_cache', JSON.stringify(podcastCache));
  }, [podcastCache]);

  useEffect(() => {
    localStorage.setItem('quantum_writer_cache', JSON.stringify(writerCache));
  }, [writerCache]);

  useEffect(() => {
    localStorage.setItem('quantum_chat_history', JSON.stringify(chatHistory));
  }, [chatHistory]);

  // ------------------------------------------------------------------
  // HANDLERS
  // ------------------------------------------------------------------
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
        // Merge profundo para book e lecture
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
      segments: [], durationMinutes: 5, customTopic: "", isDeep: false
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

  // Ensure Arrays
  if (!activePodcastData.segments) activePodcastData.segments = [];

  return (
    <div className="flex h-screen w-full bg-[#050505] overflow-hidden selection:bg-indigo-500/30 relative">
      
      {/* Mobile Overlay Backdrop */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/80 z-30 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <Sidebar 
        book={BOOK_STRUCTURE} 
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
        
        // Data
        marketingData={activeMarketingData}
        podcastData={activePodcastData}
        writerData={activeWriterData}
        chatHistory={chatHistory}
        
        // Updaters
        onUpdateMarketing={updateMarketingData}
        onUpdatePodcast={updatePodcastData}
        onUpdateWriter={updateWriterData}
        onUpdateChat={setChatHistory}

        // UX Controls
        onToggleSidebar={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      />
    </div>
  );
}

export default App;
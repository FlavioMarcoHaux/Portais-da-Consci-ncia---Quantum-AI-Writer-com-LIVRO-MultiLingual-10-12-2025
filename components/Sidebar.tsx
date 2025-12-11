
import React from 'react';
import { BookStructure, Chapter, Subchapter, Language } from '../types';
import { Book, ChevronRight, Circle, X } from 'lucide-react';

interface SidebarProps {
  book: BookStructure;
  currentSubchapter: Subchapter | null;
  onSelectSubchapter: (chapter: Chapter, subchapter: Subchapter) => void;
  currentLanguage: Language;
  onSetLanguage: (lang: Language) => void;
  isOpen: boolean; // New prop for mobile state
  onClose: () => void; // New prop for closing on mobile
}

export const Sidebar: React.FC<SidebarProps> = ({ 
    book, 
    currentSubchapter, 
    onSelectSubchapter,
    currentLanguage,
    onSetLanguage,
    isOpen,
    onClose
}) => {
  return (
    <div className={`
        fixed inset-y-0 left-0 z-40 w-80 bg-[#020202] border-r border-neutral-700 h-screen overflow-y-auto 
        transform transition-transform duration-300 ease-in-out shadow-[5px_0_30px_rgba(0,0,0,0.5)]
        ${isOpen ? 'translate-x-0' : '-translate-x-full'} 
        md:translate-x-0 md:static md:flex-shrink-0
    `}>
      <div className="p-6 sticky top-0 bg-[#020202]/95 backdrop-blur z-10 border-b border-neutral-700">
        
        {/* Mobile Header with Close Button */}
        <div className="flex justify-between items-start mb-4 md:hidden">
            <span className="text-neutral-400 text-xs font-bold uppercase tracking-widest">Menu Principal</span>
            <button onClick={onClose} className="text-neutral-400 hover:text-white p-1 rounded-md border border-neutral-700 hover:bg-neutral-800">
                <X size={20} />
            </button>
        </div>

        {/* Language Selector */}
        <div className="flex justify-between items-center mb-6 bg-neutral-900 border border-neutral-600 rounded-lg p-1 shadow-inner">
            <button 
                onClick={() => onSetLanguage('pt')}
                className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${currentLanguage === 'pt' ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-300 hover:text-white hover:bg-neutral-800'}`}
            >
                🇧🇷 PT
            </button>
            <button 
                onClick={() => onSetLanguage('en')}
                className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${currentLanguage === 'en' ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-300 hover:text-white hover:bg-neutral-800'}`}
            >
                🇺🇸 EN
            </button>
            <button 
                onClick={() => onSetLanguage('es')}
                className={`flex-1 py-1.5 rounded text-xs font-bold transition-all ${currentLanguage === 'es' ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-300 hover:text-white hover:bg-neutral-800'}`}
            >
                🇪🇸 ES
            </button>
        </div>

        <div className="flex items-center space-x-2 text-indigo-400 mb-2">
          <Book size={20} />
          <span className="font-bold tracking-wider text-xs uppercase text-indigo-300">Estrutura do Livro</span>
        </div>
        <h1 className="font-serif-title text-xl text-white leading-tight shadow-black drop-shadow-md">{book.title}</h1>
      </div>
      
      <div className="p-4 space-y-6 pb-20">
        {book.chapters.map((chapter) => (
          <div key={chapter.id} className="space-y-2">
            <h3 className="text-neutral-200 font-bold px-2 uppercase text-[10px] tracking-widest flex items-center border-l-2 border-neutral-600 pl-3 py-1">
              {chapter.title}
            </h3>
            <ul className="space-y-1">
              {chapter.subchapters.map((sub) => (
                <li key={sub.id}>
                  <button
                    onClick={() => onSelectSubchapter(chapter, sub)}
                    className={`w-full text-left px-3 py-2.5 rounded-md transition-all duration-200 flex items-start group border ${
                      currentSubchapter?.id === sub.id
                        ? 'bg-indigo-900/40 text-white shadow-[0_0_15px_rgba(99,102,241,0.2)] border-indigo-500/50'
                        : 'text-neutral-300 hover:bg-neutral-800 hover:text-white border-transparent hover:border-neutral-700'
                    }`}
                  >
                    <div className="mt-1 mr-2 flex-shrink-0">
                      {currentSubchapter?.id === sub.id ? (
                        <ChevronRight size={12} className="text-indigo-300" />
                      ) : (
                        <Circle size={6} className="text-neutral-500 group-hover:text-neutral-300" />
                      )}
                    </div>
                    <span className={`line-clamp-2 ${currentSubchapter?.id === sub.id ? 'font-medium' : 'font-normal'}`}>{sub.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

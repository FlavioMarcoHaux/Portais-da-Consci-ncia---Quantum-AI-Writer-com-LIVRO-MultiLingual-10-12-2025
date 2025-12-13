
import React, { useState } from 'react';
import { Chapter, Subchapter, WriterData, Language, GenerationStatus } from '../types';
import { BookOpen } from 'lucide-react';
import { WriterBook } from './WriterBook';
import { WriterLecture } from './WriterLecture';
import { useTranslation } from '../hooks/useTranslation';

interface TabWriterProps {
    chapter: Chapter | null;
    subchapter: Subchapter | null;
    language: Language;
    data: WriterData;
    onUpdate: (data: Partial<WriterData>) => void;
}

export const TabWriter: React.FC<TabWriterProps> = ({ 
    chapter, subchapter, language, data, onUpdate 
}) => {
    const [viewMode, setViewMode] = useState<'book' | 'lecture'>('book');
    const t = useTranslation(language);

    if (!subchapter) {
        return (
            <div className="flex-1 flex items-center justify-center text-neutral-500 flex-col animate-fade-in h-full">
                <BookOpen size={48} className="mb-4 opacity-30" />
                <p>{language === 'pt' ? 'Selecione um subcapítulo no menu para iniciar a escrita.' : 'Select a subchapter from the menu to start writing.'}</p>
            </div>
        );
    }

    return (
        <div className="flex-1 h-full overflow-y-auto bg-[#050505] scrollbar-thin scrollbar-thumb-neutral-800 w-full relative flex flex-col">
            {/* TOGGLE HEADER */}
            {data.book?.fullText && (
                <div className="bg-[#050505] border-b border-neutral-800 p-2 flex justify-center sticky top-0 z-30">
                    <div className="bg-neutral-900 rounded-lg p-1 flex space-x-1 shadow-md border border-neutral-700">
                        <button 
                            onClick={() => setViewMode('book')}
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'book' ? 'bg-indigo-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                        >
                            {t.common.modeBook}
                        </button>
                        <button 
                            onClick={() => setViewMode('lecture')}
                            className={`px-4 py-2 rounded-md text-xs font-bold uppercase tracking-wider transition-all ${viewMode === 'lecture' ? 'bg-emerald-600 text-white shadow-lg' : 'text-neutral-400 hover:text-white hover:bg-neutral-800'}`}
                        >
                            {t.common.modeLecture}
                        </button>
                    </div>
                </div>
            )}

            {/* CONTENT */}
            <div className="flex-1">
                {viewMode === 'book' ? (
                    <WriterBook 
                        chapter={chapter}
                        subchapter={subchapter}
                        language={language}
                        data={data}
                        onUpdate={onUpdate}
                        onStartLectureCreation={() => setViewMode('lecture')}
                    />
                ) : (
                    <WriterLecture 
                        subchapter={subchapter}
                        language={language}
                        data={data}
                        onUpdate={onUpdate}
                    />
                )}
            </div>
        </div>
    );
};

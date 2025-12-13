
import React, { useState } from 'react';
import { Chapter, Subchapter, GenerationStatus, WriterData, Language } from '../types';
import { BookOpen, Mic, Download, FileText, Play, Pause, Sparkles, GraduationCap } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';
import { generateBookContent } from '../services/writerService';
import { generateSpeech, splitTextSmartly, delay, cleanMarkdownForSpeech } from '../services/geminiService';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { createWavBlob } from '../utils/downloadHelper';
import { QuantumLoader } from './QuantumLoader';
import { useTranslation } from '../hooks/useTranslation';

interface WriterBookProps {
    chapter: Chapter | null;
    subchapter: Subchapter | null;
    language: Language;
    data: WriterData;
    onUpdate: (data: Partial<WriterData>) => void;
    onStartLectureCreation: () => void;
}

export const WriterBook: React.FC<WriterBookProps> = ({ 
    chapter, subchapter, language, data, onUpdate, onStartLectureCreation 
}) => {
    const { playBase64, isPlaying, stop, base64ToUint8Array } = useAudioPlayer();
    const [progressMsg, setProgressMsg] = useState("");
    const t = useTranslation(language);

    // --- LOGIC: BOOK AUDIOBOOK ---
    const handleCreateAudiobook = async () => {
        if (!data.book?.fullText) return;
        onUpdate({ statusAudioBook: GenerationStatus.GENERATING });
        setProgressMsg(t.writer.statusAudio);

        try {
            const cleanText = cleanMarkdownForSpeech(data.book.fullText);
            const chunks = splitTextSmartly(cleanText, 2000); 
            const audioBlobs: Blob[] = [];
            
            for (let i = 0; i < chunks.length; i++) {
                const pct = Math.round(((i) / chunks.length) * 100);
                setProgressMsg(`${t.writer.statusAudio} ${pct}%`);
                
                if (i > 0) await delay(1000); 

                try {
                    const base64 = await generateSpeech(chunks[i], 'Enceladus');
                    if (base64) {
                        const bytes = base64ToUint8Array(base64);
                        audioBlobs.push(new Blob([bytes]));
                    }
                } catch (e) {
                    console.error("Chunk failed", e);
                }
            }
            
            const wavBlob = createWavBlob(audioBlobs);
            if (wavBlob) {
                const url = window.URL.createObjectURL(wavBlob);
                onUpdate({ 
                    statusAudioBook: GenerationStatus.COMPLETE,
                    book: { ...data.book, audiobookUrl: url }
                });
            } else {
                onUpdate({ statusAudioBook: GenerationStatus.ERROR });
            }
        } catch (e) {
            console.error(e);
            onUpdate({ statusAudioBook: GenerationStatus.ERROR });
        }
    };

    // --- LOGIC: PDF ---
    const handleDownloadPDF = () => {
        const content = data.book?.fullText;
        if (!content || !subchapter) return;

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const bottomMargin = 35;
        const maxLineWidth = pageWidth - (margin * 2);
        
        let y = margin + 10;

        // --- Cover / Header ---
        doc.setFont("times", "bold");
        doc.setFontSize(24); 
        doc.setTextColor(0, 0, 0);
        
        const splitTitle = doc.splitTextToSize(subchapter.title, maxLineWidth);
        doc.text(splitTitle, margin, y);
        y += (splitTitle.length * 10) + 5;

        doc.setFont("times", "normal");
        doc.setFontSize(12);
        doc.setTextColor(80);
        doc.text(`${t.writer.manuscriptHeader} - Portais da Consciência`, margin, y);
        y += 10;
        
        doc.setDrawColor(200);
        doc.setLineWidth(0.5);
        doc.line(margin, y, pageWidth - margin, y);
        y += 15;

        // --- Content ---
        const lines = content.split('\n');
        
        lines.forEach((line) => {
            if (y > pageHeight - bottomMargin) {
                doc.addPage();
                y = margin + 10; 
            }

            let text = line.trim();
            if (!text) { 
                y += 6; 
                return; 
            }

            let fontSize = 12; 
            let fontStyle = "normal";
            let color = [0, 0, 0];
            let lineHeightFactor = 6; 
            
            if (text.startsWith('## ')) {
                fontSize = 16; 
                fontStyle = "bold"; 
                text = text.replace(/^##\s+/, ''); 
                y += 8; 
                lineHeightFactor = 8;
            } else if (text.startsWith('### ')) {
                fontSize = 14; 
                fontStyle = "bold"; 
                text = text.replace(/^###\s+/, ''); 
                y += 6;
                lineHeightFactor = 7;
            } else if (text.startsWith('- ')) {
                text = '•  ' + text.replace(/^-\s+/, '');
            } else if (text.startsWith('> ')) {
                text = text.replace(/^>\s+/, '');
                fontStyle = 'italic';
                color = [60, 60, 60];
            }

            text = text.replace(/\*\*/g, '').replace(/__/g, '');
            
            doc.setFont("times", fontStyle);
            doc.setFontSize(fontSize);
            doc.setTextColor(color[0], color[1], color[2]);

            const wrappedText = doc.splitTextToSize(text, maxLineWidth);
            doc.text(wrappedText, margin, y);
            
            y += (wrappedText.length * lineHeightFactor) + 2; 
        });

        const pageCount = doc.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFont("times", "normal");
            doc.setFontSize(9);
            doc.setTextColor(150);
            
            doc.setDrawColor(220);
            doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
            
            doc.text(`${t.writer.page} ${i} / ${pageCount}`, pageWidth - margin - 20, pageHeight - 10);
            doc.text("Portais da Consciência - Quantum AI Writer", margin, pageHeight - 10);
        }

        doc.save(`Book_${subchapter.id}_${language}.pdf`);
    };

    // --- LOGIC: WRITE BOOK ---
    const handleWriteBook = async () => {
        if (!subchapter) return;
        onUpdate({ 
            statusBook: GenerationStatus.GENERATING, 
            book: { fullText: "", sections: [], generatedAt: Date.now(), audiobookUrl: null },
            lecture: null,
            statusLecture: GenerationStatus.IDLE
        });
        setProgressMsg(t.writer.statusGenerating);

        try {
            await generateBookContent(
                chapter?.title || "", subchapter.title, subchapter.description || "", subchapter.id, language,
                (newChunk, fullTextSoFar) => {
                    onUpdate({ book: { fullText: fullTextSoFar, sections: [], generatedAt: Date.now(), audiobookUrl: null }});
                    setProgressMsg(t.writer.statusGenerating);
                }
            );
            onUpdate({ statusBook: GenerationStatus.COMPLETE });
        } catch (e) {
            console.error(e);
            onUpdate({ statusBook: GenerationStatus.ERROR });
        }
    };

    const isBusy = data.statusBook === GenerationStatus.GENERATING || data.statusAudioBook === GenerationStatus.GENERATING;
    const showPlaceholder = !data.book?.fullText && data.statusBook === GenerationStatus.IDLE;

    if (showPlaceholder) {
        return (
            <div className="w-full min-h-[50vh] flex items-center justify-center">
                {isBusy && <div className="fixed bottom-8 z-50 bg-neutral-900 p-4 rounded-xl border border-indigo-500/50 flex gap-4"><QuantumLoader/><span className="text-indigo-200 text-sm">{progressMsg}</span></div>}
                
                <div className="max-w-4xl mx-auto p-8 text-center border-2 border-dashed border-neutral-800 rounded-xl bg-neutral-900/20">
                    <BookOpen size={48} className="mx-auto text-indigo-500 mb-4 opacity-50" />
                    <h3 className="text-xl font-serif-title text-white mb-2">{t.writer.placeholderTitle}</h3>
                    <p className="text-neutral-400 mb-6 max-w-md mx-auto">
                        {t.writer.placeholderText}
                    </p>
                    <button 
                        onClick={handleWriteBook}
                        disabled={isBusy}
                        className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-full font-bold shadow-[0_0_20px_rgba(79,70,229,0.4)] transition-all flex items-center gap-2 mx-auto"
                    >
                        <Sparkles size={18} />
                        {t.writer.btnGenerate}
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="animate-fade-in w-full pb-20">
            {isBusy && <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 p-4 rounded-xl border border-indigo-500/50 flex gap-4 items-center shadow-2xl"><QuantumLoader/><span className="text-indigo-200 text-sm font-mono">{progressMsg}</span></div>}

            {/* HEADER ACTIONS */}
            <div className="sticky top-0 z-20 bg-[#050505]/95 backdrop-blur border-b border-neutral-800 p-4 flex justify-between items-center w-full">
                <div className="text-indigo-400 text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                    <BookOpen size={14} /> {t.common.modeBook}
                </div>
                <div className="flex gap-2 items-center">
                    <button onClick={handleDownloadPDF} className="p-2 text-neutral-400 hover:text-white border border-neutral-700 rounded-lg hover:bg-neutral-800 flex items-center gap-1" title={t.writer.btnPdf}>
                        <FileText size={18} />
                    </button>
                    
                    {data.book?.audiobookUrl && (
                        <a 
                            href={data.book.audiobookUrl} 
                            download={`audiobook_${subchapter?.id || 'chapter'}.wav`}
                            className="p-2 text-emerald-400 hover:text-emerald-300 border border-emerald-800/50 bg-emerald-950/30 rounded-lg hover:bg-emerald-900/50 transition-colors flex items-center gap-1 font-bold text-xs"
                            title={t.writer.btnWav}
                        >
                            <Download size={18} /> <span>WAV</span>
                        </a>
                    )}

                    <button 
                        onClick={handleCreateAudiobook} 
                        disabled={isBusy || !!data.book?.audiobookUrl}
                        className={`p-2 border rounded-lg transition-all ${data.book?.audiobookUrl ? 'text-green-400 border-green-900 bg-green-900/10 cursor-default opacity-50' : 'text-neutral-400 hover:text-indigo-400 border-neutral-700 hover:bg-neutral-800'}`}
                        title={t.writer.btnAudiobook}
                    >
                        <Mic size={18} />
                    </button>
                </div>
            </div>

            {/* AUDIO PLAYER */}
            {data.book?.audiobookUrl && (
                <div className="max-w-4xl mx-auto mt-6 px-4">
                    <div className="bg-indigo-950/30 border border-indigo-500/30 p-4 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button 
                                onClick={() => isPlaying ? stop() : playBase64(data.book!.audiobookUrl!.split(',')[1] || "")} 
                                className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white hover:bg-indigo-400 shadow-lg"
                            >
                                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                            </button>
                            <div>
                                <p className="text-xs font-bold text-indigo-300 uppercase">{t.writer.audioPlayer}</p>
                                <p className="text-white text-xs">{t.writer.chapterFull}</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* BOOK CONTENT */}
            <div className="max-w-[900px] mx-auto bg-[#0a0a0a] min-h-screen border-x border-neutral-800/50 shadow-2xl my-8 p-8 md:p-16">
                <div className="text-center mb-12 border-b border-neutral-800 pb-8">
                    <p className="text-xs text-indigo-400 uppercase tracking-[0.3em] mb-4">Portais da Consciência</p>
                    <h2 className="text-3xl font-serif-title text-white leading-tight mb-4">{subchapter?.title}</h2>
                </div>
                <div className="prose prose-invert prose-lg max-w-none font-serif text-neutral-300 leading-loose text-justify">
                    <ReactMarkdown components={{
                        h1: ({node, ...props}) => <h1 className="text-center font-serif-title text-2xl mt-12 mb-6 text-white" {...props} />,
                        h2: ({node, ...props}) => <h2 className="font-serif-title text-xl mt-10 mb-4 text-indigo-100 border-l-2 border-indigo-500 pl-4" {...props} />,
                        p: ({node, ...props}) => <p className="mb-6 indent-8" {...props} />,
                        blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-indigo-900/50 pl-6 italic text-neutral-400 my-8 py-2 bg-neutral-900/30 rounded-r" {...props} />,
                    }}>
                        {data.book?.fullText || ""}
                    </ReactMarkdown>
                </div>
                
                {/* NEXT STEP: LECTURE */}
                {data.statusBook === GenerationStatus.COMPLETE && (
                    <div className="mt-20 pt-10 border-t border-neutral-800 text-center">
                        <button 
                            onClick={onStartLectureCreation}
                            className="bg-emerald-700 hover:bg-emerald-600 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg flex items-center gap-3 mx-auto"
                        >
                            <GraduationCap size={20} />
                            {t.writer.btnLecture}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

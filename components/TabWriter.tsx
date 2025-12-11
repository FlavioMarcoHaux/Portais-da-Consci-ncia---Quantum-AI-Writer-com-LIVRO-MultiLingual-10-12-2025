
import React, { useState } from 'react';
import { Chapter, Subchapter, GenerationStatus, WriterData, Language } from '../types';
import { QuantumLoader } from './QuantumLoader';
import { BookOpen, Mic, Download, GraduationCap, Play, Pause, FileText, Sparkles, AlertCircle, Quote, List, BrainCircuit } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { generateBookContent, generateLectureScript } from '../services/writerService';
import { generateSpeech, splitTextSmartly, delay } from '../services/geminiService';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import jsPDF from 'jspdf';

interface TabWriterProps {
    chapter: Chapter | null;
    subchapter: Subchapter | null;
    language: Language;
    data: WriterData;
    onUpdate: (data: Partial<WriterData>) => void;
}

export const TabWriter: React.FC<TabWriterProps> = ({ 
    chapter, 
    subchapter, 
    language,
    data,
    onUpdate 
}) => {
    const { playBase64, isPlaying, stop, base64ToUint8Array } = useAudioPlayer();
    const [progressMsg, setProgressMsg] = useState("");

    // --- HELPER: WAV BUILDER (Client-Side Audio Engineering) ---
    const buildWavFromText = async (text: string, voiceName: string, onProgress: (pct: number) => void): Promise<string | null> => {
        const chunks = splitTextSmartly(text, 3000); // 3k chars limit for safe TTS
        const audioBlobs: Blob[] = [];
        
        for (let i = 0; i < chunks.length; i++) {
            onProgress(Math.round(((i) / chunks.length) * 100));
            
            // THROTTLING: Avoid API 429 errors
            if (i > 0) await delay(1000); 

            try {
                const base64 = await generateSpeech(chunks[i], voiceName);
                if (base64) {
                    const bytes = base64ToUint8Array(base64);
                    audioBlobs.push(new Blob([bytes]));
                }
            } catch (e) {
                console.error("Chunk failed", e);
            }
        }
        onProgress(100);

        if (audioBlobs.length === 0) return null;

        // WAV Header Construction
        const totalLength = audioBlobs.reduce((acc, blob) => acc + blob.size, 0);
        const wavHeader = new ArrayBuffer(44);
        const view = new DataView(wavHeader);
        const writeString = (view: DataView, offset: number, string: string) => {
            for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i));
        };

        writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + totalLength, true);
        writeString(view, 8, 'WAVE');
        writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, 1, true);
        view.setUint32(24, 24000, true);
        view.setUint32(28, 24000 * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeString(view, 36, 'data');
        view.setUint32(40, totalLength, true);

        const combinedBlob = new Blob([wavHeader, ...audioBlobs], { type: 'audio/wav' });
        return window.URL.createObjectURL(combinedBlob);
    };

    // --- HANDLERS ---

    const handleWriteBook = async () => {
        if (!subchapter) return;
        
        // Reset state completely before starting
        onUpdate({ 
            statusBook: GenerationStatus.GENERATING, 
            book: { fullText: "", sections: [], generatedAt: Date.now(), audiobookUrl: null },
            // Clear lecture if regenerating book to ensure consistency
            lecture: null,
            statusLecture: GenerationStatus.IDLE
        });
        setProgressMsg("Iniciando processo de escrita quântica (4 Partes)...");

        try {
            await generateBookContent(
                chapter?.title || "",
                subchapter.title,
                subchapter.description || "",
                subchapter.id,
                language,
                (newChunk, fullTextSoFar) => {
                    // Use functional update or just pass the full text from service which is authoritative
                    onUpdate({
                        book: {
                            fullText: fullTextSoFar,
                            sections: [], // We can skip section tracking for UI to save complexity, or track if needed
                            generatedAt: Date.now(),
                            audiobookUrl: null
                        }
                    });
                    setProgressMsg("Escrevendo... O texto está sendo materializado.");
                }
            );
            onUpdate({ statusBook: GenerationStatus.COMPLETE });
        } catch (e) {
            console.error(e);
            onUpdate({ statusBook: GenerationStatus.ERROR });
        }
    };

    const handleCreateAudiobook = async () => {
        if (!data.book?.fullText) return;
        onUpdate({ statusAudioBook: GenerationStatus.GENERATING });
        setProgressMsg("Engenharia de Áudio: Narrando capítulo (Isso pode levar 1-2 minutos)...");

        try {
            // Voice: Enceladus (Milton)
            const url = await buildWavFromText(data.book.fullText, 'Enceladus', (pct) => {
                setProgressMsg(`Renderizando Voz Quântica: ${pct}%`);
            });
            
            if (url) {
                onUpdate({ 
                    statusAudioBook: GenerationStatus.COMPLETE,
                    book: { ...data.book, audiobookUrl: url }
                });
            } else {
                onUpdate({ statusAudioBook: GenerationStatus.ERROR });
            }
        } catch (e) {
            onUpdate({ statusAudioBook: GenerationStatus.ERROR });
        }
    };

    const handleCreateLecture = async () => {
        if (!data.book?.fullText) return;
        onUpdate({ 
            statusLecture: GenerationStatus.GENERATING,
            lecture: { script: "", audioUrl: null, generatedAt: Date.now() }
        });
        setProgressMsg("Roberta Erickson está analisando o livro para criar a aula...");

        try {
            await generateLectureScript(
                data.book.fullText,
                language,
                (newChunk, fullScriptSoFar) => {
                     onUpdate({
                        lecture: {
                            script: fullScriptSoFar,
                            audioUrl: null,
                            generatedAt: Date.now()
                        }
                    });
                }
            );
            onUpdate({ statusLecture: GenerationStatus.COMPLETE });
        } catch (e) {
             onUpdate({ statusLecture: GenerationStatus.ERROR });
        }
    };

    const handleCreateAudioLecture = async () => {
        if (!data.lecture?.script) return;
        onUpdate({ statusAudioLecture: GenerationStatus.GENERATING });
        setProgressMsg("Engenharia de Áudio: Gravando Aula Magna...");

        try {
            // Voice: Aoede (Roberta)
            const url = await buildWavFromText(data.lecture.script, 'Aoede', (pct) => {
                setProgressMsg(`Renderizando Voz da Professora: ${pct}%`);
            });
            
            if (url) {
                onUpdate({ 
                    statusAudioLecture: GenerationStatus.COMPLETE,
                    lecture: { ...data.lecture, audioUrl: url }
                });
            } else {
                onUpdate({ statusAudioLecture: GenerationStatus.ERROR });
            }
        } catch (e) {
            onUpdate({ statusAudioLecture: GenerationStatus.ERROR });
        }
    };

    const handleDownloadPDF = (type: 'book' | 'lecture') => {
        const content = type === 'book' ? data.book?.fullText : data.lecture?.script;
        const title = type === 'book' ? subchapter?.title : `Aula Magna: ${subchapter?.title}`;
        
        if (!content) return;

        const doc = new jsPDF();
        
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const maxLineWidth = pageWidth - (margin * 2);
        
        let y = margin;

        // --- TITLE ---
        doc.setFont("times", "bold");
        doc.setFontSize(type === 'book' ? 22 : 18);
        doc.setTextColor(type === 'lecture' ? 10 : 0, type === 'lecture' ? 80 : 0, type === 'lecture' ? 60 : 0); // Emerald tone for Lecture
        
        const splitTitle = doc.splitTextToSize(title || "Documento", maxLineWidth);
        doc.text(splitTitle, margin, y);
        y += (splitTitle.length * 8) + 5;

        // --- SUBTITLE ---
        doc.setFont("times", "normal");
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(type === 'book' ? "Manuscrito Original - Portais da Consciência" : "Guia de Estudos & Práticas - Prof. Roberta Erickson", margin, y);
        y += 10;

        // --- SEPARATOR ---
        doc.setDrawColor(200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 10;

        // --- CONTENT PARSING ---
        // Simple Markdown Parser for PDF
        const lines = content.split('\n');
        
        lines.forEach((line) => {
            // Check Page Overflow
            if (y > pageHeight - margin) {
                doc.addPage();
                y = margin;
            }

            let text = line.trim();
            if (!text) {
                y += 5; // Paragraph spacing
                return;
            }

            // Styles
            let fontSize = 11;
            let fontStyle = "normal"; // normal, bold, italic, bolditalic
            let color = [0, 0, 0];
            let indent = 0;
            let spacingAfter = 5;

            // Headers
            if (text.startsWith('## ')) {
                fontSize = 14;
                fontStyle = "bold";
                color = type === 'lecture' ? [0, 100, 80] : [40, 40, 40];
                text = text.replace(/^##\s+/, '');
                y += 5; // Extra space before header
            } 
            else if (text.startsWith('### ')) {
                fontSize = 12;
                fontStyle = "bold";
                color = [60, 60, 60];
                text = text.replace(/^###\s+/, '');
                y += 3;
            }
            // Lists
            else if (text.startsWith('- ') || text.startsWith('* ')) {
                text = '• ' + text.replace(/^[-*]\s+/, '');
                indent = 5;
                spacingAfter = 4;
            }
            // Blockquotes
            else if (text.startsWith('> ')) {
                text = text.replace(/^>\s+/, '');
                fontStyle = "italic";
                color = [80, 80, 80];
                indent = 10;
            }

            // Clean inline markdown
            text = text.replace(/\*\*/g, ''); // Remove bold markers
            text = text.replace(/__/g, ''); // Remove italic markers

            // Render
            doc.setFont("times", fontStyle);
            doc.setFontSize(fontSize);
            doc.setTextColor(color[0], color[1], color[2]);

            const wrappedText = doc.splitTextToSize(text, maxLineWidth - indent);
            doc.text(wrappedText, margin + indent, y);
            
            y += (wrappedText.length * (fontSize * 0.5)) + (spacingAfter / 2);
        });

        // --- FOOTER ---
        const pageCount = doc.getNumberOfPages();
        for(let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFont("times", "normal");
            doc.setFontSize(8);
            doc.setTextColor(150);
            
            const footerText = `Página ${i} de ${pageCount}`;
            doc.text(footerText, pageWidth - margin - 20, pageHeight - 10);

            if (type === 'lecture') {
                 doc.text("Guia de Estudos - Fé em 10 Minutos de Oração - youtube.com/@fe10minutos", margin, pageHeight - 10);
            } else {
                 doc.text("Portais da Consciência - Fé em 10 Minutos de Oração - youtube.com/@fe10minutos", margin, pageHeight - 10);
            }
        }

        doc.save(`${type === 'book' ? 'Livro' : 'Aula'}_${subchapter?.id || 'doc'}.pdf`);
    };

    // --- RENDER ---

    if (!subchapter) {
        return (
            <div className="flex-1 flex items-center justify-center text-neutral-500 flex-col animate-fade-in">
                <BookOpen size={48} className="mb-4 opacity-30" />
                <p>Selecione um subcapítulo no menu para iniciar a escrita.</p>
            </div>
        );
    }

    const isBusy = 
        data.statusBook === GenerationStatus.GENERATING || 
        data.statusLecture === GenerationStatus.GENERATING ||
        data.statusAudioBook === GenerationStatus.GENERATING ||
        data.statusAudioLecture === GenerationStatus.GENERATING;

    const showPlaceholder = !data.book?.fullText && data.statusBook === GenerationStatus.IDLE;
    const isWritingButEmpty = data.statusBook === GenerationStatus.GENERATING && !data.book?.fullText;

    return (
        <div className="flex-1 h-full overflow-y-auto bg-[#050505] scrollbar-thin scrollbar-thumb-neutral-800 w-full relative">
            {/* WRITER HEADER */}
            <div className="sticky top-0 z-20 bg-[#050505]/95 backdrop-blur border-b border-neutral-800 p-6 flex justify-between items-center w-full shadow-md">
                <div>
                    <div className="flex items-center space-x-2 text-indigo-400 text-xs font-bold uppercase tracking-widest mb-1">
                        <BookOpen size={14} />
                        <span>Módulo Escritor Quântico ({language})</span>
                    </div>
                    <h1 className="text-xl font-serif-title text-white">{subchapter.title}</h1>
                </div>

                <div className="flex gap-3">
                    {data.book?.fullText && (
                        <>
                            <button onClick={() => handleDownloadPDF('book')} className="p-2 text-neutral-400 hover:text-white border border-neutral-700 rounded-lg hover:bg-neutral-800 transition-all" title="Baixar PDF do Livro">
                                <FileText size={20} />
                            </button>
                            <button 
                                onClick={handleCreateAudiobook} 
                                disabled={isBusy || !!data.book.audiobookUrl}
                                className={`p-2 border rounded-lg transition-all ${data.book.audiobookUrl ? 'text-green-400 border-green-900 bg-green-900/20 cursor-default' : 'text-neutral-400 hover:text-indigo-400 border-neutral-700 hover:bg-neutral-800'}`}
                                title="Gerar Audiobook"
                            >
                                <Mic size={20} />
                            </button>
                        </>
                    )}
                </div>
            </div>

            <div className="p-0 w-full"> {/* Removed padding from main container to allow full width background manipulation if needed, but centering content */}
                
                {/* 1. SECTION: BOOK GENERATION AREA */}
                <div className="w-full min-h-[50vh]">
                    {showPlaceholder ? (
                        <div className="max-w-4xl mx-auto p-8 mt-12">
                            <div className="text-center py-20 border-2 border-dashed border-neutral-800 rounded-xl bg-neutral-900/20">
                                <BookOpen size={48} className="mx-auto text-indigo-500 mb-4 opacity-50" />
                                <h3 className="text-xl font-serif-title text-white mb-2">O Manuscrito Está em Branco</h3>
                                <p className="text-neutral-400 mb-6 max-w-md mx-auto">
                                    Inicie o protocolo de escrita para gerar um capítulo profundo (~2600 palavras) com a voz de Milton Dilts.
                                </p>
                                <button 
                                    onClick={handleWriteBook}
                                    disabled={isBusy}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-3 rounded-full font-bold shadow-[0_0_20px_rgba(79,70,229,0.4)] hover:shadow-[0_0_30px_rgba(79,70,229,0.6)] transition-all flex items-center gap-2 mx-auto"
                                >
                                    <Sparkles size={18} />
                                    Materializar Capítulo (20 min)
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="animate-fade-in w-full">
                            
                            {/* AUDIO PLAYER CONTAINER (Floating or Top) */}
                            {data.book?.audiobookUrl && (
                                <div className="max-w-4xl mx-auto mt-8 px-8">
                                    <div className="bg-indigo-950/30 border border-indigo-500/30 p-4 rounded-xl flex items-center justify-between mb-8">
                                        <div className="flex items-center gap-4">
                                            <button 
                                                onClick={() => {
                                                    if(isPlaying) stop();
                                                    else playBase64(data.book!.audiobookUrl!.split(',')[1] || "");
                                                }} 
                                                className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-white hover:bg-indigo-400 shadow-lg"
                                            >
                                                {isPlaying ? <Pause size={18} /> : <Play size={18} />}
                                            </button>
                                            <div>
                                                <p className="text-xs font-bold text-indigo-300 uppercase tracking-wider">Audiobook</p>
                                                <p className="text-white text-sm">Narrado por Milton Dilts</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                             <a href={data.book.audiobookUrl} download={`audiobook_${subchapter.id}.wav`} className="p-2 text-neutral-400 hover:text-white border border-neutral-700 rounded hover:bg-neutral-800 transition-colors">
                                                <Download size={20}/>
                                             </a>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* --- THE BOOK PAGE UI --- */}
                            <div className="max-w-[900px] mx-auto bg-[#0a0a0a] min-h-screen border-x border-neutral-800/50 shadow-[0_0_50px_rgba(0,0,0,0.5)] my-0 pb-32">
                                <div className="px-8 md:px-16 py-12 md:py-20">
                                    
                                    {/* Chapter Title Visual */}
                                    {data.book?.fullText && (
                                        <div className="text-center mb-16 border-b border-neutral-800 pb-8">
                                            <p className="text-xs text-indigo-400 uppercase tracking-[0.3em] mb-4">Portais da Consciência</p>
                                            <h2 className="text-3xl md:text-4xl font-serif-title text-white leading-tight mb-4">{subchapter.title}</h2>
                                            {chapter?.title && <p className="text-neutral-500 font-serif italic text-lg">{chapter.title}</p>}
                                        </div>
                                    )}

                                    {/* SKELETON LOADER (Inside Page) */}
                                    {isWritingButEmpty && (
                                        <div className="space-y-6 animate-pulse opacity-40">
                                            <div className="h-4 bg-neutral-700 rounded w-full"></div>
                                            <div className="h-4 bg-neutral-700 rounded w-full"></div>
                                            <div className="h-4 bg-neutral-700 rounded w-5/6"></div>
                                            <div className="h-8 bg-transparent"></div>
                                            <div className="h-4 bg-neutral-700 rounded w-full"></div>
                                            <div className="h-4 bg-neutral-700 rounded w-full"></div>
                                            <div className="h-4 bg-neutral-700 rounded w-4/5"></div>
                                            <div className="flex items-center justify-center pt-20">
                                                <p className="text-indigo-400 font-mono text-xs tracking-widest">MATERIALIZANDO PENSAMENTO...</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* THE CONTENT */}
                                    <div className="prose prose-invert prose-lg max-w-none font-serif text-neutral-300 leading-loose text-justify">
                                        <ReactMarkdown
                                            components={{
                                                h1: ({node, ...props}) => <h1 className="text-center font-serif-title text-2xl mt-12 mb-6 text-white" {...props} />,
                                                h2: ({node, ...props}) => <h2 className="font-serif-title text-xl mt-10 mb-4 text-indigo-100 border-l-2 border-indigo-500 pl-4" {...props} />,
                                                h3: ({node, ...props}) => <h3 className="font-sans font-bold text-lg mt-8 mb-3 text-neutral-200" {...props} />,
                                                p: ({node, ...props}) => <p className="mb-6 indent-8" {...props} />, // Indent first line for book feel
                                                strong: ({node, ...props}) => <strong className="text-white font-bold" {...props} />,
                                                ul: ({node, ...props}) => <ul className="list-disc pl-6 mb-6 space-y-2 text-neutral-400" {...props} />,
                                                blockquote: ({node, ...props}) => <blockquote className="border-l-4 border-indigo-900/50 pl-6 italic text-neutral-400 my-8 py-2 bg-neutral-900/30 rounded-r" {...props} />,
                                                // Adicionando suporte básico a tabelas também no Livro (Dark Mode)
                                                table: ({node, ...props}) => <div className="overflow-x-auto my-8"><table className="w-full text-left border-collapse border border-neutral-700" {...props} /></div>,
                                                th: ({node, ...props}) => <th className="p-4 border-b border-neutral-700 bg-neutral-900 text-indigo-300 font-serif" {...props} />,
                                                td: ({node, ...props}) => <td className="p-4 border-b border-neutral-800 text-neutral-400" {...props} />,
                                            }}
                                        >
                                            {data.book?.fullText || ""}
                                        </ReactMarkdown>
                                    </div>

                                    {/* FOOTER OF PAGE */}
                                    {data.book?.fullText && data.statusBook === GenerationStatus.COMPLETE && (
                                        <div className="mt-20 pt-8 border-t border-neutral-800 text-center">
                                            <p className="text-neutral-600 text-sm font-serif italic">***</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* LOADING STATE - Fixed Overlay */}
                {isBusy && (
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 border border-indigo-500/50 p-4 rounded-xl shadow-2xl flex items-center gap-4 animate-in slide-in-from-bottom-10">
                        <QuantumLoader />
                        <span className="text-indigo-200 font-mono text-sm">{progressMsg}</span>
                    </div>
                )}

                {/* 2. SECTION: MENTOR / LECTURE (Separated Section) */}
                {(data.statusBook === GenerationStatus.COMPLETE || data.book?.fullText) && (
                    <div className="max-w-5xl mx-auto px-4 md:px-8 pb-32">
                        <div className="mt-20 pt-10 border-t border-neutral-800 animate-fade-in">
                            <div className="flex items-center gap-2 mb-8 text-emerald-400 uppercase tracking-widest font-bold text-xs">
                                <GraduationCap size={16} />
                                <span>Mentor Quântico</span>
                            </div>
                            
                            {!data.lecture?.script ? (
                                 <div className="bg-[#0a0a0a] border border-neutral-800 p-8 md:p-12 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-8 shadow-xl">
                                    <div className="flex-1">
                                        <h3 className="text-2xl font-display font-bold text-white mb-4">Sala de Aula: Profundidade & Prática</h3>
                                        <p className="text-neutral-400 text-base leading-relaxed mb-6">
                                            Transforme este capítulo em uma <strong>Aula Magna Prática</strong>. A Professora Roberta Erickson irá extrair os conceitos teóricos, criar exercícios de fixação e propor um desafio semanal para sua evolução.
                                        </p>
                                        <div className="flex gap-4 text-xs text-emerald-600 font-mono uppercase tracking-wide">
                                            <span className="flex items-center gap-1"><BrainCircuit size={14}/> Didática Ericksoniana</span>
                                            <span className="flex items-center gap-1"><List size={14}/> Exercícios Práticos</span>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={handleCreateLecture}
                                        disabled={isBusy}
                                        className="bg-emerald-700 hover:bg-emerald-600 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg whitespace-nowrap text-lg flex items-center gap-3"
                                    >
                                        <Sparkles size={20} />
                                        Gerar Aula Magna
                                    </button>
                                 </div>
                            ) : (
                                <div className="space-y-8 animate-fade-in">
                                    {/* LECTURE HEADER & CONTROLS */}
                                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#0e0e0e] p-6 rounded-xl border border-neutral-800">
                                        <div>
                                            <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
                                                <GraduationCap className="text-emerald-500" size={24} />
                                                Guia de Estudos & Práticas
                                            </h3>
                                            <p className="text-neutral-500 text-sm mt-1">Material de Apoio desenvolvido por Roberta Erickson</p>
                                        </div>
                                        
                                        <div className="flex gap-3">
                                            <button onClick={() => handleDownloadPDF('lecture')} className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg transition-all text-sm font-medium">
                                                <FileText size={16} />
                                                <span>PDF</span>
                                            </button>
                                            
                                            <button 
                                                onClick={handleCreateAudioLecture}
                                                disabled={isBusy || !!data.lecture.audioUrl}
                                                className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-medium ${data.lecture.audioUrl ? 'text-emerald-400 border-emerald-900 bg-emerald-900/20 cursor-default' : 'bg-neutral-900 text-neutral-300 hover:text-white border-neutral-700 hover:border-emerald-500 hover:text-emerald-400'}`}
                                            >
                                                <Mic size={16} />
                                                <span>{data.lecture.audioUrl ? 'Áudio Gerado' : 'Gerar Áudio'}</span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* AUDIO PLAYER (If exists) */}
                                    {data.lecture.audioUrl && (
                                         <div className="bg-emerald-950/20 border border-emerald-500/20 p-6 rounded-xl flex items-center justify-between shadow-lg">
                                            <div className="flex items-center gap-6">
                                                <button 
                                                    onClick={() => {
                                                        if(isPlaying) stop();
                                                        else playBase64(data.lecture!.audioUrl!.split(',')[1] || "");
                                                    }} 
                                                    className="w-14 h-14 rounded-full bg-emerald-600 flex items-center justify-center text-white hover:bg-emerald-500 shadow-xl transition-transform hover:scale-105"
                                                >
                                                    {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
                                                </button>
                                                <div>
                                                    <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">Podcast da Aula</p>
                                                    <h4 className="text-white font-bold text-lg">Explicação da Professora</h4>
                                                </div>
                                            </div>
                                            <a href={data.lecture.audioUrl} download={`aula_${subchapter.id}.wav`} className="p-3 text-neutral-400 hover:text-white border border-neutral-700 rounded-full hover:bg-neutral-800 transition-colors">
                                                <Download size={20}/>
                                            </a>
                                        </div>
                                    )}

                                    {/* LECTURE CONTENT - PAPER STYLE */}
                                    <div className="bg-[#f0f0f0] text-neutral-900 p-8 md:p-12 rounded-xl shadow-2xl relative overflow-hidden">
                                        {/* Decorative Header */}
                                        <div className="absolute top-0 left-0 w-full h-2 bg-emerald-600"></div>
                                        
                                        <div className="prose prose-lg max-w-none font-sans leading-relaxed">
                                            <ReactMarkdown
                                                components={{
                                                    h1: ({node, ...props}) => <h1 className="text-3xl font-bold text-emerald-900 border-b-2 border-emerald-200 pb-4 mb-6" {...props} />,
                                                    h2: ({node, ...props}) => <h2 className="text-xl font-bold text-emerald-800 mt-8 mb-4 flex items-center gap-2" {...props} />,
                                                    h3: ({node, ...props}) => <h3 className="text-lg font-bold text-neutral-800 mt-6 mb-2" {...props} />,
                                                    p: ({node, ...props}) => <p className="mb-4 text-neutral-700" {...props} />,
                                                    ul: ({node, ...props}) => <ul className="bg-white p-6 rounded-lg shadow-sm border border-neutral-200 list-none space-y-3 my-6" {...props} />,
                                                    li: ({node, ...props}) => <li className="flex items-start gap-2 before:content-['•'] before:text-emerald-500 before:font-bold before:mr-2" {...props} />,
                                                    blockquote: ({node, ...props}) => (
                                                        <div className="flex gap-4 p-6 bg-emerald-50 rounded-r-lg border-l-4 border-emerald-500 my-8">
                                                            <Quote className="text-emerald-300 flex-shrink-0" size={24} />
                                                            <blockquote className="text-emerald-900 italic font-medium" {...props} />
                                                        </div>
                                                    ),
                                                    strong: ({node, ...props}) => <strong className="text-emerald-900 font-bold" {...props} />,
                                                    // TABLE SUPPORT - AULA MAGNA
                                                    table: ({node, ...props}) => (
                                                        <div className="overflow-x-auto my-8 rounded-lg shadow-sm border border-neutral-300 bg-white">
                                                            <table className="w-full text-left border-collapse" {...props} />
                                                        </div>
                                                    ),
                                                    thead: ({node, ...props}) => <thead className="bg-emerald-100 border-b border-emerald-200" {...props} />,
                                                    tbody: ({node, ...props}) => <tbody className="divide-y divide-neutral-200" {...props} />,
                                                    tr: ({node, ...props}) => <tr className="hover:bg-neutral-50 transition-colors" {...props} />,
                                                    th: ({node, ...props}) => <th className="px-6 py-4 font-bold text-emerald-900 text-sm uppercase tracking-wider" {...props} />,
                                                    td: ({node, ...props}) => <td className="px-6 py-4 text-neutral-700 whitespace-pre-line leading-relaxed" {...props} />,
                                                }}
                                            >
                                                {data.lecture.script}
                                            </ReactMarkdown>
                                        </div>

                                        {/* Footer branding */}
                                        <div className="mt-12 pt-8 border-t border-neutral-300 flex flex-col md:flex-row justify-between items-center text-neutral-500 text-sm font-mono gap-2">
                                            <span className="text-center md:text-left">Guia de Estudos & Práticas do Canal - Fé em 10 Minutos de Oração - youtube.com/@fe10minutos</span>
                                            <span>Prof. Roberta Erickson</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

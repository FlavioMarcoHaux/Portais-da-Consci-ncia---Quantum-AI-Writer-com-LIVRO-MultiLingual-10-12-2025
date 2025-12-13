
import React, { useState } from 'react';
import { Subchapter, GenerationStatus, WriterData, Language } from '../types';
import { GraduationCap, Mic, Download, Play, Pause, FileText, Quote, List, BrainCircuit } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import jsPDF from 'jspdf';
import { generateLectureScript } from '../services/writerService';
import { generateSpeech, splitTextSmartly, delay, cleanMarkdownForSpeech } from '../services/geminiService';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { createWavBlob } from '../utils/downloadHelper';
import { QuantumLoader } from './QuantumLoader';
import { useTranslation } from '../hooks/useTranslation';

interface WriterLectureProps {
    subchapter: Subchapter | null;
    language: Language;
    data: WriterData;
    onUpdate: (data: Partial<WriterData>) => void;
}

export const WriterLecture: React.FC<WriterLectureProps> = ({ 
    subchapter, language, data, onUpdate 
}) => {
    const { playBase64, isPlaying, stop, base64ToUint8Array } = useAudioPlayer();
    const [progressMsg, setProgressMsg] = useState("");
    const t = useTranslation(language);

    // --- LOGIC: LECTURE AUDIO ---
    const handleCreateAudioLecture = async () => {
        if (!data.lecture?.script) return;
        onUpdate({ statusAudioLecture: GenerationStatus.GENERATING });
        setProgressMsg("Engenharia de Áudio: Gravando Aula Magna...");

        try {
            const cleanText = cleanMarkdownForSpeech(data.lecture.script);
            const chunks = splitTextSmartly(cleanText, 2000); 
            const audioBlobs: Blob[] = [];
            
            for (let i = 0; i < chunks.length; i++) {
                const pct = Math.round(((i) / chunks.length) * 100);
                setProgressMsg(`${t.writer.statusAudio} ${pct}%`);
                
                if (i > 0) await delay(1000); 

                try {
                    const base64 = await generateSpeech(chunks[i], 'Aoede');
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
                    statusAudioLecture: GenerationStatus.COMPLETE,
                    lecture: { ...data.lecture, audioUrl: url }
                });
            } else {
                onUpdate({ statusAudioLecture: GenerationStatus.ERROR });
            }
        } catch (e) {
            console.error(e);
            onUpdate({ statusAudioLecture: GenerationStatus.ERROR });
        }
    };

    // --- LOGIC: GENERATE LECTURE ---
    const handleCreateLecture = async () => {
        if (!data.book?.fullText) return;
        onUpdate({ 
            statusLecture: GenerationStatus.GENERATING,
            lecture: { script: "", audioUrl: null, generatedAt: Date.now() }
        });
        setProgressMsg("Roberta Erickson está analisando o livro para criar a aula...");

        try {
            await generateLectureScript(
                data.book.fullText, language,
                (newChunk, fullScriptSoFar) => {
                     onUpdate({ lecture: { script: fullScriptSoFar, audioUrl: null, generatedAt: Date.now() } });
                }
            );
            onUpdate({ statusLecture: GenerationStatus.COMPLETE });
        } catch (e) {
             onUpdate({ statusLecture: GenerationStatus.ERROR });
        }
    };

    // --- LOGIC: PDF ---
    const handleDownloadPDF = () => {
        const content = data.lecture?.script;
        if (!content || !subchapter) return;

        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const margin = 20;
        const bottomMargin = 35; 
        const maxLineWidth = pageWidth - (margin * 2);
        let y = margin + 10;

        doc.setFont("times", "bold");
        doc.setFontSize(22); 
        doc.setTextColor(10, 80, 60);
        doc.text(`${t.lecture.header}: ${subchapter.title}`, margin, y);
        y += 15;

        doc.setFont("times", "normal");
        doc.setFontSize(12);
        doc.setTextColor(100);
        doc.text("Prof. Roberta Erickson", margin, y);
        y += 10;
        doc.setDrawColor(200);
        doc.line(margin, y, pageWidth - margin, y);
        y += 15;

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
                color = [0, 100, 80]; 
                text = text.replace(/^##\s+/, ''); 
                y += 8;
                lineHeightFactor = 8;
            } else if (text.startsWith('### ')) {
                fontSize = 14; 
                fontStyle = "bold"; 
                text = text.replace(/^###\s+/, ''); 
                y += 6;
                lineHeightFactor = 7;
            } else if (text.startsWith('- ') || text.startsWith('* ')) {
                text = '•  ' + text.replace(/^[-*]\s+/, '');
            } else if (text.startsWith('> ')) {
                text = text.replace(/^>\s+/, ''); 
                fontStyle = "italic"; 
                color = [80, 80, 80];
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
            doc.setFontSize(9);
            doc.setTextColor(150);
            doc.setDrawColor(220);
            doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15);
            doc.text(`${t.writer.page} ${i} / ${pageCount}`, pageWidth - margin - 20, pageHeight - 10);
            doc.text(t.lecture.footer, margin, pageHeight - 10);
        }

        doc.save(`Lecture_${subchapter.id}_${language}.pdf`);
    };

    const isBusy = data.statusLecture === GenerationStatus.GENERATING || data.statusAudioLecture === GenerationStatus.GENERATING;

    if (!data.lecture?.script && data.statusLecture === GenerationStatus.IDLE) {
        return (
            <div className="max-w-5xl mx-auto px-4 py-12 animate-fade-in">
                <div className="bg-[#0a0a0a] border border-neutral-800 p-12 rounded-2xl flex flex-col items-center text-center gap-6 shadow-xl">
                    <GraduationCap size={48} className="text-emerald-500 mb-2"/>
                    <h3 className="text-2xl font-display font-bold text-white">{t.lecture.placeholderTitle}</h3>
                    <p className="text-neutral-400 text-base leading-relaxed max-w-lg">
                        {t.lecture.placeholderText}
                    </p>
                    <button 
                        onClick={handleCreateLecture}
                        disabled={isBusy}
                        className="bg-emerald-700 hover:bg-emerald-600 text-white px-8 py-4 rounded-xl font-bold transition-all shadow-lg flex items-center gap-3"
                    >
                        <BrainCircuit size={20} />
                        {t.lecture.btnGenerate}
                    </button>
                </div>
                {isBusy && <div className="mt-4 flex justify-center"><QuantumLoader/></div>}
            </div>
        );
    }

    return (
        <div className="w-full pb-20 animate-fade-in relative">
            {isBusy && <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 bg-neutral-900 p-4 rounded-xl border border-emerald-500/50 flex gap-4 items-center shadow-2xl"><QuantumLoader/><span className="text-emerald-200 text-sm font-mono">{progressMsg}</span></div>}

            {/* HEADER */}
            <div className="sticky top-0 z-20 bg-[#0e0e0e]/95 backdrop-blur border-b border-neutral-800 p-4 flex flex-col md:flex-row justify-between items-center gap-4 shadow-md">
                <div>
                    <h3 className="text-xl font-display font-bold text-white flex items-center gap-2">
                        <GraduationCap className="text-emerald-500" size={24} />
                        {t.lecture.header}
                    </h3>
                </div>
                
                <div className="flex gap-3">
                    <button onClick={handleDownloadPDF} className="flex items-center gap-2 px-4 py-2 bg-neutral-900 text-neutral-300 hover:text-white border border-neutral-700 hover:border-neutral-500 rounded-lg transition-all text-sm font-medium">
                        <FileText size={16} /> PDF
                    </button>
                    
                    {data.lecture?.audioUrl && (
                        <a 
                            href={data.lecture.audioUrl} 
                            download={`aula_${subchapter?.id || 'gen'}.wav`}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-950/30 text-emerald-400 hover:text-emerald-300 border border-emerald-800/50 hover:border-emerald-500 hover:bg-emerald-900/50 rounded-lg transition-all text-sm font-medium"
                            title={t.writer.btnWav}
                        >
                            <Download size={16} /> <span>WAV</span>
                        </a>
                    )}

                    <button 
                        onClick={handleCreateAudioLecture}
                        disabled={isBusy || !!data.lecture?.audioUrl}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all text-sm font-medium ${data.lecture?.audioUrl ? 'text-emerald-400 border-emerald-900 bg-emerald-900/20 cursor-default opacity-50' : 'bg-neutral-900 text-neutral-300 hover:text-white border-neutral-700 hover:border-emerald-500 hover:text-emerald-400'}`}
                    >
                        <Mic size={16} />
                        {data.lecture?.audioUrl ? 'Áudio Gerado' : t.lecture.btnAudio}
                    </button>
                </div>
            </div>

            {/* AUDIO PLAYER */}
            {data.lecture?.audioUrl && (
                 <div className="max-w-4xl mx-auto mt-6 px-4">
                    <div className="bg-emerald-950/20 border border-emerald-500/20 p-6 rounded-xl flex items-center justify-between shadow-lg">
                        <div className="flex items-center gap-6">
                            <button 
                                onClick={() => isPlaying ? stop() : playBase64(data.lecture!.audioUrl!.split(',')[1] || "")} 
                                className="w-14 h-14 rounded-full bg-emerald-600 flex items-center justify-center text-white hover:bg-emerald-500 shadow-xl transition-transform hover:scale-105"
                            >
                                {isPlaying ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
                            </button>
                            <div>
                                <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider mb-1">{t.lecture.audioLabel}</p>
                                <h4 className="text-white font-bold text-lg">{t.lecture.audioSub}</h4>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* CONTENT */}
            <div className="max-w-5xl mx-auto px-4 mt-8">
                <div className="bg-[#f0f0f0] text-neutral-900 p-8 md:p-12 rounded-xl shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-2 bg-emerald-600"></div>
                    
                    <div className="prose prose-lg max-w-none font-sans leading-relaxed">
                        <ReactMarkdown components={{
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
                            // Table Support
                            table: ({node, ...props}) => <div className="overflow-x-auto my-8 rounded-lg shadow-sm border border-neutral-300 bg-white"><table className="w-full text-left border-collapse" {...props} /></div>,
                            thead: ({node, ...props}) => <thead className="bg-emerald-100 border-b border-emerald-200" {...props} />,
                            tbody: ({node, ...props}) => <tbody className="divide-y divide-neutral-200" {...props} />,
                            tr: ({node, ...props}) => <tr className="hover:bg-neutral-50 transition-colors" {...props} />,
                            th: ({node, ...props}) => <th className="px-6 py-4 font-bold text-emerald-900 text-sm uppercase tracking-wider" {...props} />,
                            td: ({node, ...props}) => <td className="px-6 py-4 text-neutral-700 whitespace-pre-line leading-relaxed" {...props} />,
                        }}>
                            {data.lecture?.script}
                        </ReactMarkdown>
                    </div>

                    <div className="mt-12 pt-8 border-t border-neutral-300 flex flex-col md:flex-row justify-between items-center text-neutral-500 text-sm font-mono gap-2">
                        <span className="text-center md:text-left">{t.lecture.footer} - Fé em 10 Minutos de Oração</span>
                        <span>Prof. Roberta Erickson</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

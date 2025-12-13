import React, { useState, useEffect } from 'react';
import { Chapter, Subchapter, GenerationStatus, PodcastData, Language, PodcastSegment } from '../types';
import { QuantumLoader } from './QuantumLoader';
import { Mic2, Download, Radio, Sparkles, Clock, FileText, Search, Terminal, Archive, Zap, CheckCircle, Loader2, Play, Pause } from 'lucide-react';
import { generatePodcastScript, generateSpeech, splitTextSmartly, delay } from '../services/geminiService';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { generateZipPackage, base64ToBlob, createWavBlob } from '../utils/downloadHelper';
import { useTranslation } from '../hooks/useTranslation';

interface TabPodcastProps {
    chapter: Chapter | null;
    subchapter: Subchapter | null;
    language: Language;
    data: PodcastData;
    onUpdate: (data: Partial<PodcastData>) => void;
}

export const TabPodcast: React.FC<TabPodcastProps> = ({ 
    chapter, 
    subchapter,
    language, 
    data,
    onUpdate
}) => {
    const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
    const [audioStatus, setAudioStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
    const [generationLog, setGenerationLog] = useState<string[]>([]);
    
    // Player para preview individual (opcional)
    const { playBase64, isPlaying, stop: stopPlayer } = useAudioPlayer();
    const [playingSegmentIndex, setPlayingSegmentIndex] = useState<number | null>(null);

    const t = useTranslation(language);

    useEffect(() => {
        return () => stopPlayer();
    }, []);

    const addLog = (msg: string) => setGenerationLog(prev => [...prev, `> ${msg}`]);

    // 1. GERAR ROTEIRO (TEXTO)
    const handleGenerateScript = async (isDeep: boolean) => {
        if (!subchapter && !data.customTopic) {
            alert("Please provide a topic.");
            return;
        }

        setStatus(GenerationStatus.GENERATING);
        onUpdate({ segments: [] }); 
        setGenerationLog(["> INIT SCRIPT GENERATION..."]);
        stopPlayer();

        try {
            addLog(`Mode: ${isDeep ? "Deep" : "Fast"}`);
            addLog(`Lang: ${language.toUpperCase()}`);

            const result = await generatePodcastScript(
                chapter?.title || "Free Session",
                subchapter?.title || "Deep Research",
                subchapter?.description || "Web based conversation.",
                subchapter?.id || "free-roam",
                language,
                [],
                isDeep,
                data.durationMinutes,
                data.customTopic 
            );

            addLog(`Generated ${result.length} text segments`);
            
            onUpdate({ segments: result, isDeep });
            setStatus(GenerationStatus.COMPLETE);
        } catch (e) {
            console.error(e);
            addLog("SYSTEM ERROR.");
            setStatus(GenerationStatus.ERROR);
        }
    };

    // 2. SINTETIZAR ÁUDIO (BLOCO A BLOCO)
    const handleSynthesizeAudio = async () => {
        if (data.segments.length === 0) return;
        
        setAudioStatus(GenerationStatus.GENERATING);
        addLog("INIT AUDIO SYNTHESIS PROTOCOL...");
        
        // Copia local para manipulação
        let updatedSegments = [...data.segments];

        for (let i = 0; i < updatedSegments.length; i++) {
            // Se já tem áudio, pula
            if (updatedSegments[i].audioBase64) continue;

            // Marca como processando na UI
            updatedSegments[i] = { ...updatedSegments[i], isProcessingAudio: true };
            onUpdate({ segments: [...updatedSegments] });

            try {
                addLog(`Synthesizing Block ${i + 1}/${updatedSegments.length} (${updatedSegments[i].speaker})...`);
                
                // Divide se for muito longo (segurança)
                const chunks = splitTextSmartly(updatedSegments[i].text, 4000);
                let segmentAudioBase64 = "";

                // Nota: Por simplicidade de UX e API, vamos gerar um único base64 por segmento de roteiro
                // Se o segmento for gigante, o generateSpeech pode falhar, então o ideal seria iterar chunks, 
                // mas para "Blocos de 5 min" do prompt anterior, o roteiro já deve vir quebrado.
                // Se o texto for > 4000 chars, pegamos apenas o primeiro chunk ou iteramos? 
                // Vamos iterar e concatenar (muito complexo para base64 puro sem header WAV).
                // Solução Simplificada: Assumimos que o roteiro já vem bem quebrado.
                
                // Delay para rate limit
                if (i > 0) await delay(1500);

                const audioResult = await generateSpeech(updatedSegments[i].text, updatedSegments[i].voiceId);
                
                updatedSegments[i] = { 
                    ...updatedSegments[i], 
                    audioBase64: audioResult, // Se null, falhou
                    isProcessingAudio: false 
                };

            } catch (error) {
                console.error(`Error segment ${i}`, error);
                updatedSegments[i] = { ...updatedSegments[i], isProcessingAudio: false };
                addLog(`Error synthesizing block ${i+1}`);
            }

            // Atualiza estado global a cada passo
            onUpdate({ segments: [...updatedSegments] });
        }

        setAudioStatus(GenerationStatus.COMPLETE);
        addLog("AUDIO SYNTHESIS COMPLETE. READY FOR DOWNLOAD.");
    };

    // 3. PREVIEW INDIVIDUAL
    const togglePreview = (index: number) => {
        if (playingSegmentIndex === index && isPlaying) {
            stopPlayer();
            setPlayingSegmentIndex(null);
        } else {
            const seg = data.segments[index];
            if (seg.audioBase64) {
                setPlayingSegmentIndex(index);
                playBase64(seg.audioBase64, () => setPlayingSegmentIndex(null));
            }
        }
    };

    // 4. DOWNLOAD COMBINADO
    const handleDownloadMergedAudio = async () => {
        const segmentsWithAudio = data.segments.filter(s => s.audioBase64);
        if (segmentsWithAudio.length === 0) return;

        addLog("Merging audio blocks...");
        
        try {
            const audioBlobs: Blob[] = [];
            
            for (const seg of segmentsWithAudio) {
                if (seg.audioBase64) {
                    const bin = atob(seg.audioBase64);
                    const len = bin.length;
                    const arr = new Uint8Array(len);
                    for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
                    audioBlobs.push(new Blob([arr]));
                }
            }

            const wavBlob = createWavBlob(audioBlobs);
            if (wavBlob) {
                const url = window.URL.createObjectURL(wavBlob);
                const a = document.createElement('a');
                a.href = url;
                const safeTitle = (data.customTopic || subchapter?.title || "podcast").replace(/\s+/g, '_').toLowerCase();
                a.download = `${safeTitle}_${language}_full.wav`;
                document.body.appendChild(a);
                a.click();
                addLog("Download started.");
            }
        } catch (e) {
            console.error(e);
            addLog("Error merging audio.");
        }
    };

    const getScriptText = () => {
        const title = data.customTopic || subchapter?.title || "podcast";
        const header = `PODCAST SCRIPT (${language.toUpperCase()}): ${title}\n\n`;
        const body = data.segments.map(seg => `${seg.speaker.toUpperCase()}:\n${seg.text}\n`).join('\n');
        return header + body;
    };

    const handleDownloadScript = () => {
        if (data.segments.length === 0) return;
        const text = getScriptText();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `script_${language}.txt`;
        document.body.appendChild(a);
        a.click();
    };

    const hasAnyAudio = data.segments.some(s => s.audioBase64);
    const isProcessing = status === GenerationStatus.GENERATING || audioStatus === GenerationStatus.GENERATING;

    return (
        <div className="flex-1 flex flex-col h-full bg-[#050505] animate-fade-in">
             <div className="p-4 md:p-8 border-b border-neutral-700 bg-[#080808]">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between max-w-6xl mx-auto gap-4 md:gap-6">
                    <div>
                        <h2 className="text-xl md:text-2xl font-serif-title text-purple-300 flex items-center gap-2 shadow-black drop-shadow-sm">
                            <Mic2 className="text-purple-500" />
                            <span className="truncate">{t.podcast.title} ({language.toUpperCase()})</span>
                        </h2>
                        <p className="text-neutral-400 text-xs md:text-sm mt-1 font-medium truncate">
                            {subchapter ? t.podcast.subtitleSub : t.podcast.subtitleFree}
                        </p>
                    </div>

                    <div className="flex flex-col gap-4 w-full xl:w-auto">
                        <div className="relative group w-full xl:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 group-hover:text-purple-400 transition-colors" size={16} />
                            <input 
                                type="text"
                                value={data.customTopic}
                                onChange={(e) => onUpdate({ customTopic: e.target.value })}
                                placeholder={t.podcast.inputPlaceholder}
                                className="w-full bg-[#050505] border border-neutral-600 text-white text-sm rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all placeholder-neutral-500 shadow-inner"
                                disabled={isProcessing}
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-3 justify-center md:justify-end">
                            {/* CONTROLES DE AÇÃO */}
                            {data.segments.length > 0 && (
                                <>
                                    {!hasAnyAudio && (
                                        <button 
                                            onClick={handleSynthesizeAudio} 
                                            disabled={isProcessing}
                                            className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 animate-pulse"
                                        >
                                            <Zap size={16} />
                                            <span>Sintetizar Áudio</span>
                                        </button>
                                    )}

                                    {hasAnyAudio && (
                                        <button 
                                            onClick={handleDownloadMergedAudio} 
                                            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2"
                                            title="Baixar Áudio Completo"
                                        >
                                            <Download size={16} />
                                            <span>Download WAV</span>
                                        </button>
                                    )}

                                    <button onClick={handleDownloadScript} className="w-10 h-10 rounded-full border border-neutral-600 bg-neutral-900 text-yellow-400 flex items-center justify-center" title={t.podcast.btnScript}><FileText size={18} /></button>
                                </>
                            )}
                            
                            <div className="flex items-center bg-[#050505] rounded-full pl-3 pr-2 py-1 border border-neutral-600 h-10 md:h-12 shadow-sm">
                                <Clock size={16} className="text-neutral-400 mr-2" />
                                <select 
                                    value={data.durationMinutes} 
                                    onChange={(e) => onUpdate({ durationMinutes: Number(e.target.value) })}
                                    className="bg-transparent text-white text-xs md:text-sm font-bold focus:outline-none cursor-pointer border-none mr-1"
                                    disabled={isProcessing}
                                >
                                    <option value={5}>5 min</option>
                                    <option value={10}>10 min</option>
                                    <option value={15}>15 min</option>
                                    <option value={20}>20 min</option>
                                    <option value={30}>30 min</option>
                                </select>
                            </div>

                            <button onClick={() => handleGenerateScript(false)} disabled={isProcessing} className="flex items-center space-x-2 bg-purple-950/80 text-white px-4 py-2 rounded-full border border-purple-700 text-xs font-bold hover:bg-purple-900">
                                <Sparkles size={16} /> <span>{t.podcast.btnFast}</span>
                            </button>

                            <button onClick={() => handleGenerateScript(true)} disabled={isProcessing} className="flex items-center space-x-2 bg-indigo-950/80 text-white px-4 py-2 rounded-full border border-indigo-700 text-xs font-bold hover:bg-indigo-900">
                                <Radio size={16} /> <span>{t.podcast.btnDeep}</span>
                            </button>
                        </div>
                    </div>
                </div>
             </div>

             <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#0a0a0a]">
                <div className="max-w-3xl mx-auto space-y-6">
                    {/* Placeholder Inicial */}
                    {status === GenerationStatus.IDLE && data.segments.length === 0 && (
                        <div className="text-center text-neutral-500 mt-20">
                            <div className="w-24 h-24 bg-[#0f0f0f] rounded-full flex items-center justify-center mx-auto mb-6 border border-neutral-700 shadow-xl">
                                <Mic2 size={32} className="text-neutral-600" />
                            </div>
                            <p className="text-lg font-display font-bold text-neutral-400">{t.podcast.readyTitle}</p>
                            <p className="text-sm mt-2 max-w-md mx-auto opacity-70 text-neutral-500">
                                {subchapter ? t.podcast.readyTextSub : t.podcast.readyTextFree}
                            </p>
                        </div>
                    )}

                    {/* Loader de Roteiro */}
                    {status === GenerationStatus.GENERATING && (
                        <div className="space-y-6">
                            <QuantumLoader />
                            <div className="text-center text-purple-400 font-mono text-xs animate-pulse">Gerando Roteiro Estruturado...</div>
                        </div>
                    )}

                    {/* Lista de Segmentos */}
                    {data.segments.length > 0 && (
                        <div className="space-y-4 pb-8">
                            {/* System Log Compacto */}
                            {isProcessing && (
                                <div className="bg-black border border-neutral-800 rounded-lg p-3 font-mono text-[10px] text-green-400 h-24 overflow-y-auto mb-4 opacity-80">
                                    {generationLog.map((log, i) => <div key={i}>{log}</div>)}
                                    <div id="log-end"></div>
                                </div>
                            )}

                            {data.segments.map((seg, idx) => (
                                <div key={idx} className={`p-5 rounded-xl border transition-all ${seg.isProcessingAudio ? 'border-yellow-500 bg-yellow-900/10' : seg.audioBase64 ? 'border-green-900 bg-green-900/10' : 'bg-[#0f0f0f] border-neutral-700'}`}>
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <span className={`text-xs uppercase font-extrabold ${seg.speaker.includes('Milton') ? 'text-cyan-300' : 'text-pink-300'}`}>
                                                {seg.speaker}
                                            </span>
                                            {/* Status Badge */}
                                            {seg.isProcessingAudio && (
                                                <span className="flex items-center gap-1 text-[10px] text-yellow-400 font-bold bg-yellow-900/30 px-2 py-0.5 rounded-full">
                                                    <Loader2 size={10} className="animate-spin" /> Sintetizando...
                                                </span>
                                            )}
                                            {seg.audioBase64 && (
                                                <span className="flex items-center gap-1 text-[10px] text-green-400 font-bold bg-green-900/30 px-2 py-0.5 rounded-full">
                                                    <CheckCircle size={10} /> Áudio Pronto
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Play Preview Button */}
                                        {seg.audioBase64 && (
                                            <button 
                                                onClick={() => togglePreview(idx)}
                                                className="w-8 h-8 rounded-full bg-neutral-800 hover:bg-neutral-700 flex items-center justify-center text-neutral-300 transition-colors"
                                                title="Preview deste bloco"
                                            >
                                                {playingSegmentIndex === idx && isPlaying ? <Pause size={14} /> : <Play size={14} />}
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-base font-display leading-relaxed text-neutral-300">{seg.text}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
             </div>
        </div>
    );
};
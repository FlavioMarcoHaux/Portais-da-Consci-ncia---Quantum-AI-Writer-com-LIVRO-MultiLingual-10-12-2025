import React, { useState, useEffect } from 'react';
import { Chapter, Subchapter, GenerationStatus, PodcastData, Language, PodcastAudioBlock } from '../types';
import { QuantumLoader } from './QuantumLoader';
import { Mic2, Download, Radio, Sparkles, Clock, FileText, Search, Zap, CheckCircle, Loader2 } from 'lucide-react';
import { generatePodcastScript, generateMultiSpeakerSpeech, delay } from '../services/geminiService';
import { createWavBlob } from '../utils/downloadHelper';
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
    
    const t = useTranslation(language);

    const addLog = (msg: string) => setGenerationLog(prev => [...prev, `> ${msg}`]);

    // 1. GERAR ROTEIRO (TEXTO)
    const handleGenerateScript = async (isDeep: boolean) => {
        if (!subchapter && !data.customTopic) {
            alert("Please provide a topic.");
            return;
        }

        setStatus(GenerationStatus.GENERATING);
        onUpdate({ segments: [], audioBlocks: [] }); 
        setGenerationLog(["> INIT SCRIPT GENERATION..."]);

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
            
            onUpdate({ segments: result, isDeep, audioBlocks: [] });
            setStatus(GenerationStatus.COMPLETE);
        } catch (e) {
            console.error(e);
            addLog("SYSTEM ERROR.");
            setStatus(GenerationStatus.ERROR);
        }
    };

    // 2. SINTETIZAR ÁUDIO (AGRUPAMENTO INTELIGENTE - 5 MIN BLOCKS)
    const handleSynthesizeAudio = async () => {
        if (data.segments.length === 0) return;
        
        setAudioStatus(GenerationStatus.GENERATING);
        addLog("INIT AUDIO SYNTHESIS PROTOCOL (BLOCK MODE)...");
        
        // --- ETAPA DE AGRUPAMENTO (BATCHING) ---
        const blocks: PodcastAudioBlock[] = [];
        let currentBlockText = "";
        let currentWordCount = 0;
        let blockIndex = 1;
        const TARGET_WORDS_PER_BLOCK = 750; // ~5 minutos

        for (let i = 0; i < data.segments.length; i++) {
            const seg = data.segments[i];
            // Formatação Exata para Multi-Speaker TTS: "Speaker Name: Text"
            const line = `${seg.speaker}: ${seg.text}\n`;
            
            currentBlockText += line;
            currentWordCount += seg.text.split(/\s+/).length;

            const isLast = i === data.segments.length - 1;

            // Fecha o bloco se atingiu o limite ou é o último segmento
            if (currentWordCount >= TARGET_WORDS_PER_BLOCK || isLast) {
                blocks.push({
                    id: `block_${blockIndex}`,
                    label: `Bloco ${blockIndex} (${Math.round(currentWordCount/150)} min)`,
                    audioBase64: null,
                    status: GenerationStatus.IDLE,
                    transcript: currentBlockText
                });
                
                // Reset
                currentBlockText = "";
                currentWordCount = 0;
                blockIndex++;
            }
        }

        // Inicializa estado com blocos vazios
        onUpdate({ audioBlocks: blocks });
        
        // --- ETAPA DE GERAÇÃO (TTS MULTI-SPEAKER) ---
        const updatedBlocks = [...blocks];

        for (let i = 0; i < updatedBlocks.length; i++) {
            if (updatedBlocks[i].audioBase64) continue; // Pula se já existe

            // Marca processando
            updatedBlocks[i].status = GenerationStatus.GENERATING;
            onUpdate({ audioBlocks: [...updatedBlocks] });
            
            addLog(`Synthesizing ${updatedBlocks[i].label}...`);

            if (i > 0) await delay(2000); // Rate limit safety

            try {
                const audio = await generateMultiSpeakerSpeech(updatedBlocks[i].transcript);
                
                updatedBlocks[i].status = audio ? GenerationStatus.COMPLETE : GenerationStatus.ERROR;
                updatedBlocks[i].audioBase64 = audio;
            } catch (err) {
                console.error(err);
                updatedBlocks[i].status = GenerationStatus.ERROR;
                addLog(`Error on Block ${i+1}`);
            }

            onUpdate({ audioBlocks: [...updatedBlocks] });
        }

        setAudioStatus(GenerationStatus.COMPLETE);
        addLog("AUDIO SYNTHESIS COMPLETE.");
    };

    // 3. DOWNLOAD COMBINADO (Junta os Blocos gerados)
    const handleDownloadMergedAudio = async () => {
        const blocksWithAudio = data.audioBlocks?.filter(b => b.audioBase64 && b.status === GenerationStatus.COMPLETE) || [];
        if (blocksWithAudio.length === 0) return;

        addLog(`Merging ${blocksWithAudio.length} audio blocks...`);
        
        try {
            const audioBlobs: Blob[] = [];
            
            for (const block of blocksWithAudio) {
                if (block.audioBase64) {
                    const bin = atob(block.audioBase64);
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

    // Download de um bloco individual
    const handleDownloadBlock = (block: PodcastAudioBlock) => {
         if (!block.audioBase64) return;
         try {
            const bin = atob(block.audioBase64);
            const len = bin.length;
            const arr = new Uint8Array(len);
            for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
            const blob = createWavBlob([new Blob([arr])]); // Wrap in wav header
            
            if (blob) {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${block.label.replace(/\s/g, '_')}.wav`;
                document.body.appendChild(a);
                a.click();
            }
         } catch(e) { console.error(e); }
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

    const hasAnyAudio = data.audioBlocks?.some(b => b.audioBase64);
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
                                    <button 
                                        onClick={handleSynthesizeAudio} 
                                        disabled={isProcessing || (hasAnyAudio && audioStatus === GenerationStatus.COMPLETE)}
                                        className={`px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2 transition-all ${
                                            hasAnyAudio ? 'bg-neutral-800 text-neutral-400' : 'bg-purple-600 hover:bg-purple-500 text-white animate-pulse'
                                        }`}
                                    >
                                        {audioStatus === GenerationStatus.GENERATING ? <Loader2 className="animate-spin" size={16}/> : <Zap size={16} />}
                                        <span>{hasAnyAudio ? "Áudio Gerado" : "Sintetizar (Blocos)"}</span>
                                    </button>

                                    {hasAnyAudio && (
                                        <button 
                                            onClick={handleDownloadMergedAudio} 
                                            className="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-full font-bold shadow-lg flex items-center gap-2"
                                            title="Baixar Áudio Completo (Unificado)"
                                        >
                                            <Download size={16} />
                                            <span>Download Full</span>
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

                    {/* BLOCKS DISPLAY (NOVA SEÇÃO) */}
                    {data.audioBlocks && data.audioBlocks.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 border-b border-neutral-800 pb-8">
                             {data.audioBlocks.map((block) => (
                                 <div key={block.id} className={`p-4 rounded-xl border flex items-center justify-between ${block.status === GenerationStatus.GENERATING ? 'bg-yellow-900/10 border-yellow-600/50' : block.status === GenerationStatus.COMPLETE ? 'bg-green-900/10 border-green-600/50' : 'bg-neutral-900/50 border-neutral-800'}`}>
                                     <div>
                                         <p className="text-white font-bold text-sm">{block.label}</p>
                                         <p className="text-[10px] text-neutral-400 uppercase font-mono mt-1">
                                             {block.status === GenerationStatus.GENERATING ? "Processando..." : block.status === GenerationStatus.COMPLETE ? "Pronto para Download" : "Aguardando..."}
                                         </p>
                                     </div>
                                     <div>
                                        {block.status === GenerationStatus.GENERATING && <Loader2 className="animate-spin text-yellow-500" size={20} />}
                                        {block.status === GenerationStatus.COMPLETE && (
                                            <button 
                                                onClick={() => handleDownloadBlock(block)}
                                                className="bg-neutral-800 hover:bg-neutral-700 text-green-400 p-2 rounded-full transition-colors"
                                                title="Baixar Bloco Individual"
                                            >
                                                <Download size={16} />
                                            </button>
                                        )}
                                     </div>
                                 </div>
                             ))}
                        </div>
                    )}

                    {/* System Log */}
                    {isProcessing && (
                        <div className="bg-black border border-neutral-800 rounded-lg p-3 font-mono text-[10px] text-green-400 h-24 overflow-y-auto mb-4 opacity-80">
                            {generationLog.map((log, i) => <div key={i}>{log}</div>)}
                            <div id="log-end"></div>
                        </div>
                    )}

                    {/* Lista de Segmentos (Visualização Apenas) */}
                    {data.segments.length > 0 && (
                        <div className="space-y-4 pb-8 opacity-80">
                            <h3 className="text-xs uppercase font-bold text-neutral-500 tracking-widest mb-2">Script Preview</h3>
                            {data.segments.map((seg, idx) => (
                                <div key={idx} className="p-4 rounded-xl border border-neutral-800 bg-[#0f0f0f]">
                                    <div className="flex items-center gap-3 mb-2">
                                        <span className={`text-xs uppercase font-extrabold ${seg.speaker.includes('Milton') ? 'text-cyan-300' : 'text-pink-300'}`}>
                                            {seg.speaker}
                                        </span>
                                    </div>
                                    <p className="text-sm font-display leading-relaxed text-neutral-400">{seg.text}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
             </div>
        </div>
    );
};
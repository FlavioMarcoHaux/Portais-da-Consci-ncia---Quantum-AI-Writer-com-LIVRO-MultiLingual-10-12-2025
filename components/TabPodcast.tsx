

import React, { useState, useEffect } from 'react';
import { Chapter, Subchapter, GenerationStatus, PodcastData, Language } from '../types';
import { QuantumLoader } from './QuantumLoader';
import { Mic2, Play, Pause, Download, Radio, Sparkles, Clock, FileText, Search, Terminal, Archive } from 'lucide-react';
import { generatePodcastScript, generateSpeech, splitTextSmartly, delay } from '../services/geminiService';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { generateZipPackage } from '../utils/downloadHelper';

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
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number>(-1);
    const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
    const [isDownloading, setIsDownloading] = useState(false);
    const [generationLog, setGenerationLog] = useState<string[]>([]);
    
    const { playBase64, isPlaying, stop, resume, suspend, base64ToUint8Array } = useAudioPlayer();

    useEffect(() => {
        return () => stop();
    }, []);

    useEffect(() => {
        if (currentSegmentIndex >= 0 && data.segments.length > 0) {
            const el = document.getElementById(`segment-${currentSegmentIndex}`);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [currentSegmentIndex]);

    const addLog = (msg: string) => setGenerationLog(prev => [...prev, `> ${msg}`]);

    const handleGenerate = async (isDeep: boolean) => {
        if (!subchapter && !data.customTopic) {
            alert("Em modo livre, digite um tema para o Podcast.");
            return;
        }

        setStatus(GenerationStatus.GENERATING);
        onUpdate({ segments: [] }); 
        setGenerationLog(["> INICIANDO PROTOCOLO DE GERAÇÃO..."]);
        setCurrentSegmentIndex(-1);
        stop();

        try {
            addLog(`Modo: ${isDeep ? "Deep Dive" : "Fast Track"}`);
            addLog(`Idioma: ${language.toUpperCase()}`);
            addLog(`Duração Alvo: ${data.durationMinutes} minutos`);

            const result = await generatePodcastScript(
                chapter?.title || "Sessão Livre",
                subchapter?.title || "Deep Research",
                subchapter?.description || "Conversa espontânea baseada em pesquisa web.",
                subchapter?.id || "free-roam",
                language,
                [],
                isDeep,
                data.durationMinutes,
                data.customTopic 
            );

            addLog(`Geração Completa. Segmentos: ${result.length}`);
            addLog("Sincronizando timeline...");

            onUpdate({ segments: result, isDeep });
            setStatus(GenerationStatus.COMPLETE);
        } catch (e) {
            console.error(e);
            addLog("ERRO CRÍTICO NO SISTEMA.");
            setStatus(GenerationStatus.ERROR);
        }
    };

    // Recursive player that handles both Segments AND Smart Chunks
    const playSegmentRecursive = async (segmentIndex: number, chunkIndex: number = 0) => {
        // End of all segments
        if (segmentIndex >= data.segments.length) {
            setCurrentSegmentIndex(-1);
            stop();
            return;
        }

        setCurrentSegmentIndex(segmentIndex);
        const segment = data.segments[segmentIndex];

        // Smart Chunking for Playback:
        // Divide o texto em blocos menores (seguros para TTS) respeitando pontuação.
        const chunks = splitTextSmartly(segment.text, 3500);

        // End of chunks for this segment -> move to next segment
        if (chunkIndex >= chunks.length) {
            playSegmentRecursive(segmentIndex + 1, 0);
            return;
        }

        try {
            // Process current chunk
            const base64Audio = await generateSpeech(chunks[chunkIndex], segment.voiceId);
            
            if (base64Audio) {
                playBase64(base64Audio, () => {
                    // Play next chunk in this segment
                    playSegmentRecursive(segmentIndex, chunkIndex + 1);
                });
            } else {
                // Skip if error, try next chunk
                console.warn("Skipping bad chunk");
                playSegmentRecursive(segmentIndex, chunkIndex + 1);
            }
        } catch (e) {
            console.error("Playback error", e);
            stop();
        }
    };

    const togglePlayback = async () => {
        if (isPlaying) {
            await suspend();
        } else {
            if (currentSegmentIndex >= 0) {
                await resume();
            } else {
                playSegmentRecursive(0);
            }
        }
    };

    const getScriptText = () => {
        const title = data.customTopic || subchapter?.title || "podcast_gerado";
        const header = `PODCAST ROTEIRO (${language.toUpperCase()}): ${title}\n` +
                       `DESCRIÇÃO: ${subchapter?.description || 'Modo Livre'}\n` +
                       `GERADO EM: ${new Date().toLocaleString()}\n` +
                       `--------------------------------------------------\n\n`;
    
        const body = data.segments.map(seg => {
            return `${seg.speaker.toUpperCase()}:\n${seg.text}\n`;
        }).join('\n');

        return header + body;
    };

    const generateWavBlob = async (): Promise<Blob | null> => {
        try {
            const audioBlobs: Blob[] = [];
            
            // Loop com Throttling (Smart Batching + Delay)
            for (let i = 0; i < data.segments.length; i++) {
                const segment = data.segments[i];
                
                // Aplicar Smart Chunking para o download também
                // Garante que nenhum pedaço exceda o limite da API
                const chunks = splitTextSmartly(segment.text, 3500);

                for (const chunk of chunks) {
                    // THROTTLING: Delay de segurança entre requisições
                    // Isso é crucial para episódios longos (20min+) para evitar erro 429
                    if (audioBlobs.length > 0) {
                        await delay(500); // 0.5s delay
                    }

                    const base64Audio = await generateSpeech(chunk, segment.voiceId);
                    
                    if (base64Audio) {
                        const bytes = base64ToUint8Array(base64Audio);
                        audioBlobs.push(new Blob([bytes]));
                    }
                }
            }
  
            if (audioBlobs.length > 0) {
                const totalLength = audioBlobs.reduce((acc, blob) => acc + blob.size, 0);
                const wavHeader = new ArrayBuffer(44);
                const view = new DataView(wavHeader);
                
                const writeString = (view: DataView, offset: number, string: string) => {
                  for (let i = 0; i < string.length; i++) {
                    view.setUint8(offset + i, string.charCodeAt(i));
                  }
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
                
                return new Blob([wavHeader, ...audioBlobs], { type: 'audio/wav' });
            }
            return null;
        } catch (e) {
            console.error("Error generating combined audio", e);
            return null;
        }
    };

    const handleDownloadAudio = async () => {
        if (data.segments.length === 0 || isDownloading) return;
        setIsDownloading(true);
        const safeTitle = (data.customTopic || subchapter?.title || "podcast_audio").replace(/\s+/g, '_').toLowerCase();

        try {
            const blob = await generateWavBlob();
            if (blob) {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.style.display = 'none';
                a.href = url;
                a.download = `${safeTitle}_${language}.wav`;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
            }
        } finally {
            setIsDownloading(false);
        }
    };

    const handleDownloadScript = () => {
        if (data.segments.length === 0) return;
        const safeTitle = (data.customTopic || subchapter?.title || "podcast").replace(/\s+/g, '_').toLowerCase();
        const text = getScriptText();
        const blob = new Blob([text], { type: 'text/plain' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `roteiro_${safeTitle}_${language}.txt`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const handleDownloadZip = async () => {
        if (data.segments.length === 0 || isDownloading) return;
        setIsDownloading(true);
        const safeTitle = (data.customTopic || subchapter?.title || "podcast").replace(/\s+/g, '_').toLowerCase();

        try {
            const files: { name: string; data: string | Blob }[] = [
                { name: 'roteiro.txt', data: getScriptText() }
            ];

            const wavBlob = await generateWavBlob();
            if (wavBlob) {
                files.push({ name: 'episodio_completo.wav', data: wavBlob });
            }

            await generateZipPackage(`pacote_podcast_${language}_${safeTitle}.zip`, files);

        } catch (e) {
            console.error("Zip download failed", e);
        } finally {
            setIsDownloading(false);
        }
    }

    return (
        <div className="flex-1 flex flex-col h-full bg-[#050505] animate-fade-in">
             <div className="p-4 md:p-8 border-b border-neutral-700 bg-[#080808]">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between max-w-6xl mx-auto gap-4 md:gap-6">
                    <div>
                        <h2 className="text-xl md:text-2xl font-serif-title text-purple-300 flex items-center gap-2 shadow-black drop-shadow-sm">
                            <Mic2 className="text-purple-500" />
                            <span className="truncate">Transmissão Quântica ({language.toUpperCase()})</span>
                        </h2>
                        <p className="text-neutral-400 text-xs md:text-sm mt-1 font-medium truncate">
                            {subchapter ? `Milton & Roberta: ${subchapter.title}` : "Milton & Roberta: Modo Livre"}
                        </p>
                    </div>

                    <div className="flex flex-col gap-4 w-full xl:w-auto">
                        <div className="relative group w-full xl:w-96">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 group-hover:text-purple-400 transition-colors" size={16} />
                            <input 
                                type="text"
                                value={data.customTopic}
                                onChange={(e) => onUpdate({ customTopic: e.target.value })}
                                placeholder="Deep Research / Tema Personalizado..."
                                className="w-full bg-[#050505] border border-neutral-600 text-white text-sm rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/50 transition-all placeholder-neutral-500 shadow-inner"
                                disabled={status === GenerationStatus.GENERATING}
                            />
                            {data.customTopic && (
                                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-purple-900 text-purple-200 px-2 py-0.5 rounded border border-purple-700 font-bold">
                                    GROUNDING
                                </span>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-3 justify-center md:justify-end">
                            {data.segments.length > 0 && (
                                <>
                                    <button 
                                        onClick={togglePlayback}
                                        disabled={isDownloading}
                                        className={`flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full border transition-all shadow-lg hover:scale-105 active:scale-95 ${isPlaying ? 'bg-purple-600 border-purple-400 text-white shadow-purple-900/50' : 'bg-neutral-900 border-neutral-600 text-purple-400 hover:bg-neutral-800 hover:text-purple-300'}`}
                                    >
                                        {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-1" />}
                                    </button>

                                    <button
                                        onClick={handleDownloadScript}
                                        disabled={status === GenerationStatus.GENERATING}
                                        className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full border border-neutral-600 bg-neutral-900 text-yellow-400 hover:bg-neutral-800 hover:text-yellow-300 transition-all disabled:opacity-50 shadow-md"
                                        title="Baixar Roteiro (.txt)"
                                    >
                                        <FileText size={18} />
                                    </button>

                                    <button
                                        onClick={handleDownloadZip}
                                        disabled={isDownloading || status === GenerationStatus.GENERATING}
                                        className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full border border-neutral-600 bg-neutral-900 text-green-400 hover:bg-neutral-800 hover:text-green-300 transition-all disabled:opacity-50 shadow-md"
                                        title="Baixar Pacote Podcast (.zip)"
                                    >
                                        {isDownloading ? (
                                            <div className="w-5 h-5 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                                        ) : (
                                            <Archive size={18} />
                                        )}
                                    </button>

                                    <button
                                        onClick={handleDownloadAudio}
                                        disabled={isDownloading || status === GenerationStatus.GENERATING}
                                        className="flex items-center justify-center w-10 h-10 md:w-12 md:h-12 rounded-full border border-neutral-600 bg-neutral-900 text-cyan-400 hover:bg-neutral-800 hover:text-cyan-300 transition-all disabled:opacity-50 shadow-md"
                                        title="Baixar Episódio Completo (.wav)"
                                    >
                                        <Download size={18} />
                                    </button>
                                </>
                            )}
                            
                            <div className="flex items-center bg-[#050505] rounded-full pl-3 pr-2 py-1 border border-neutral-600 h-10 md:h-12 shadow-sm">
                                <Clock size={16} className="text-neutral-400 mr-2" />
                                <select 
                                    value={data.durationMinutes} 
                                    onChange={(e) => onUpdate({ durationMinutes: Number(e.target.value) })}
                                    className="bg-transparent text-white text-xs md:text-sm font-bold focus:outline-none cursor-pointer border-none mr-1 appearance-none hover:text-purple-300 transition-colors"
                                    disabled={status === GenerationStatus.GENERATING || isDownloading}
                                >
                                    <option value={5} className="bg-neutral-900 text-white">5 min</option>
                                    <option value={10} className="bg-neutral-900 text-white">10 min</option>
                                    <option value={15} className="bg-neutral-900 text-white">15 min</option>
                                    <option value={20} className="bg-neutral-900 text-white">20 min</option>
                                    <option value={30} className="bg-neutral-900 text-white">30 min</option>
                                </select>
                            </div>

                            <button
                                onClick={() => handleGenerate(false)}
                                disabled={status === GenerationStatus.GENERATING || isDownloading || (!subchapter && !data.customTopic)}
                                className="flex items-center space-x-2 bg-purple-950/80 hover:bg-purple-900 text-white px-4 md:px-6 py-2 md:py-3 rounded-full transition-all border border-purple-700 hover:border-purple-400 group disabled:opacity-50 shadow-[0_0_15px_rgba(168,85,247,0.2)] font-bold text-xs md:text-sm"
                            >
                                {status === GenerationStatus.GENERATING ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Sparkles size={16} className="text-purple-200" />
                                )}
                                <span>Rápido</span>
                            </button>

                            <button
                                onClick={() => handleGenerate(true)}
                                disabled={status === GenerationStatus.GENERATING || isDownloading || (!subchapter && !data.customTopic)}
                                className="flex items-center space-x-2 bg-indigo-950/80 hover:bg-indigo-900 text-white px-4 md:px-6 py-2 md:py-3 rounded-full transition-all border border-indigo-700 hover:border-indigo-400 group disabled:opacity-50 shadow-[0_0_15px_rgba(79,70,229,0.2)] font-bold text-xs md:text-sm"
                            >
                                {status === GenerationStatus.GENERATING ? (
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                ) : (
                                    <Radio size={16} className="text-indigo-200" />
                                )}
                                <span>Profundo</span>
                            </button>
                        </div>
                    </div>
                </div>
             </div>

             <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#0a0a0a]">
                <div className="max-w-3xl mx-auto space-y-6">
                    {status === GenerationStatus.IDLE && data.segments.length === 0 && (
                        <div className="text-center text-neutral-500 mt-20">
                            <div className="w-24 h-24 bg-[#0f0f0f] rounded-full flex items-center justify-center mx-auto mb-6 border border-neutral-700 shadow-xl">
                                <Mic2 size={32} className="text-neutral-600" />
                            </div>
                            <p className="text-lg font-display font-bold text-neutral-400">Estúdio Quântico Pronto.</p>
                            <p className="text-sm mt-2 max-w-md mx-auto opacity-70 text-neutral-500">
                                {subchapter 
                                    ? `Escolha a duração e o modo para gerar o episódio sobre: ${subchapter.title}` 
                                    : "Digite um tema acima para iniciar um Podcast de Pesquisa Livre."}
                            </p>
                        </div>
                    )}

                    {status === GenerationStatus.GENERATING && (
                        <div className="space-y-6">
                            <QuantumLoader />
                            <div className="bg-black border border-neutral-700 rounded-lg p-4 font-mono text-xs text-green-400 h-48 overflow-y-auto shadow-inner">
                                <div className="flex items-center gap-2 mb-2 border-b border-neutral-800 pb-2 text-neutral-500 font-bold">
                                    <Terminal size={14} />
                                    <span>SYSTEM LOG</span>
                                </div>
                                <div className="space-y-1 opacity-90">
                                    {generationLog.map((log, i) => (
                                        <div key={i} className="animate-fade-in">{log}</div>
                                    ))}
                                    <div className="animate-pulse">_</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {data.segments.length > 0 && (
                        <div className="space-y-4 pb-8">
                            {data.segments.map((seg, idx) => {
                                const isActive = idx === currentSegmentIndex;
                                const speakerName = seg.speaker || "Milton Dilts";
                                const isMilton = speakerName.toLowerCase().includes("milton");
                                
                                return (
                                    <div 
                                        key={idx} 
                                        id={`segment-${idx}`}
                                        className={`p-6 rounded-xl border transition-all duration-300 cursor-pointer ${
                                            isActive 
                                            ? 'bg-purple-900/30 border-purple-500 shadow-[0_0_30px_rgba(168,85,247,0.2)] scale-[1.01] z-10' 
                                            : 'bg-[#0f0f0f] border-neutral-700 hover:bg-[#151515] hover:border-neutral-500'
                                        }`}
                                        onClick={() => playSegmentRecursive(idx)}
                                    >
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-green-400 animate-pulse shadow-[0_0_10px_#4ade80]' : 'bg-neutral-600'}`} />
                                            <span className={`text-xs uppercase tracking-widest font-extrabold ${isMilton ? 'text-cyan-300' : 'text-pink-300'}`}>
                                                {speakerName}
                                            </span>
                                            {seg.tone && (
                                                <span className="text-xs text-neutral-500 italic font-medium bg-black/30 px-2 py-0.5 rounded">
                                                    {seg.tone}
                                                </span>
                                            )}
                                        </div>
                                        <p className={`text-lg font-display leading-relaxed ${isActive ? 'text-white' : 'text-neutral-300'}`}>
                                            {seg.text}
                                        </p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
             </div>
        </div>
    );
};

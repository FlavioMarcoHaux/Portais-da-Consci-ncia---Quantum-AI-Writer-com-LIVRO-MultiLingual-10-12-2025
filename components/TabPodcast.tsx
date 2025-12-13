import React, { useState, useEffect } from 'react';
import { Chapter, Subchapter, GenerationStatus, PodcastData, Language } from '../types';
import { QuantumLoader } from './QuantumLoader';
import { Mic2, Play, Pause, Download, Radio, Sparkles, Clock, FileText, Search, Terminal, Archive } from 'lucide-react';
import { generatePodcastScript, generateSpeech, splitTextSmartly, delay } from '../services/geminiService';
import { useAudioPlayer } from '../hooks/useAudioPlayer';
import { generateZipPackage } from '../utils/downloadHelper';
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
    const [currentSegmentIndex, setCurrentSegmentIndex] = useState<number>(-1);
    const [status, setStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
    const [isDownloading, setIsDownloading] = useState(false);
    const [generationLog, setGenerationLog] = useState<string[]>([]);
    const t = useTranslation(language);
    
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
            alert("Please provide a topic.");
            return;
        }

        setStatus(GenerationStatus.GENERATING);
        onUpdate({ segments: [] }); 
        setGenerationLog(["> INIT..."]);
        setCurrentSegmentIndex(-1);
        stop();

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

            addLog(`Generated ${result.length} segments`);
            addLog("Syncing timeline...");

            onUpdate({ segments: result, isDeep });
            setStatus(GenerationStatus.COMPLETE);
        } catch (e) {
            console.error(e);
            addLog("SYSTEM ERROR.");
            setStatus(GenerationStatus.ERROR);
        }
    };

    const playSegmentRecursive = async (segmentIndex: number, chunkIndex: number = 0) => {
        if (segmentIndex >= data.segments.length) {
            setCurrentSegmentIndex(-1);
            stop();
            return;
        }

        setCurrentSegmentIndex(segmentIndex);
        const segment = data.segments[segmentIndex];
        const chunks = splitTextSmartly(segment.text, 3500);

        if (chunkIndex >= chunks.length) {
            playSegmentRecursive(segmentIndex + 1, 0);
            return;
        }

        try {
            const base64Audio = await generateSpeech(chunks[chunkIndex], segment.voiceId);
            if (base64Audio) {
                playBase64(base64Audio, () => {
                    playSegmentRecursive(segmentIndex, chunkIndex + 1);
                });
            } else {
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
        const title = data.customTopic || subchapter?.title || "podcast";
        const header = `PODCAST SCRIPT (${language.toUpperCase()}): ${title}\n\n`;
        const body = data.segments.map(seg => `${seg.speaker.toUpperCase()}:\n${seg.text}\n`).join('\n');
        return header + body;
    };

    const generateWavBlob = async (): Promise<Blob | null> => {
        try {
            const audioBlobs: Blob[] = [];
            for (let i = 0; i < data.segments.length; i++) {
                const segment = data.segments[i];
                const chunks = splitTextSmartly(segment.text, 3500);
                for (const chunk of chunks) {
                    if (audioBlobs.length > 0) await delay(500);
                    const base64Audio = await generateSpeech(chunk, segment.voiceId);
                    if (base64Audio) {
                        const bytes = base64ToUint8Array(base64Audio);
                        audioBlobs.push(new Blob([bytes]));
                    }
                }
            }
            // WAV Header construction... (Same as before, abbreviated for update)
            if (audioBlobs.length > 0) {
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
                 return new Blob([wavHeader, ...audioBlobs], { type: 'audio/wav' });
            }
            return null;
        } catch (e) {
            return null;
        }
    };

    const handleDownloadAudio = async () => {
        if (data.segments.length === 0 || isDownloading) return;
        setIsDownloading(true);
        const safeTitle = (data.customTopic || subchapter?.title || "podcast").replace(/\s+/g, '_').toLowerCase();
        try {
            const blob = await generateWavBlob();
            if (blob) {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${safeTitle}_${language}.wav`;
                document.body.appendChild(a);
                a.click();
            }
        } finally { setIsDownloading(false); }
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

    const handleDownloadZip = async () => {
        if (data.segments.length === 0 || isDownloading) return;
        setIsDownloading(true);
        try {
            const files: { name: string; data: string | Blob }[] = [{ name: 'script.txt', data: getScriptText() }];
            const wavBlob = await generateWavBlob();
            if (wavBlob) files.push({ name: 'episode.wav', data: wavBlob });
            await generateZipPackage(`podcast_${language}.zip`, files);
        } finally { setIsDownloading(false); }
    }

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
                                disabled={status === GenerationStatus.GENERATING}
                            />
                        </div>

                        <div className="flex flex-wrap items-center gap-3 justify-center md:justify-end">
                            {data.segments.length > 0 && (
                                <>
                                    <button onClick={togglePlayback} disabled={isDownloading} className={`flex items-center justify-center w-10 h-10 rounded-full border transition-all ${isPlaying ? 'bg-purple-600 border-purple-400 text-white' : 'bg-neutral-900 border-neutral-600 text-purple-400'}`}>
                                        {isPlaying ? <Pause size={18} /> : <Play size={18} className="ml-1" />}
                                    </button>
                                    <button onClick={handleDownloadScript} className="w-10 h-10 rounded-full border border-neutral-600 bg-neutral-900 text-yellow-400 flex items-center justify-center" title={t.podcast.btnScript}><FileText size={18} /></button>
                                    <button onClick={handleDownloadZip} className="w-10 h-10 rounded-full border border-neutral-600 bg-neutral-900 text-green-400 flex items-center justify-center" title={t.podcast.btnZip} disabled={isDownloading}><Archive size={18} /></button>
                                    <button onClick={handleDownloadAudio} className="w-10 h-10 rounded-full border border-neutral-600 bg-neutral-900 text-cyan-400 flex items-center justify-center" title={t.podcast.btnAudio} disabled={isDownloading}><Download size={18} /></button>
                                </>
                            )}
                            
                            <div className="flex items-center bg-[#050505] rounded-full pl-3 pr-2 py-1 border border-neutral-600 h-10 md:h-12 shadow-sm">
                                <Clock size={16} className="text-neutral-400 mr-2" />
                                <select 
                                    value={data.durationMinutes} 
                                    onChange={(e) => onUpdate({ durationMinutes: Number(e.target.value) })}
                                    className="bg-transparent text-white text-xs md:text-sm font-bold focus:outline-none cursor-pointer border-none mr-1"
                                    disabled={status === GenerationStatus.GENERATING}
                                >
                                    <option value={5}>5 min</option>
                                    <option value={10}>10 min</option>
                                    <option value={15}>15 min</option>
                                    <option value={20}>20 min</option>
                                    <option value={30}>30 min</option>
                                </select>
                            </div>

                            <button onClick={() => handleGenerate(false)} disabled={status === GenerationStatus.GENERATING} className="flex items-center space-x-2 bg-purple-950/80 text-white px-4 py-2 rounded-full border border-purple-700 text-xs font-bold">
                                <Sparkles size={16} /> <span>{t.podcast.btnFast}</span>
                            </button>

                            <button onClick={() => handleGenerate(true)} disabled={status === GenerationStatus.GENERATING} className="flex items-center space-x-2 bg-indigo-950/80 text-white px-4 py-2 rounded-full border border-indigo-700 text-xs font-bold">
                                <Radio size={16} /> <span>{t.podcast.btnDeep}</span>
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
                            <p className="text-lg font-display font-bold text-neutral-400">{t.podcast.readyTitle}</p>
                            <p className="text-sm mt-2 max-w-md mx-auto opacity-70 text-neutral-500">
                                {subchapter ? t.podcast.readyTextSub : t.podcast.readyTextFree}
                            </p>
                        </div>
                    )}

                    {status === GenerationStatus.GENERATING && (
                        <div className="space-y-6">
                            <QuantumLoader />
                            <div className="bg-black border border-neutral-700 rounded-lg p-4 font-mono text-xs text-green-400 h-48 overflow-y-auto shadow-inner">
                                <div className="flex items-center gap-2 mb-2 border-b border-neutral-800 pb-2 text-neutral-500 font-bold">
                                    <Terminal size={14} />
                                    <span>{t.podcast.logSystem}</span>
                                </div>
                                {generationLog.map((log, i) => <div key={i}>{log}</div>)}
                            </div>
                        </div>
                    )}

                    {data.segments.length > 0 && (
                        <div className="space-y-4 pb-8">
                            {data.segments.map((seg, idx) => (
                                <div key={idx} id={`segment-${idx}`} className={`p-6 rounded-xl border ${idx === currentSegmentIndex ? 'bg-purple-900/30 border-purple-500' : 'bg-[#0f0f0f] border-neutral-700'}`}>
                                    <div className="flex items-center gap-3 mb-3">
                                        <span className={`text-xs uppercase font-extrabold ${seg.speaker.includes('Milton') ? 'text-cyan-300' : 'text-pink-300'}`}>{seg.speaker}</span>
                                    </div>
                                    <p className="text-lg font-display leading-relaxed text-neutral-300">{seg.text}</p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
             </div>
        </div>
    );
};
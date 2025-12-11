

import React, { useState } from 'react';
import { Chapter, Subchapter, GenerationStatus, MarketingData, Language } from '../types';
import { QuantumLoader } from './QuantumLoader';
import { Zap, Copy, Youtube, Image as ImageIcon, Download, Sparkles, RefreshCw, Search, Globe, Archive } from 'lucide-react';
import { generateMarketingStrategy, generateThumbnailPrompt, generateThumbnailImage } from '../services/geminiService';
import { generateZipPackage, base64ToBlob } from '../utils/downloadHelper';

interface TabManuscriptProps {
    chapter: Chapter | null;
    subchapter: Subchapter | null;
    language: Language;
    data: MarketingData;
    onUpdate: (data: Partial<MarketingData>) => void;
}

export const TabManuscript: React.FC<TabManuscriptProps> = ({ 
    chapter, 
    subchapter,
    language,
    data,
    onUpdate
}) => {
    // Local loading states (UI only, data is in props)
    const [seoStatus, setSeoStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
    const [visualStatus, setVisualStatus] = useState<GenerationStatus>(GenerationStatus.IDLE);
    const [isZipping, setIsZipping] = useState(false);

    const handleGenerateSEO = async () => {
        if (!subchapter && !data.customTopic) {
            alert("Em modo livre, por favor digite um tema para pesquisar.");
            return;
        }

        setSeoStatus(GenerationStatus.GENERATING);
        try {
            const strategyResult = await generateMarketingStrategy(
                subchapter?.title || "Pesquisa Livre", 
                subchapter?.description || "Conteúdo baseado em pesquisa web deep research",
                language,
                data.customTopic, // Pass custom topic
                subchapter?.id // Pass subchapter ID for bibliography
            );
            
            // Generate prompt automatically based on new strategy
            let newPrompt = data.imagePrompt;
            try {
                newPrompt = await generateThumbnailPrompt(
                    strategyResult.optimizedTitle, 
                    strategyResult.description,
                    language
                );
            } catch (err) { console.error("Auto prompt failed", err); }

            onUpdate({
                strategy: strategyResult,
                imagePrompt: newPrompt
            });

            setSeoStatus(GenerationStatus.COMPLETE);

        } catch (e) {
            console.error(e);
            setSeoStatus(GenerationStatus.ERROR);
        }
    };

    const handleGeneratePrompt = async () => {
        setVisualStatus(GenerationStatus.GENERATING);
        try {
            const title = data.strategy?.optimizedTitle || subchapter?.title || data.customTopic;
            const desc = data.strategy?.description || subchapter?.description || "";
            
            const prompt = await generateThumbnailPrompt(title, desc, language);
            onUpdate({ imagePrompt: prompt });
            setVisualStatus(GenerationStatus.COMPLETE);
        } catch (e) {
            console.error(e);
            setVisualStatus(GenerationStatus.ERROR);
        }
    };

    const handleGenerateImage = async () => {
        if (!data.imagePrompt) return;
        setVisualStatus(GenerationStatus.GENERATING);
        
        try {
            const base64 = await generateThumbnailImage(data.imagePrompt);
            onUpdate({ generatedImage: base64 });
            setVisualStatus(GenerationStatus.COMPLETE);
        } catch (e) {
            console.error(e);
            setVisualStatus(GenerationStatus.ERROR);
        }
    };

    const handleDownloadZip = async () => {
        if (!data.strategy) return;
        setIsZipping(true);

        const safeTitle = (data.strategy.optimizedTitle || "marketing_kit").replace(/[^a-z0-9]/gi, '_').toLowerCase();
        
        // 1. Prepare Markdown Content
        const contentMd = `
# ${data.strategy.optimizedTitle}

## Gancho Viral (Hook)
${data.strategy.viralHook}

## Descrição Otimizada
${data.strategy.description}

## Capítulos (Timestamps)
${data.strategy.chapters}

## Tags
${data.strategy.tags}

## Prompt da Thumbnail
${data.imagePrompt}
`;

        const files: { name: string; data: string | Blob }[] = [
            { name: 'estrategia_seo.md', data: contentMd }
        ];

        // 2. Add Image if available
        if (data.generatedImage) {
            const imgBlob = base64ToBlob(data.generatedImage, 'image/jpeg');
            files.push({ name: 'thumbnail.jpg', data: imgBlob });
        }

        await generateZipPackage(`kit_marketing_${language}_${safeTitle}.zip`, files);
        setIsZipping(false);
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div className="flex-1 flex flex-col md:flex-row h-full overflow-hidden bg-[#050505] animate-fade-in">
            {/* LEFT COLUMN: SEO AGENT */}
            <div className="flex-1 border-r border-neutral-700 overflow-y-auto p-6 md:p-8 bg-[#080808]">
                <div className="flex items-center space-x-2 text-cyan-400 mb-6 uppercase tracking-widest text-xs font-bold border-b border-neutral-700 pb-2">
                    <Youtube size={16} />
                    <span>Neuro-Marketing Agent ({language.toUpperCase()})</span>
                </div>

                <div className="mb-8">
                    <h1 className="text-2xl font-serif-title text-white mb-2 shadow-black drop-shadow-md">
                        {subchapter ? subchapter.title : "Marketing & Deep Research"}
                    </h1>
                    <p className="text-neutral-300 text-sm mb-4 font-medium">
                        {subchapter 
                            ? `Estratégia (${language.toUpperCase()}) baseada no capítulo selecionado.` 
                            : "Digite um tema abaixo para iniciar uma pesquisa profunda na web."}
                    </p>
                    
                    {/* Custom Topic Input */}
                    <div className="relative group w-full mb-4">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400 group-hover:text-cyan-400 transition-colors" size={16} />
                        <input 
                            type="text"
                            value={data.customTopic}
                            onChange={(e) => onUpdate({ customTopic: e.target.value })}
                            placeholder={subchapter ? "Adicionar Trend Específica..." : "Digite o tema para pesquisar..."}
                            className="w-full bg-[#050505] border border-neutral-600 text-white text-sm rounded-lg pl-10 pr-4 py-3 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder-neutral-500 shadow-inner"
                            disabled={seoStatus === GenerationStatus.GENERATING}
                        />
                        {data.customTopic && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] bg-cyan-900 text-cyan-200 px-2 py-0.5 rounded border border-cyan-700 font-bold">
                                <Globe size={10} />
                                DEEP RESEARCH
                            </span>
                        )}
                    </div>

                    <button
                        onClick={handleGenerateSEO}
                        disabled={seoStatus === GenerationStatus.GENERATING || (!subchapter && !data.customTopic)}
                        className="w-full flex items-center justify-center space-x-2 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-700 hover:border-cyan-500 px-6 py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(8,145,178,0.15)] hover:shadow-[0_0_25px_rgba(34,211,238,0.25)] group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                         {seoStatus === GenerationStatus.GENERATING ? (
                             <div className="flex items-center gap-2">
                                <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
                                <span className="text-xs animate-pulse font-bold text-cyan-200">ANALISANDO BIG DATA...</span>
                             </div>
                         ) : (
                             <>
                                <Zap size={20} className="group-hover:text-white transition-colors" />
                                <span className="font-display tracking-wider font-bold">ATIVAR ESTRATÉGIA VIRAL ({language.toUpperCase()})</span>
                             </>
                         )}
                    </button>
                </div>

                {/* VISUAL FEEDBACK: Loader */}
                {seoStatus === GenerationStatus.GENERATING && <QuantumLoader />}

                {data.strategy && (
                    <div className="space-y-6 animate-fade-in pb-10">
                        
                        {/* Download ZIP Button */}
                        <button 
                            onClick={handleDownloadZip}
                            disabled={isZipping}
                            className="w-full bg-neutral-900 hover:bg-neutral-800 border border-neutral-600 text-neutral-200 hover:text-white py-3 rounded-lg flex items-center justify-center space-x-2 transition-all font-bold disabled:opacity-50 shadow-sm"
                        >
                            {isZipping ? (
                                <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <Archive size={18} />
                            )}
                            <span>Baixar Kit Marketing (.zip)</span>
                        </button>

                        {/* Title Block */}
                        <div className="bg-[#0a0a0a] p-5 rounded-lg border border-neutral-600 shadow-lg">
                            <div className="flex justify-between items-center mb-2 border-b border-neutral-700 pb-2">
                                <span className="text-xs text-neutral-400 uppercase font-bold tracking-wider">Título Otimizado</span>
                                <button onClick={() => copyToClipboard(data.strategy!.optimizedTitle)} className="text-neutral-500 hover:text-white transition-colors"><Copy size={14} /></button>
                            </div>
                            <p className="text-xl text-white font-bold leading-snug tracking-tight">{data.strategy.optimizedTitle}</p>
                        </div>

                        {/* Viral Hook */}
                        <div className="bg-purple-950/20 p-5 rounded-lg border border-purple-800/50 shadow-[0_4px_20px_-10px_rgba(88,28,135,0.3)]">
                             <div className="flex justify-between items-center mb-2 border-b border-purple-900/30 pb-2">
                                <span className="text-xs text-purple-300 uppercase font-bold tracking-wider">Gancho Viral</span>
                                <button onClick={() => copyToClipboard(data.strategy!.viralHook)} className="text-purple-400 hover:text-white transition-colors"><Copy size={14} /></button>
                            </div>
                            <p className="text-purple-100 italic font-medium text-lg">"{data.strategy.viralHook}"</p>
                        </div>

                        {/* Description & Chapters */}
                        <div className="bg-[#0a0a0a] p-5 rounded-lg border border-neutral-600 shadow-md">
                            <div className="flex justify-between items-center mb-2 border-b border-neutral-700 pb-2">
                                <span className="text-xs text-neutral-400 uppercase font-bold tracking-wider">Descrição & Timestamps</span>
                                <button onClick={() => copyToClipboard(data.strategy!.description + "\n\n" + data.strategy!.chapters)} className="text-neutral-500 hover:text-white transition-colors"><Copy size={14} /></button>
                            </div>
                            <div className="h-48 overflow-y-auto pr-2 text-sm text-neutral-200 space-y-4 whitespace-pre-wrap font-mono leading-relaxed bg-[#050505] p-3 rounded border border-neutral-700">
                                {data.strategy.description}
                                <div className="text-cyan-400 mt-4 pt-4 border-t border-neutral-800 font-bold">
                                    {data.strategy.chapters}
                                </div>
                            </div>
                        </div>

                        {/* Tags */}
                        <div className="bg-[#0a0a0a] p-5 rounded-lg border border-neutral-600 shadow-md">
                             <div className="flex justify-between items-center mb-2 border-b border-neutral-700 pb-2">
                                <span className="text-xs text-neutral-400 uppercase font-bold tracking-wider">Tags</span>
                                <button onClick={() => copyToClipboard(data.strategy!.tags)} className="text-neutral-500 hover:text-white transition-colors"><Copy size={14} /></button>
                            </div>
                            <p className="text-xs text-cyan-300 font-mono break-words bg-[#050505] p-3 rounded border border-neutral-700">{data.strategy.tags}</p>
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT COLUMN: VISUAL AGENT */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 bg-[#050505] border-l border-neutral-700">
                <div className="flex items-center space-x-2 text-purple-400 mb-6 uppercase tracking-widest text-xs font-bold border-b border-neutral-700 pb-2">
                    <ImageIcon size={16} />
                    <span>Visual Semiotics Agent (Imagen 4)</span>
                </div>

                {!data.imagePrompt ? (
                    <div className="h-full flex flex-col items-center justify-center text-neutral-500 space-y-4">
                        <ImageIcon size={48} className="opacity-30" />
                        <p className="text-sm font-medium">Gere a estratégia SEO primeiro para desbloquear o visual.</p>
                    </div>
                ) : (
                    <div className="space-y-6 animate-fade-in pb-10">
                        {/* Prompt Display */}
                        <div className="bg-[#0a0a0a] p-4 rounded-xl border border-neutral-600 shadow-lg">
                            <div className="flex justify-between items-center mb-3 border-b border-neutral-700 pb-2">
                                <span className="text-xs text-neutral-400 uppercase font-bold tracking-wider">Prompt de Imagem (Semiótica)</span>
                                <div className="flex space-x-2">
                                    <button onClick={() => handleGeneratePrompt()} title="Regenerar Prompt" className="text-neutral-500 hover:text-white transition-colors"><RefreshCw size={14} /></button>
                                    <button onClick={() => copyToClipboard(data.imagePrompt)} className="text-neutral-500 hover:text-white transition-colors"><Copy size={14} /></button>
                                </div>
                            </div>
                            <textarea 
                                value={data.imagePrompt}
                                onChange={(e) => onUpdate({ imagePrompt: e.target.value })}
                                className="w-full bg-[#050505] text-neutral-200 text-sm p-3 rounded-lg border border-neutral-700 focus:border-purple-500 focus:outline-none min-h-[100px] font-mono leading-relaxed"
                            />
                        </div>

                        {/* Generation Action */}
                        <button
                            onClick={handleGenerateImage}
                            disabled={visualStatus === GenerationStatus.GENERATING}
                            className="w-full flex items-center justify-center space-x-2 bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800 hover:border-purple-500 px-6 py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(168,85,247,0.15)] group"
                        >
                            {visualStatus === GenerationStatus.GENERATING ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-5 h-5 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
                                    <span className="text-xs animate-pulse font-bold">RENDERIZANDO EM 8K...</span>
                                </div>
                            ) : (
                                <>
                                    <Sparkles size={20} className="group-hover:text-white transition-colors" />
                                    <span className="font-display tracking-wider font-bold">MATERIALIZAR THUMBNAIL (IMAGEN 4)</span>
                                </>
                            )}
                        </button>

                        {/* Image Result */}
                        {data.generatedImage ? (
                            <div className="relative group rounded-xl overflow-hidden border-2 border-neutral-700 shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                                <img 
                                    src={`data:image/jpeg;base64,${data.generatedImage}`} 
                                    alt="Generated Thumbnail" 
                                    className="w-full h-auto object-cover"
                                />
                                <div className="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                                    <a 
                                        href={`data:image/jpeg;base64,${data.generatedImage}`} 
                                        download={`thumb_${subchapter ? subchapter.id : 'deep_research'}_${language}.jpg`}
                                        className="bg-white text-black px-6 py-3 rounded-full flex items-center space-x-2 font-bold hover:scale-105 transition-transform shadow-xl"
                                    >
                                        <Download size={20} />
                                        <span>Baixar Imagem</span>
                                    </a>
                                </div>
                            </div>
                        ) : (
                            <div className="aspect-video bg-[#0a0a0a] border-2 border-dashed border-neutral-700 rounded-xl flex flex-col items-center justify-center text-neutral-600">
                                <ImageIcon size={32} className="mb-2 opacity-50" />
                                <span className="text-xs uppercase tracking-widest font-bold">Área de Materialização</span>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
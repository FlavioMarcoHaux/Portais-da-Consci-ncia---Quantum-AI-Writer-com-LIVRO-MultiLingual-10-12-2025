
import { GoogleGenAI, Modality, Type } from "@google/genai";
import { getCorePersonaInstruction, getPodcastSystemInstruction, getSeoAgentInstruction, getThumbnailAgentInstruction } from '../constants';
import { BIBLIOGRAPHY } from '../bibliography';
import { ChatMessage, PodcastSegment, MarketingStrategy, Language } from '../types';

const apiKey = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

const BASE_CONFIG = {
  temperature: 0.8,
  topP: 0.95,
  topK: 40,
};

// ---------------------------------------------------------------------------
// UTILS: SMART CHUNKING & THROTTLING
// ---------------------------------------------------------------------------

export const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const cleanMarkdownForSpeech = (markdown: string): string => {
    if (!markdown) return "";
    return markdown
        // 1. Remove linhas de separação de tabela (ex: |---|---|)
        .replace(/^\|?[\s\-|:]+\|$/gm, '') 
        // 2. Substitui pipes de tabela por vírgulas (pausa natural)
        .replace(/\|/g, ', ')
        // 3. Remove marcadores de Negrito/Itálico (**texto** -> texto)
        .replace(/\*\*|__/g, '')
        // 4. Remove Hash de Títulos (## Título -> Título)
        .replace(/^#+\s/gm, '')
        // 5. Remove Blockquotes (> Texto -> Texto)
        .replace(/^>\s/gm, '')
        // 6. Remove Blocos de Código e Inline Code
        .replace(/```[\s\S]*?```/g, '')
        .replace(/`/g, '')
        // 7. Remove Imagens, mantendo texto alt se houver
        .replace(/!\[(.*?)\]\(.*?\)/g, '$1')
        // 8. Remove Links, mantendo apenas o texto
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        // 9. Remove linhas horizontais
        .replace(/^-{3,}$/gm, '')
        // 10. Normaliza quebras de linha excessivas
        .replace(/\n{3,}/g, '\n\n')
        .trim();
};

export const splitTextSmartly = (text: string, limit: number = 3500): string[] => {
    if (!text) return [];
    if (text.length <= limit) return [text];

    const chunks: string[] = [];
    let currentChunk = "";
    
    const sentences = text.match(/[^.!?]+([.!?]+|$)/g) || [text];

    for (const sentence of sentences) {
        if (sentence.length > limit) {
             if (currentChunk) {
                 chunks.push(currentChunk.trim());
                 currentChunk = "";
             }
             let remaining = sentence;
             while (remaining.length > 0) {
                 chunks.push(remaining.slice(0, limit));
                 remaining = remaining.slice(limit);
             }
        } 
        else if ((currentChunk.length + sentence.length) > limit) {
            chunks.push(currentChunk.trim());
            currentChunk = sentence;
        } else {
            currentChunk += sentence;
        }
    }
    
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }

    return chunks;
};

// ---------------------------------------------------------------------------
// SERVICES
// ---------------------------------------------------------------------------

const buildPrompt = (chapterTitle: string, subchapterTitle: string, description: string, subchapterId: string, lang: Language) => {
    const references = BIBLIOGRAPHY[subchapterId];
    const bibliographyInstruction = references 
        ? `\n\n**BASE CIENTÍFICA E BIBLIOGRÁFICA OBRIGATÓRIA:**\nVocê DEVE fundamentar seus argumentos nas seguintes obras:\n${references.map(r => `- ${r}`).join('\n')}\n`
        : "";

    return `
    ${getCorePersonaInstruction(lang)}

    TAREFA ATUAL:
    Como Milton Dilts e Roberta Erickson, escreva o conteúdo completo para:
    
    Capítulo: ${chapterTitle}
    Subcapítulo: ${subchapterTitle}
    Contexto/Descrição: ${description}
    ${bibliographyInstruction}

    DIRETRIZES:
    1. **Idioma:** ${lang.toUpperCase()}.
    2. **Explicação:** Lembre-se de contextualizar termos como Kyoshu-Sama/Meishu-Sama para o público geral.
    3. **Estilo:** Hipnótico, Científico e Espiritual.
    4. **Formato:** Texto de livro final.
`;
};

export const generatePodcastScript = async (
  chapterTitle: string,
  subchapterTitle: string,
  description: string,
  subchapterId: string,
  lang: Language,
  history: ChatMessage[] = [],
  isDeep: boolean = false,
  durationMinutes: number = 5,
  customTopic: string = ""
): Promise<PodcastSegment[]> => {
    if (!apiKey) throw new Error("API Key not found.");

    const references = BIBLIOGRAPHY[subchapterId];
    let bibliographyInstruction = references 
        ? `\n\n**BASE CIENTÍFICA INTERNA:**\n${references.map(r => `- ${r}`).join('\n')}`
        : "";

    let topicInstruction = "";
    let toolsConfig: any = undefined;

    if (customTopic.trim()) {
        topicInstruction = `
        **TEMA PRIORITÁRIO (DEEP RESEARCH):** "${customTopic}".
        USE A BUSCA GOOGLE para encontrar referências no idioma ${lang.toUpperCase()} ou globalmente relevantes.
        `;
        toolsConfig = [{ googleSearch: {} }];
    } else {
        topicInstruction = "Siga estritamente o tema do Subcapítulo fornecido.";
    }

    const CHUNK_DURATION = 5; 
    const totalChunks = Math.ceil(durationMinutes / CHUNK_DURATION);
    
    let allSegments: PodcastSegment[] = [];
    let previousContext = "";

    console.log(`Starting Podcast Generation (${lang}): ${durationMinutes} mins total. Topic: ${customTopic}`);

    for (let i = 0; i < totalChunks; i++) {
        const currentChunk = i + 1;
        let minutesForThisChunk = CHUNK_DURATION;
        if (currentChunk === totalChunks) {
            const remainder = durationMinutes % CHUNK_DURATION;
            if (remainder > 0) minutesForThisChunk = remainder;
        }

        const targetWordCount = Math.ceil(minutesForThisChunk * 130);
        const isFinalChunk = currentChunk === totalChunks;

        const partInstruction = totalChunks > 1 
            ? `PARTE ${currentChunk} de ${totalChunks}.`
            : "Roteiro Completo.";

        const contextInstruction = previousContext 
            ? `RESUMO DA PARTE ANTERIOR: ${previousContext}\nCONTINUE a conversa fluidamente.`
            : "INÍCIO DO PODCAST.";

        const closingInstruction = isFinalChunk
            ? "Encerre com conclusões finais e despedida."
            : "NÃO encerre ainda, mantenha o assunto em aberto para a próxima parte.";

        let hookInstruction = "";
        if (currentChunk === 1) {
            hookInstruction = `
            **GANCHO INICIAL:**
            Comece com uma pergunta ou afirmação chocante no idioma ${lang.toUpperCase()}.
            `;
        }

        const userPrompt = `
        Gere o roteiro do Podcast em ${lang.toUpperCase()}.
        Capítulo: ${chapterTitle}
        Subcapítulo: ${subchapterTitle}
        Contexto: ${description}
        ${bibliographyInstruction}
        
        ${topicInstruction}
        
        ${partInstruction}
        ${contextInstruction}
        ${hookInstruction}
        
        **METAS DE EXTENSÃO (CRÍTICO):**
        - Tempo Alvo deste bloco: ${minutesForThisChunk} minutos.
        - **Contagem de Palavras:** Aprox. ${targetWordCount} palavras.
        - Mantenha um ritmo natural de conversa.
        - Use diálogos fluidos.

        ${closingInstruction}
        
        **PERSONAGENS (ESTRITO):**
        - Use APENAS "Milton Dilts" ou "Roberta Erickson".
        - **PROIBIDO:** Não escreva "(Voz de Enceladus)" ou "(Voz de Aoede)" no texto.
        - O ouvinte não deve saber que é uma IA.
        `;

        try {
             const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: [
                    { role: 'user', parts: [{ text: getPodcastSystemInstruction(lang) }] },
                    { role: 'user', parts: [{ text: userPrompt }] }
                ],
                config: {
                    ...BASE_CONFIG,
                    tools: toolsConfig,
                    responseMimeType: "application/json",
                    thinkingConfig: { thinkingBudget: isDeep ? 8192 : 2048 },
                }
            });
            
            const text = response.text;
            if (!text) continue;
            
            const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
            let parsedData: any;
            try { parsedData = JSON.parse(jsonStr); } catch (e) { continue; }

            let segmentsArray: any[] = [];
            if (Array.isArray(parsedData)) {
                segmentsArray = parsedData;
            } else if (typeof parsedData === 'object' && parsedData !== null) {
                const possibleKey = Object.keys(parsedData).find(k => Array.isArray(parsedData[k]));
                if (possibleKey) segmentsArray = parsedData[possibleKey];
                else if (parsedData.speaker && parsedData.text) segmentsArray = [parsedData];
            }

            const segments: PodcastSegment[] = segmentsArray.map(item => {
                let speakerRaw = item.speaker || "Milton Dilts";
                
                let speakerClean = speakerRaw
                    .replace(/\(Voz de .+\)/gi, '')
                    .replace(/Voz de .+/gi, '')
                    .replace(/\(.*\)/g, '') 
                    .replace(/Enceladus/gi, '')
                    .replace(/Aoede/gi, '')
                    .replace(/narrador/gi, 'Milton Dilts')
                    .replace(/host/gi, 'Milton Dilts')
                    .trim();

                if (!speakerClean) speakerClean = "Milton Dilts";

                let voiceId = "Fenrir"; 
                const lowerSpeaker = speakerRaw.toLowerCase();
                
                if (lowerSpeaker.includes('roberta')) {
                    voiceId = 'Aoede';
                    if (speakerClean === "Milton Dilts") speakerClean = "Roberta Erickson";
                }
                
                return { speaker: speakerClean, voiceId, text: item.text || "", tone: item.tone };
            });
            
            allSegments = [...allSegments, ...segments];

            if (!isFinalChunk && segments.length > 0) {
                const lastFewLines = segments.slice(-4).map(s => `${s.speaker}: ${s.text}`).join('\n');
                previousContext = `Últimas falas:\n${lastFewLines}`;
            }

        } catch (error) {
            console.error(`Error generating podcast chunk ${currentChunk}:`, error);
            throw error;
        }
    }

    return allSegments;
}

export const generateSpeech = async (text: string, voiceIdOrName: string, retries = 3): Promise<string | null> => {
  if (!apiKey) throw new Error("API Key not found.");
  
  const safeText = (text || "").slice(0, 4500); 

  let apiVoiceName = 'Aoede'; 
  const input = voiceIdOrName ? voiceIdOrName.toLowerCase() : '';

  if (input.includes('roberta') || input.includes('aoede') || input.includes('erickson')) {
      apiVoiceName = 'Aoede';
  } else {
      apiVoiceName = 'Fenrir'; 
  }

  if (input.includes('milton') || input.includes('dilts') || input.includes('enceladus')) {
      apiVoiceName = 'Fenrir';
  }

  for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash-preview-tts',
          contents: [{ parts: [{ text: safeText }] }],
          config: {
            responseModalities: [Modality.AUDIO],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: apiVoiceName }, 
              },
            },
          },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        return base64Audio || null;

      } catch (error: any) {
        const isRateLimit = error.message?.includes('429') || error.status === 429 || error.status === 503;
        const isInternalError = error.message?.includes('500') || error.status === 500;
        
        if ((isRateLimit || isInternalError) && attempt < retries - 1) {
            const waitTime = 2000 * Math.pow(2, attempt); 
            console.warn(`TTS Error (${error.status || error.code || 'unknown'}). Retrying in ${waitTime}ms... (Attempt ${attempt + 1}/${retries})`);
            await delay(waitTime);
            continue;
        }

        console.error("Error generating speech:", error);
        return null;
      }
  }
  return null;
};

export const sendChatMessage = async (
    history: ChatMessage[], 
    newMessage: string,
    lang: Language,
    attachment?: { mimeType: string, data: string } | null
): Promise<string> => {
    if (!apiKey) throw new Error("API Key not found.");

    const historyParts = history.map(msg => ({
        role: msg.role,
        parts: [{ text: msg.text }]
    }));

    const systemInstruction = {
        role: 'user',
        parts: [{ text: getCorePersonaInstruction(lang) + "\n\nResponda às dúvidas no idioma " + lang.toUpperCase() + "." }]
    };

    const newMessageParts: any[] = [];
    if (attachment) {
        newMessageParts.push({
            inlineData: { mimeType: attachment.mimeType, data: attachment.data }
        });
        newMessageParts.push({ text: `[Arquivo Anexado]: ${newMessage}` });
    } else {
        newMessageParts.push({ text: newMessage });
    }

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: [
                systemInstruction,
                ...historyParts,
                { role: 'user', parts: newMessageParts }
            ],
             config: BASE_CONFIG
        });
        return response.text || "Não consegui processar a resposta.";
    } catch (error) {
        console.error("Chat error:", error);
        return "Perturbação no campo quântico. Erro ao processar mensagem.";
    }
}

export const generateMarketingStrategy = async (
    subchapterTitle: string,
    subchapterDescription: string,
    lang: Language,
    customTopic: string = "",
    subchapterId?: string
): Promise<MarketingStrategy> => {
    if (!apiKey) throw new Error("API Key not found.");

    const references = (subchapterId && BIBLIOGRAPHY[subchapterId]) ? BIBLIOGRAPHY[subchapterId] : [];
    
    const bibliographySection = references.length > 0
        ? `
        \n[BIBLIOGRAFIA OBRIGATÓRIA]:
        A lista abaixo contém as referências científicas e espirituais deste subcapítulo.
        ${references.map(r => `- ${r}`).join('\n')}
        
        **INSTRUÇÃO IMPORTANTE:** Você DEVE incluir a lista de bibliografia acima NO FINAL do campo 'description'.
        `
        : "";

    let contextPrompt = "";
    let toolsConfig: any = undefined;

    if (customTopic.trim()) {
        contextPrompt = `
        [TEMA PRIORITÁRIO - DEEP RESEARCH]: ${customTopic}
        USE O GOOGLE SEARCH para analisar o que está em alta para o público que fala ${lang.toUpperCase()}.
        `;
        toolsConfig = [{ googleSearch: {} }];
    } else {
        contextPrompt = `
        [TEMA DO VÍDEO]: ${subchapterTitle}
        [CONTEXTO]: ${subchapterDescription}
        `;
    }

    const fullPrompt = `
    ${contextPrompt}
    ${bibliographySection}
    
    Gere a estratégia de SEO em ${lang.toUpperCase()}.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: [
                { role: 'user', parts: [{ text: getSeoAgentInstruction(lang) }] },
                { role: 'user', parts: [{ text: fullPrompt }] }
            ],
            config: {
                ...BASE_CONFIG,
                tools: toolsConfig,
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        optimizedTitle: { type: Type.STRING },
                        description: { type: Type.STRING },
                        tags: { type: Type.STRING },
                        chapters: { type: Type.STRING },
                        viralHook: { type: Type.STRING }
                    },
                    required: ["optimizedTitle", "description", "tags", "chapters"]
                }
            }
        });
        
        const text = response.text || "{}";
        return JSON.parse(text) as MarketingStrategy;

    } catch (error) {
        console.error("Marketing generation error", error);
        throw error;
    }
}

export const generateThumbnailPrompt = async (
    title: string,
    description: string,
    lang: Language
): Promise<string> => {
    if (!apiKey) throw new Error("API Key not found.");
    
    const prompt = `
    TÍTULO: ${title}
    RESUMO: ${description}
    IDIOMA ALVO: ${lang.toUpperCase()}
    
    Gere APENAS o prompt visual.
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-pro-preview',
            contents: [
                { role: 'user', parts: [{ text: getThumbnailAgentInstruction(lang) }] },
                { role: 'user', parts: [{ text: prompt }] }
            ],
            config: BASE_CONFIG
        });
        
        return response.text || "";
    } catch (error) {
        console.error("Thumbnail prompt generation error", error);
        throw error;
    }
}

export const generateThumbnailImage = async (imagePrompt: string): Promise<string | null> => {
    if (!apiKey) throw new Error("API Key not found.");

    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: imagePrompt,
            config: {
                numberOfImages: 1,
                aspectRatio: "16:9",
                outputMimeType: "image/jpeg"
            }
        });

        const base64 = response.generatedImages?.[0]?.image?.imageBytes;
        return base64 || null;
    } catch (error) {
        console.error("Image generation error", error);
        throw error;
    }
}

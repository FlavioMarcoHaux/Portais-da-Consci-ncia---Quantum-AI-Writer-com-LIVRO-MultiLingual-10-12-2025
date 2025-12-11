
import { GoogleGenAI } from "@google/genai";
import { getCorePersonaInstruction } from '../constants';
import { BIBLIOGRAPHY } from '../bibliography';
import { Language } from '../types';

const apiKey = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey || '' });

const BASE_CONFIG = {
  temperature: 0.7, // Um pouco mais baixo para escrita consistente
  topP: 0.95,
  topK: 40,
};

// ---------------------------------------------------------------------------
// BOOK GENERATION (Milton Dilts)
// ---------------------------------------------------------------------------

export const generateBookContent = async (
    chapterTitle: string,
    subchapterTitle: string,
    description: string,
    subchapterId: string,
    lang: Language,
    onChunk: (chunk: string, fullText: string) => void
): Promise<string> => {
    if (!apiKey) throw new Error("API Key not found.");

    const references = BIBLIOGRAPHY[subchapterId] || [];
    const bibliographyInstruction = references.length > 0 
        ? `\n\n**BASE BIBLIOGRÁFICA (Consultar):**\n${references.map(r => `- ${r}`).join('\n')}`
        : "";

    // 4 Chunks x ~650 words = ~2600 words total (20 min reading)
    const TOTAL_CHUNKS = 4;
    let fullContent = "";
    let previousContext = "";

    console.log(`Starting Book Generation (${lang})...`);

    for (let i = 1; i <= TOTAL_CHUNKS; i++) {
        const isFinal = i === TOTAL_CHUNKS;
        
        let specificGoal = "";
        if (i === 1) {
            specificGoal = `
            **FASE DE PRE-TALK E RAPPORT (CRÍTICO):**
            Não comece com "Neste capítulo...". Comece estabelecendo uma conexão profunda e hipnótica com o leitor.
            Use o estilo de Milton Erickson: "E talvez você esteja se perguntando...", "E enquanto você respira...".
            Faça o leitor se sentir seguro e curioso.
            Só depois dessa sintonização (Rapport) introduza o tema do subcapítulo.
            Defina o problema central que vamos explorar, mas de forma envolvente.
            `;
        }
        else if (i === 2) specificGoal = "Aprofundamento teórico, correlações quânticas e casos de uso.";
        else if (i === 3) specificGoal = "Conexão espiritual profunda, exemplos metafóricos e quebra de objeções.";
        else specificGoal = "Conclusão magistral, exercícios práticos de integração e fechamento.";

        const prompt = `
        ${getCorePersonaInstruction(lang)}
        
        ATUE AGORA EXCLUSIVAMENTE COMO: **Milton Dilts (O Escritor)**.
        
        TAREFA: Escrever a PARTE ${i} de ${TOTAL_CHUNKS} do Subcapítulo do livro "Portais da Consciência".
        
        DADOS:
        - Título: ${chapterTitle}
        - Subtítulo: ${subchapterTitle}
        - Contexto: ${description}
        ${bibliographyInstruction}
        
        CONTEXTO ANTERIOR:
        ${previousContext ? `Resumo do que já foi escrito: ${previousContext.slice(-500)}...` : "Este é o início do capítulo."}
        
        OBJETIVO DESTA PARTE (${i}/${TOTAL_CHUNKS}):
        ${specificGoal}
        
        DIRETRIZES DE ESCRITA:
        - **FORMATO VISUAL (IMPORTANTE):** O texto deve ter "cara de livro". Use parágrafos bem estruturados e longos. Use títulos (Markdown ##) para separar seções importantes. Não use listas (bullets) excessivamente, prefira texto corrido.
        - **Estilo:** Literário, Hipnótico, Acadêmico-Espiritual. Use metáforas ricas.
        - **Extensão:** Aprox. 650 palavras.
        - **Continuidade:** O texto deve fluir naturalmente da parte anterior (se houver).
        - NÃO repita o título do capítulo no início do texto. Comece o conteúdo diretamente.
        - **PROIBIDO:** Não se apresente ("Olá, sou Milton"). Assuma que a conexão já existe.
        - ${isFinal ? "Encerre o capítulo com uma reflexão poderosa." : "Não encerre o capítulo. Deixe o gancho para a próxima parte."}
        `;

        try {
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { ...BASE_CONFIG, thinkingConfig: { thinkingBudget: 2048 } }
            });

            const text = response.text || "";
            fullContent += text + "\n\n";
            previousContext = text;
            onChunk(text, fullContent); // Atualiza UI com o texto acumulado correto

        } catch (error) {
            console.error(`Error generating book chunk ${i}`, error);
            throw error;
        }
    }

    return fullContent;
};

// ---------------------------------------------------------------------------
// LECTURE GENERATION (Roberta Erickson)
// ---------------------------------------------------------------------------

export const generateLectureScript = async (
    bookContent: string,
    lang: Language,
    onChunk: (chunk: string, fullScript: string) => void
): Promise<string> => {
    if (!apiKey) throw new Error("API Key not found.");

    // 2 Chunks x ~650 words = ~1300 words (10 min speech)
    const TOTAL_CHUNKS = 2;
    let fullScript = "";
    
    // Resume o conteúdo do livro para caber no contexto se for muito grande
    const contentContext = bookContent.length > 20000 ? bookContent.slice(0, 20000) + "..." : bookContent;

    for (let i = 1; i <= TOTAL_CHUNKS; i++) {
        const isFinal = i === TOTAL_CHUNKS;

        const prompt = `
        ${getCorePersonaInstruction(lang)}
        
        ATUE AGORA EXCLUSIVAMENTE COMO: **Roberta Erickson (A Professora)**.
        
        TAREFA: Criar o Roteiro da Aula Magna (Material Didático) baseada no texto do livro fornecido.
        PARTE ${i} de ${TOTAL_CHUNKS}.
        
        TEXTO BASE DO LIVRO (FONTE):
        ${contentContext.slice(0, 5000)}... (baseie-se nos conceitos chave)
        
        ESTILO DA AULA:
        - Didático, Prático, Estruturado.
        - Você está criando um GUIA DE ESTUDOS para o aluno.
        - Use linguagem clara e direta.
        
        OBJETIVO DESTA PARTE:
        ${i === 1 ? "Introdução, Definição dos Conceitos Chave, Teoria Aplicada." : "Exercícios Práticos, Desafio Semanal, Conclusão Motivacional."}
        
        DIRETRIZES DE FORMATAÇÃO (ESTRITAS):
        - Use Markdown rico.
        - Use Títulos (##) para separar tópicos.
        - Use Listas (-) para enumerar passos ou exercícios.
        - Use Citações (>) para destacar frases importantes (Insights).
        - NÃO use blocos de texto gigantes. Quebre em parágrafos legíveis.
        
        ${isFinal ? "Encerre com uma lista de 3 tarefas práticas para a semana." : "Continue a explicação teórica."}
        `;

        try {
             const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                config: { ...BASE_CONFIG }
            });

            const text = response.text || "";
            fullScript += text + "\n\n";
            onChunk(text, fullScript);

        } catch (error) {
            console.error(`Error generating lecture chunk ${i}`, error);
            throw error;
        }
    }

    return fullScript;
}

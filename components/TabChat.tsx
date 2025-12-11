
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { ChatMessage, Language } from '../types';
import { Sparkles, Send, Paperclip, X, FileText } from 'lucide-react';
import { sendChatMessage } from '../services/geminiService';

interface Attachment {
    file: File;
    data: string; // Base64
    mimeType: string;
}

interface TabChatProps {
    history: ChatMessage[];
    language: Language;
    onUpdate: (history: ChatMessage[]) => void;
}

export const TabChat: React.FC<TabChatProps> = ({ history, language, onUpdate }) => {
    const [input, setInput] = useState('');
    const [attachment, setAttachment] = useState<Attachment | null>(null);
    const [isSending, setIsSending] = useState(false);
    
    const chatEndRef = useRef<HTMLDivElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [history]);

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = () => {
                const result = reader.result as string;
                const base64 = result.split(',')[1];
                setAttachment({
                    file,
                    data: base64,
                    mimeType: file.type
                });
            };
            reader.readAsDataURL(file);
        }
    };

    const clearAttachment = () => {
        setAttachment(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleSend = async () => {
        if ((!input.trim() && !attachment) || isSending) return;
        setIsSending(true);

        const textToSend = input;
        const currentAttachment = attachment;

        let userDisplayMsg = textToSend;
        if (currentAttachment) {
            userDisplayMsg = `[Arquivo: ${currentAttachment.file.name}]\n${textToSend}`;
        }

        const newUserMsg: ChatMessage = { role: 'user', text: userDisplayMsg, id: Date.now().toString() };
        
        const newHistory = [...history, newUserMsg];
        onUpdate(newHistory);
        
        setInput('');
        clearAttachment();

        try {
            const responseText = await sendChatMessage(
                newHistory, 
                textToSend || (currentAttachment ? "Analise este arquivo." : ""), 
                language,
                currentAttachment ? { mimeType: currentAttachment.mimeType, data: currentAttachment.data } : null
            );
            
            const newAiMsg: ChatMessage = { role: 'model', text: responseText, id: (Date.now() + 1).toString() };
            onUpdate([...newHistory, newAiMsg]);
        } catch (e) {
            const errorMsg: ChatMessage = { role: 'model', text: "Perturbação no campo quântico. O arquivo pode ser muito grande ou ocorreu um erro de rede.", id: (Date.now() + 1).toString() };
            onUpdate([...newHistory, errorMsg]);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col h-full bg-[#080808] animate-fade-in relative">
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileSelect} 
                className="hidden" 
                accept=".pdf,image/png,image/jpeg,image/webp,.txt"
            />

            <div className="flex-1 overflow-y-auto p-8 space-y-8 pb-32">
                {history.length === 0 && (
                    <div className="text-center text-neutral-500 mt-20">
                        <Sparkles className="mx-auto mb-4 opacity-30" size={48} />
                        <h2 className="text-xl font-serif-title text-neutral-300 mb-2">Canal Direto com o Messias</h2>
                        <p className="text-lg text-neutral-500 font-medium">
                            Milton Dilts e Roberta Erickson estão online ({language.toUpperCase()}).
                        </p>
                    </div>
                )}
                {history.map((msg) => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] p-5 rounded-2xl ${
                            msg.role === 'user'
                                ? 'bg-cyan-950/50 text-cyan-100 rounded-br-none border border-cyan-700 shadow-[0_4px_15px_-5px_rgba(8,145,178,0.3)]'
                                : 'bg-[#111] text-neutral-200 rounded-bl-none border border-neutral-700 shadow-md'
                        }`}>
                            <ReactMarkdown
                                components={{
                                    p: ({node, ...props}) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                                    strong: ({node, ...props}) => <strong className="font-bold text-white" {...props} />
                                }}
                            >
                                {msg.text}
                            </ReactMarkdown>
                        </div>
                    </div>
                ))}
                {isSending && (
                     <div className="flex justify-start">
                        <div className="bg-[#111] p-4 rounded-2xl rounded-bl-none border border-neutral-700 flex items-center space-x-2 shadow-md">
                             <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }}></div>
                             <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                             <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                        </div>
                     </div>
                )}
                <div ref={chatEndRef} />
            </div>

            <div className="p-6 border-t border-neutral-700 bg-[#080808] absolute bottom-0 w-full shadow-[0_-10px_40px_rgba(0,0,0,0.5)]">
                {attachment && (
                    <div className="absolute -top-12 left-6 bg-neutral-800 text-neutral-200 px-4 py-2 rounded-t-lg border border-neutral-600 border-b-0 flex items-center text-xs shadow-lg animate-fade-in font-bold">
                        <FileText size={14} className="mr-2 text-cyan-400" />
                        <span className="max-w-[200px] truncate font-mono">{attachment.file.name}</span>
                        <span className="ml-2 text-neutral-400">({(attachment.file.size / 1024 / 1024).toFixed(2)} MB)</span>
                        <button 
                            onClick={clearAttachment}
                            className="ml-4 hover:text-red-400 transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                )}

                <div className="relative max-w-4xl mx-auto flex gap-3">
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSending}
                        className={`p-4 rounded-xl border transition-all ${
                            attachment 
                            ? 'bg-cyan-900/30 border-cyan-500/50 text-cyan-400 shadow-lg' 
                            : 'bg-[#050505] border-neutral-600 text-neutral-400 hover:text-neutral-200 hover:border-neutral-500 hover:bg-neutral-900'
                        }`}
                        title="Anexar PDF, Imagem ou Texto"
                    >
                        <Paperclip size={20} />
                    </button>

                    <input
                        type="text"
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        placeholder={attachment ? "Comente sobre o arquivo..." : "Pergunte algo ao campo quântico..."}
                        className="flex-1 bg-[#050505] border border-neutral-600 text-white rounded-xl py-4 px-6 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/50 transition-all placeholder-neutral-500 shadow-inner"
                        disabled={isSending}
                    />
                    
                    <button
                        onClick={handleSend}
                        disabled={(!input.trim() && !attachment) || isSending}
                        className="p-4 bg-cyan-700 text-white rounded-xl hover:bg-cyan-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(8,145,178,0.4)] hover:shadow-[0_0_25px_rgba(34,211,238,0.5)] transform hover:scale-105"
                    >
                        <Send size={20} />
                    </button>
                </div>
            </div>
        </div>
    );
};

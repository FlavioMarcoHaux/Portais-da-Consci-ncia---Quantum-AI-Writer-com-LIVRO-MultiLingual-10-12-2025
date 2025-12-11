import { useRef, useEffect, useState, useCallback } from 'react';

// Helper to convert Base64 to Uint8Array
function base64ToUint8Array(base64: string) {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
}

// Audio decoding helper
async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const bufferCopy = data.buffer.slice(0);
  try {
      return await ctx.decodeAudioData(bufferCopy);
  } catch (e) {
      // Fallback for raw PCM if header detection fails
      const dataInt16 = new Int16Array(data.buffer);
      const frameCount = dataInt16.length / numChannels;
      const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

      for (let channel = 0; channel < numChannels; channel++) {
        const channelData = buffer.getChannelData(channel);
        for (let i = 0; i < frameCount; i++) {
          channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
        }
      }
      return buffer;
  }
}

export const useAudioPlayer = () => {
    const audioContextRef = useRef<AudioContext | null>(null);
    const activeSourceRef = useRef<AudioBufferSourceNode | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);

    useEffect(() => {
        return () => {
            stop();
            if (audioContextRef.current) {
                audioContextRef.current.close();
            }
        };
    }, []);

    const initContext = () => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
        }
        return audioContextRef.current;
    };

    const stop = useCallback(() => {
        if (activeSourceRef.current) {
            try {
                activeSourceRef.current.stop();
            } catch (e) { }
            activeSourceRef.current = null;
        }
        setIsPlaying(false);
    }, []);

    const playBase64 = useCallback(async (base64Audio: string, onEnded?: () => void) => {
        const ctx = initContext();
        
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }
        
        stop();
        setIsPlaying(true);

        try {
            const bytes = base64ToUint8Array(base64Audio);
            const audioBuffer = await decodeAudioData(bytes, ctx, 24000, 1);
            
            const source = ctx.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(ctx.destination);
            source.onended = () => {
                activeSourceRef.current = null;
                setIsPlaying(false);
                if (onEnded) onEnded();
            };
            activeSourceRef.current = source;
            source.start();
        } catch (error) {
            console.error("Audio playback error", error);
            setIsPlaying(false);
            if (onEnded) onEnded();
        }
    }, [stop]);

    const resume = useCallback(async () => {
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
            setIsPlaying(true);
        }
    }, []);

    const suspend = useCallback(async () => {
         if (audioContextRef.current) {
            await audioContextRef.current.suspend();
            setIsPlaying(false);
        }
    }, []);

    return {
        playBase64,
        stop,
        resume,
        suspend,
        isPlaying,
        base64ToUint8Array // Exported helper for downloads
    };
};
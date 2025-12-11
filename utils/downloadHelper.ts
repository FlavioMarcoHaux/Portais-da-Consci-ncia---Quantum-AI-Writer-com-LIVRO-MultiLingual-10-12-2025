
import JSZip from 'jszip';

export const base64ToBlob = (base64: string, type: string) => {
    const binStr = atob(base64);
    const len = binStr.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        arr[i] = binStr.charCodeAt(i);
    }
    return new Blob([arr], { type });
};

export const generateZipPackage = async (filename: string, files: { name: string, data: Blob | string }[]) => {
    const zip = new JSZip();
    
    files.forEach(f => {
        zip.file(f.name, f.data);
    });
    
    const blob = await zip.generateAsync({ type: 'blob' });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
};

// Constrói um Blob WAV válido a partir de array de Blobs PCM/WAV parts
export const createWavBlob = (audioBlobs: Blob[]): Blob | null => {
    if (audioBlobs.length === 0) return null;

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
};

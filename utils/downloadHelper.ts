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
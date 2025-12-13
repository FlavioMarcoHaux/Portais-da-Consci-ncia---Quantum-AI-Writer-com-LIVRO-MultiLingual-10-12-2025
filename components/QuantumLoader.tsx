
import React from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { Language } from '../types';

// We need to inject language here, but since it's often used inside components 
// that already have language access, we can rely on a simple context or just default to EN if not provided,
// BUT since we are updating everything, let's keep it simple: 
// The loader text is generic. However, to be perfect, it should accept a prop or we read from a global context.
// Given the architecture, I'll update it to accept language prop optional, or default to PT.

export const QuantumLoader: React.FC<{ language?: Language }> = ({ language = 'pt' }) => {
  const t = useTranslation(language);
  
  return (
    <div className="flex flex-col items-center justify-center p-10 space-y-4">
      <div className="relative w-24 h-24">
        <div className="absolute inset-0 border-4 border-indigo-500/30 rounded-full animate-ping"></div>
        <div className="absolute inset-2 border-4 border-purple-500/50 rounded-full animate-spin" style={{ animationDuration: '3s' }}></div>
        <div className="absolute inset-4 border-4 border-cyan-400/70 rounded-full animate-spin" style={{ animationDuration: '1.5s', animationDirection: 'reverse' }}></div>
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-4 h-4 bg-white rounded-full shadow-[0_0_15px_white] animate-pulse"></div>
        </div>
      </div>
      <p className="text-cyan-300 font-display tracking-widest text-sm animate-pulse">
        {t.loader}
      </p>
    </div>
  );
};

import React from 'react';

export const QuantumLoader: React.FC = () => {
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
        PROCESSANDO NA MATRIZ QUÂNTICA...
      </p>
    </div>
  );
};
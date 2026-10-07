import React from 'react';

interface ExhibitionFrameProps {
  children: React.ReactNode;
  isGalleryMode: boolean;
}

export const ExhibitionFrame: React.FC<ExhibitionFrameProps> = ({ children, isGalleryMode }) => {
  if (!isGalleryMode) {
    return (
      <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
        {children}
      </div>
    );
  }

  return (
    <div className="relative w-full h-full flex items-center justify-center p-4 md:p-8 bg-[#040406] overflow-hidden">
      {/* Dim museum wall ambient illumination */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at 50% 38%, rgba(28, 32, 45, 0.4) 0%, rgba(3, 4, 7, 0.98) 75%)',
        }}
      />

      {/* Museum Exhibition Frame Container */}
      <div className="relative flex flex-col items-center max-h-[92vh] z-10">
        {/* Floating Fine Art Frame */}
        <div
          className="relative rounded-sm p-3 md:p-4 bg-gradient-to-b from-[#18181b] via-[#101013] to-[#09090b] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] border border-neutral-800/60"
          style={{
            boxShadow: '0 30px 80px rgba(0, 0, 0, 0.85), inset 0 1px 1px rgba(255, 255, 255, 0.1)',
          }}
        >
          {/* Subtle Inner Bevel Liner */}
          <div className="relative p-1 bg-[#060608] border border-neutral-900/80 shadow-inner">
            <div className="relative overflow-hidden w-[310px] h-[551px] sm:w-[360px] sm:h-[640px] md:w-[410px] md:h-[728px] lg:w-[450px] lg:h-[800px]">
              {children}
            </div>
          </div>
        </div>

        {/* Gallery Placard beneath painting */}
        <div className="mt-5 px-5 py-3 rounded bg-neutral-950/80 border border-neutral-800/50 backdrop-blur-md text-center max-w-xs shadow-lg">
          <div className="font-serif-luxury text-sm tracking-[0.2em] text-neutral-200 uppercase font-medium">
            Nocturne in Charcoal & Indigo
          </div>
          <div className="text-[11px] text-neutral-400 mt-0.5 tracking-wider">
            Oil impasto on Belgian linen, 2026
          </div>
          <div className="text-[10px] text-neutral-500 mt-1 italic font-light">
            Continuous kinetic light cycle &middot; 9:16 Vertical
          </div>
        </div>
      </div>

      {/* Gallery floor reflection line */}
      <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-black via-black/80 to-transparent pointer-events-none" />
    </div>
  );
};

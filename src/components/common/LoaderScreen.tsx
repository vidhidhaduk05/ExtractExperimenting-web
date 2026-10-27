import React from 'react';
import { ShimmerSkeleton } from './ShimmerSkeleton';

export type LoaderPreset = 'cards' | 'table' | 'claimscape' | 'article' | 'default';

export interface LoaderScreenProps {
  preset?: LoaderPreset;
  title?: string;
  subtitle?: string;
  fullScreen?: boolean;
  breathing?: boolean;
  className?: string;
}

export const LoaderScreen: React.FC<LoaderScreenProps> = ({
  preset = 'default',
  title = 'Loading content...',
  subtitle = 'Please wait while resources are synthesized',
  fullScreen = false,
  breathing = true,
  className = '',
}) => {
  const containerClass = fullScreen
    ? 'fixed inset-0 z-50 flex flex-col bg-[#fbf9f4]/95 dark:bg-[#1E1E1E]/95 backdrop-blur-sm p-6 md:p-12 overflow-y-auto'
    : 'w-full py-8 px-4 flex flex-col gap-6';

  const breathingClass = breathing ? 'animate-breathing' : '';

  const renderCards = () => (
    <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl mx-auto ${breathingClass}`}>
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="border border-[#d2c2cb] rounded-xl p-5 bg-white shadow-xs flex flex-col gap-4 transition-all"
        >
          <div className="flex items-center gap-3">
            <ShimmerSkeleton circle width={42} height={42} />
            <div className="flex flex-col gap-2 flex-1">
              <ShimmerSkeleton height={16} width="65%" />
              <ShimmerSkeleton height={12} width="40%" />
            </div>
          </div>
          <div className="flex flex-col gap-2 pt-2">
            <ShimmerSkeleton height={14} width="100%" />
            <ShimmerSkeleton height={14} width="92%" />
            <ShimmerSkeleton height={14} width="75%" />
          </div>
          <div className="pt-3 border-t border-[#eee7ec] flex justify-between items-center">
            <ShimmerSkeleton height={20} width={80} borderRadius={6} />
            <ShimmerSkeleton height={28} width={90} borderRadius={8} />
          </div>
        </div>
      ))}
    </div>
  );

  const renderTable = () => (
    <div className={`w-full max-w-6xl mx-auto border border-[#d2c2cb] rounded-xl overflow-hidden bg-white shadow-xs ${breathingClass}`}>
      <div className="p-4 border-b border-[#eee7ec] flex justify-between items-center bg-[#fbf9f4]">
        <ShimmerSkeleton height={24} width={180} />
        <ShimmerSkeleton height={32} width={240} borderRadius={8} />
      </div>
      <div className="divide-y divide-[#eee7ec]">
        {[1, 2, 3, 4, 5, 6, 7].map((row) => (
          <div key={row} className="px-6 py-4 flex items-center gap-4">
            <ShimmerSkeleton width={32} height={20} borderRadius={4} />
            <ShimmerSkeleton height={16} width="35%" />
            <ShimmerSkeleton height={16} width="25%" />
            <ShimmerSkeleton height={16} width="15%" />
            <div className="ml-auto flex gap-2">
              <ShimmerSkeleton width={60} height={24} borderRadius={6} />
              <ShimmerSkeleton width={24} height={24} circle />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderClaimscape = () => (
    <div className={`w-full max-w-5xl mx-auto flex flex-col gap-6 ${breathingClass}`}>
      <div className="border border-[#d2c2cb] rounded-lg p-6 bg-[#fbf9f4] shadow-xs flex flex-col gap-4">
        <ShimmerSkeleton height={24} width={220} borderRadius={4} />
        <ShimmerSkeleton height={48} width="100%" borderRadius={6} />
        <div className="flex gap-4">
          <ShimmerSkeleton height={32} width={160} borderRadius={6} />
          <ShimmerSkeleton height={32} width={160} borderRadius={6} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="border border-[#d2c2cb] p-4 bg-white rounded-md flex flex-col gap-2">
            <ShimmerSkeleton height={12} width="60%" />
            <ShimmerSkeleton height={28} width="40%" />
            <ShimmerSkeleton height={10} width="80%" />
          </div>
        ))}
      </div>
      <div className="border border-[#d2c2cb] h-72 rounded-lg bg-white p-6 flex flex-col justify-between">
        <div className="flex justify-between items-center">
          <ShimmerSkeleton height={18} width={200} />
          <ShimmerSkeleton height={24} width={140} borderRadius={6} />
        </div>
        <div className="grid grid-cols-12 gap-2 my-auto">
          {Array.from({ length: 36 }).map((_, i) => (
            <ShimmerSkeleton key={i} height={14} circle className="mx-auto" />
          ))}
        </div>
        <ShimmerSkeleton height={14} width="45%" />
      </div>
    </div>
  );

  const renderArticle = () => (
    <div className={`w-full max-w-3xl mx-auto flex flex-col gap-6 bg-white border border-[#d2c2cb] p-8 rounded-xl shadow-xs ${breathingClass}`}>
      <ShimmerSkeleton height={36} width="85%" />
      <div className="flex items-center gap-3">
        <ShimmerSkeleton circle width={36} height={36} />
        <div className="flex flex-col gap-1.5 flex-1">
          <ShimmerSkeleton height={14} width={160} />
          <ShimmerSkeleton height={11} width={100} />
        </div>
      </div>
      <div className="flex flex-col gap-3 pt-4 border-t border-[#eee7ec]">
        <ShimmerSkeleton height={16} width="100%" />
        <ShimmerSkeleton height={16} width="96%" />
        <ShimmerSkeleton height={16} width="92%" />
        <ShimmerSkeleton height={16} width="98%" />
        <ShimmerSkeleton height={16} width="70%" />
      </div>
      <div className="flex flex-col gap-3 pt-2">
        <ShimmerSkeleton height={16} width="95%" />
        <ShimmerSkeleton height={16} width="100%" />
        <ShimmerSkeleton height={16} width="65%" />
      </div>
    </div>
  );

  return (
    <div className={`${containerClass} ${className}`} role="status" aria-label={title}>
      {(title || subtitle) && (
        <div className="max-w-6xl mx-auto w-full mb-2 flex items-center justify-between">
          <div>
            <h3
              className="text-base font-semibold text-[#141413] tracking-tight"
              style={{ fontFamily: 'Serifon Editorial, Georgia, serif' }}
            >
              {title}
            </h3>
            {subtitle && <p className="text-xs text-[#62535d] mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-[#4f444b] bg-[#eee7ec] border border-[#d2c2cb] px-3 py-1.5 rounded-full">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#814d75] opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#3a0f34] breathing-glow" />
            </span>
            <span className="font-serif italic text-[#3a0f34]">Loading</span>
          </div>
        </div>
      )}

      {preset === 'cards' && renderCards()}
      {preset === 'table' && renderTable()}
      {preset === 'claimscape' && renderClaimscape()}
      {preset === 'article' && renderArticle()}
      {preset === 'default' && renderCards()}
    </div>
  );
};

/**
 * BreathingLoader Component
 * Lightweight breathing pulse loader for inline, card-level, or page-level loading states.
 */
export const BreathingLoader: React.FC<{
  label?: string;
  sublabel?: string;
  className?: string;
}> = ({ label = 'Loading...', sublabel, className = '' }) => {
  return (
    <div
      role="status"
      aria-label={label}
      className={`flex flex-col items-center justify-center p-8 gap-3 animate-breathing ${className}`}
    >
      <div className="relative flex items-center justify-center">
        <div className="w-12 h-12 rounded-full border-2 border-[#d2c2cb] border-t-[#3a0f34] animate-spin" />
        <div className="absolute w-8 h-8 rounded-full bg-[#814d75]/15 breathing-glow flex items-center justify-center">
          <div className="w-3 h-3 rounded-full bg-[#3a0f34]" />
        </div>
      </div>
      <div className="text-center">
        <p
          className="text-sm font-semibold text-[#3a0f34] tracking-tight"
          style={{ fontFamily: 'Serifon Editorial, Georgia, serif' }}
        >
          {label}
        </p>
        {sublabel && <p className="text-xs text-[#62535d] mt-0.5">{sublabel}</p>}
      </div>
    </div>
  );
};

export default LoaderScreen;

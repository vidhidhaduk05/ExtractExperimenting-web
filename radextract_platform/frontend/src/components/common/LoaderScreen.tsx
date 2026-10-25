import React from 'react';
import { ShimmerSkeleton } from './ShimmerSkeleton';

export type LoaderPreset = 'cards' | 'table' | 'claimscape' | 'article' | 'default';

export interface LoaderScreenProps {
  preset?: LoaderPreset;
  title?: string;
  subtitle?: string;
  fullScreen?: boolean;
  className?: string;
}

export const LoaderScreen: React.FC<LoaderScreenProps> = ({
  preset = 'default',
  title = 'Loading content...',
  subtitle = 'Please wait while resources are synthesized',
  fullScreen = false,
  className = '',
}) => {
  const containerClass = fullScreen
    ? 'fixed inset-0 z-50 flex flex-col bg-white/90 dark:bg-gray-950/90 backdrop-blur-sm p-6 md:p-12 overflow-y-auto'
    : 'w-full py-8 px-4 flex flex-col gap-6';

  const renderCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-6xl mx-auto">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div
          key={i}
          className="border border-gray-200 dark:border-gray-800 rounded-xl p-5 bg-white dark:bg-gray-900 shadow-xs flex flex-col gap-4"
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
          <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
            <ShimmerSkeleton height={20} width={80} borderRadius={6} />
            <ShimmerSkeleton height={28} width={90} borderRadius={8} />
          </div>
        </div>
      ))}
    </div>
  );

  const renderTable = () => (
    <div className="w-full max-w-6xl mx-auto border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden bg-white dark:bg-gray-900 shadow-xs">
      <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
        <ShimmerSkeleton height={24} width={180} />
        <ShimmerSkeleton height={32} width={240} borderRadius={8} />
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
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
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-6">
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
    <div className="w-full max-w-3xl mx-auto flex flex-col gap-6 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 p-8 rounded-xl shadow-xs">
      <ShimmerSkeleton height={36} width="85%" />
      <div className="flex items-center gap-3">
        <ShimmerSkeleton circle width={36} height={36} />
        <div className="flex flex-col gap-1.5 flex-1">
          <ShimmerSkeleton height={14} width={160} />
          <ShimmerSkeleton height={11} width={100} />
        </div>
      </div>
      <div className="flex flex-col gap-3 pt-4 border-t border-gray-100 dark:border-gray-800">
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
            <h3 className="text-base font-semibold text-gray-800 dark:text-gray-200">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-3 py-1.5 rounded-full">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
            Loading
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

export default LoaderScreen;

import React from 'react';
import './ShimmerSkeleton.css';

export interface ShimmerSkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  circle?: boolean;
  className?: string;
}

/**
 * ShimmerSkeleton: Reusable loading placeholder with 4-line core CSS sweep effect.
 */
export const ShimmerSkeleton: React.FC<ShimmerSkeletonProps> = ({
  width,
  height,
  borderRadius,
  circle = false,
  className = '',
  style,
  ...props
}) => {
  const inlineStyle: React.CSSProperties = {
    ...style,
    ...(width !== undefined ? { width: typeof width === 'number' ? `${width}px` : width } : {}),
    ...(height !== undefined ? { height: typeof height === 'number' ? `${height}px` : height } : {}),
    ...(circle
      ? { borderRadius: '50%' }
      : borderRadius !== undefined
      ? { borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius }
      : {}),
  };

  return (
    <div
      className={`shimmer-skeleton ${className}`}
      style={inlineStyle}
      aria-hidden="true"
      {...props}
    />
  );
};

export default ShimmerSkeleton;

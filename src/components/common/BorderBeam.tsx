import React from "react";
import { cn } from "../../lib/utils";

export interface BorderBeamProps {
  children?: React.ReactNode;
  active?: boolean;
  size?: number;
  duration?: number;
  borderWidth?: number;
  colorFrom?: string;
  colorTo?: string;
  delay?: number;
  className?: string;
  containerClassName?: string;
}

/**
 * BorderBeam Component
 * Renders an animated glowing border beam traveling around the perimeter of any card or container.
 * When active={false}, the beam is dormant, rendering the container cleanly.
 *
 * Usage pattern 1 (as wrapper):
 *   <BorderBeam active={false}>
 *     <Card>Content</Card>
 *   </BorderBeam>
 *
 * Usage pattern 2 (as self-contained overlay inside a relative card):
 *   <div className="relative overflow-hidden rounded-xl">
 *     <BorderBeam active={true} />
 *     <div>Content</div>
 *   </div>
 */
export function BorderBeam({
  children,
  active = true,
  size = 200,
  duration = 8,
  borderWidth = 1.5,
  colorFrom = "#814d75", // Master Theme Editorial Plum
  colorTo = "#ffdea6",   // Master Theme Pale Amber Accent
  delay = 0,
  className,
  containerClassName,
}: BorderBeamProps) {
  const beamOverlay = (
    <div
      data-testid="border-beam-overlay"
      data-active={active ? "true" : "false"}
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] overflow-hidden",
        !active && "opacity-0 pointer-events-none transition-opacity duration-300",
        className
      )}
      style={
        {
          padding: `${borderWidth}px`,
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          mask: "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          maskComposite: "exclude",
        } as React.CSSProperties
      }
    >
      {active && (
        <div
          data-testid="border-beam-rotator"
          className="absolute -top-[100%] -left-[100%] w-[300%] h-[300%] animate-border-beam"
          style={
            {
              "--duration": `${duration}s`,
              animationDelay: `${delay}s`,
              background: `conic-gradient(from 0deg, transparent 0deg, transparent 270deg, ${colorFrom} 320deg, ${colorTo} 360deg)`,
            } as React.CSSProperties
          }
        />
      )}
    </div>
  );

  // If wrapping children, wrap in a relative container with rounded-[inherit]
  if (children) {
    return (
      <div className={cn("relative rounded-xl overflow-hidden", containerClassName)}>
        {children}
        {beamOverlay}
      </div>
    );
  }

  return beamOverlay;
}

export default BorderBeam;

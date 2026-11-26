import React from "react";

export interface GameTitleProps {
  text: string;
  type: "exit" | "report" | "profile" | "skip" | "inactive" | "choose" | "miniboard";
  className?: string; // Tailwind text size class, e.g., "text-[34px]", "text-[42px]"
  arabicDisplay?: boolean;
}

const ARABIC_OUTLINE_RADIUS_EM = 0.075;
const ARABIC_DEPTH_OFFSET_EM = 0.14;
const ARABIC_SHADOW_DIRECTIONS = 24;

function buildSmoothTextShadow(
  radiusEm: number,
  directions: number,
  color: string,
  extraOffsetsYEm: number[] = []
): string {
  const shadows: string[] = [];
  const offsetsY = [0, ...extraOffsetsYEm];

  for (const dy of offsetsY) {
    for (let i = 0; i < directions; i++) {
      const angle = (i * 2 * Math.PI) / directions;
      const x = (Math.cos(angle) * radiusEm).toFixed(4);
      const y = (dy + Math.sin(angle) * radiusEm).toFixed(4);
      shadows.push(`${x}em ${y}em 0 ${color}`);
    }
  }

  return shadows.join(", ");
}

export default function GameTitle({ text, type, className = "text-[34px]", arabicDisplay = false }: GameTitleProps) {
  // Centralized theme color pairing for game titles
  const getColors = () => {
    switch (type) {
      case "exit":
        return arabicDisplay
          ? { color: "#FFB300", stroke: "#0F3957" }
          : { color: "#FFFFFF", stroke: "#FFB300" };
      case "report":
        return arabicDisplay
          ? { color: "#FB923C", stroke: "#0F3957" }
          : { color: "#FFFFFF", stroke: "#FB923C" };
      case "profile":
        return { color: "#FFFFFF", stroke: "#4F46E5" };
      case "skip":
        return { color: "#FFFFFF", stroke: "#38BDF8" };
      case "inactive":
        return arabicDisplay
          ? { color: "#818CF8", stroke: "#2E2882" }
          : { color: "#FFFFFF", stroke: "#818CF8" };
      case "choose":
      case "miniboard":
        return { color: "#FFFFFF", stroke: "#2E2882" };
      default:
        return { color: "#38BDF8", stroke: "#0F3957" };
    }
  };

  const { color, stroke } = getColors();
  const depthOffset = arabicDisplay ? `${ARABIC_DEPTH_OFFSET_EM}em` : "2.5px";
  const arabicOutlineShadow = arabicDisplay
    ? buildSmoothTextShadow(ARABIC_OUTLINE_RADIUS_EM, ARABIC_SHADOW_DIRECTIONS, stroke)
    : undefined;
  const arabicDepthShadow = arabicDisplay
    ? buildSmoothTextShadow(ARABIC_OUTLINE_RADIUS_EM, ARABIC_SHADOW_DIRECTIONS, stroke, [
        -(ARABIC_DEPTH_OFFSET_EM * 0.5),
      ])
    : undefined;
  const textStyle: React.CSSProperties = arabicDisplay
    ? {
        fontFamily: "inherit",
        fontWeight: 900,
        letterSpacing: "normal",
      }
    : {
        fontFamily: "'Fredoka', 'Inter', sans-serif",
      };

  const layer3OutlineStyle: React.CSSProperties = arabicDisplay
    ? {
        color: stroke,
        textShadow: arabicDepthShadow,
      }
    : ({
        color: stroke,
        WebkitTextStroke: `3.5px ${stroke}`,
        textStroke: `3.5px ${stroke}`,
        paintOrder: "stroke fill",
      } as React.CSSProperties);

  const layer2OutlineStyle: React.CSSProperties = arabicDisplay
    ? {
        color: stroke,
        textShadow: arabicOutlineShadow,
      }
    : ({
        color: stroke,
        WebkitTextStroke: `3.5px ${stroke}`,
        textStroke: `3.5px ${stroke}`,
        paintOrder: "stroke fill",
      } as React.CSSProperties);

  return (
    <div 
      dir={arabicDisplay ? "rtl" : undefined}
      className={`relative inline-block select-none ${arabicDisplay ? "tracking-normal leading-[1.15]" : "font-black tracking-widest uppercase leading-none"} text-center ${className}`}
      style={textStyle}
    >
      {/* 
        🎨 1. Layer 3: Background 3D Block Layer (الطبقة الخلفية ثلاثية الأبعاد)
        Placed at the very bottom. Drawn using the stroke color for both fill and the thick round outline.
        Shifted downwards using transform to build a fully solid, gapless, and unified 3D base block.
      */}
      <span
        dir={arabicDisplay ? "rtl" : undefined}
        className="absolute top-0 left-0 w-full h-full block text-center"
        style={{
          ...textStyle,
          ...layer3OutlineStyle,
          transform: `translate(0px, ${depthOffset})`,
          WebkitTransform: `translate(0px, ${depthOffset})`,
          pointerEvents: "none",
        }}
      >
        {text}
      </span>

      {/* 
        🎨 2. Layer 2: Middle Outline Layer (الطبقة الوسطى المحددة للحدود)
        Acts as the relative block layout anchor to define natural dimensions in the DOM flow.
        Renders the outer border outline in the normal, unshifted location.
      */}
      <span
        dir={arabicDisplay ? "rtl" : undefined}
        className="block"
        style={{
          ...textStyle,
          ...layer2OutlineStyle,
        }}
      >
        {text}
      </span>

      {/* 
        🎨 3. Layer 1: Foreground Layer (الطبقة الأمامية الصافية)
        Sits at the very top of the stack, overlaying the smooth inner letters in pristine, high-contrast color.
      */}
      <span
        dir={arabicDisplay ? "rtl" : undefined}
        className="absolute top-0 left-0 w-full h-full block text-center"
        style={{
          ...textStyle,
          color: color,
          pointerEvents: "none",
        }}
      >
        {text}
      </span>
    </div>
  );
}


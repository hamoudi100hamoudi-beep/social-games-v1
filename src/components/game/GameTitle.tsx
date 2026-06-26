import React from "react";

export interface GameTitleProps {
  text: string;
  type: "exit" | "report" | "profile" | "skip" | "inactive";
  className?: string; // Tailwind text size class, e.g., "text-[34px]", "text-[42px]"
}

export default function GameTitle({ text, type, className = "text-[34px]" }: GameTitleProps) {
  // Centralized theme color pairing for game titles
  const getColors = () => {
    switch (type) {
      case "exit":
        return { color: "#FFB300", stroke: "#0F3957" };
      case "report":
        return { color: "#FB923C", stroke: "#0F3957" };
      case "profile":
        return { color: "#FFFFFF", stroke: "#4F46E5" };
      case "skip":
        return { color: "#38BDF8", stroke: "#0F3957" };
      case "inactive":
        return { color: "#818CF8", stroke: "#2E2882" };
      default:
        return { color: "#38BDF8", stroke: "#0F3957" };
    }
  };

  const { color, stroke } = getColors();

  return (
    <div 
      className={`relative inline-block select-none font-black tracking-widest uppercase text-center leading-none ${className}`}
      style={{ fontFamily: "'Fredoka', 'Inter', sans-serif" }}
    >
      {/* 
        🎨 1. Layer 3: Background 3D Block Layer (الطبقة الخلفية ثلاثية الأبعاد)
        Placed at the very bottom. Drawn using the stroke color for both fill and the thick 5px round outline.
        Shifted downwards by 3px using transform to build a fully solid, gapless, and unified 3D base blocks.
      */}
      <span
        className="absolute top-0 left-0 w-full h-full block text-center"
        style={{
          color: stroke,
          WebkitTextStroke: `5px ${stroke}`,
          textStroke: `5px ${stroke}`,
          paintOrder: "stroke fill",
          transform: "translate(0px, 3px)",
          WebkitTransform: "translate(0px, 3px)",
          pointerEvents: "none",
        }}
      >
        {text}
      </span>

      {/* 
        🎨 2. Layer 2: Middle Outline Layer (الطبقة الوسطى المحددة للحدود)
        Acts as the relative block layout anchor to define natural dimensions in the DOM flow.
        Renders the perfect 5px round outer border outline in the normal, unshifted location.
      */}
      <span
        className="block"
        style={{
          color: stroke,
          WebkitTextStroke: `5px ${stroke}`,
          textStroke: `5px ${stroke}`,
          paintOrder: "stroke fill",
        }}
      >
        {text}
      </span>

      {/* 
        🎨 3. Layer 1: Foreground Layer (الطبقة الأمامية الصافية)
        Sits at the very top of the stack, overlaying the smooth inner letters in pristine, high-contrast color.
      */}
      <span
        className="absolute top-0 left-0 w-full h-full block text-center"
        style={{
          color: color,
          pointerEvents: "none",
        }}
      >
        {text}
      </span>
    </div>
  );
}


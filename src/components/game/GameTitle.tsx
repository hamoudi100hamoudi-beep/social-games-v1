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
        🎨 1. Background Layer (الطبقة الخلفية):
        Draws the ultra-smooth, thick round border using standard browser text stroke,
        and adds the clean 3D solid shadow extrusion directed straight downwards.
        Both stroke and fill of this layer share the stroke color, eliminating any
        aliasing artifacts, overlaps, or transparent bleeding.
      */}
      <span
        className="block"
        style={{
          color: stroke,
          WebkitTextStroke: `8px ${stroke}`,
          textStroke: `8px ${stroke}`,
          paintOrder: "stroke fill",
          textShadow: `
            0px 1px 0px ${stroke},
            0px 2px 0px ${stroke},
            0px 3px 0px ${stroke},
            0px 4px 0px ${stroke},
            0px 5px 0px ${stroke},
            0px 6px 0px ${stroke}
          `,
        }}
      >
        {text}
      </span>

      {/* 
        🎨 2. Foreground Layer (الطبقة الأمامية):
        Sits perfectly on top of the background layer.
        Displays the crisp, untampered inner characters with zero aliasing,
        ensuring 100% legibility and absolute softness on both old and new devices.
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

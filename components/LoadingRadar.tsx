"use client";
import React from "react";

/**
 * Adapted from a Uiverse.io radar sweep component — recolored from
 * "seagreen" to the app's Nigerian-green brand color for consistency
 * with the rest of the accent color usage.
 */
const LoadingRadar: React.FC = () => {
  return (
    <div className="relative flex items-center justify-center w-[150px] h-[150px] rounded-full border border-[#333] shadow-[25px_25px_75px_rgba(0,0,0,0.55)] overflow-hidden">
      <div className="absolute inset-5 rounded-full border border-dashed border-[#444] shadow-[inset_-5px_-5px_25px_rgba(0,0,0,0.25),inset_5px_5px_35px_rgba(0,0,0,0.25)]" />

      <div className="absolute w-[50px] h-[50px] rounded-full border border-dashed border-[#444] shadow-[inset_-5px_-5px_25px_rgba(0,0,0,0.25),inset_5px_5px_35px_rgba(0,0,0,0.25)]" />

      <span className="absolute top-1/2 left-1/2 w-1/2 h-full bg-transparent origin-top-left border-t border-dashed border-white animate-[radar81_2s_linear_infinite]">
        <span className="absolute top-0 left-0 w-full h-full bg-[#008751] origin-top-left rotate-[-55deg] blur-[30px] drop-shadow-[20px_20px_20px_#008751]" />
      </span>

      <style jsx>{`
        @keyframes radar81 {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default LoadingRadar;
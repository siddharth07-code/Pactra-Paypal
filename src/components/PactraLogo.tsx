import React from "react";
import Image from "next/image";

interface PactraLogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
  variant?: "full" | "mark" | "lockup";
  markOnly?: boolean;
}

export function PactraLogo({
  className = "",
  size = "md",
  variant = "lockup",
  markOnly = false,
}: PactraLogoProps) {
  const markDimensions = size === "sm" ? 24 : size === "lg" ? 36 : 28;
  const textSize = size === "sm" ? "text-[14px]" : size === "lg" ? "text-[20px]" : "text-[16px]";

  if (markOnly || variant === "mark") {
    return (
      <span
        className={`inline-flex items-center justify-center shrink-0 select-none ${className}`}
        style={{ width: markDimensions, height: markDimensions }}
      >
        <Image
          src="/brand/pactra-mark.png"
          alt="PACTRA"
          width={markDimensions}
          height={markDimensions}
          className="w-full h-full object-contain"
        />
      </span>
    );
  }

  return (
    <span className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <span
        className="inline-flex items-center justify-center shrink-0"
        style={{ width: markDimensions, height: markDimensions }}
      >
        <Image
          src="/brand/pactra-mark.png"
          alt=""
          width={markDimensions}
          height={markDimensions}
          className="w-full h-full object-contain"
        />
      </span>
      <span className={`font-semibold tracking-[-0.03em] text-text-primary ${textSize}`}>
        PACTRA
      </span>
    </span>
  );
}

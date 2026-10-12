import React from "react";
import { cn } from "@/lib/utils";

export interface QronosGlyphProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  size?: number;
}

export function QronosGlyph({
  size = 28,
  className,
  alt = "Qronos AI",
  ...props
}: QronosGlyphProps) {
  return (
    <img
      src="/images/qronos-logo-square.png"
      alt={alt}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={cn("object-contain rounded-md select-none pointer-events-none", className)}
      {...props}
    />
  );
}

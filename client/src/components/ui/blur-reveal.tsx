import React, { Children } from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cn } from "@/lib/utils";

export interface BlurRevealProps extends HTMLMotionProps<"div"> {
  children: React.ReactNode;
  delay?: number;
  duration?: number;
  blur?: string;
  yOffset?: number;
  className?: string;
}

/**
 * BlurReveal component inspired by Inspira UI / Magic UI.
 * Smoothly animates content entrance with a blur fade and vertical translation.
 */
export function BlurReveal({
  children,
  delay = 0.2,
  duration = 0.75,
  blur = "20px",
  yOffset = 20,
  className = "",
  ...props
}: BlurRevealProps) {
  const childArray = Children.toArray(children);

  if (childArray.length > 1) {
    return (
      <div className={cn(className)} {...(props as any)}>
        {childArray.map((child, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, filter: `blur(${blur})`, y: yOffset }}
            animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
            transition={{
              delay: delay + index * 0.12,
              duration,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {child}
          </motion.div>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, filter: `blur(${blur})`, y: yOffset }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }}
      transition={{
        delay,
        duration,
        ease: [0.22, 1, 0.36, 1],
      }}
      className={cn(className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export default BlurReveal;

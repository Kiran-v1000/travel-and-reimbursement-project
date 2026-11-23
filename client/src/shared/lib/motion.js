// Shared motion presets. Durations follow 150-250ms UI / 200ms page guidance;
// framer-motion honours prefers-reduced-motion via MotionConfig in providers.
export const ease = [0.16, 1, 0.3, 1];

export const page = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.24, ease } },
  exit: { opacity: 0, y: -4, transition: { duration: 0.14 } },
};

export const list = {
  animate: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
};

export const item = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.22, ease } },
  exit: { opacity: 0, x: -12, transition: { duration: 0.16 } },
};

export const pop = {
  initial: { opacity: 0, scale: 0.97, y: 6 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.22, ease } },
  exit: { opacity: 0, scale: 0.98, y: 4, transition: { duration: 0.14 } },
};

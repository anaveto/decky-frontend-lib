import { CSSProperties, FC } from 'react';

import { Export, findModuleExport } from '../webpack';

export interface MarqueeProps {
  play?: boolean;
  direction?: 'left' | 'right';
  speed?: number;
  delay?: number;
  fadeLength?: number;
  center?: boolean;
  resetOnPause?: boolean;
  style?: CSSProperties;
  className?: string;
  children: React.ReactNode;
}

// old || vite
export const Marquee: FC<MarqueeProps> = findModuleExport(
  (e: Export) =>
    (e?.toString && e.toString?.().includes('.Marquee') && e.toString?.().includes('--fade-length')) ||
    (typeof e == 'function' && e.toString().includes('"--fade-length-left"')),
);

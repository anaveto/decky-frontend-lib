import { FC, ReactNode } from 'react';

import { Export, findModuleDetailsByExport } from '../webpack';

// TODO where did this go?
// export const Panel: FC<{ children?: ReactNode; }> = findModuleExport((e: Export) => {
//   if (typeof mod !== 'object' || !mod.__esModule) return undefined;
//   return mod.Panel;
// });

export interface PanelSectionProps {
  title?: string;
  spinner?: boolean;
  children?: ReactNode;
}

const [mod, panelSection] = findModuleDetailsByExport((e: Export) => e.toString?.()?.includes('.PanelSection'));

// Vite builds of Steam inline the class names, so match the props instead
const [viteScope, vitePanelSection, vitePanelSectionName] = mod
  ? [undefined, undefined, undefined]
  : findModuleDetailsByExport(
      (e: Export) =>
        typeof e == 'function' &&
        /^function [\w$]*\([\w$]\)\{const\{title:[\w$]+,children:[\w$]+\}=[\w$]+;/.test(e.toString()) &&
        e.toString().includes('.spinner&&'),
    );

// The row is a generic div component: take the one Steam nests directly in its panel sections most often
function findVitePanelSectionRow() {
  if (!viteScope) return undefined;
  const nested = new RegExp(
    `\\(${vitePanelSectionName.replace(/\$/g, '\\$')},\\{[^{}]*?children:\\[?\\(0,[\\w$]+\\.jsxs?\\)\\(([\\w$]+),`,
    'g',
  );
  const counts = new Map<string, number>();
  for (const e of Object.values(viteScope)) {
    if (typeof e != 'function') continue;
    for (const match of e.toString().matchAll(nested)) counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  const [name] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [];
  return name && viteScope[name];
}

export const PanelSection = (panelSection ?? vitePanelSection) as FC<PanelSectionProps>;

export interface PanelSectionRowProps {
  children?: ReactNode;
}
export const PanelSectionRow = (mod
  ? Object.values(mod).filter((exp: any) => !exp?.toString?.()?.includes('.PanelSection'))[0]
  : findVitePanelSectionRow()) as FC<PanelSectionRowProps>;

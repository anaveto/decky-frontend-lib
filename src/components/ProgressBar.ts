import { ReactNode, FC } from 'react';

import { Export, findModuleExport } from '../webpack';
import { ItemProps } from './Item';
import { createPropListRegex } from '../utils';

export interface ProgressBarItemProps extends ItemProps {
  indeterminate?: boolean;
  nTransitionSec?: number;
  nProgress?: number;
  focusable?: boolean;
}

export interface ProgressBarProps {
  indeterminate?: boolean;
  nTransitionSec?: number;
  nProgress?: number;
  focusable?: boolean;
}

export interface ProgressBarWithInfoProps extends ProgressBarItemProps {
  /** Timestamp of the completion time, has to be divided by 1000 */
  rtEstimatedCompletionTime?: number;
  sOperationText?: ReactNode;
}

// old || vite
export const ProgressBar = findModuleExport((e: Export) =>
  (e?.toString && /\.ProgressBar,(?:\w*==)?"standard"(?:==)?/.test(e.toString?.())) ||
  (typeof e == 'function' && e.toString().includes('role:"progressbar"') && e.toString().includes('nTransitionSec')),
) as FC<ProgressBarProps>;

export const ProgressBarWithInfo = findModuleExport((e: Export) =>
  // new || old || vite
  e?.toString?.()?.includes('.ProgressBarFieldStatus,children') || e?.toString?.()?.includes('.ProgressBarFieldStatus},') ||
  (typeof e == 'function' && e.toString().includes('rtEstimatedCompletionTime:') && e.toString().includes('childrenContainerWidth:')),
) as FC<ProgressBarWithInfoProps>;

const progressBarItemRegex = createPropListRegex(["indeterminate", "nTransitionSec", "nProgress"]);
export const ProgressBarItem = findModuleExport((e: Export) =>
  e?.toString && progressBarItemRegex.test(e.toString?.()),
) as FC<ProgressBarItemProps>;

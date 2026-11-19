import type { FC, ReactNode } from 'react';
import type { PopupCreationOptions } from '../globals/stores/popupmanager';
import { type Export, findModuleByExport, findModuleDetailsByExport, findModuleExport, modules } from '../webpack';
import type { FooterLegendProps } from './FooterLegend';

// Separate interface, since one of webpack module exports uses this exact object,
// so maybe it could be reused elsewhere.
interface MonitorOptions {
  targetMonitor: {
    flMonitorScale: number;
    nScreenLeft: number;
    nScreenTop: number;
    nScreenWidth: number;
    nScreenHeight: number;
  };
  flGamepadScale: number;
}

export interface ContextMenuCreationOptions extends PopupCreationOptions, Partial<MonitorOptions> {
  /**
   * When {@link bForcePopup} is true, makes the window appear above everything else.
   */
  bAlwaysOnTop?: boolean;

  /**
   * Disables the mouse overlay, granting the ability to click anywhere while
   * the menu's active.
   */
  bDisableMouseOverlay?: boolean;

  /**
   * Disables the {@link bPreferPopTop} behavior.
   */
  bDisablePopTop?: boolean;

  bFitToWindow?: boolean;

  /**
   * Forces the menu to open in a separate window instead of inside the parent.
   */
  bForcePopup?: boolean;

  /**
   * Like {@link bMatchWidth}, but don't shrink below the menu's minimum width.
   */
  bGrowToElementWidth?: boolean;

  /**
   * Match the parent's exact height.
   */
  bMatchHeight?: boolean;

  /**
   * Match the parent's exact width.
   */
  bMatchWidth?: boolean;

  /**
   * Set to `true` to not focus the menu when shown.
   */
  bNoFocusWhenShown?: boolean;

  /**
   * Makes the menu **invisible**, instead of getting removed from the DOM.
   */
  bRetainOnHide?: boolean;

  bScreenCoordinates?: boolean;

  /**
   * Set to `true` to not account for the parent's width.
   */
  bOverlapHorizontal?: boolean;

  /**
   * Set to `true` to not account for the parent's height.
   */
  bOverlapVertical?: boolean;

  /**
   * Set to `true` to make the entire menu try to appear on the left side from
   * the parent.
   */
  bPreferPopLeft?: boolean;

  /**
   * Set to `true` to make the entire menu try to appear above the parent.
   */
  bPreferPopTop?: boolean;

  bShiftToFitWindow?: boolean;

  // different window creation flags (StandaloneContextMenu vs PopupContextMenu,
  // so OverrideRedirect vs PopUpMenuHint in EPopupCreationFlags)
  bStandalone?: boolean;

  /**
   * Class name **replacement** for the container element, i.e. it replaces the
   * default class.
   */
  strClassName?: string;
}

interface ContextMenuInstance {
  Hide(): void;
  Show(): void;
}

export const showContextMenu: (
  children: ReactNode,
  parent?: EventTarget,
  options?: ContextMenuCreationOptions,
) => ContextMenuInstance = findModuleExport(
  (e: Export) =>
    typeof e === 'function' &&
    e.toString?.().includes('GetContextMenuManagerFromWindow(') &&
    e.toString?.().includes('.CreateContextMenuInstance('),
);

export interface MenuProps extends FooterLegendProps {
  label: string;
  onCancel?(): void;
  cancelText?: string;
  children?: ReactNode;
}

// Vite builds of Steam have no menu module: find the menu item class, then the components Steam nests it in
const viteScope = modules.get('vite');
const viteMenuItemName = viteScope && Object.keys(viteScope).find((name) => {
  const e = viteScope[name];
  return typeof e == 'function' && e.prototype?.OnOKButton && e.prototype?.OnMouseEnter && e.toString().includes('onDisabledItemSelected');
});

function findViteMenuParent(filter: (source: string) => boolean) {
  if (!viteMenuItemName) return undefined;
  const parent = new RegExp(
    `\\(([\\w$]+),\\{[^{}]*?children:\\[?\\(0,[\\w$]+\\.jsxs?\\)\\(${viteMenuItemName.replace(/\$/g, '\\$')},`,
    'g',
  );
  const counts = new Map<string, number>();
  for (const e of Object.values(viteScope)) {
    if (typeof e != 'function') continue;
    for (const match of e.toString().matchAll(parent)) counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  }
  const [name] = [...counts].sort((a, b) => b[1] - a[1]).find(([name]) => filter(viteScope[name]?.toString?.() ?? '')) ?? [];
  return name && viteScope[name];
}

const MenuModule = viteScope
  ? undefined
  : findModuleDetailsByExport((e: Export) => e?.render?.toString()?.includes('bPlayAudio:') || (e?.prototype?.OnOKButton && e?.prototype?.OnMouseEnter));

export const Menu: FC<MenuProps> = viteScope
  ? findViteMenuParent((source) => source.includes('useId') && source.includes('labelId'))
  : findModuleExport((e: Export) => e?.prototype?.HideIfSubmenu && e?.prototype?.HideMenu) || // Legacy Menu
	(Object.values(MenuModule?.[0] ?? {}).find((e) => e?.toString?.()?.includes?.(`useId`) && e?.toString?.()?.includes?.(`labelId`)) as FC<MenuProps>); // New Menu 6/15/2025

export interface MenuGroupProps {
  label: string;
  disabled?: boolean;
  children?: ReactNode;
}

// New || Old 9/14/2026
const MenuGroupModule = !viteScope && findModuleByExport(e => e?.prototype?.Focus && e?.prototype?.OnOKButton && (e?.prototype?.render?.toString().includes?.(`this.props.tone=="emphasis"`) || e?.prototype?.render?.toString().includes?.(`"emphasis"==this.props.tone`)));
export const MenuGroup: FC<MenuGroupProps> = viteScope
  ? findViteMenuParent((source) => source.includes('bInGamepadUI:'))
  : MenuGroupModule && Object.values(MenuGroupModule).find((e: Export) => typeof e == "function" && e?.toString?.()?.includes("bInGamepadUI:"));
export interface MenuItemProps extends FooterLegendProps {
  bInteractableItem?: boolean;
  onClick?(evt: Event): void;
  onSelected?(evt: Event): void;
  onMouseEnter?(evt: MouseEvent): void;
  onMoveRight?(): void;
  selected?: boolean;
  disabled?: boolean;
  bPlayAudio?: boolean;
  tone?: 'positive' | 'emphasis' | 'destructive';
  children?: ReactNode;
}

export const MenuItem: FC<MenuItemProps> = viteScope ? viteMenuItemName && viteScope[viteMenuItemName] : MenuModule?.[1];

export const MenuSeparator: FC = findModuleExport(
  (e: Export) => typeof e === 'function' && /className:.+?\.ContextMenuSeparator/.test(e.toString?.()),
);

/*
all().map(m => {
if (typeof m !== "object") return undefined;
for (let prop in m) { if (m[prop]?.prototype?.OK && m[prop]?.prototype?.Cancel && m[prop]?.prototype?.render) return m[prop]}
}).find(x => x)
*/

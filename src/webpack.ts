import Logger from './logger';

declare global {
  interface Window {
    webpackChunksteamui: any;
    deckyViteModules?: Record<string, any>;
  }
}

const logger = new Logger('Webpack');

// In most case an object with getters for each property. Look for the first call to r.d in the module, usually near or at the top.
export type ModuleID = string; // number string
export type Module = any;
export type Export = any;
type FilterFn = (module: any) => boolean;
type ExportFilterFn = (moduleExport: any, exportName?: any) => boolean;
type FindFn = (module: any) => any;

export let modules = new Map<ModuleID, Module>();

// Vite builds of Steam (Rolldown + Oxc) print string literals as template literals and destructure with let.
// Present function source the way the existing filters expect it.
function normalizeFunctionSource() {
  const fnToString = Function.prototype.toString;
  const templateLiteral = /`(?:[^`\\]|\\[\s\S])*`/g;
  const toPlainString = (literal: string) =>
    literal.includes('${') || /["\\\n]/.test(literal) ? literal : `"${literal.slice(1, -1)}"`;
  const cache = new WeakMap<Function, string>();
  Function.prototype.toString = function (this: Function) {
    const source = fnToString.call(this);
    if (!source.includes('`') && !source.includes('let{')) return source;
    let normalized = cache.get(this);
    if (normalized === undefined) {
      normalized = source.replace(templateLiteral, toPlainString).replace(/\blet\{/g, 'const{');
      cache.set(this, normalized);
    }
    return normalized;
  };
}

// Vite builds of Steam have no webpack module registry. The loader collects the top-level bindings of Steam's main
// chunk into window.deckyViteModules: every object binding becomes a module, and all bindings together form one more.
function initViteModuleCache(bindings: Record<string, any>) {
  normalizeFunctionSource();
  const scope: Record<string, any> = {};
  for (const [name, value] of Object.entries(bindings)) {
    if (value == null || typeof value === 'symbol') continue;
    try {
      if (typeof value.toString !== 'function') continue;
      value.toString();
    } catch (e) {
      continue;
    }
    scope[name] = value;
    if (typeof value === 'object' && !Array.isArray(value) && !value.$$typeof && value !== window && !(value instanceof Node)) {
      modules.set(name, value);
    }
  }
  modules.set('vite', scope);
}

function initModuleCache() {
  const startTime = performance.now();
  logger.group('Webpack Module Init');
  if (!window.webpackChunksteamui && window.deckyViteModules) {
    initViteModuleCache(window.deckyViteModules);
    logger.groupEnd(`Vite modules initialized in ${performance.now() - startTime}ms...`);
    return;
  }
  // Webpack 5
  // Generate a fake module ID
  const id = Symbol("@decky/ui");
  let webpackRequire!: ((id: any) => Module) & { m: object };
  // Insert our module in a new chunk.
  // The module will then be called with webpack's internal require function as its first argument
  window.webpackChunksteamui.push([
    [id],
    {},
    (r: any) => {
      webpackRequire = r;
    },
  ]);

  logger.log(
    'Initializing all modules. Errors here likely do not matter, as they are usually just failing module side effects.',
  );

  // Loop over every module ID
  for (let id of Object.keys(webpackRequire.m)) {
    try {
      const module = webpackRequire(id);
      if (module) {
        modules.set(id, module);
      }
    } catch (e) {
      logger.debug('Ignoring require error for module', id, e);
    }
  }

  logger.groupEnd(`Modules initialized in ${performance.now() - startTime}ms...`);
}

initModuleCache();

export const findModule = (filter: FilterFn) => {
  for (const m of modules.values()) {
    if (m.default && filter(m.default)) return m.default;
    if (filter(m)) return m;
  }
};

export const findModuleDetailsByExport = (
  filter: ExportFilterFn,
  minExports?: number,
): [module: Module | undefined, moduleExport: any, exportName: any, moduleID: string | undefined] => {
  for (const [id, m] of modules) {
    if (!m) continue;
    for (const mod of [m.default, m]) {
      // special cases
      if (typeof mod !== 'object') continue;
      if (mod == window) continue; // wtf
      if (minExports && Object.keys(mod).length < minExports) continue;

      for (let exportName in mod) {
        if (mod?.[exportName]) {
          try {
            const filterRes = filter(mod[exportName], exportName);
            if (filterRes) {
              return [mod, mod[exportName], exportName, id];
            } else {
              continue;
            }
          } catch (e) {
            logger.warn("Webpack filter threw exception: ", e, "Filter: ", filter);
          }
        }
      }
    }
  }
  return [undefined, undefined, undefined, undefined];
};

export const findModuleByExport = (filter: ExportFilterFn, minExports?: number) => {
  return findModuleDetailsByExport(filter, minExports)?.[0];
};

export const findModuleExport = (filter: ExportFilterFn, minExports?: number) => {
  return findModuleDetailsByExport(filter, minExports)?.[1];
};

/**
 * @deprecated use findModuleExport instead
 */
export const findModuleChild = (filter: FindFn) => {
  logger.warn("findModuleChild is deprecated and will be removed soon. Use findModuleExport instead. Used in:", new Error().stack?.substring(5))
  for (const m of modules.values()) {
    for (const mod of [m.default, m]) {
      const filterRes = filter(mod);
      if (filterRes) {
        return filterRes;
      } else {
        continue;
      }
    }
  }
};

/**
 * @deprecated use createModuleMapping instead
 */
export const findAllModules = (filter: FilterFn) => {
  logger.warn("findAllModules is deprecated and will be removed soon. Use createModuleMapping instead. Used in:", new Error().stack?.substring(5))
  const out = [];

  for (const m of modules.values()) {
    if (m.default && filter(m.default)) out.push(m.default);
    if (filter(m)) out.push(m);
  }

  return out;
};

export const createModuleMapping = (filter: FilterFn) => {
  const mapping = new Map<ModuleID, Module>();

  for (const [id, m] of modules) {
    if (m.default && filter(m.default)) mapping.set(id, m.default);
    if (filter(m)) mapping.set(id, m);
  }

  return mapping;
};

export const CommonUIModule = findModule((m: Module) => {
  if (typeof m !== 'object') return false;
  for (let prop in m) {
    if (m[prop]?.contextType?._currentValue && Object.keys(m).length > 60) return true;
  }
  return false;
});

// The Spinner icon of Vite builds of Steam, which inline its class name
export const viteSpinnerRegex = /\("path",\{d:"M18 10C17\.4696 10 16\.9609 9\.78929/;

export const IconsModule = findModuleByExport(
  (e) => e?.toString && /Spinner\),children:\[\(0,\w+\.jsx\)\("path",\{d:"M18 /.test(e.toString?.()) || /Spinner\)}\)?,.\.createElement\(\"path\",{d:\"M18 /.test(e.toString?.()) || viteSpinnerRegex.test(e?.toString?.()),
);

export const ReactRouter = findModuleByExport((e) => e.computeRootMatch);

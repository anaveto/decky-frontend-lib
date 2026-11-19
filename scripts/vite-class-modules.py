#!/usr/bin/env python3
"""Rebuild Steam's CSS class modules for Vite builds of the Steam client.

Vite builds inline the hashed class names and keep no class modules. This script pairs every class name of the
last webpack build with its name in a Vite build: equal CSS rules in both builds name the same classes, and the
Vite JavaScript declares the names of one CSS module in the order of the webpack module's keys.

Usage: vite-class-modules.py WEBPACK_STEAMUI VITE_STEAMUI OUT_TS [OUT_PAIRS_JSON]
"""
import collections, glob, json, os, re, sys

CLASS = re.compile(r'\.(-?[_a-zA-Z][_a-zA-Z0-9-]*)')
CLASS_VALUE = re.compile(r'^-?[_a-zA-Z][_a-zA-Z0-9-]*$')
KEY = r'(?:[\w$]+|"[^"]+")'
VITE_NAME = r'["`](_?-?[A-Za-z0-9_-]{10,12}-)["`]'


def css_rules(text, path):
    text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
    out, stack, buf = [], [], ''
    for c in text:
        if c == '{':
            stack.append(buf.strip())
            buf = ''
        elif c == '}':
            if stack:
                sel = stack.pop()
                if buf.strip() and not sel.startswith('@'):
                    out.append((tuple(s for s in stack if s.startswith('@media')), sel, buf.strip(), path))
            buf = ''
        else:
            buf += c
    return out


def load_css(steamui):
    rules = []
    for path in sorted(glob.glob(os.path.join(steamui, 'css', '*.css'))):
        rules += css_rules(open(path, encoding='utf-8', errors='replace').read(), path)
    return rules


def webpack_class_modules(steamui):
    modules = []
    for path in sorted(glob.glob(os.path.join(steamui, '*.js'))):
        source = open(path, encoding='utf-8', errors='replace').read()
        for m in re.finditer(r'exports=\{((?:' + KEY + r':"[^"]*",?)+)\}', source):
            modules.append({k.strip('"'): v for k, v in re.findall('(' + KEY + r'):"([^"]*)"', m.group(1))})
    return modules


def vite_name_runs(steamui):
    run = re.compile(r'(?:[\w$]+\s*=\s*' + VITE_NAME + r'\s*,\s*)+[\w$]+\s*=\s*' + VITE_NAME)
    one = re.compile(r'[\w$]+\s*=\s*' + VITE_NAME)
    runs = []
    for path in sorted(glob.glob(os.path.join(steamui, '*.js'))):
        source = open(path, encoding='utf-8', errors='replace').read()
        runs += [one.findall(m.group(0)) for m in run.finditer(source)]
    return runs


def declarations(decl, level):
    parts = [x.strip() for x in decl.split(';') if x.strip()]
    if level == 'exact':
        return ';'.join(sorted(x.replace(' ', '') for x in parts))
    if level == 'props':
        return ','.join(sorted({x.split(':', 1)[0].strip().split('-')[0] for x in parts if ':' in x}))
    return ''


def skeleton(sel, shared, known):
    names, anchors = [], 0
    sel = re.sub(r'\s*([>+~,])\s*', r'\1', re.sub(r'\s+', ' ', sel.strip())).replace('::', ':')

    def sub(m):
        nonlocal anchors
        n = m.group(1)
        if n in shared:
            return '.' + n
        if n in known:
            anchors += 1
            return '.=' + known[n]
        names.append(n)
        return '.\0'
    return CLASS.sub(sub, sel), names, anchors


def loci(old, new, mapping, window=15):
    new_file = {}
    for _, sel, _, path in new:
        for n in CLASS.findall(sel):
            new_file.setdefault(n, path)
    out = []
    for i, rule in enumerate(old):
        votes = collections.Counter()
        for _, sel, _, path in old[max(0, i - window):i + window + 1]:
            if path == rule[3]:
                votes.update(new_file[mapping[n]] for n in CLASS.findall(sel) if n in mapping and mapping[n] in new_file)
        out.append(votes.most_common(1)[0][0] if votes else None)
    return out


def align_css(old, new):
    shared = {n for r in old for n in CLASS.findall(r[1])} & {n for r in new for n in CLASS.findall(r[1])}
    mapping = {}
    old_locus, new_locus = [None] * len(old), [r[3] for r in new]
    levels = [(lo, base) for lo in (False, True) for base in ('exact', 'props', 'selector')]
    while True:
        for use_locus, base in levels:
            if use_locus and not any(old_locus):
                old_locus = loci(old, new, mapping)
            known_new = {y: y for y in mapping.values()}

            def index(rules, known, locus):
                idx = collections.defaultdict(list)
                for rule, lo in zip(rules, locus):
                    sk, names, anchors = skeleton(rule[1], shared, known)
                    if names and (base != 'selector' or anchors) and (not use_locus or lo):
                        idx[(rule[0], sk, declarations(rule[2], base), lo if use_locus else None)].append(names)
                return idx
            oi, ni = index(old, mapping, old_locus), index(new, known_new, new_locus)
            votes = collections.defaultdict(collections.Counter)
            for key, olist in oi.items():
                nlist = ni.get(key)
                if nlist and len(olist) == 1 and len(nlist) == 1 and len(olist[0]) == len(nlist[0]):
                    for x, y in zip(olist[0], nlist[0]):
                        votes[x][y] += 1
            found = {}
            for x, c in votes.items():
                top = c.most_common(2)
                if len(top) == 1 or top[1][1] < top[0][1]:
                    found[x] = top[0][0]
            taken = set(mapping.values())
            count = collections.Counter(found.values())
            added = {x: y for x, y in found.items() if x not in mapping and y not in taken and count[y] == 1}
            if added:
                mapping.update(added)
                if use_locus:
                    old_locus = loci(old, new, mapping)
                break
        else:
            return mapping


def fill_from_js(runs, modules, mapping):
    keylists = [[v for v in m.values() if CLASS_VALUE.match(v)] for m in modules]
    while True:
        pos = {}
        for mi, keys in enumerate(keylists):
            for ki, v in enumerate(keys):
                pos.setdefault(v, []).append((mi, ki))
        inverse = {v: o for o, v in mapping.items()}
        added = {}
        for run in runs:
            anchors = [(i, pos[inverse[n]][0]) for i, n in enumerate(run) if n in inverse and len(pos.get(inverse[n], [])) == 1]
            bounded = [(-1, (None, -1))] + anchors + [(len(run), (None, -1))]
            for (p, (ma, ka)), (q, (mb, kb)) in zip(bounded, bounded[1:]):
                if ma is not None and ma == mb:
                    gap_old = keylists[ma][ka + 1:kb] if kb > ka else None
                elif ma is None and mb is not None:
                    gap_old = keylists[mb][:kb]
                elif ma is not None and mb is None:
                    gap_old = keylists[ma][ka + 1:]
                else:
                    gap_old = None
                gap_new = run[p + 1:q]
                if gap_old and len(gap_new) == len(gap_old) \
                        and not any(n in inverse for n in gap_new) and not any(o in mapping for o in gap_old):
                    added.update(zip(gap_old, gap_new))
        taken = set(mapping.values())
        added = {o: n for o, n in added.items() if n not in taken and o not in mapping}
        if not added:
            return mapping
        mapping.update(added)


def main(webpack_steamui, vite_steamui, out_ts, out_pairs=None):
    mapping = align_css(load_css(webpack_steamui), load_css(vite_steamui))
    css_count = len(mapping)
    modules = webpack_class_modules(webpack_steamui)
    mapping = fill_from_js(vite_name_runs(vite_steamui), modules, mapping)
    rebuilt = []
    for m in modules:
        if len(m) > 1000 or not any(v in mapping for v in m.values()):
            continue
        rebuilt.append({k: mapping[v] if CLASS_VALUE.match(v) else v for k, v in m.items() if v in mapping or not CLASS_VALUE.match(v)})
    with open(out_ts, 'w') as fp:
        fp.write('export default ' + json.dumps(rebuilt, separators=(',', ':')) + ' as Record<string, string>[];\n')
    if out_pairs:
        with open(out_pairs, 'w') as fp:
            json.dump(mapping, fp, separators=(',', ':'), sort_keys=True)
    print(f'{css_count} names from CSS, {len(mapping) - css_count} from JS, {len(rebuilt)} of {len(modules)} modules', file=sys.stderr)


if __name__ == '__main__':
    main(*sys.argv[1:])

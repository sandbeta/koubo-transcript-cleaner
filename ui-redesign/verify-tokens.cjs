/* 令牌体检：直接解析交付文件里的 CSS，把令牌还原成 hex 后按 WCAG 公式实算。
   为什么这么验：本机 headless 浏览器通道（Chrome/Edge、截图与 print-to-pdf）本轮全部只出 0 字节，
   量不到真实几何；颜色这条至少能脱离渲染引擎算准，且算的是文件里的值，不是文档里写的值。
   用法：node verify-tokens.cjs [目标文件]   默认审产品本体（皮肤已在里面）；审原型传 ui-redesign/koubo-ui-redesign.html */
const fs = require('fs');
const path = require('path');
const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'koubo-transcript-cleaner.html');
const src = fs.readFileSync(file, 'utf8');

/* ---------- 合并样式层：产品样式 + 后置皮肤，按文档顺序拼，后写的赢 ---------- */
const styleTags = [...src.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)];
const layers = styleTags.map(m => m[2]);
const layerIds = styleTags.map(m => m[1].trim());   /* 皮肤层靠注入时打的 id 认，不靠某个令牌名 */
/* 注释必须先去掉再解析：选择器文本里混进注释会让 at-rule 判定失效（@media 前的一句注释
   就导致暗色档整块没被扫到，亮/夜两栏算出同一组数——本版实测踩过） */
const cssAll = layers.join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
const file2 = path.relative(process.cwd(), file);

/* ---------- 解析 CSS 变量：按文档顺序合并，并把「亮档」与「暗档」分开 ----------
   坑：@media (prefers-color-scheme: dark){ :root{…} } 里嵌套的也是一个 :root 块，
   用「正则抓所有 :root」会把暗档值混进亮档，于是亮档色板等于没测过（本版实测踩过）。
   所以这里做真正的括号配对解析，按父层 at-rule 判定档位。 */
function scan(seg, isDark, out, chain) {
  let k = 0;
  while (k < seg.length) {
    const o = seg.indexOf('{', k);
    if (o < 0) break;
    const sel = seg.slice(k, o).trim();
    let d = 1, c = o + 1;
    while (c < seg.length && d > 0) { if (seg[c] === '{') d++; else if (seg[c] === '}') d--; c++; }
    const body = seg.slice(o + 1, c - 1);
    /* 把整条 at-rule 祖先链记下来：像素皮肤的亮色覆盖是 prefers-color-scheme:light，
       只认 dark 的话这层会被当成基档。注意是「接在」传入链后面，不能覆盖掉。 */
    const here = chain ? chain + ' > ' + sel : sel;
    const dark = isDark || /prefers-color-scheme:\s*dark/.test(sel) || /\[data-theme=["']?dark/.test(sel);
    if (/@/.test(sel)) scan(body, dark, out, here);
    else out.push({ sel, body, dark, chain: here });
    k = c;
  }
  return out;
}
function varsOf(body) {
  const o = {};
  [...body.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)[;}]/g)].forEach(m => { o[m[1]] = m[2].trim(); });
  return o;
}
const rootBlocks = scan(cssAll, false, []).filter(b => /:root|\[data-theme/.test(b.sel));
/* 档位模型要分清「基档」与「覆盖档」：稿纸台皮肤是亮档为底 + 暗色覆盖，像素皮肤反过来
   （暗档为底 + prefers-color-scheme:light 覆盖）。早先只按 dark 标记分档，把像素质质的
   亮色覆盖当成了基档，于是"夜稿"那几行一直显示的是亮色值——量的是错的档位还照样全绿。 */
const base = {}, lightOv = {}, darkOv = {};
for (const b of rootBlocks) {
  const v = varsOf(b.body);
  if (/prefers-color-scheme:\s*light/.test(b.chain || '')) Object.assign(lightOv, v);
  else if (b.dark) Object.assign(darkOv, v);
  else Object.assign(base, v);
}
const light = Object.assign({}, base, lightOv);   /* 浅色档最终生效值 */
const dark = Object.assign({}, base, darkOv);     /* 深色档最终生效值 */
const hasLight = Object.keys(base).length > 0;
if (!hasLight) { console.log('FAIL  解析不到任何 :root 令牌：' + file); process.exit(1); }
const hasDark = Object.keys(darkOv).length > 0 || Object.keys(lightOv).length > 0;
console.log('令牌块 ' + rootBlocks.length + ' 个（基档 ' + Object.keys(base).length +
  ' / 浅色覆写 ' + Object.keys(lightOv).length + ' / 深色覆写 ' + Object.keys(darkOv).length + '）');

/* 长度类令牌（--target:28px）不参与颜色解析，单独走这条 */
function lenOf(name, map, d) {
  d = d || 0;
  const v = map[name];
  if (v == null || d > 8) return null;
  const ref = v.match(/var\((--[\w-]+)\)/);
  if (ref) return lenOf(ref[1], map, d + 1);
  return v;
}

function resolve(name0, map, depth) {
  const name = name0[0] === '-' ? name0 : '--' + name0;   /* 传 'ink-primary' 也要能解 */
  depth = depth || 0;
  let v = map[name];
  if (v == null) return null;
  if (depth > 8) return null;
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return resolve(ref[1], map, depth + 1);
  if (/^#[0-9a-f]{3,8}$/i.test(v)) return v;
  const m = v.match(/(#[0-9a-f]{3,8})/i);
  return m ? m[1] : null;
}

/* ---------- WCAG ---------- */
function rgb(hex) {
  let c = hex.replace('#', '');
  if (c.length === 3) c = c.split('').map(x => x + x).join('');
  if (c.length === 8) c = c.slice(0, 6);
  return c.match(/../g).map(x => parseInt(x, 16));
}
function lum(hex) {
  return rgb(hex).map(v => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); })
    .reduce((a, v, i) => a + [0.2126, 0.7152, 0.0722][i] * v, 0);
}
function ratio(a, b) { const x = lum(a), y = lum(b); const [hi, lo] = x > y ? [x, y] : [y, x]; return (hi + 0.05) / (lo + 0.05); }

/* ---------- 该过的组合：两套命名都要覆盖 ----------
   原型用语义名（ink-primary / surface-app…），产品+皮肤用产品名（--text-1 / --bg-page…）。
   解不出的一方直接跳过，不算失败——否则同一份脚本审不了两种文件。 */
const PAIRS = [
  /* [档位, 前景, 背景, 需求, 说明] */
  ['light', 'ink-primary', 'surface-app', 4.5], ['light', 'ink-primary', 'surface-paper', 4.5],
  ['light', 'ink-ui', 'surface-app', 4.5], ['light', 'ink-muted', 'surface-app', 4.5],
  ['light', 'ink-muted', 'surface-panel', 4.5], ['light', 'action-text', 'surface-select', 4.5],
  ['light', 'ink-on-action', 'action', 4.5], ['light', 'ink-on-solid', 'action', 4.5],
  ['light', 'ink-on-solid', '--action-hover', 4.5], ['light', 'ink-on-solid', 'flag-mark', 4.5],
  ['light', 'flag-must', 'surface-paper', 4.5], ['light', 'flag-mark', 'surface-paper', 4.5],
  ['light', 'keep', 'surface-paper', 4.5], ['light', 'quote', 'surface-paper', 4.5],
  ['light', '--p-red-800', '--c-pill-red', 4.5], ['light', '--p-org-800', '--c-pill-org', 4.5],
  ['light', '--p-grn-800', '--c-pill-grn', 4.5], ['light', '--p-blue-700', '--c-pill-blue', 4.5],
  ['light', 'edge-field', 'surface-paper', 3.0], ['light', 'focus', 'surface-paper', 3.0],
  /* 产品令牌名（皮肤重映射之后必须仍然达标） */
  ['light', '--text-1', '--bg-card', 4.5],
  ['light', '--text-3', '--bg-sub', 4.5], ['light', '--accent-ink', '--bg-card', 4.5],
  ['light', '--ink-on-solid', '--accent', 4.5], ['light', '--hit', '--bg-card', 4.5],
  ['light', '--bad', '--bg-card', 4.5], ['light', '--ok', '--bg-card', 4.5],
  ['light', '--accent-ink', '--surface-select', 4.5], ['light', '--focus', '--bg-card', 3.0],
  ['light', '--edge-field', '--bg-card', 3.0], ['light', '--p-org-800', '--p-org-50', 4.5],
  ['light', '--p-red-800', '--p-red-50', 4.5], ['light', '--p-grn-800', '--p-grn-50', 4.5],
  ['light', '--p-blue-700', '--p-blue-50', 4.5],
  ['dark', 'ink-primary', 'surface-app', 4.5], ['dark', 'ink-primary', 'surface-paper', 4.5],
  ['dark', 'ink-ui', 'surface-app', 4.5], ['dark', 'ink-muted', 'surface-app', 4.5],
  ['dark', 'action-text', 'surface-select', 4.5], ['dark', 'ink-on-action', 'action', 4.5],
  ['dark', 'ink-on-solid', 'action', 4.5], ['dark', 'ink-on-solid', '--action-hover', 4.5],
  ['dark', 'ink-on-solid', 'flag-mark', 4.5],
  ['dark', 'flag-must', 'surface-paper', 4.5], ['dark', 'flag-mark', 'surface-paper', 4.5],
  ['dark', 'keep', 'surface-paper', 4.5], ['dark', 'quote', 'surface-paper', 4.5],
  ['dark', 'edge-field', 'surface-paper', 3.0], ['dark', 'focus', 'surface-paper', 3.0],
['dark', '--text-1', '--bg-card', 4.5],
  ['dark', '--text-2', '--bg-page', 4.5], ['dark', '--text-3', '--bg-page', 4.5],
  ['dark', '--accent-ink', '--bg-card', 4.5], ['dark', '--ink-on-solid', '--accent', 4.5],
  ['dark', '--hit', '--bg-card', 4.5], ['dark', '--bad', '--bg-card', 4.5],
  ['dark', '--ok', '--bg-card', 4.5], ['dark', '--focus', '--bg-card', 3.0],
  ['dark', '--p-org-800', '--p-org-50', 4.5], ['dark', '--p-red-800', '--p-red-50', 4.5],
  ['dark', '--p-grn-800', '--p-grn-50', 4.5]
];

const checks = PAIRS.map(([scope, fg, bg, need]) => [
  scope === 'light' ? '日稿' : '夜稿',
  scope === 'light' ? light : dark, fg, bg, need
]).filter(([ , map, fg, bg ]) => resolve(fg, map) && resolve(bg, map));

const skipped = PAIRS.length - checks.length;
let fail = 0;
console.log('文件 ' + path.relative(process.cwd(), file));
console.log('对比度（从文件 CSS 里解析出的实际值算；解不出的组合跳过 ' + skipped + ' 个）');
console.log('档位      前景 → 背景'.padEnd(46) + '实测     需 ≥   判定');
for (const [scope, map, fgName, bgName, need] of checks) {
  const fg = resolve(fgName, map), bg = resolve(bgName, map);
  const r = ratio(fg, bg);
  const ok = r >= need;
  if (!ok) fail++;
  console.log((ok ? '  ' : '✗ ') + (scope + ' ' + fgName + ' ' + fg + ' → ' + bgName + ' ' + bg).padEnd(48) +
    r.toFixed(2).padStart(6) + ':1  ' + need.toFixed(1) + '   ' + (ok ? 'OK' : '不达标'));
}

/* ---------- 令牌纪律：裸色值分「产品历史遗留」与「皮肤新写的」两层报 ----------
   产品原样式里两百多处硬写十六进制，本次是后置皮肤嫁接、不改它，所以历史遗留只报数不判失败；
   皮肤层必须 0 处，否则以后暗色档跟不动。 */
function stripTokens(css) {
  return css
    .replace(/:root\s*\{[\s\S]*?\n\s*\}/g, '')
    .replace(/\[data-theme="dark"\]\s*\{[\s\S]*?\n\}/g, '')
    .replace(/@media \(prefers-color-scheme: dark\)\s*\{[\s\S]*?\n\s*\}\s*\}/g, '');
}
const HEXRULE = /(?:background|color|border-color|outline-color|fill|stroke)\s*:\s*([^;]*#[0-9a-fA-F]{3,8}[^;]*)/g;
/* 皮肤层改名：外置构建叫 skin-v3，并入产品本体后叫 stardew。
   两个都认——上次改成"认标记不认令牌名"就是为了别再靠猜颜色判断皮肤存不存在。 */
const skinIdx = layerIds.findIndex(a => /skin-v3|stardew/.test(a));
/* 产品本体必须有皮肤层，缺了就是 sync 没跑；原型（没有 id="selftest"）本来就单层，不算缺陷 */
if (skinIdx < 0 && /<script id="selftest">/.test(src)) {
  console.log('FAIL  找不到皮肤层（skin-v3 / stardew 都没有）：' + path.relative(process.cwd(), file));
  process.exit(1);
}
const legacyCss = stripTokens(layers.slice(0, skinIdx < 0 ? layers.length : skinIdx).join('\n'));
const legacy = [...legacyCss.matchAll(HEXRULE)].map(m => m[1].trim());
const skinCss = skinIdx >= 0 ? stripTokens(layers.slice(skinIdx).join('\n')) : '';
const naked = [...skinCss.matchAll(HEXRULE)].map(m => m[1].trim());
console.log('\n裸色值：产品历史层 ' + legacy.length + ' 处（本次不改，仅登记为技术债），皮肤层 ' + naked.length + ' 处' +
  (naked.length ? '\n  ' + [...new Set(naked)].join('\n  ') : '（皮肤层 OK）'));
if (naked.length) fail++;

/* ---------- 带 alpha 的颜色：先按底色合成再算，且解不出必须硬失败 ----------
   上面那个 PAIRS 循环对解不出的组合是「静默跳过」，而 resolve() 只认十六进制，
   遇到 rgba() 就返回 null。跳过等于这条颜色从来没被量过——皮肤里 --berry-line
   （删除线常态）、--focus-ring、--bevel-* 全是 rgba。所以单开一段，不允许可选。
   放在 skinIdx 之后：它要靠"有没有皮肤层"决定自己该不该跑，写前面会撞 const 的暂时性死区。 */
function parseColor(v0, map, depth) {
  if (v0 == null) return null;
  depth = depth || 0;
  if (depth > 8) return null;
  const v = String(v0).trim();
  const ref = v.match(/^var\((--[\w-]+)\)$/);
  if (ref) return parseColor(map[ref[1]] == null ? null : map[ref[1]], map, depth + 1);
  let m = v.match(/^#([0-9a-f]{3,8})$/i);
  if (m) {
    let c = m[1]; if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const b = [c.slice(0, 2), c.slice(2, 4), c.slice(4, 6)].map(x => parseInt(x, 16));
    return { rgb: b, a: c.length === 8 ? parseInt(c.slice(6, 8), 16) / 255 : 1 };
  }
  m = v.match(/^rgba?\(([^)]+)\)$/i);
  if (m) {
    const p = m[1].split(/[,\/\s]+/).filter(Boolean);
    const b = p.slice(0, 3).map(x => x.endsWith('%') ? Math.round(parseFloat(x) * 2.55) : Math.round(parseFloat(x)));
    return { rgb: b, a: p.length > 3 ? parseFloat(p[3]) : 1 };
  }
  return null;
}
const overRGBA = (fg, bg) => ({ rgb: fg.rgb.map((c, i) => Math.round(c * fg.a + bg.rgb[i] * (1 - fg.a))), a: 1 });
const hexOf = c => '#' + c.rgb.map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, '0')).join('');
/* 删除线属于"理解界面状态所必需的图形"，按非文本对照 3.0 卡。
   --focus-ring 故意不列：它的 3:1 责任由同一条规则里的 border-color: var(--focus) 承担
   （PAIRS 里 --focus → --bg-card 实测 5.18:1），环本身只是加厚强调。
   把环也拉来卡 3:1，只会逼人把环刷成一块不透明的蓝——那是拿门禁当目标函数。 */
const ALPHA_PAIRS = [['--berry-line', '--bg-card', 3.0, '删除线常态']];
console.log('\n带 alpha 的颜色（先按底色合成再算；解不出直接判失败，不许静默跳过）');
if (skinIdx < 0) {
  /* "文件里没有这个令牌"和"有但解不出/不达标"是两件事。前者按层的有无判——
     这些是皮肤独有令牌，原型没有皮肤层；后者才硬失败。
     混成一条规则，就会要么漏量、要么把原型判死。 */
  console.log('  跳过：本文件没有皮肤层，--berry-line 之类是皮肤令牌');
} else ALPHA_PAIRS.forEach(([fgN, bgN, need, label]) => {
  ['light', 'dark'].forEach(sc => {
    const map = sc === 'light' ? light : dark;
    const rawFg = map[fgN], rawBg = map[bgN];
    if (rawFg == null || rawBg == null) {
      fail++;
      console.log('✗ ' + (sc + ' ' + label).padEnd(24) + '解不出：' + (rawFg == null ? fgN : bgN) + ' 不在令牌表里');
      return;
    }
    const fg = parseColor(rawFg, map), bg = parseColor(rawBg, map);
    if (!fg || !bg) { fail++; console.log('✗ ' + (sc + ' ' + label).padEnd(24) + '写法解析不了：' + rawFg + ' / ' + rawBg); return; }
    const mix = fg.a >= 1 ? fg : overRGBA(fg, bg);
    const r = ratio(hexOf(mix), hexOf(bg));
    const ok = r >= need;
    if (!ok) fail++;
    console.log((ok ? '  ' : '✗ ') + (sc + ' ' + label).padEnd(24) +
      hexOf(mix) + ' (' + fgN + ' α' + fg.a + ' 压 ' + hexOf(bg) + ')' +
      r.toFixed(2).padStart(9) + ':1  需 ≥' + need.toFixed(1) + '   ' + (ok ? 'OK' : '不达标'));
  });
});
/* 历史层里「还活着的文字色」才是真风险：皮肤没覆盖到的规则会继续用旧蓝/旧灰 */
function selSet(css) {
  const s = new Set();
  scan(css, false, []).forEach(b => {
    b.sel.split(',').forEach(x => { const t = x.trim(); if (t && !t.startsWith('@')) s.add(t.replace(/\s+/g, ' ')); });
  });
  return s;
}
const skinLayers = skinIdx >= 0 ? layers.slice(skinIdx).join('\n').replace(/\/\*[\s\S]*?\*\//g, '') : '';
const skinSels = selSet(skinLayers);
const legacySels = selSet(legacyCss);
const uncovered = [...legacySels].filter(sel => {
  /* 只挑历史上真的设了文字色的那条规则 */
  const re = new RegExp('(^|\\n)\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*[^-w]color:\\s*#', 'm');
  return re.test(legacyCss) && !skinSels.has(sel);
});
const withColor = [...legacySels].filter(sel =>
  new RegExp('(^|\\n)\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*[^-w]color:\\s*#', 'm').test(legacyCss));
console.log('历史层设了文字色的选择器 ' + withColor.length + ' 个，皮肤没接管：' + uncovered.length + ' 个' +
  (uncovered.length ? '\n  ' + uncovered.slice(0, 14).join('\n  ') : '（文字色已全部接管）'));

/* 悬停/背景底色同样要接管：只查 color: 会漏掉 .star:hover{background:#eff5ff} 这种
   「不改文字只改底」的规则——亮档看着没事，夜档就变成浅底压浅字。 */
function uncoveredBy(prop) {
  const re1 = sel => new RegExp('(^|\\n)\\s*' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*' + prop + ':\\s*#', 'm');
  const all = [...legacySels].filter(sel => re1(sel).test(legacyCss));
  return { n: all.length, miss: all.filter(sel => !skinSels.has(sel)) };
}
['background', 'border-color', 'box-shadow'].forEach(prop => {
  const r = uncoveredBy(prop);
  const bad = r.miss.length;
  if (prop === 'background') { console.log('历史层设了底色的选择器 ' + r.n + ' 个，皮肤没接管：' + bad + (bad ? '\n  ' + r.miss.slice(0, 16).join('\n  ') : '（底色已全部接管）')); if (bad > 6) fail++; }
  else console.log('历史层设了 ' + prop + ' 的选择器 ' + r.n + ' 个，皮肤没接管：' + r.miss.length + (r.miss.length ? '（低饱和边框沿用旧色，暗档下可能偏淡）' : ''));
});

/* ---------- 已知死法：var() 拼十六进制透明度 ---------- */
/* 只允许「紧跟、无空格」：var(--x)88 才是无效拼色写法。
   带 \s* 会把渐变多停靠点 var(--sky-2) 58% 误报成拼透明度。 */
const badMix = [...src.matchAll(/var\(--[\w-]+\)[0-9a-fA-F]{2}\b/g)];
console.log('var() 拼透明度（CSS 无效写法）：' + badMix.length + (badMix.length ? ' ⚠ ' + badMix.map(m => m[0]).join(' ') : '  OK'));
if (badMix.length) fail++;

/* ---------- 真不变量：页面级容器必须自带底色 ----------
   替代原先那条代理检查（「每个文字令牌都要能在页面底上达标」）。
   那条会逼你把页面底色刷亮到和卡片差不多，层次就废了——为刷绿牺牲设计，是要防的事。
   星露谷的规矩本来就是「所有文字都在框里」，所以该守的是：没有文字直接坐在页面底上。 */
const PAGE_LEVEL = ['body', 'footer.foot', '.statusbar', '.wrap', '.grid', '.col', '.app-head'];
console.log('\n页面级容器是否自带底色（文字不许直接落在页面底上）');
PAGE_LEVEL.forEach(sel => {
  const esc2 = sel.replace(/[.\[\]"\\]/g, m => '\\' + m);
  /* 复合选择器也要算进来：`html, body { color: … }` 里的 body，
     只匹配行首 `body {` 会漏，于是把"设了色没设底"误判成安全 */
  const hits = [...cssAll.matchAll(new RegExp('(?:^|\\n)([^{}]*)\\{([^}]*)\\}', 'g'))]
    .filter(h => h[1].split(',').some(s => s.trim() === sel))
    .map(h => h[2]);
  if (!hits.length) { console.log('  · ' + sel.padEnd(14) + '本文件没有该规则，跳过'); return; }
  const merged = hits.join(';');
  const setsColor = /(^|;)\s*color:/.test(merged);
  const hasBg = /(^|;)\s*background(-color)?:/.test(merged);
  if (setsColor && !hasBg) { console.log('✗ ' + sel.padEnd(14) + '设了文字色却没有底色'); fail++; }
  else console.log('  ' + sel.padEnd(14) + (hasBg ? '有底色' : '不设文字色') + ' OK');
});

/* ---------- 命中区契约：交互类必须写最小尺寸（两套命名各查各的，缺的跳过） ---------- */
const PROTO = ['.btn', '.icon-btn', '.step', '.chip', '.seg label', '.stars button', '.itab'];
const PROD = ['.btn', '.mini', '.chip button', '.star', '.psel', '.seg label', '.rule'];
const isProto = cssAll.indexOf('.icon-btn') >= 0;
const need24 = isProto ? PROTO : PROD;
console.log('\n交互类最小尺寸声明（Web 端 24 CSS px，' + (isProto ? '原型' : '产品+皮肤') + '口径）');
need24.forEach(sel => {
  const esc2 = sel.replace(/[.\[\]"\\]/g, m => '\\' + m);
  /* 层叠里"后写的赢"：产品先写 .btn{padding…}，皮肤后写 .btn{min-height:40px}，
     取第一个匹配会量到旧层，报出假缺陷。取最后一个。 */
  const all = [...cssAll.matchAll(new RegExp('\\n\\s*' + esc2 + '\\s*\\{([^}]*)\\}', 'g'))];
  if (!all.length) { console.log('  · ' + sel.padEnd(16) + '本文件没有这条规则，跳过'); return; }
  const b = all[all.length - 1][1];
  const mh = (b.match(/min-height:\s*([^;]+)/) || [])[1];
  const fh = (b.match(/(?:^|;)\s*height:\s*([^;]+)/) || [])[1];      /* 方形图标按钮写的是 height，也算数 */
  const mw = (b.match(/min-width:\s*([^;]+)/) || [])[1] || (b.match(/(?:^|;)\s*width:\s*([^;]+)/) || [])[1];
  const pad = (b.match(/padding:\s*([^;]+)/) || [])[1] || (b.match(/\bpadding:\s*([^;]+)/) || [])[1];
  const raw = s => { if (!s) return null; const v = s.trim().match(/^var\((--[\w-]+)\)$/); return v ? (lenOf(v[1], light) || v[0]) : s.trim(); };
  const px = s => { const r = raw(s); const n = parseFloat(r); return isNaN(n) ? (r || '—') : n + 'px'; };
  if (!(mh || fh)) { console.log('✗ ' + sel.padEnd(16) + '没写 min-height / height'); fail++; return; }
  const cands = [mh, fh].map(s => { const r = raw(s); const n = parseFloat(r); return isNaN(n) ? NaN : n; }).filter(n => !isNaN(n));
  const eff = cands.length ? Math.min.apply(null, cands) : NaN;
  if (!isNaN(eff) && eff < 24) { console.log('✗ ' + sel.padEnd(16) + '实测 ' + eff + 'px < 24'); fail++; return; }
  console.log('  ' + sel.padEnd(16) + (mh ? 'min-height ' + px(mh) : '—') + ' ' +
    (fh ? 'height ' + px(fh) + ' ' : '') + (mw ? '宽 ' + px(mw) : '') + (pad ? 'padding ' + pad.trim() : '') +
    (isNaN(eff) ? '' : ' → 生效 ' + eff + 'px'));
});

/* ---------- 单 live region / 零网络 ---------- */
const markup = src.replace(/<script[^>]*>[\s\S]*?<\/script>/g, '').replace(/<style[^>]*>[\s\S]*?<\/style>/g, '');
const liveN = [...markup.matchAll(/aria-live="[^"]*"/g)].length;
const netN = (src.match(/https?:\/\/[^"'()\s]+/g) || []).filter(u => !/w3\.org|schema\.org/.test(u)).length;
console.log('\naria-live 属性：' + liveN + '（应为 1）');
console.log('外链（含字体 CDN）：' + netN + '（应为 0）');
console.log('prefers-reduced-motion：' + (cssAll.match(/prefers-reduced-motion/g) || []).length + ' 处（应 ≥1）');
console.log('夜稿令牌：' + (hasDark ? '有' : '无（只有亮档）'));
if (liveN !== 1) fail++;
if (netN) fail++;
console.log('\n==== ' + (fail ? fail + ' 项不达标' : '全部达标'));
process.exit(fail ? 1 : 0);

/* 还原度回读：把第 0 轮定的星露谷清单变成探针，逐条查皮肤 CSS 里到底有没有落地。
   专抓「我以为写了其实没写」——这类缺口肉眼最容易放过，也不需要浏览器。
   用法：node ui-redesign/audit-fidelity.cjs [皮肤css] */
const fs = require('fs');
const path = require('path');
const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'koubo-v3-skin.css');
let raw = fs.readFileSync(file, 'utf8');
/* 传产品本体时也要用皮肤层来量。整份 HTML 一起喂，下面那些「取第一条匹配」的探针
   会命中产品历史样式（`.mini{background:#fff}`），把皮肤真的写了的东西看成没写。 */
const tags = [...raw.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)];
const skinAt = tags.findIndex(t => /skin-v3|stardew/.test(t[1]));
if (/\.html?$/i.test(file)) {
  if (skinAt < 0) { console.log('FAIL  找不到皮肤层（skin-v3 / stardew）：' + path.basename(file)); process.exit(1); }
  raw = tags.slice(skinAt).map(t => t[2]).join('\n');
}
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '');

/* 每条：清单条目 → 必须在 CSS 里出现的签名（正则） */
const SPEC = [
  ['直角，体积靠斜面不靠圆角', /\*\s*\{\s*border-radius:\s*0\s*!important/],
  ['三层木框：外描边', /\.card\s*\{[^}]*border:\s*3px solid var\(--wood-dark\)/],
  ['三层木框：内斜面', /\.card\s*\{[^}]*inset 0 0 0 2px var\(--wood-light\)/],
  ['三层木框：硬投影（不透明无模糊）', /\.card\s*\{[^}]*5px 5px 0 var\(--shadow-hard\)/],
  ['木带标题', /\.card > h2\s*\{[^}]*background:\s*var\(--wood-face\)/],
  ['木板按钮', /\.btn\s*\{[^}]*background:\s*var\(--wood-face\)/],
  ['按下位移 + 收投影（木板被压下去）', /\.btn:active\s*\{[^}]*translate\(3px,\s*3px\)/],
  ['背包格 chip', /\.chip\s*\{[^}]*background:\s*var\(--slot\)/],
  ['读数窗计数', /\.count\s*\{[^}]*background:\s*var\(--milk\)/],
  ['抖动点阵纹理（泥地）', /repeating-conic-gradient/],
  ['八向描边字（像素字体味）', /\.app-head h1\s*\{[^}]*-2px 2px var\(--wood-dark\)/],
  /* 不绑具体令牌名：第 7 轮把云从 --milk 换成 --cloud，绑名字的探针就又过时了。
     只查意图——有没有用 box-shadow 堆出多个阶梯偏移。 */
  ['像素云：box-shadow 堆出阶梯轮廓', /\.app-head::before\s*\{[^}]*box-shadow:[^}]*var\(--[a-z-]+\)[^}]*var\(--[a-z-]+\)/],
  ['标题屏天空→草地渐变', /\.app-head\s*\{[^}]*linear-gradient\(var\(--sky\)[^}]*var\(--grass-2\)/],
  ['金币色评分', /\.star\.on\s*\{[^}]*background:\s*var\(--coin\)/],
  ['toast 也是木牌', /#toast\s*\{[^}]*background:\s*var\(--wood-face\)/],
  ['页脚装进木框（文字不许坐在泥地上）', /footer\.foot\s*\{[^}]*background:\s*var\(--parchment\)/],
  ['报告头也用木带（不只卡片头）', /\.report > \.rh\s*\{[^}]*background:\s*var\(--wood-face\)/],
  ['删除句子仍可读（不靠降对比）', /\.rline \.ex s\s*\{[^}]*color:\s*var\(--text-1\)/],
  ['理由是说明、按钮是操作（不同色）', /\.rline \.ex em\s*\{[^}]*color:\s*var\(--text-3\)/],
  /* —— 第 0 轮清单里承诺、第 4 轮补做的三项 —— */
  /* 探针只认 CSS 本体：注释在检查前就被剥掉了，靠中文注释命中等于永远通过 */
  /* 探针绑意图，不绑具体像素值：上一版写死 `12px 4px var(--milk)` 和 `--wood-mid) 0 5px`，
     第 5 轮把云放大到 6px 单位、栅栏改用 wood-pale，两条就同时误报——
     守卫因为设计被改进而报错，是在惩罚修复本身。 */
  ['前景木栅栏（标题屏下沿的尖桩）', /\.app-head\s*\{[^}]*repeating-linear-gradient\(90deg, var\(--wood-[a-z]+\) 0 \d+px[^}]*\) left bottom/],
  ['木纹：木板要有板纹不是平涂', /--wood-face:[^;]*repeating-linear-gradient\(90deg, var\(--grain\)/],
  ['草地抖动：绿色带也要有像素颗粒', /var\(--grass-dither\)\s+left bottom/],
  /* 早先写的是 `dark[\s\S]*star`，任何位置出现 star 都会命中——那是个会撒谎的探针 */
  ['暗档：夜晚谷仓要真的换掉天空色', /prefers-color-scheme: dark[\s\S]*?--sky:\s*#16233A/]
];

let miss = 0;
console.log('还原度回读：' + path.basename(file));
SPEC.forEach(([name, re]) => {
  const ok = re.test(css);
  if (!ok) miss++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + name);
});

/* 「说明 vs 操作 要能分辨」不能只查文字色不同——上一版文字色确实不同，
   但两者底色都是 --parchment-2，真实渲染里仍是同一类对象。底色才决定归类。 */
const bgOf = sel => {
  /* 取最后一条：同特异性下后写的赢。取第一条会把被皮肤覆掉的旧值当成生效值。 */
  const all = [...css.matchAll(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'g'))];
  if (!all.length) return null;
  const body = all[all.length - 1][1];
  return (body.match(/background(?:-color)?:\s*([^;]+)/) || [])[1] || '';
};
const bgBtn = bgOf('.mini'), bgTag = bgOf('.rline .ex em');
const separable = bgBtn && bgTag && bgBtn !== bgTag;
if (!separable) miss++;
console.log((separable ? '  ✓ ' : '  ✗ ') + '说明标签与操作按钮底色不同（' + bgTag + ' vs ' + bgBtn + '）');

/* 「会随档位翻转的纸面令牌」绝不能拿来当文字色或装饰色。
   第 7 轮实测：暗档 --milk 从奶白翻成近黑（作纸面是对的），而标题、副标题、
   像素云都在用它 → 暗字 + 近黑描边压在深夜空上，标题几乎看不见。
   这类"一个令牌兼两个相反用途"的错，静态可查，不必等眼睛。 */
const flipInDark = ['--milk', '--parchment', '--parchment-2', '--slot', '--bg-sub', '--bg-card'];
const mis = [];
flipInDark.forEach(tok => {
  const re = new RegExp('(?:^|[;{])\\s*(color|fill|stroke)\\s*:\\s*[^;}]*' + tok.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'), 'g');
  [...css.matchAll(re)].forEach(m => mis.push(tok + ' 被用作 ' + m[1]));
});
if (mis.length) miss++;
console.log((mis.length ? '  ✗ ' : '  ✓ ') + '随档位翻转的纸面令牌没有被当成文字色' + (mis.length ? '：' + [...new Set(mis)].join('；') : ''));

/* ======================= 动效门禁（5 条） =======================
   动效最容易"看着没事其实越线"：50ms 的手感肉、亚像素糊边、减动档留下一个停在
   错误位置的云，全都肉眼查不出。这五条全部静态可查。
   顺序很重要：先修掉皮肤里既有的 box-shadow 过渡，再立规矩——
   反过来先立规矩，它就会立刻卡住构建，而我就有借口去放宽它了。 */
let mmiss = 0;
const mt = (pass, name, why) => { if (!pass) mmiss++; console.log((pass ? '  ✓ ' : '  ✗ ') + name + (pass || !why ? '' : '：' + why)); };

/* 时长令牌是闭集：只查这 6 个声明值，检查面从 O(规则数) 降到 O(1)。
   散在规则里的 160ms 才是"同一个项目里动效忽快忽慢"的成因。 */
const TOK = {};
[...css.matchAll(/(--t-[a-z]+):\s*([^;]+);/g)].forEach(m => { TOK[m[1]] = m[2].trim(); });
const WANT = ['--t-hover', '--t-ctrl', '--t-panel', '--t-pop', '--t-drawer', '--t-env'];
const blkM = css.match(/--blk:\s*(\d+)px/);
const BLK = blkM ? +blkM[1] : 6;

/* ④a 六个令牌都在，且值形如「时长 + steps()」 */
const noTok = WANT.filter(t => !TOK[t]);
let badTiming = [];
Object.entries(TOK).forEach(([k, v]) => {
  if (!/^\d+m?s\s+steps\(\d+,\s*(end|jump-none|jump-start|start)\)$/.test(v)) badTiming.push(k + '=' + v);
});
mt(!noTok.length && !badTiming.length, '动效令牌齐备且节奏都是 steps()',
  (noTok.length ? '缺 ' + noTok.join(',') : '') + (badTiming.length ? ' 非 steps/写法可疑 ' + badTiming.join(',') : ''));

/* ④b UI 动效 ≤300ms；带 infinite 的环境动效豁免 */
const envName = [...css.matchAll(/animation:\s*([\w-]+)[^;]*infinite/g)].map(m => m[1]);
const over = [];
Object.entries(TOK).forEach(([k, v]) => {
  const ms = v.match(/^(\d+(?:\.\d+)?)(ms|s)/);
  if (!ms) return;
  const dur = ms[1] * (ms[2] === 's' ? 1000 : 1);
  const usedInfinite = envName.some(n => new RegExp('animation:\\s*' + n + '[^;]*var\\(' + k + '\\)').test(css));
  if (dur > 300 && !usedInfinite) over.push(k + '=' + dur + 'ms');
});
mt(!over.length, 'UI 动效时长全部 ≤300ms（环境动效豁免）', over.join(' '));

/* ① 不许动画 box-shadow：既查过渡的属性表，也查关键帧体 */
const shadowInTrans = [...css.matchAll(/transition\s*:[^;]*box-shadow[^;]*/g)].map(m => m[0].trim());
const kfBlocks = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{([\s\S]*?)\n\s*\}/g)];
const shadowInKf = kfBlocks.filter(([, , b]) => /box-shadow/.test(b)).map(m => m[1]);
mt(!shadowInTrans.length && !shadowInKf.length, '没有动画 box-shadow（过渡属性表 + 关键帧体都查）',
  shadowInTrans.join(' / ') + shadowInKf.map(n => ' @keyframes ' + n).join(''));

/* ② 像素画只能整块位移：关键帧里的 translate 必须是 --blk 的整数倍，
      且 steps(n) 要能整除「位移格数」，否则某一帧会落在半格上糊边 */
const kfBad = [];
kfBlocks.forEach(([full, name, body]) => {
  const dists = [...body.matchAll(/translate[XY]?\(\s*(-?[\d.]+)px/g)].map(m => Math.abs(+m[1]));
  const calcBlk = [...body.matchAll(/translate[XY]?\(\s*calc\(var\(--blk\)\s*\*\s*(\d+)\)/g)].map(m => +m[1] * BLK);
  const all = dists.concat(calcBlk);
  if (!all.length) return;
  const maxPx = Math.max(...all);
  if (maxPx % BLK) kfBad.push(name + ' 位移 ' + maxPx + 'px 不是 ' + BLK + 'px 的整数倍');
  const steps = (css.match(new RegExp('animation:\\s*' + name + '[^;]*steps\\((\\d+)')) || [])[1];
  if (steps && (maxPx / BLK) % +steps) kfBad.push(name + ' steps(' + steps + ') 不整除 ' + (maxPx / BLK) + ' 格');
  /* 写成裸 px 而不是 calc(var(--blk)*n) 的，单独提醒：换基准时这类值不会跟着走 */
  if (dists.length) kfBad.push(name + ' 用了裸 px 位移，应写 calc(var(--blk) * n)');
});
mt(!kfBad.length, '像素画位移落在整块网格上（' + BLK + 'px 基准）', [...new Set(kfBad)].join('；'));

/* ③ infinite 动画必须首尾同位。理由不是美观：产品那条 `*,*::before,*::after` 的减动档
      把 animation-iteration-count 砍成 1，不同位就等于给减动用户留下停在半路的云。 */
const loopBad = [];
envName.forEach(n => {
  const m = css.match(new RegExp('@keyframes\\s+' + n + '\\s*\\{([\\s\\S]*?)\\n\\s*\\}'));
  if (!m) { loopBad.push(n + ' 找不到关键帧定义'); return; }
  const body = m[1];
  /* 关键帧选择器可以是 `0%, 100% {…}` 合并写法，也可以是 `0% {…} 100% {…}` 挤在同一行。
     早先要求帧选择器前面必须是行首，于是"首尾不同位"会被报成"缺 0% 或 100% 帧"——
     结论碰巧对，理由是编的，这种报错会把人往错的地方引。 */
  const at = pct => {
    const hits = [...body.matchAll(/([^{}\n]+)\{([^}]*)\}/g)];
    const one = hits.find(h => h[1].split(',').map(s => s.trim()).indexOf(pct) >= 0);
    return one ? one[2].replace(/\s+/g, ' ').trim() : null;
  };
  const a = at('0%'), b = at('100%');
  if (a === null || b === null) { loopBad.push(n + ' 缺 0% 或 100% 帧'); return; }
  if (a !== b) loopBad.push(n + ' 首尾不同位：' + a + ' vs ' + b);
});
mt(!loopBad.length, '循环动画首尾同位（减动档砍成单趟时才会停回原位）', loopBad.join('；'));

/* ⑤ 皮肤里新写的过渡必须引令牌，不许再写魔法数字。
      减动档要排除在外：它的职责恰恰是写死一个 .01ms 把所有过渡打死。 */
const noReduce = css.replace(/@media\s*\(prefers-reduced-motion:[^{]*\{[\s\S]*?\n\}/g, '');
const magic = [...noReduce.matchAll(/transition[^;]*?\b(\d+(?:\.\d+)?m?s)\b[^;]*/g)]
  .map(m => m[0].trim()).filter(s => !/var\(--t-/.test(s));
mt(!magic.length, '过渡时长一律引 --t-* 令牌', magic.join(' / '));

console.log('\n动效门禁 ' + (6 - mmiss) + '/6');
miss += mmiss;
console.log('\n==== 落地 ' + (SPEC.length + 2 + 6 - miss) + '/' + (SPEC.length + 2 + 6) + '，缺 ' + miss + ' 项');
process.exit(miss ? 1 : 0);
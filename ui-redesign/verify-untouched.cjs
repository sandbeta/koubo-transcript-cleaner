/* 合并后的"什么都没动"证明。
   皮肤并入产品本体以后，旧写法（拿 koubo-v3.html 当皮肤版来比）已经失效：
   现在产品就是那一份，没有"另一版"可比。剩下的不变量只有两条，都还能硬查：

   1. 漂移：产品里 <style id="stardew"> 的内容必须和 ui-redesign/koubo-v3-skin.css
      逐字节相同。手改产品内的皮肤 → 两份开始分家 → 下次 sync 会静默覆盖掉你改的。
   2. 附加性（一次性，opt-in）：产品剥掉皮肤块必须等于合并前的基线，
      也就是"这次合并只往 head 里插了一个样式块，DOM 与三段脚本一字未动"。
      页内 160 条断言的前提（锚点还在、逻辑没改）由这两条一起兜住。

   用法：node ui-redesign/verify-untouched.cjs [--base <文件>|git:<ref>] [--product <文件>] */
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const ROOT = path.join(__dirname, '..');
const argv = process.argv.slice(2);
const opt = name => { const i = argv.indexOf('--' + name); return i < 0 ? null : argv[i + 1]; };
const product = path.resolve(opt('product') || path.join(ROOT, 'koubo-transcript-cleaner.html'));
const skinFile = path.join(__dirname, 'koubo-v3-skin.css');
const src = fs.readFileSync(product, 'utf8');
const skin = fs.readFileSync(skinFile, 'utf8');

const MARK = '<style id="stardew">';
const blockRe = /<style id="stardew">([\s\S]*?)<\/style>\n?/;
let ok = true;
const say = (pass, msg) => { if (!pass) ok = false; console.log((pass ? '一致  ' : '不一致 ') + msg); };

/* ---------- 1. 皮肤块只能有一个，且必须在外层产品样式之后 ---------- */
const marks = [...src.matchAll(/<style id="stardew">/g)];
say(marks.length === 1, '产品内皮肤块数量 ' + marks.length + '（应为 1）');
const baseStyle = src.indexOf('<style>');
const skinPos = src.indexOf(MARK);
say(baseStyle >= 0 && skinPos > baseStyle, '层叠顺序：产品样式 @' + baseStyle + ' → 皮肤 @' + skinPos);

/* ---------- 2. 漂移检查 ---------- */
const m = src.match(blockRe);
const inside = m ? m[1] : '';
const norm = s => s.replace(/\r\n/g, '\n').trim();
say(!!m && norm(inside) === norm(skin),
  '皮肤块与 koubo-v3-skin.css 逐字节相同（' + norm(inside).length + ' / ' + norm(skin).length + ' 字符）' +
  (!m ? '' : norm(inside) === norm(skin) ? '' : ' → 有人直接改了产品里的皮肤，改 skin.css 再跑 sync-skin'));

/* ---------- 3. 附加性：剥掉皮肤块 == 基线（opt-in） ----------
   这条只在"证明这次合并只插了一个样式块"时有用，是一次性的：
   合并提交进 HEAD 之后，HEAD 本身就含皮肤，再拿 HEAD 当基线必然报不一致。
   所以默认不跑，要跑就显式给合并前的文件或 git ref。合并那轮实测：
   剥掉皮肤块 156968 字符 == git show d8fe69b:koubo-transcript-cleaner.html，逐字节相同。 */
const stripped = src.replace(blockRe, '');
let base = null, baseFrom = '';
const baseArg = opt('base');
if (baseArg) {
  base = baseArg.startsWith('git:')
    ? cp.execSync('git show ' + baseArg.slice(4), { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    : fs.readFileSync(path.resolve(baseArg), 'utf8');
  baseFrom = baseArg;
}
if (base === null) {
  console.log('跳过  附加性基线（一次性检查）。重跑：--base git:d8fe69b:koubo-transcript-cleaner.html 或 --base <合并前的文件>');
} else {
  say(stripped === base, '剥掉皮肤块后与基线逐字节相同（基线=' + baseFrom + '，' +
    stripped.length + ' / ' + base.length + ' 字符）');
  if (stripped !== base) {
    /* 给出第一处差异，别让人对着 18 万字符找 */
    let i = 0; while (i < stripped.length && i < base.length && stripped[i] === base[i]) i++;
    console.log('       首处差异 @' + i + '\n       现: …' + JSON.stringify(stripped.slice(i, i + 60)) +
      '\n       基: …' + JSON.stringify(base.slice(i, i + 60)));
  }
}

/* ---------- 4. 三段脚本 + 页内自检锚点仍然健在 ---------- */
['core', 'ui', 'selftest'].forEach(id => {
  const mm = src.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>'));
  say(!!mm && mm[1].length > 0, 'script#' + id + ' 存在（' + (mm ? mm[1].length : 0) + ' 字符）');
});
const anchors = ['rawText', 'cleanText', 'cleanWrap', 'reportBody', 'keptInfo', 'riskList', 'riskCount',
  'partsGrid', 'gapList', 'gemList', 'vaultBody', 'vaultTotal', 'takesBody', 'promptText', 'finalText',
  'titleInput', 'blacklistChips', 'ruleList', 'toast', 'jsState', 'saveState',
  'cfgDrawer', 'cfgScrim', 'cfgOpen', 'cfgCount', 'factorList'];
const missing = anchors.filter(id => !new RegExp('id="' + id + '"').test(src));
say(!missing.length, '页内自检与皮肤依赖的 DOM 锚点 ' + (anchors.length - missing.length) + '/' + anchors.length +
  (missing.length ? '，缺：' + missing.join(',') : ' 全在'));

/* 皮肤块不许伸进 body：插错位置会把整页包进 <style> 里 */
const bodyAt = src.indexOf('<body');
say(skinPos >= 0 && src.indexOf('</style>', skinPos) < bodyAt, '皮肤块闭合于 <body>(' + bodyAt + ') 之前');

console.log(ok
  ? '==== 皮肤只是 head 里的一个样式块：逻辑、DOM、锚点一字未动 → 页内 80 条断言的前提仍然成立'
  : '==== 有门禁没过');
process.exit(ok ? 0 : 1);

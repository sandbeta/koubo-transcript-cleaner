/* 层叠冲突审计：皮肤是后置追加的，产品样式里写在 @media 内的规则，
   会被皮肤里同特异性的非媒体规则反超（媒体查询不加特异性，只比先后）。
   这类 bug 静态能查，不需要浏览器。
   用法：node ui-redesign/audit-cascade.cjs [目标html] */
const fs = require('fs');
const path = require('path');
const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, '..', 'koubo-transcript-cleaner.html');
const src = fs.readFileSync(file, 'utf8');
const tags = [...src.matchAll(/<style([^>]*)>([\s\S]*?)<\/style>/g)];
/* 皮肤层改名了：skin-v3（外置构建，已删）→ stardew（已并入产品本体）。
   两个标记都认，改名的那轮提交还能用同一份脚本回查。 */
const skinAt = tags.findIndex(t => /skin-v3|stardew/.test(t[1]));
if (skinAt < 0) { console.log('FAIL  找不到皮肤层：' + file); process.exit(1); }

function stripComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

/* 收集 (选择器, 是否在媒体查询内, 媒体条件) */
function collect(css) {
  const out = [];
  let k = 0;
  function walk(seg, media, out) {
    let i = 0;
    while (i < seg.length) {
      const o = seg.indexOf('{', i);
      if (o < 0) break;
      const sel = seg.slice(i, o).trim();
      let d = 1, c = o + 1;
      while (c < seg.length && d > 0) { if (seg[c] === '{') d++; else if (seg[c] === '}') d--; c++; }
      const body = seg.slice(o + 1, c - 1);
      /* 记下这条规则声明了哪些属性：同选择器但属性不相交，就不算冲突 */
      const props = [...body.matchAll(/(?:^|;)\s*([a-z-][a-z0-9-]*)\s*:/g)].map(m => m[1]);
      if (sel.startsWith('@')) walk(body, sel.replace(/\s*\{.*$/, ''), out);
      else out.push({ sel: sel.replace(/\s+/g, ' '), media, props });
      i = c;
    }
  }
  walk(css, null, out);
  return out;
}

const legacy = collect(stripComments(tags.slice(0, skinAt).map(t => t[2]).join('\n')));
const skin = collect(stripComments(tags.slice(skinAt).map(t => t[2]).join('\n')));

/* 皮肤里的非媒体规则，会反超产品里写在媒体查询中的同名规则 */
/* 选择器要按逗号拆开：皮肤常写 `.btn:active, .mini:active` 这种复合串，
   整串比对会漏认，于是把"已经处理过"报成"没重述"。 */
const splitSel = s => s.split(',').map(x => x.trim().replace(/\s+/g, ' ')).filter(Boolean);
/* 皮肤非媒体规则：选择器 → 它声明的属性 */
const skinPlainProps = new Map();
skin.filter(r => !r.media).forEach(r => splitSel(r.sel).forEach(s => {
  skinPlainProps.set(s, (skinPlainProps.get(s) || []).concat(r.props));
}));
/* 断点比较：皮肤在更宽的断点里重述过，就等于覆盖了产品更窄的那个断点 */
const maxW = m => { const v = m && m.match(/max-width:\s*(\d+)px/); return v ? +v[1] : Infinity; };
const skinMediaFor = (sel, prop) => skin
  .filter(r => r.media && splitSel(r.sel).includes(sel) && r.props.includes(prop))
  .map(r => maxW(r.media));

console.log('皮肤非媒体规则 ' + skinPlainProps.size + ' 条选择器；产品媒体规则 ' + legacy.filter(r => r.media).length + ' 条');
const uncovered = [], covered = [], disjoint = [];
legacy.filter(r => r.media).forEach(r => {
  splitSel(r.sel).forEach(sel => {
    const sp = skinPlainProps.get(sel);
    if (!sp) return;
    /* 同选择器但属性完全不相交 = 不打架（产品减动档的 * 改 transition，
       皮肤的 * 改 border-radius，只比选择器会报假警） */
    const clash = r.props.filter(p => sp.includes(p));
    if (!clash.length) { disjoint.push({ sel, media: r.media, why: '产品改 [' + r.props.join(',') + ']，皮肤改 [' + sp.join(',') + ']，不相交' }); return; }
    const need = maxW(r.media);
    clash.forEach(prop => {
      const widths = skinMediaFor(sel, prop);
      if (widths.some(w => w >= need)) covered.push({ sel, media: r.media, note: prop + ' 已在 ' + widths.filter(w => w >= need).map(w => w === Infinity ? '非媒体' : w + 'px').join('/') + ' 重述' });
      else uncovered.push({ sel, media: r.media, note: prop });
    });
  });
});
console.log('\n同选择器但属性不相交（不算冲突）：' + disjoint.length + ' 处');
disjoint.forEach(d => console.log('  ·    ' + (d.media + '  ').padEnd(40) + d.sel.padEnd(14) + d.why));
console.log('真冲突且皮肤已重述：' + covered.length + ' 处');
covered.forEach(c => console.log('  OK   ' + (c.media + '  ').padEnd(40) + c.sel.padEnd(14) + c.note));
console.log('真冲突且皮肤没重述：' + uncovered.length + ' 处');
uncovered.forEach(c => console.log('  ✗    ' + (c.media + '  ').padEnd(40) + c.sel.padEnd(14) + c.note + ' 会被皮肤打断'));
if (!uncovered.length) { console.log('\n==== 响应式与减动偏好都没被皮肤打断'); process.exit(0); }
console.log('\n==== ' + uncovered.length + ' 处需要补断点');
process.exit(1);

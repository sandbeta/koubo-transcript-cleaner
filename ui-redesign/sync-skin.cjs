/* 把星露谷皮肤同步进真产品。
   皮肤 CSS（ui-redesign/koubo-v3-skin.css）是唯一可编辑源；产品文件里那个
   <style id="stardew"> 块由本脚本生成，不手改——否则两处会漂移。
   用法：node ui-redesign/sync-skin.cjs */
const fs = require('fs');
const path = require('path');

const PRODUCT = path.join(__dirname, '..', 'koubo-transcript-cleaner.html');
const SKIN = path.join(__dirname, 'koubo-v3-skin.css');

const css = fs.readFileSync(SKIN, 'utf8');
let html = fs.readFileSync(PRODUCT, 'utf8');

const open = '<style id="stardew">', closeRe = /<style id="stardew">[\s\S]*?<\/style>\n?/;
const block = open + '\n' + css + '\n</style>\n';

if (closeRe.test(html)) {
  html = html.replace(closeRe, block);
  console.log('已替换产品文件里现有的 stardew 块');
} else {
  const at = html.indexOf('</head>');
  if (at < 0) { console.log('FAIL 找不到 </head>'); process.exit(1); }
  html = html.slice(0, at) + block + html.slice(at);
  console.log('已在 </head> 前插入 stardew 块');
}

/* 皮肤必须在产品自己的样式之后，否则覆盖不掉硬写的色值 */
const base = html.indexOf('<style>'), theme = html.indexOf(open);
if (!(theme > base)) { console.log('FAIL 层叠顺序不对：产品样式 @' + base + '，皮肤 @' + theme); process.exit(1); }

fs.writeFileSync(PRODUCT, html);
console.log('OK 层叠顺序：产品样式 @' + base + ' → 皮肤 @' + theme);
console.log('产物 ' + fs.statSync(PRODUCT).size + ' 字节（皮肤 ' + css.length + ' 字符）');

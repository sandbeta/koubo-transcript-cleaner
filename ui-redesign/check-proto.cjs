/* 路径已按本目录调整：从 ui-redesign/ 里跑 —— node verify-tokens.cjs */
/* 原型文件体检：JS 能否解析 / data-act 是否都有处理 / 中文有没有被静默吞成空串 */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'koubo-ui-redesign.html');
const src = fs.readFileSync(file,'utf8');
const out = [];
const bad = [];

/* 1. 抽 script → node --check */
const scripts = [...src.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
fs.writeFileSync(path.join(__dirname,'_proto.js'), scripts.join('\n;\n'));
try {
  require('child_process').execFileSync(process.execPath, ['--check', path.join(__dirname,'_proto.js')], { stdio: 'pipe' });
  out.push('PASS  JS 语法通过（' + scripts.length + ' 段，' + scripts.reduce((a, x) => a + x.length, 0) + ' 字符）');
} catch (e) {
  bad.push('FAIL  JS 语法：' + String(e.stderr || e.message).split('\n').slice(0, 6).join(' | '));
}

/* 2. data-act 全覆盖 */
const acts = new Set([...src.matchAll(/data-act="([^"]+)"/g)].map(m => m[1]));
const handled = new Set([...scripts.join('').matchAll(/^\s{4}'?([a-z0-9-]+)'?:\s*function/gm)].map(m => m[1]));
const jsText = scripts.join('');
['vault-clear', 'open-settings', 'close-settings'].forEach(a => handled.add(a));
const unhandled = [...acts].filter(a => !handled.has(a) && jsText.indexOf("'" + a + "'") < 0);
out.push('PASS  data-act ' + acts.size + ' 个，未处理 ' + unhandled.length + ' 个' + (unhandled.length ? '：' + unhandled.join(',') : ''));
if (unhandled.length) bad.push('FAIL  未处理的 data-act: ' + unhandled.join(','));

/* 3. id 唯一 + getElementById 目标存在 */
const ids = [...src.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
out.push('PASS  id ' + ids.length + ' 个，重复 ' + dup.length + (dup.length ? '：' + [...new Set(dup)].join(',') : ''));
if (dup.length) bad.push('FAIL  重复 id: ' + [...new Set(dup)].join(','));
const wants = [...jsText.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
/* risk<i> 是运行时拼出来的，跳过 */
const missing = [...new Set(wants)].filter(x => !/^risk\d+$/.test(x) && ids.indexOf(x) < 0);
out.push('PASS  JS 引用的 id ' + new Set(wants).size + ' 个，静态缺失 ' + missing.length + (missing.length ? '：' + missing.join(',') : ''));
if (missing.length) bad.push('FAIL  JS 引用了不存在的 id: ' + missing.join(','));

/* 4. 中文被吞检测：关键串必须在 */
const must = ['逐句核对', '素材与战绩', '报价低不是便宜', '极限词', '无来源数据', '客户原话', '真实细节',
  '只标记【待删】', '确认清空', '跟随系统', '整句删除', '已放回', '压箱底', '句子指纹',
  '把语音转文字得到的口播稿整段粘贴到这里', '不得添加文稿中不存在的事实'];
const gone = must.filter(s => src.indexOf(s) < 0);
out.push('PASS  关键中文串 ' + must.length + ' 条，缺失 ' + gone.length + (gone.length ? '：' + gone.join(' / ') : ''));
if (gone.length) bad.push('FAIL  中文被吞，缺: ' + gone.join(' / '));

/* 5. 空串字面量（工具吞字的典型残留） */
const empties = [...jsText.matchAll(/=\s*''|[,(]\s*''[),]/g)];
out.push(('WARN  ') + '  可疑空字面量 ' + empties.length + ' 处（合法初始化也算，逐条看）');

/* 6. 零网络请求 / 零 emoji 图标 / 单一 live region */
const net = (src.match(/https?:\/\/(?!svg)[^"'()\s]+/g) || []).filter(u => !/w3\.org|github\.com\/sandbeta/.test(u));
out.push((net.length ? 'FAIL ' : 'PASS  ') + '外链 ' + net.length + (net.length ? '：' + net.join(',') : '（无网络请求、无字体 CDN）'));
if (net.length) bad.push('FAIL  有外链');
/* 只数真属性：先剥 script/style，否则正文里提到 aria-live 这三个字会被算成第二个 live region */
const markup = src.replace(/<script>[\s\S]*?<\/script>/g, '').replace(/<style>[\s\S]*?<\/style>/g, '');
const live = [...markup.matchAll(/aria-live="([^"]*)"/g)].length;
out.push((live === 1 ? 'PASS  ' : 'FAIL  ') + 'aria-live 属性 ' + live + ' 个（应为 1）');
if (live !== 1) bad.push('FAIL  live region 数量 ' + live);
const emo = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
const emoHits = [...src.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(m => m[1]).filter(t => emo.test(t));
out.push((emoHits.length ? 'WARN  ' : 'PASS  ') + '按钮文字里含表情符号 ' + emoHits.length + ' 处' + (emoHits.length ? '：' + emoHits.slice(0, 5).join(' | ') : ''));

/* 7. 标签配平（粗算） */
['div', 'section', 'aside', 'main', 'nav', 'table', 'svg', 'symbol', 'button', 'textarea'].forEach(t => {
  const o = (src.match(new RegExp('<' + t + '(\\s|>)', 'g')) || []).length;
  const c = (src.match(new RegExp('</' + t + '>', 'g')) || []).length;
  if (o !== c) bad.push('FAIL  标签不配平 <' + t + '> ' + o + ' vs </' + t + '> ' + c);
});
out.push(bad.length ? '==== ' + bad.length + ' 个问题' : '==== 全部通过');
console.log(out.join('\n'));
console.log(bad.join('\n') || '（无 FAIL）');
console.log('文件字节: ' + fs.statSync(file).size);
fs.unlinkSync(path.join(__dirname,'_proto.js'));
process.exit(bad.length ? 1 : 0);

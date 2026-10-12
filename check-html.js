const fs = require('fs');
const html = fs.readFileSync(process.argv[2] || 'koubo-transcript-cleaner.html', 'utf8');

// 1. 抽出两段 script 做语法检查
for (const id of ['core', 'ui']) {
  const re = new RegExp('<script id="' + id + '">([\\s\\S]*?)<\\/script>');
  const m = html.match(re);
  if (!m) { console.log('MISSING script#' + id); continue; }
  fs.writeFileSync('_chk_' + id + '.js', m[1]);
  console.log('script#' + id + ' extracted, ' + m[1].split('\n').length + ' lines');
}

// 2. id 唯一性 + getElementById 目标都存在
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
console.log('duplicate ids:', dup.length ? [...new Set(dup)] : 'none');

const used = [...new Set([...html.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]))];
const missing = used.filter(u => !ids.includes(u));
console.log('getElementById targets missing from DOM:', missing.length ? missing : 'none');

// 3. data-act 都有对应处理函数
const acts = [...new Set([...html.matchAll(/data-act="([^"]+)"/g)].map(m => m[1]))]
  .filter(a => !/[+$]/.test(a));   // 排除 selftest 里拼接出来的伪选择器
const handled = [...new Set([...html.matchAll(/^\s{4}'([a-z-]+)':/gm)].map(m => m[1]))];
const unhandled = acts.filter(a => !handled.includes(a));
console.log('buttons:', acts.length, '| handled:', handled.length, '| UNHANDLED:', unhandled.length ? unhandled : 'none');

// 4. 标签闭合粗查
for (const t of ['div', 'section', 'textarea', 'script', 'button', 'label']) {
  const open = (html.match(new RegExp('<' + t + '(\\s|>)', 'g')) || []).length;
  const close = (html.match(new RegExp('</' + t + '>', 'g')) || []).length;
  if (open !== close) console.log('TAG MISMATCH', t, open, close);
}
console.log('tag balance: checked');
console.log('file size:', fs.statSync(process.argv[2] || 'koubo-transcript-cleaner.html').size, 'bytes');

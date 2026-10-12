const fs = require('fs');
const h = fs.readFileSync(process.argv[2] || 'koubo-transcript-cleaner.html', 'utf8');
const open = '<script id="core">';
const a = h.indexOf(open), b = h.indexOf('</script>', a);
const mod = { exports: {} };
new Function('module', 'exports', 'window', h.slice(a + open.length, b) + '\n;module.exports=KBCore;')(mod, mod.exports, {});
const C = mod.exports;

const R = [];
const ok = (n, cond, info) => R.push((cond ? 'PASS  ' : 'FAIL  ') + n + (info ? ' → ' + info : ''));

/* ---------- isBackup ---------- */
ok('isBackup 认得出合法备份', C.isBackup({ factors: [], vault: [], takes: [] }), '');
ok('isBackup 拒绝随意 JSON', !C.isBackup({ hello: 1 }) && !C.isBackup(null) && !C.isBackup([]) && !C.isBackup('x'), '');
ok('缺 takes 不算备份', !C.isBackup({ factors: [], vault: [] }), '');

/* ---------- mergeBackup：核心风险是 id 重映射 ---------- */
const cur = {
  vault: [
    { id: 'v1', text: '他说小王我是不是被人坑了', parts: ['quote'], createdAt: 10 },
    { id: 'v2', text: '本机新攒的一条结果素材', parts: ['result'], createdAt: 20 }
  ],
  takes: [{ id: 't1', title: '本机片子', chars: 50, createdAt: 99, score: 3, used: ['v1'], body: 'x', parts: {}, risk: 0 }]
};
const inc = {
  factors: C.DEFAULT_FACTORS, blacklist: C.DEFAULT_BLACKLIST,
  vault: [
    { id: 'x1', text: '他说小王我是不是被人坑了', parts: ['quote'], createdAt: 5 },   // 与 v1 同文
    { id: 'x2', text: '备份带来的新素材，上个月翡翠湾姓李的业主', parts: ['detail'], createdAt: 6 }
  ],
  takes: [
    { id: 'tx', title: '备份老片', chars: 300, createdAt: 5, score: 5, used: ['x1', 'x2'], body: 'b', parts: {}, risk: 1 },
    { id: 'tx2', title: '本机片子', chars: 50, createdAt: 1, score: 1, used: [], body: '', parts: {}, risk: 0 }  // 与本机同标题+字数
  ]
};
const m = C.mergeBackup(cur, inc);
ok('同文素材不重复导入', m.vault.length === 3 && m.addedVault === 1, 'vault=' + m.vault.length + ' added=' + m.addedVault);
ok('重复计数正确', m.skippedVault === 1, 'skipped=' + m.skippedVault);
ok('同标题同字数成片不重复导入', m.takes.length === 2 && m.addedTakes === 1, 'takes=' + m.takes.length + ' added=' + m.addedTakes);
ok('成片按时间倒序', m.takes[0].createdAt >= m.takes[1].createdAt, m.takes.map(t => t.createdAt).join(','));

const imported = m.takes.find(t => t.id === 'tx');
const v1 = m.vault.find(v => v.text === '他说小王我是不是被人坑了');
const x2new = m.vault.find(v => v.text.indexOf('翡翠湾') !== -1);
ok('战绩链不断：used 里旧 id 重映射到本机 id', imported.used.indexOf(v1.id) !== -1, JSON.stringify(imported.used));
ok('used 里不再有备份侧的悬空 id', imported.used.indexOf('x1') === -1, JSON.stringify(imported.used));
ok('新素材沿用其 id 时被 used 指到', imported.used.indexOf(x2new.id) !== -1, JSON.stringify(imported.used) + ' vs ' + x2new.id);
ok('评分随导入成片保留', imported.score === 5, 'score=' + imported.score);
ok('本机原有数据未被冲掉', m.vault.some(v => v.id === 'v2') && m.takes.some(t => t.id === 't1'), '');
ok('合并是纯函数，不改入参', cur.vault.length === 2 && cur.takes.length === 1, '');
ok('空备份不炸', C.mergeBackup({ vault: [], takes: [] }, {}).addedVault === 0, '');
ok('id 冲突时换新 id（不覆盖本机同 id 素材）', (() => {
  const r2 = C.mergeBackup({ vault: [{ id: 'same', text: '本机内容甲', parts: [] }], takes: [] },
    { vault: [{ id: 'same', text: '备份内容乙', parts: [] }], takes: [] });
  const ids = r2.vault.map(v => v.id);
  return new Set(ids).size === 2 && r2.vault.some(v => v.text === '本机内容甲');
})(), '');

/* ---------- pruneForQuota ---------- */
const long = n => 'x'.repeat(n);
const many = [];
for (let i = 0; i < 6; i++) many.push({ id: 't' + i, title: '片' + i, createdAt: 1000 + i, score: i + 1, chars: 100, body: long(1000), used: [], parts: {}, risk: 0 });
const p = C.pruneForQuota(many, 3000);
ok('配额兜底：按预算丢弃正文', p.takes.reduce((a, t) => a + t.body.length, 0) <= 3000, '剩余 ' + p.takes.reduce((a, t) => a + t.body.length, 0) + ' 字');
ok('从最旧开始丢', p.takes[0].body === '' && p.takes[5].body.length === 1000, 'dropped=' + p.dropped);
ok('丢正文但记录与评分都还在', p.takes[0].score === 1 && p.takes[0].title === '片0' && p.takes[0].truncated === true, '');
ok('够用时不动任何正文', C.pruneForQuota(many, 999999).dropped === 0, '');
ok('空数组不炸', C.pruneForQuota([], 100).takes.length === 0, '');

/* ---------- buildBackup ---------- */
const bk = C.buildBackup({ factors: ['x'], blacklist: ['y'], rules: { filler: true }, blMode: 'mark', libSort: 'perf', keep: ['k'], keepFor: 'kf', vault: [{ id: 'v1', text: 't' }], takes: [{ id: 't1' }], title: 'T', raw: 'R', clean: 'C', final: 'F', prompt: 'P' });
ok('备份含全部可迁移字段', bk.app === 'koubo-transcript-cleaner' && bk.version === 2 && bk.vault.length === 1 && bk.takes.length === 1 && bk.blacklist[0] === 'y' && bk.keepFor === 'kf' && bk.libSort === 'perf', Object.keys(bk).join(','));
ok('备份可被自己的校验接受', C.isBackup(bk), '');
ok('备份往返合并零新增（幂等）', (() => {
  const s = { vault: [{ id: 'v1', text: 't', parts: [] }], takes: [{ id: 't1', title: 'a', chars: 1, createdAt: 1, used: [] }] };
  const r = C.mergeBackup(s, C.buildBackup({ factors: [], vault: s.vault, takes: s.takes }));
  return r.addedVault === 0 && r.addedTakes === 0;
})(), '');

console.log(R.join('\n'));
console.log('\n合计: ' + R.filter(x => x.startsWith('PASS')).length + ' PASS / ' + R.filter(x => x.startsWith('FAIL')).length + ' FAIL');

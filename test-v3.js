const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'koubo-transcript-cleaner.html'), 'utf8');

// 防呆：中文字符可能被工具链吞成空串，先扫一遍所有字符串字面量
const empties = [...html.matchAll(/'\s*'/g)].length;
console.log('[char-integrity] 空字符串字面量出现次数（正则/代码里合法，但词库数组里非法）:', empties);
const arrLines = html.split('\n').filter(l => /const (FILLER_CHARS|FILLER_PHRASES|FILLER_COND)|words: \[/.test(l));
let bad = 0;
for (const l of arrLines) {
  const items = [...l.matchAll(/'([^']*)'/g)].map(m => m[1]);
  const emptyItems = items.filter(x => x.trim() === '');
  if (emptyItems.length) { console.log('  !! 数组里有空项:', l.trim().slice(0, 70)); bad++; }
}
console.log('[char-integrity] 词库数组扫描', arrLines.length, '行，异常', bad, '行');

// 非 ASCII 可疑残留（被截断的半个汉字会显示为 ? 或控制字符）
const weird = html.match(/[\uFFFD\u0000-\u0008\u000B\u000C\u000E-\u001F]/g);
console.log('[char-integrity] 替换符/控制字符:', weird ? weird.length + ' 个' : 'none');

const src = html.match(/<script id="core">([\s\S]*?)<\/script>/)[1] + '\n;module.exports=KBCore;';
const mod = { exports: {} };
new Function('module', 'exports', 'window', src)(mod, mod.exports, {});
const C = mod.exports;
console.log('[load] core exports:', Object.keys(C).length);

const R = [];
const eq = (n, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  R.push((ok ? 'PASS  ' : 'FAIL  ') + n + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
};
const ok = (n, cond, info) => R.push((cond ? 'PASS  ' : 'FAIL  ') + n + (info ? ' → ' + info : ''));

/* ---------- ① 极限词检测 ---------- */
const r1 = C.scanRisk('这是我们这边最便宜的，保证你满意。');
ok('极限词-绝对化命中', r1.some(h => h.word === '最便宜' && h.cat === '绝对化用语' && h.level === 'high'), r1.map(h => h.word).join(','));
ok('极限词-承诺命中', r1.some(h => h.word === '保证'), '');

const r2 = C.scanRisk('第一次见面的时候他还挺犹豫的。');
ok('「第一次」不误报「第一」', !r2.some(h => h.word === '第一'), r2.map(h => h.word).join(',') || '无命中');

const r3 = C.scanRisk('我吃完以后胃里舒服一些，睡觉也踏实。');
ok('「胃里舒服」不误报养胃', r3.length === 0, JSON.stringify(r3.map(h => h.word)));

const r4 = C.scanRisk('这个方子能根治，还能养胃排毒。');
ok('功效词全中(同句同类合并但词不丢)', ['根治', '养胃', '排毒'].every(w => r4.some(h => h.words.indexOf(w) !== -1)), JSON.stringify(r4.map(h => h.word)));
ok('合并后仍是一条', r4.length === 1, '条数=' + r4.length + ' word=' + (r4[0] || {}).word);

const r5 = C.scanRisk('所有客户都说好，零差评。');
ok('全称判断命中', r5.some(h => h.cat === '全称判断 / 无法举证'), r5.map(h => h.word).join(','));

const r6 = C.scanRisk('绝对值这个数我不纠结。');
ok('「绝对值」不误报', !r6.some(h => h.word === '绝对'), r6.map(h => h.word).join(',') || '无命中');

ok('风险项带改口建议', r1.every(h => h.fix && h.why && h.fix.length > 5), '');
ok('空文本不炸', C.scanRisk('').length === 0 && C.scanRisk(null).length === 0, '');

/* ---------- ② 故事零件分桶 ---------- */
const STORY = [
  '上个月翡翠湾一个姓李的业主，对比了四家公司，最后选了一家报价最便宜的。',
  '结果开工到一半，工长说要加钱，他打电话给我，声音都是抖的，他说小王我是不是被人坑了。',
  '我当天就去了工地，我跟他说，这个钱我不加，我自己贴。',
  '最后他这单我少赚了八千块，但他后来介绍了两个邻居给我。',
  '我一直跟我自己讲，报价准比报价低值钱。'
].join('\n');
const cl = C.classifyParts(STORY);
ok('分桶-冲突', cl.counts.conflict > 0, 'conflict=' + cl.counts.conflict);
ok('分桶-客户原话', cl.counts.quote > 0, 'quote=' + cl.counts.quote);
ok('分桶-我的动作', cl.counts.turn > 0, 'turn=' + cl.counts.turn);
ok('分桶-带数字结果', cl.counts.result > 0, 'result=' + cl.counts.result);
ok('分桶-真实细节', cl.counts.detail > 0, 'detail=' + cl.counts.detail);
ok('分桶-价值观金句', cl.counts.belief > 0, 'belief=' + cl.counts.belief);
ok('完整故事无缺口', C.storyGaps(cl).length === 0, JSON.stringify(C.storyGaps(cl).map(g => g.missing)));

const THIN = '有个客户找我装修。\n后来他觉得贵。\n我说价格可以谈。\n最后他挺满意的。';
const gapsThin = C.storyGaps(C.classifyParts(THIN));
ok('薄故事报缺口', gapsThin.length >= 2, gapsThin.map(g => g.missing + '/' + g.severity).join(' '));
ok('缺结果被识别', gapsThin.some(g => g.missing === 'result'), '');
ok('缺真实细节被识别', gapsThin.some(g => g.missing === 'detail'), '');

const NOQUOTE = '有个客户嫌贵，我一直坚持不降价，最后省了两万块，我觉得值不值要看长期。';
ok('缺客户原话被识别', C.storyGaps(C.classifyParts(NOQUOTE)).some(g => g.missing === 'quote'), '');

/* ---------- ③ 相似度与判重 ---------- */
const s1 = C.similarity('这个客户后来介绍了两个邻居给我', '这个客户后来把邻居介绍给了我');
ok('换序近重复达到阈值', s1 >= C.SIM_DUP && C.isDuplicate('这个客户后来介绍了两个邻居给我', '这个客户后来把邻居介绍给了我'), s1.toFixed(2) + ' vs 阈值' + C.SIM_DUP);
const s2 = C.similarity('报价低不是便宜', '上个月有个客户对比了四家公司');
ok('无关句相似度低', s2 < 0.15, s2.toFixed(2));
ok('自身相似度=1', C.similarity('完全一样的一句话内容', '完全一样的一句话内容') === 1, '');
ok('空串不炸', C.similarity('', '有内容的一句话') === 0, '');
ok('短句不误判为重复', !C.isDuplicate('有个客户', '有个客户来了'), '');
ok('共用开头的不同长句不误判', !C.isDuplicate('上个月有个客户来找我问价格', '上个月有个客户把定金打给了我然后跑了'), '');

/* ---------- ④ keep 豁免（逐条放回）—— 用系统自己算出的指纹，和 UI 的真实用法一致 ---------- */
const RAW = '大家好我是小王。\n根据行业数据显示，超过六成的装修纠纷都是来自增项。\n但这句是我要保留的实质内容关于报价。';
const base = C.preclean(RAW, { rules: { opening: true }, blacklist: C.DEFAULT_BLACKLIST, blacklistMode: 'delete' });
ok('默认删掉了黑名单句', !base.text.includes('六成的装修纠纷'), base.text.replace(/\n/g, ' | '));
const target = base.events.find(e => e.bucket === 'blacklist');
ok('删除事件带指纹和规则名', !!(target && target.fp && target.rule), JSON.stringify(target || null));
const kept = C.preclean(RAW, { rules: { opening: true }, blacklist: C.DEFAULT_BLACKLIST, blacklistMode: 'delete', keep: [target.fp] });
ok('keep 指纹命中→该句被放回', kept.text.includes('六成的装修纠纷'), kept.text.replace(/\n/g, ' | '));
const keptEv = kept.events.filter(e => e.bucket === 'blacklist');
ok('放回后该条不再出现在删除事件里', keptEv.length === 0, JSON.stringify(keptEv.map(e => e.sample)));
ok('keep 不影响其它删除', kept.events.some(e => e.bucket === 'rules.opening'), '');
ok('放回后字数增加', kept.after > base.after, base.after + ' → ' + kept.after);

/* ---------- ⑤ 集成：preclean 产出 risk/gaps/parts ---------- */
const full = C.preclean(STORY, { rules: { filler: true, dedupe: true, stutter: true, opening: false }, blacklist: [], blacklistMode: 'delete' });
ok('preclean 返回 parts/gaps/risk', !!(full.parts && full.gaps && full.risk), 'gaps=' + full.gaps.length + ' risk=' + full.risk.length);
ok('句子级事件带指纹', full.events.filter(e => e.kind === 'sentence').every(e => !!e.fp), JSON.stringify(full.events.slice(0, 1)));

/* ---------- ⑥ Prompt 包含新段落 ---------- */
const p = C.buildPrompt({
  factors: C.DEFAULT_FACTORS, blacklist: C.DEFAULT_BLACKLIST, rules: { filler: true },
  cleaned: full.text, title: '测试', risk: C.scanRisk('这是最便宜的，保证满意'), gaps: C.storyGaps(C.classifyParts(THIN))
});
ok('Prompt 含合规红线', p.includes('# 合规红线') && p.includes('最便宜'), '');
ok('Prompt 含故事零件列', p.includes('故事零件'), '');
ok('Prompt 含缺口节', p.includes('这个故事目前缺的零件'), '');
const p2 = C.buildPrompt({ factors: C.DEFAULT_FACTORS, blacklist: [], rules: {}, cleaned: '正常的一句话内容', title: '' });
ok('无风险无缺口时不输出这两节', !p2.includes('# 合规红线') && !p2.includes('缺的零件'), '');

/* ---------- ⑦ 导出 md 含必改清单 ---------- */
const md = C.buildMarkdownFile({
  title: '测试稿', factors: C.DEFAULT_FACTORS, blacklist: [], final: '正文内容',
  risk: C.scanRisk('这是最便宜的'), gaps: C.storyGaps(C.classifyParts(THIN))
});
ok('md 含发布前必改', md.includes('发布前必改') && md.includes('绝对化用语'), '');
ok('md 含故事缺口', md.includes('故事缺口'), '');
const md2 = C.buildMarkdownFile({ title: 'x', final: 'y', risk: [], gaps: [] });
ok('无风险时 md 干净', !md2.includes('发布前必改'), '');

/* ---------- ⑧ 老功能回归 ---------- */
const old = C.preclean(STORY, { rules: { filler: true, dedupe: true, stutter: true, opening: true }, blacklist: C.DEFAULT_BLACKLIST, blacklistMode: 'delete' });
ok('老链路仍工作', old.after > 0 && old.before >= old.after, old.before + '→' + old.after + ' (' + old.ratio + '%)');
ok('谢谢不被拆', C.stripStutter('谢谢你。', () => { }).text === '谢谢你。', '');
ok('是不是保留', C.stripFillers('我是不是被人坑了。', () => { }).text === '我是不是被人坑了。', '');

console.log(R.join('\n'));
console.log('\n合计: ' + R.filter(x => x.startsWith('PASS')).length + ' PASS / ' + R.filter(x => x.startsWith('FAIL')).length + ' FAIL');

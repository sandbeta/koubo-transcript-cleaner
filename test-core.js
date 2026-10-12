const fs = require('fs');
const path = require('path');
const file = process.argv[2] ? path.resolve(process.argv[2]) : path.join(__dirname, 'koubo-transcript-cleaner.html');
const html = fs.readFileSync(file, 'utf8');

const m = html.match(/<script id="core">([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: core script not found'); process.exit(1); }

global.window = {};
const sandbox = m[1] + '\n;module.exports = KBCore;';
const mod = { exports: {} };
new Function('module', 'exports', 'window', sandbox)(mod, mod.exports, global.window);
const C = mod.exports;

console.log('core loaded OK. exports:', Object.keys(C).length);

const SAMPLE = [
  '大家好，我是小王，做装修这行已经八年了，今天给大家分享一个很多业主都会踩的坑。',
  '嗯，那个，其实吧，很多客户第一次来找我的时候，都是先问价格。',
  '上个月有个客户，他对比了四家公司，最后选了一家报价最便宜的，便宜了整整两万块。',
  '结果呢，结果就是开工到一半，工长说这个要加钱那个要加钱，最后总共多花了三万五。',
  '我我我当时接到他电话的时候，他声音都是抖的，他说小王我是不是被人坑了。',
  '所谓增项，说白了就是指合同里没有写，但是施工过程中必须增加的费用。',
  '根据行业数据显示，超过六成的装修纠纷都是来自主材和人工的增项。',
  '所以说，报价低不是便宜，报价准才是便宜。',
  '报价低不是便宜，报价准才是便宜。',
  '我一直跟我自己的客户讲，你可以拿着我的报价单去比，比完你再回来找我。',
  '那个，反正就是，你至少要问清楚三件事：水电按米还是按项，瓷砖要不要找平，拆除含不含清运。',
  '这三件事问明白了，你就不会多花冤枉钱，不会多花冤枉钱。',
  '行，那今天就聊到这里，记得点赞关注，我们下期见。'
].join('\n');

const rules = { filler: true, dedupe: true, stutter: true, opening: true };

function run(label, opts) {
  const r = C.preclean(SAMPLE, opts);
  console.log('\n===== ' + label + ' =====');
  console.log('before=' + r.before + ' after=' + r.after + ' ratio=' + r.ratio + '% sents=' + r.sentences + ' codes=' + r.timecodes);
  r.steps.forEach(s => console.log('  - ' + s.label + ': ' + (s.off ? 'OFF' : s.hits + ' 处') + (s.byName ? ' ' + JSON.stringify(s.byName) : '')));
  console.log('--- OUTPUT ---');
  console.log(r.text);
  return r;
}

const full = run('全部规则 + 默认黑名单(整句删除)', { rules, blacklist: C.DEFAULT_BLACKLIST, blacklistMode: 'delete' });
const mark = run('黑名单只标记', { rules, blacklist: C.DEFAULT_BLACKLIST, blacklistMode: 'mark' });
const none = run('全关（只 normalize）', { rules: {}, blacklist: [], blacklistMode: 'delete' });

// 误伤检查
console.log('\n===== 误伤/回归检查 =====');
const eq = (name, got, want) => {
  const ok = typeof want === 'boolean' ? got === want : String(got).trim() === String(want).trim();
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok ? '' : '  got=' + JSON.stringify(got) + ' want=' + JSON.stringify(want)));
};
const L = () => {};
eq('谢谢 不被拆', C.stripStutter('谢谢你，帮了我很多。', L).text, '谢谢你，帮了我很多。');
eq('谢谢谢 → 谢谢', C.stripStutter('谢谢谢大家。', L).text, '谢谢大家。');
eq('慢慢 保留', C.stripStutter('我们慢慢来。', L).text, '我们慢慢来。');
eq('整整 保留', C.stripStutter('便宜了整整两万块。', L).text, '便宜了整整两万块。');
eq('我我我 → 我', C.stripStutter('我我我当时就走了。', L).text, '我当时就走了。');
eq('我我 → 我', C.stripStutter('我我认为是对的。', L).text, '我认为是对的。');
eq('呐喊 不被删', C.stripFillers('他大声呐喊，冲了出去。', L).text, '他大声呐喊，冲了出去。');
eq('那个客户 不被删', C.stripFillers('那个客户后来回来了。', L).text, '那个客户后来回来了。');
eq('独立「那个，」被删', C.stripFillers('那个，我们要报价。', L).text, '我们要报价。');
eq('疑问「是不是」保留', C.stripFillers('他说小王我是不是被人坑了。', L).text, '他说小王我是不是被人坑了。');
eq('口头禅「，对吧，」删', C.stripFillers('这个很贵，对吧，大家都懂。', L).text, '这个很贵，大家都懂。');
eq('「就是说白了」不被削坏', C.stripFillers('就是说白了，这事不怪他。', L).text, '就是说白了，这事不怪他。');
eq('「嘶哑」不被删', C.stripFillers('他嗓子都嘶哑了。', L).text, '他嗓子都嘶哑了。');
eq('时间码保留', C.timecodes('00:12 你好 1:02:33 报价').length >= 2, true);
eq('空输入不炸', C.preclean('', { rules, blacklist: C.DEFAULT_BLACKLIST }).text, '');

const crossLine = C.preclean('报价低不是便宜，报价准才是便宜。\n报价低不是便宜，报价准才是便宜。\n第三句是别的内容。',
  { rules: { dedupe: true }, blacklist: [] });
eq('跨行重复句合并', (crossLine.text.match(/报价低不是便宜/g) || []).length, 1);

const inSentenceDup = C.preclean('你就不会多花冤枉钱，不会多花冤枉钱。', { rules: { dedupe: true }, blacklist: [] });
eq('句内重复片段合并', inSentenceDup.text, '你就不会多花冤枉钱。');

const ending = C.preclean('这是真正有内容的一句关于报价的话。\n行，今天就聊到这里，记得点赞关注，我们下期见。',
  { rules: {}, blacklist: C.DEFAULT_BLACKLIST });
eq('结尾套话被黑名单删除', ending.text.includes('下期见'), false);
console.log('  结尾套话用例输出 →', JSON.stringify(ending.text));

const eng = C.preclean('This is my China business and it works.', { rules: {}, blacklist: C.DEFAULT_BLACKLIST });
eq('英文子串 hi/ina 不误伤', eng.text, 'This is my China business and it works.');

const tcIn = C.preclean('00:08 嗯，那个，上个月有个客户，他对比了四家公司。', { rules, blacklist: C.DEFAULT_BLACKLIST });
eq('时间码后不留孤立逗号', /00:08\s+，/.test(tcIn.text), false);
console.log('  时间码用例输出 →', JSON.stringify(tcIn.text));

// 自定义黑名单字面匹配
const custom = C.preclean('第一句正常内容。\n这段话里有广告植入字样要删掉。\n第三句也正常。', {
  rules: {}, blacklist: ['广告植入'], blacklistMode: 'delete'
});
console.log('\n自定义黑名单 →', JSON.stringify(custom.text), 'hits=', custom.steps[0] && custom.steps[0].hits);

// 短文本
console.log('短文本 →', JSON.stringify(C.preclean('嗯，好的。', { rules, blacklist: C.DEFAULT_BLACKLIST }).text));

// Prompt 包
const prompt = C.buildPrompt({
  factors: C.DEFAULT_FACTORS, blacklist: C.DEFAULT_BLACKLIST, rules,
  cleaned: full.text, title: '装修报价增项'
});
console.log('\n===== PROMPT 包 (' + C.countChars(prompt) + ' 字) =====');
console.log(prompt);

// 素材体检
console.log('\n===== 素材体检 Top5 =====');
C.scoreSentences(full.text).slice(0, 5).forEach(g =>
  console.log('  ' + g.score + '分 [' + (g.code || '无码') + '] ' + g.text.slice(0, 40) + ' | ' + g.tags.join(',')));

// Markdown 导出
const md = C.buildMarkdownFile({
  title: '装修报价里的增项坑', factors: C.DEFAULT_FACTORS, blacklist: C.DEFAULT_BLACKLIST,
  rawChars: full.before, cleanChars: full.after, ratio: full.ratio, finalChars: 100,
  final: '## 一、成片结构\n钩子→展开→落点\n\n| 序号 | 时间码 | 文本 | 命中 | 建议 |\n|---|---|---|---|---|\n| 1 | 00:12 | x | 人设 | 特写 |'
});
console.log('\n===== 导出 .md =====');
console.log(md);

console.log('\n===== inspectMarkdown =====');
console.log(C.inspectMarkdown(md), C.inspectMarkdown('纯文本没有结构'), C.inspectMarkdown(''));
console.log('\nsafeFileName:', C.safeFileName('装修/报价:增项?坑 测试'), '|', C.safeFileName(''), '|', C.fileStamp(new Date()));

// 带时间码的稿件
console.log('\n===== 时间码稿件 =====');
const TC = [
  '00:00 大家好，我是做装修的小王。',
  '00:08 嗯，那个，上个月有个客户，他对比了四家公司。',
  '00:21 最后选了一家报价最便宜的，便宜了整整两万块。',
  '00:35 结果呢，结果就是开工到一半，工长说这个要加钱那个要加钱。',
  '00:52 我我我当时接到他电话的时候，他声音都是抖的。',
  '01:10 所以说，报价低不是便宜，报价准才是便宜。',
  '01:10 所以说，报价低不是便宜，报价准才是便宜。',
  '01:30 行，今天就聊到这里，记得点赞关注。'
].join('\n');
const tcr = C.preclean(TC, { rules, blacklist: C.DEFAULT_BLACKLIST, blacklistMode: 'delete' });
console.log('时间码保留数 =', tcr.timecodes, ' 压缩 =', tcr.ratio + '%');
console.log(tcr.text);
const tcp = C.buildPrompt({ factors: C.DEFAULT_FACTORS, blacklist: C.DEFAULT_BLACKLIST, rules, cleaned: tcr.text, title: '' });
console.log('\nPrompt 是否要求时间码来自原文:', /时间码必须来自原文/.test(tcp));
console.log('体检带码片段:', C.scoreSentences(tcr.text).slice(0, 3).map(g => g.code + '|' + g.score).join('  '));

// 极端输入
console.log('\n===== 极端输入 =====');
const weird = ['', '   ', '\n\n\n', '嗯', '，，，', '啊啊啊啊啊啊', 'hello world this is a test', '一'.repeat(500)];
weird.forEach((w, i) => {
  try {
    const r = C.preclean(w, { rules, blacklist: C.DEFAULT_BLACKLIST, blacklistMode: 'delete' });
    console.log('  #' + i + ' ok len=' + r.text.length + ' before=' + r.before + ' after=' + r.after);
  } catch (e) { console.log('  #' + i + ' THREW: ' + e.message); }
});


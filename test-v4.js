const fs = require('fs');
const html = fs.readFileSync(process.argv[2] || 'koubo-transcript-cleaner.html', 'utf8');
const a = html.indexOf('<script id="core">');
const b = html.indexOf('</script>', a);
const src = html.slice(a + 18, b) + '\n;module.exports=KBCore;';
const mod = { exports: {} };
new Function('module', 'exports', 'window', src)(mod, mod.exports, {});
const C = mod.exports;

const R = [];
const ok = (n, cond, info) => R.push((cond ? 'PASS  ' : 'FAIL  ') + n + (info ? ' → ' + info : ''));

const V = [
  { id: 'v1', text: '他说小王我是不是被人坑了，声音都是抖的', parts: ['quote', 'detail'], createdAt: 1 },
  { id: 'v2', text: '上个月翡翠湾一个姓李的业主对比了四家公司最后选了最便宜的', parts: ['detail', 'conflict'], createdAt: 2 },
  { id: 'v3', text: '报价低不是便宜，报价准才是便宜', parts: ['belief'], createdAt: 3 },
  { id: 'v4', text: '最后他这单我少赚了八千块，他后来介绍了两个邻居给我', parts: ['result'], createdAt: 4 }
];

/* ---------- 1. 登记 ---------- */
const t = C.makeTake({ title: '  装修增项坑  ', final: '正文内容一二三', parts: { conflict: 1, result: 1 }, risk: 2 });
ok('makeTake 去空格并统计字数', t.title === '装修增项坑' && t.chars === 7 && t.score === 0 && t.used.length === 0, JSON.stringify({ title: t.title, chars: t.chars }));
ok('未命名兜底', C.makeTake({}).title === '未命名成片', '');
ok('每条 id 唯一', new Set([C.makeTake({}).id, C.makeTake({}).id, C.makeTake({}).id]).size === 3, '');

/* ---------- 2. 素材↔成片匹配 ---------- */
const m1 = C.matchVault('- 他说小王我是不是被人坑了，声音都是抖的\n\n- 别的句子', V);
ok('整句搬用命中', m1.length === 1 && m1[0] === 'v1', JSON.stringify(m1));

const m2 = C.matchVault('客户当时在电话里说，自己是不是被人坑了，声音都是抖的。', V);
ok('大模型改写后仍能命中', m2.indexOf('v1') !== -1, JSON.stringify(m2));

const m3 = C.matchVault('今天天气不错，我们聊聊别的完全无关的话题内容。', V);
ok('无关稿不误命中', m3.length === 0, JSON.stringify(m3));

ok('空稿返回空', C.matchVault('', V).length === 0 && C.matchVault(null, V).length === 0, '');
ok('空库存不炸', C.matchVault('随便一句话内容测试', []).length === 0, '');
const m4 = C.matchVault('报价低不是便宜，报价准才是便宜。这句是别的。', V);
ok('金句原样引用命中', m4.indexOf('v3') !== -1, JSON.stringify(m4));

/* ---------- 3. 表现统计 ---------- */
const takes = [
  C.makeTake({ title: 'A', final: 'x', used: ['v1', 'v2'], score: 5 }),
  C.makeTake({ title: 'B', final: 'y', used: ['v1', 'v3'], score: 2 }),
  C.makeTake({ title: 'C', final: 'z', used: ['v1'], score: 0 })
];
const st = C.vaultStats(V, takes);
ok('v1 用于 3 条', st.v1.count === 3, 'count=' + st.v1.count);
ok('v1 均分只算已评分的 2 条', st.v1.avg === 3.5 && st.v1.samples === 2, 'avg=' + st.v1.avg + ' samples=' + st.v1.samples);
ok('未评分不进分母', st.v3.avg === 2 && st.v3.samples === 1, 'avg=' + st.v3.avg);
ok('v4 没用过', st.v4.count === 0 && st.v4.avg === 0, '');
ok('usedIn 去重', C.vaultStats(V, [takes[0], takes[0]]).v1.count === 1, '');
ok('空库存/空成片不炸', Object.keys(C.vaultStats([], [])).length === 0, '');

/* ---------- 4. 补件候选排序 ---------- */
const ranked = C.rankCandidates(V, st, 2);
ok('候选优先给没用过的素材', ranked.length === 2 && ranked[0].id === 'v4', ranked.map(x => x.id).join(','));
const rankedAll = C.rankCandidates(V, st, 9);
ok('其次按历史表现排', rankedAll.map(x => x.id).join(',') === 'v4,v2,v3,v1', rankedAll.map(x => x.id + ':' + (st[x.id].count) + '/' + (st[x.id].avg || 0)).join(' '));

/* ---------- 5. 库存排序模式 ---------- */
ok('没用过优先模式', C.librarySort(V, st, 'unused')[0].id === 'v4', C.librarySort(V, st, 'unused').map(v => v.id).join(','));
ok('表现优先模式（v2 单次拿 5 分，均分高于被用 3 次的 v1）', C.librarySort(V, st, 'perf')[0].id === 'v2', C.librarySort(V, st, 'perf').map(v => v.id + ':' + (st[v.id].avg || 0)).join(','));
ok('用得最多模式', C.librarySort(V, st, 'busy')[0].id === 'v1', C.librarySort(V, st, 'busy').map(v => v.id + ':' + st[v.id].count).join(','));
ok('默认模式不改变条数', C.librarySort(V, st).length === V.length, '');

/* ---------- 6. 库存体检 ---------- */
const ins = C.vaultInsights(V, takes);
ok('体检：总片数与已评分数', ins.takes === 3 && ins.rated === 2 && ins.avg === 3.5, 'takes=' + ins.takes + ' rated=' + ins.rated + ' avg=' + ins.avg);
ok('体检：分桶统计存货与闲置', ins.byPart.quote.total === 1 && ins.byPart.quote.unused === 0, JSON.stringify(ins.byPart.quote));
ok('体检：result 桶有存货但一次没用过', ins.byPart.result.total === 1 && ins.byPart.result.unused === 1, JSON.stringify(ins.byPart.result));
ok('体检：空桶不报错', ins.byPart.turn.total === 0 && ins.byPart.turn.avg === 0, '');
ok('体检：空库存不炸', C.vaultInsights([], []).takes === 0, '');

/* ---------- 7. 成片零件缺口 ---------- */
ok('有冲突无结果→报 result', C.takeGaps({ conflict: 2, turn: 1, detail: 1 }).indexOf('result') !== -1, JSON.stringify(C.takeGaps({ conflict: 2, turn: 1, detail: 1 })));
ok('有冲突无原话→报 quote', C.takeGaps({ conflict: 1, result: 1, detail: 1 }).indexOf('quote') !== -1, '');
ok('零件齐→无缺口', C.takeGaps({ conflict: 1, turn: 1, quote: 1, result: 1, detail: 1, belief: 1 }).length === 0, '');
ok('空快照不炸', C.takeGaps(undefined).length > 0, '');

/* ---------- 8. 段落分隔必须活着穿过全规则管线 ---------- */
const PARA = '有个客户嫌贵，犹豫了半个月。\n我说价格可以再谈。\n后来他选了别家。\n\n另一个客户被别家多收了整整三万五。\n他半夜打电话给我，他说还是你实在。\n上个月翡翠湾姓李的业主，最后省了八千块。';
const pf = C.preclean(PARA, { rules: { filler: true, dedupe: true, stutter: true, opening: true }, blacklist: C.DEFAULT_BLACKLIST, blacklistMode: 'delete' });
ok('全规则下段落空行仍在', pf.text.includes('\n\n'), JSON.stringify(pf.text.slice(0, 24)));
ok('全规则下能分出 2 个故事段', C.splitEpisodes(pf.text).length === 2, C.splitEpisodes(pf.text).length + ' 段');
ok('第一段缺结果被单独指出（不被第二段掩盖）',
  pf.ep.blocks.length === 2 && pf.ep.blocks[0].gaps.some(g => g.missing === 'result'),
  JSON.stringify(pf.ep.blocks.map(b => b.gaps.map(g => g.missing))));
ok('无空行无时间码＝单段，行为与全稿一致',
  C.splitEpisodes('一句话的内容。\n第二句话的内容。').length === 1, '');
ok('时间码大跳分段', C.splitEpisodes('00:05 第一段。\n00:20 第一段。\n02:40 第二段。').length === 2, '');
ok('时间码小跳不误分段', C.splitEpisodes('00:05 第一段。\n00:20 还是第一段。\n00:40 还是。').length === 1, '');

console.log(R.join('\n'));
console.log('\n合计: ' + R.filter(x => x.startsWith('PASS')).length + ' PASS / ' + R.filter(x => x.startsWith('FAIL')).length + ' FAIL');

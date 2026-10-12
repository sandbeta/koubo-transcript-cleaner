# 星露谷皮肤（唯一版本，已在产品本体里）

主页面那套味道：泥地 + 木板框 + 草地色带 + 尖桩栅栏 + 像素云，正文仍是可读的 17px 无衬线。
零图片、零字体、零网络请求，装饰全部由 CSS 画。

**皮肤不再是外挂副本。** 前几轮它是 `ui-redesign/koubo-v3.html`（产品 + 后置 `<style id="skin-v3">`），
现在已经并进 `koubo-transcript-cleaner.html` 本体的 `<style id="stardew">` 块里，
那个副本和它的构建脚本 `build-v3.cjs` 一起删了——留着只会让人改错文件。

## 改样式怎么改

`ui-redesign/koubo-v3-skin.css` 是**唯一可编辑源**，产品里那块是它的副本：

```bash
node ui-redesign/sync-skin.cjs      # 把 skin.css 注入/替换进产品 </head> 之前
```

直接改产品里那块也能看到效果，但下次 sync 会静默覆盖掉——`verify-untouched.cjs` 就是查这个漂移的。

## 三条不可让步的规则

1. **像素只进框架，不进正文。** 中文没有可用的像素字体，硬套正文会毁掉可读性，而可读性是这个工具的全部价值。
2. **文字不许直接坐在页面底上。** 星露谷的规矩本来就是"所有字都在框里"。所以门禁查的是页面级容器有没有自带底色，
   而不是"每个文字令牌都要能在页面底上达标"——后者会逼你把页面底色刷亮到和卡片差不多，层次就废了。
3. **会随档位翻转的纸面令牌，绝不能当文字色用。** 第 7 轮实测：暗档 `--milk` 从奶白翻成近黑（作纸面是对的），
   而标题、副标题、像素云都在用它 → 暗字压深夜空，标题几乎看不见。现在拆成 `--cloud` / `--ink-on-sky` 两个用途。

## 夜档

一个 `@media (prefers-color-scheme: dark)` 块（43 个令牌覆写）＝夜晚谷仓：天空换成 `#16233A`、
木板变深、纸面变暗。跟系统走，不需要 JS 开关。产品本体没有暗档，暗档全部由皮肤提供。

## 动效（2026-10-12 加）

原则不是"还有什么能动"，而是**"界面上哪些东西的值会变、而它现在是硬切的"**。
在 0 行 JS、0 处 DOM 改动的前提下，只有 class 变化、display 变化、伪元素状态能被免费点亮；
`textContent` 变化（字数、徽章、状态栏）CSS 观察不到，别硬做。

节奏全部走 `:root` 里的 6 个令牌（`--t-hover/ctrl/pop/panel/drawer/env`），不散写魔法数字。
一律 `steps()`：UI 用它是因为像素动画本来就不连续插值；云用它是因为**亚像素平移会把 6px 硬边糊成灰边**。

| 改了什么 | 传达 |
|---|---|
| `.btn` 删掉 `transform`/`box-shadow` 两条 50ms 过渡 | 按下当帧换状态。它是全工具重复最多的动作，50ms 会被重复成"手感肉" |
| `#cleanWrap` 入场（`@starting-style`，opacity 4 帧 + translateY 12px） | 清洗结果落地了。这是唯一一个"劳动成果从无到有"的翻转，且已是 `''` 时再赋值不触发，天然不重播 |
| `.rline .ex s` 常态线改 `--berry-line`，悬停变实 + 3px | 「这句到底被删成什么样了」 |
| 抽屉 / 遮罩 / toast / `.mini` / `.seg label` 换步进 | 让已有的动效讲星露谷的话 |
| `#finalWarn` 完成态改 `--ok` + 着色过渡 | 「✓ 结构完整，可以交付」——工作流里唯一的交付时刻 |
| `.app-head::before` 云 36s 飘 36px（每 3 秒跳一格） | 标题屏是个地方，不是一张图 |

**踩过的坑**：把 `display` 也加进 `transition` 列表 + `transition-behavior: allow-discrete`，
实测 `opacity` 直接读到 1、过渡根本不创建（离散值在前 50% 仍是 `none`，元素压根没进入可动画状态）。
入场只需要 `@starting-style` + opacity/transform；`display` 过渡是给退场用的，这里没有退场。

**验过的证据**（不靠肉眼）：`getComputedStyle('.app-head','::before').transform` 间隔 4.2s 取两次
= `matrix(1,0,0,1,6,0)` → `matrix(1,0,0,1,18,0)`，云真的在跳格；`#cleanWrap` 用 rAF 连采 22 帧，
opacity 走 `0 → .25 → .5 → .75 → 1`、translateY 走 `12 → 9 → 6 → 3 → 0`，正是 `steps(4,end)`；
CSSOM 里确认减动档的 `.app-head::before { animation: none }` 被解析。

**明确不做**：终稿逐字打出（拦住用户复制）、报告行入场 stagger（`renderReport` 每次整块重建会重播）、
数字滚动（要 JS 且信息重复）、promptStale 呼吸（已有静态差异 + 复制前自动重建）、
萤火虫/雨/雪（装饰性自发运动 = 界面在说谎，星露谷的天气是有信息的）。
完整推演在 `playground/motion-stardew-{0..6}.md`（不入库）。

## 静态门禁（本轮全部实测通过，都是解析文件算的，不是文档里写的值）

| 检查 | 命令 | 结果 |
|---|---|---|
| 皮肤没动逻辑 | `node ui-redesign/verify-untouched.cjs` | 皮肤块与 skin.css 逐字节相同（23385 字符）；产品内只有一块；层叠顺序 产品 @165 → 皮肤 @19773；三段脚本在位；26/26 DOM 锚点在位；皮肤块闭合于 `<body>` 之前 |
| 合并只插了一个块（一次性） | `node ui-redesign/verify-untouched.cjs --base git:d8fe69b:koubo-transcript-cleaner.html` | 剥掉皮肤块后与合并前逐字节相同（156968 / 156968 字符）。合并进 HEAD 之后这条不能再拿 HEAD 当基线，所以改成 opt-in |
| 对比度 | `node ui-redesign/verify-tokens.cjs` | 日稿 + 夜稿 21 组实算全达标。文字最低 4.61:1（日稿 `--hit`），控件边界最低 3.18:1（夜稿 `--edge-field`，要求 3.0）。**另加带 alpha 的颜色**：先按底色合成再算，`--berry-line` 日 3.43:1 / 夜 3.26:1（要求 3.0）；解不出直接判失败，不许像 PAIRS 那样静默跳过 |
| 接管完整度 | 同上 | 历史层设了文字色 43 个、底色 40 个、边框色 8 个选择器，皮肤没接管 **0** 个 |
| 令牌纪律 | 同上 | 皮肤层裸色值 0 处（产品历史层 106 处，登记为技术债）；`var()` 拼十六进制透明度 0 处 |
| 命中区 | 同上 | `.btn` 38px、`.rule` 30px、`.mini`/`.star`/`.psel` 28px、`.seg label` 26px、`.chip ×` 24px（Web 端下限 24px） |
| 承诺不变 | 同上 | 外链 0（没引字体 CDN）、`aria-live` 只有 1 个、`prefers-reduced-motion` 3 处 |
| 层叠反超 | `node ui-redesign/audit-cascade.cjs` | 皮肤非媒体规则 160 条 vs 产品媒体规则 4 条，**0 处**没重述。`.btn:active` 的 transform 已在非媒体重述，`.grid` 的列在 1320px 重述；减动档的 `*` 与皮肤的 `*` 属性不相交，不算冲突 |
| 还原度 | `node ui-redesign/audit-fidelity.cjs` | 25 条星露谷清单 + 6 条动效门禁 = **31/31**。动效那 6 条：不许动画 box-shadow（过渡属性表和关键帧体都查）、像素位移必须落在 6px 整块网格上且 steps 要整除格数、`infinite` 动画必须首尾同位（否则减动档砍成单趟会停在半路）、UI 时长 ≤300ms、节奏只能是 `steps()`、过渡时长必须引 `--t-*` 令牌 |
| 门禁自己会撒谎吗 | `node ui-redesign/audit-fidelity.cjs playground/_bad.css` 式负例 | 6 条动效门禁逐条注入违规各测一次，全部当场翻脸；其中「首尾同位」那条**报错理由曾是错的**（把"首尾不同位"报成"缺 0% 帧"，因为要求帧选择器必须在行首），已修 |
| 结构与绑定 | `node check-html.js` | 无重复 id、`getElementById` 目标全在、34 按钮 / 0 未处理 `data-act`、标签配平 |
| 逻辑断言 | `node test-core.js && node test-v3/v4/v5.js` | **132 PASS / 0 FAIL**（28 + 45 + 36 + 23） |
| 页内端到端 | 打开产品后控制台 `kouboSelftest()` | **160 / 160**，存档自动还原 |

## 看到过的 / 只算过的

**看到过**：
- 日档 1440px：标题屏、状态栏、稿纸区、清洗报告（含「放回」按钮与 `「术语解释」` 这类说明标签）、
  合规风险卡、故事结构缺口卡。日档是把产品复制一份、把暗档媒体查询改成永不匹配的条件来看的，没动产品本体。
- 夜档 1440px：标题屏、状态栏、稿纸区、**清洗报告、合规风险卡、故事结构缺口卡**（10-12 补齐，之前只算过对比度）。

**没看到、但用数值证过**：云在跳格（两次 computed transform 不同）、`#cleanWrap` 入场真的走了 4 帧
（rAF 连采 22 帧）、减动档的 `animation: none` 被浏览器解析进 CSSOM。

**仍然没看到**：`过滤标准` 抽屉滑出后的星露谷观感（file:// 的 iframe 拿不到脚本权限，点不到它）、
小屏下像素云与栅栏的排布、`:has()` 色条在长句里的换行。这几条得你在真浏览器里判。

## 已经不再是问题的两件事

- 旧文档写的"配置区吃掉两屏、稿纸还在很下面"——三要素与黑名单已经收进 `过滤标准` 抽屉，
  稿纸回到第一屏。抽屉用 `visibility` 而不是 `display:none`，所以页内自检仍能驱动里面的控件。
- 旧文档写的"headless 通道坏了，跑不了页内断言所以不敢动 DOM"——DOM 已经动了，
  断言走内置浏览器 + `kouboSelftest()` 实测通过，那条限制不再成立。

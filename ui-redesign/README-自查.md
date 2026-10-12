# 稿纸台原型 · 自查记录（2026-10-11）

被测文件：`ui-redesign/koubo-ui-redesign.html`（68,094 字节，单文件，零网络请求）
检查工具：`_verify_tokens.cjs`（从交付文件的 CSS 里解析真实值再算，不核对文档措辞）、`_chk_ui.cjs`（结构与绑定体检）

## 1. 文本对比度（36 组，全部达标）

前景/背景全部由文件内 `:root` 与 `[data-theme="dark"]` 的声明解析而来，按 WCAG 相对亮度公式计算。

| 场景 | 组合 | 实测 | 需 ≥ |
|---|---|---|---|
| 日稿 UI 正文 | `ink-primary` → 页面底 | 14.16:1 | 4.5 |
| 日稿 稿纸正文 | `ink-primary` → 稿纸白 | 15.59:1 | 4.5 |
| 日稿 次级说明 | `ink-ui` → 页面底 | 7.32:1 | 4.5 |
| 日稿 弱化说明 | `ink-muted` → 页面底 | 5.30:1 | 4.5 |
| 日稿 选中行文字 | `action-text` → 选中底 | 6.71:1 | 4.5 |
| 日稿 主按钮 | 白字 → `#0F766E` | 5.47:1 | 4.5 |
| 日稿 主按钮悬停 | 白字 → `#115E59` | 7.58:1 | 4.5 |
| 日稿 极限词 | `#97231B` → 稿纸白 | 8.16:1 | 4.5 |
| 日稿 待删标记 | `#9A3412` → 稿纸白 | 7.31:1 | 4.5 |
| 日稿 保留 | `#166534` → 稿纸白 | 7.13:1 | 4.5 |
| 日稿 客户原话 | `#1D4ED8` → 稿纸白 | 6.70:1 | 4.5 |
| 日稿 四类 pill | 800 档字 → 浅底 | 5.86–6.96:1 | 4.5 |
| 日稿 输入框边界 | `#6B7280` → 稿纸白 | 4.83:1 | 3.0（非文本 1.4.11） |
| 日稿 焦点环 | `#0F766E` → 稿纸白 / 页面底 | 5.47 / 4.97:1 | 3.0 |
| 夜稿 全部语义色 | 见工具输出 | 8.29–14.30:1 | 4.5 |
| 夜稿 主按钮 | `#0F1315` → `#2DD4BF` | 10.03:1 | 4.5 |
| 夜稿 焦点环 | `#5EEAD4` → 稿纸 | 12.63:1 | 3.0 |

**这一轮抓到的两个真问题（已修）**

1. 检索推荐的 `#0D9488` 上压白字只有 **3.74:1**，不达 AA。主色降档到 `#0F766E`（5.47:1），`#0D9488` 降级为「仅大字与图形」用途（进度条、色条）。
2. 夜稿第一版把 `--action` 覆写成 `#0F766E`，而 `--ink-on-action` 已是深色 `#0F1315` —— **深字压深底**，主按钮会变成看不清。删掉这条覆写，让 `--action` 跟随 `--p-teal-700` 在两档各自解析（日 `#0F766E` / 夜 `#2DD4BF`），并新增 `--ink-on-solid` 令牌：压在饱和底上的字，亮档白、暗档必须转深。原来的 `.btn-primary:hover{color:#FFFFFF}` 和警示 toast 都硬写了白，一并换成令牌。

## 2. 令牌纪律

- 裸色值出现在令牌块之外：**0 处**（改前 2 处，见上面问题 2）
- `var(--x)88` 这类 CSS 无效拼法：**0 处**
- `aria-live` 属性：**1 个**（只有 `#toast`；步骤计数与风险计数不挂 live region，避免抢话）
- 外链（含字体 CDN）：**0**
- `@media (prefers-reduced-motion)`：存在，全部过渡降到 1ms

## 3. 命中区契约（WCAG 2.2 SC 2.5.8，Web 端 24 CSS px）

| 控件 | 声明 |
|---|---|
| `.btn` | `min-height: var(--btn-h)` = 40px |
| `.icon-btn` / 星标 | `width/height: var(--target)` = 28px |
| `.step`（左轨步骤） | `min-height: var(--target)` |
| `.chip`（黑名单词、分桶筛选） | `min-height: var(--target)` |
| `.seg label`（分段选择器） | `min-height: 26px` —— 量 label 不量 1×1 的 radio |
| `.itab` | `min-height: var(--target)` |

`.risk-word` 是行内词级目标，按 SC 2.5.8 的「内联」例外处理，靠 3px 波浪下划线 + `⚠` 形状提示扩大可辨识范围。

## 4. 结构与绑定

- `data-act` 24 个，全部有对应处理函数（沿用产品的事件委托写法，方便日后整体移植时对照）
- `id` 47 个，无重复；JS 里引用的 id 全部存在
- JS 语法 `node --check` 通过（27.3k 字符单段）
- 关键中文串 16 条全部在位（防 Write/Edit 静默吞字那条老坑）

## 5. 修掉的两个我自己写进去的缺陷

- **星星打分键盘不可上调**：原本给未点亮的星挂 `tabindex="-1"`，键盘用户只能降分不能加分。改成五颗全可聚焦 + `aria-pressed`。
- **风险词跳转靠文字匹配**：原本用按钮的 `textContent` 去 `RISK` 里猜条目，改文案就失效。改成句子下标 `si` 直接对 id。

## 6. 没能完成的检查（说明白）

**浏览器渲染层实测本轮做不到。** 本机 headless 通道全灭：Chrome 的 `--dump-dom`、`--print-to-pdf` 对所有 URL（含 `example.com`）都只产出 0 字节；`--screenshot` 中途成功过一次（211KB PNG）之后同样开始只出 0 字节；Edge 的 `--print-to-pdf` 也是 0 字节。换绝对路径 profile、去掉 `--no-sandbox`、去掉 `--virtual-time-budget`、逐个全新 profile 都试过。想按老办法筛命令行杀掉残余 headless 进程，进程枚举这一通道被权限层拦下（判定为浏览器会话侦察）。内置浏览器 `navigate_page` 访问页面也被拦。

所以以下三项**只有静态契约，没有实测数字**：

- 三栏在不同视口下的真实几何（rail/desk/inspector 宽度、稿纸行宽是否真的落在 38 字）
- `:has()`、`text-decoration: wavy` 等特性在目标浏览器里的实际渲染
- 动态插入的行（放回后的 pill、空状态）渲染后的对比度与命中区

`audit.html` 已经改成支持 `?target=`，浏览器一通就能立刻补跑：

```bash
# 基线（已上线产品）
chrome --headless --disable-gpu --allow-file-access-from-files \
  --user-data-dir=<工作区绝对路径>\_p1 --timeout=12000 --screenshot=<路径>.png \
  <工作区>/audit.html
# 原型
… --user-data-dir=<工作区绝对路径>\_p2 … <工作区>/audit.html?target=ui-redesign/koubo-ui-redesign.html
```

**请你在浏览器里打开 `ui-redesign/koubo-ui-redesign.html` 亲眼看一遍** —— 设计成不成，这一条比我的数字更要紧。

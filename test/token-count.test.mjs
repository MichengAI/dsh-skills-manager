// token 估算器单元测试（零第三方依赖）
// 断言：CJK 每字约 1 个 token；其余按词块折算；空串与纯空白返回 0。
// 运行：node test/token-count.test.mjs

import { estimateTokens } from "../lib/token-count.js";

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error("✗ " + msg);
  }
}
function eq(actual, expected, msg) {
  ok(
    actual === expected,
    msg + " (got " + JSON.stringify(actual) + ", want " + JSON.stringify(expected) + ")",
  );
}

eq(estimateTokens(""), 0, "空串返回 0");
eq(estimateTokens("   \n\t "), 0, "纯空白返回 0");
eq(estimateTokens("hello"), 1, "常见短英文词约 1 个 token");
eq(estimateTokens("hello world"), 2, "两个常见短词约 2 个 token");
eq(estimateTokens("internationalization"), 4, "20 字符长词按每约 5 字符 1 块折算");
eq(estimateTokens("internationalization"), Math.ceil(20 / 5), "长词折算公式与文档一致");
eq(estimateTokens("code-review-helper"), 7, "连字符拆词：code(1) -(1) review(2) -(1) helper(2)");
eq(estimateTokens("..."), 2, "连续标点两两合并");
eq(estimateTokens("A1 b2"), 2, "字母数字混排词各按 1 块计");
eq(estimateTokens("2024"), 1, "四位数字按 1 块计");

// ── CJK：一字约一个 token ──
eq(estimateTokens("把行程做成网页"), 7, "中文每字约 1 个 token");
eq(estimateTokens("한국어 텍스트 예시"), 8, "谚文音节每字约 1 个 token");
eq(estimateTokens("한글"), 2, "谚文不受空格影响逐字计数");
eq(estimateTokens("カタカナ"), 4, "片假名逐字计数");
eq(estimateTokens("ひらがな"), 4, "平假名逐字计数");
eq(estimateTokens("ＡＢＣ１２３"), 6, "全角形式逐字计数");
eq(estimateTokens("。、！"), 3, "CJK 句读逐字计数");
eq(
  estimateTokens("生成旅行计划并输出网页"),
  11,
  "中文描述长度即 token 数（一字一个）",
);

// ── 混合文本 ──
eq(estimateTokens("生成 travel 计划"), 6, "中英混排分段各自折算：生成(2) travel(2) 计划(2)");
eq(estimateTokens("Use it."), 3, "英文句子：Use(1) it(1) .(1)");
eq(estimateTokens("👍"), 1, "辅助平面符号按 1 个计");
eq(estimateTokens("😀👍"), 2, "emoji 逐个计数");
eq(
  estimateTokens("---\nname: demo\n"),
  5,
  "frontmatter 分隔符按标点折算：---(2) name(1) :(1) demo(1)",
);

// 与 chars/4 的经典粗估对比：纯英文长文不偏离两倍以上。
const englishParagraph =
  "Follow the user request carefully and produce a readable summary with clear sections before returning the final answer.";
const rough = Math.ceil(englishParagraph.length / 4);
const estimate = estimateTokens(englishParagraph);
ok(
  estimate >= Math.ceil(rough / 2) && estimate <= rough * 2,
  `英文长段估算 (${estimate}) 不偏离 chars/4 粗估 (${rough}) 两倍以上`,
);

// CJK 长文本不受 chars/4 低估：token 数应接近字数而不是四分之一。
const chineseParagraph = "这是一段用来校准的中文描述，逐字计数的近似值应当接近字符总数。";
eq(
  estimateTokens(chineseParagraph),
  [...chineseParagraph].length,
  "CJK 文本 token 数等于字数（含句读），不被 chars/4 低估",
);

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);

// 轻量 token 估算器：不引入真实分词器（运行时依赖只有 fflate），
// 只在服务端扫描 / 详情读取时对 description 与正文做近似计数，界面用 ≈ 标注为估算值。
// 近似依据：CJK 表意文字（汉字、谚文、假名、全角形式）在主流 BPE 词表里基本一字一个 token；
// 其余文本按词块折算（常见短词约 1 个，长词每约 5 个字符 1 个），连续标点两两合并。

/** 判断码位是否属于“一字约一个 token”的 CJK 相关范围（谚文、假名、汉字、全角形式）。 */
function isCjkCodePoint(cp: number): boolean {
  return (
    (cp >= 0x1100 && cp <= 0x11ff) || // 谚文字母
    (cp >= 0x2e80 && cp <= 0x303f) || // CJK 部首与符号（含。、「」等句读）
    (cp >= 0x3040 && cp <= 0x30ff) || // 平假名与片假名
    (cp >= 0x3130 && cp <= 0x318f) || // 谚文兼容字母
    (cp >= 0x3400 && cp <= 0x4dbf) || // 扩展 A
    (cp >= 0x4e00 && cp <= 0x9fff) || // 统一表意文字
    (cp >= 0xa960 && cp <= 0xa97f) || // 谚文扩展 A
    (cp >= 0xac00 && cp <= 0xd7ff) || // 谚文音节
    (cp >= 0xf900 && cp <= 0xfaff) || // 兼容表意文字
    (cp >= 0xff00 && cp <= 0xff9f) // 全角形式与半角假名（扩展 B 及之后的表意文字 cp > 0xffff，由外层短路覆盖）
  );
}

const WORD_CHARACTER = /[A-Za-z0-9_]/;
const WHITESPACE = /\s/;

/** 宿主 @deepseek-ai/dsh-tool-skill 注入系统提示词目录时的默认最大简介长度 */
export const DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH = 500;

/** 对齐宿主目录简介截断规则（超出 500 字符截断至 497 字符并补 "..."） */
export function truncateCatalogDescription(description: string, maxLength: number = DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH): string {
  if (!description || description.length <= maxLength) return description || "";
  return description.slice(0, Math.max(0, maxLength - 3)) + "...";
}

/** 纯函数估算文本 token 数；空串与纯空白返回 0。 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let total = 0;
  let word = 0; // 当前拉丁字母/数字连续段长度
  let punctuation = 0; // 当前连续标点/符号长度
  const flushWord = () => {
    if (word > 0) {
      total += Math.ceil(word / 5);
      word = 0;
    }
  };
  const flushPunctuation = () => {
    if (punctuation > 0) {
      total += Math.ceil(punctuation / 2);
      punctuation = 0;
    }
  };
  for (const character of text) {
    const cp = character.codePointAt(0)!;
    if (cp > 0xffff || isCjkCodePoint(cp)) {
      // 辅助平面符号（emoji 等）与 CJK 均按每字 1 个近似。
      flushWord();
      flushPunctuation();
      total += 1;
      continue;
    }
    if (WHITESPACE.test(character)) {
      flushWord();
      flushPunctuation();
      continue;
    }
    if (WORD_CHARACTER.test(character)) {
      flushPunctuation();
      word += 1;
      continue;
    }
    flushWord();
    punctuation += 1;
  }
  flushWord();
  flushPunctuation();
  return total;
}

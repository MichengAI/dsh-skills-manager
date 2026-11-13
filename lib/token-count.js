function isCjkCodePoint(cp) {
  return cp >= 4352 && cp <= 4607 || // 谚文字母
  cp >= 11904 && cp <= 12351 || // CJK 部首与符号（含。、「」等句读）
  cp >= 12352 && cp <= 12543 || // 平假名与片假名
  cp >= 12592 && cp <= 12687 || // 谚文兼容字母
  cp >= 13312 && cp <= 19903 || // 扩展 A
  cp >= 19968 && cp <= 40959 || // 统一表意文字
  cp >= 43360 && cp <= 43391 || // 谚文扩展 A
  cp >= 44032 && cp <= 55295 || // 谚文音节
  cp >= 63744 && cp <= 64255 || // 兼容表意文字
  cp >= 65280 && cp <= 65439;
}
const WORD_CHARACTER = /[A-Za-z0-9_]/;
const WHITESPACE = /\s/;
const DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH = 500;
function truncateCatalogDescription(description, maxLength = DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH) {
  if (!description) return "";
  const normalized = description.replaceAll(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return normalized.slice(0, Math.max(0, maxLength - 3)) + "...";
}
function estimateTokens(text) {
  if (!text) return 0;
  let total = 0;
  let word = 0;
  let punctuation = 0;
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
    const cp = character.codePointAt(0);
    if (cp > 65535 || isCjkCodePoint(cp)) {
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
export {
  DEFAULT_CATALOG_DESCRIPTION_MAX_LENGTH,
  estimateTokens,
  truncateCatalogDescription
};

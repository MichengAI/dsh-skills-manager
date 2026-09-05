import { randomUUID } from "node:crypto";
import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const CHAT_PRESET_ID = "zf-chat-workbench-v1";
const FORBIDDEN = /shell|terminal|filesystem|str-replace|skill|subagent|browser/i;

function normalized(text) {
  return String(text).replace(/\r\n/g, "\n").trimEnd() + "\n";
}

export function assertChatComposition(text) {
  const value = normalized(text);
  if (
    !value.includes("@deepseek-ai/dsh-persona")
    || !value.includes("@deepseek-ai/dsh-tool-web")
    || FORBIDDEN.test(value)
  ) throw new Error("unsafe-chat-composition");
  return value;
}

async function atomicWrite(path, text) {
  const temporary = join(dirname(path), `.agent.cordis.${randomUUID()}.tmp`);
  await writeFile(temporary, text, { mode: 0o600 });
  try {
    await rename(temporary, path);
  } catch (error) {
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function ensureChatPreset(agentPresets, options = {}) {
  const bundledText = normalized(
    options.bundledText
      ?? await readFile(new URL("../../presets/zf-chat/agent.cordis.yml", import.meta.url), "utf8"),
  );
  const bundledMetadata = options.bundledMetadata
    || await readFile(new URL("../../presets/zf-chat/preset.yml", import.meta.url), "utf8");
  const existing = (await agentPresets.list()).find((entry) => entry.id === CHAT_PRESET_ID);
  if (existing) {
    const installed = normalized(await agentPresets.read(CHAT_PRESET_ID));
    if (installed !== bundledText) throw new Error("preset-content-conflict");
    assertChatComposition(bundledText);
    assertChatComposition(installed);
    return { id: CHAT_PRESET_ID, installed: false };
  }

  assertChatComposition(bundledText);

  await agentPresets.copy("standard", CHAT_PRESET_ID, "正方校园问答");
  try {
    const copied = await agentPresets.resolve(CHAT_PRESET_ID);
    await atomicWrite(copied.path, bundledText);
    await atomicWrite(join(dirname(copied.path), "preset.yml"), bundledMetadata);
    const verified = assertChatComposition(await agentPresets.read(CHAT_PRESET_ID));
    if (normalized(verified) !== bundledText) throw new Error("preset-verification-failed");
    return { id: CHAT_PRESET_ID, installed: true };
  } catch (error) {
    await agentPresets.remove(CHAT_PRESET_ID).catch(() => undefined);
    throw error;
  }
}

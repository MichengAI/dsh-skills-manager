import test from "node:test";
import assert from "node:assert/strict";
import { createSpeechInput } from "../lib/client/speech-input.js";

function recognitionBrowser({ preferred = false, fallback = false } = {}) {
  const instances = [];
  class FakeRecognition {
    constructor() {
      this.started = 0;
      this.stopped = 0;
      instances.push(this);
    }

    start() {
      this.started += 1;
    }

    stop() {
      this.stopped += 1;
    }
  }

  return {
    browser: {
      ...(preferred ? { SpeechRecognition: FakeRecognition } : {}),
      ...(fallback ? { webkitSpeechRecognition: FakeRecognition } : {}),
    },
    instances,
  };
}

test("prefers SpeechRecognition and configures Chinese final/interim recognition", () => {
  const { browser, instances } = recognitionBrowser({ preferred: true, fallback: true });
  const speech = createSpeechInput(browser);
  const states = [];
  const texts = [];

  speech.start({ onText: (text) => texts.push(text), onState: (state) => states.push(state), onError() {} });

  assert.equal(speech.supported, true);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].lang, "zh-CN");
  assert.equal(instances[0].interimResults, true);
  assert.equal(instances[0].continuous, false);
  instances[0].onstart();
  assert.deepEqual(states, ["listening"]);
  instances[0].onend();
  assert.deepEqual(states, ["listening", "idle"]);
});

test("falls back to webkitSpeechRecognition when the standard constructor is absent", () => {
  const { browser, instances } = recognitionBrowser({ fallback: true });
  const speech = createSpeechInput(browser);

  speech.start({ onText() {}, onState() {}, onError() {} });

  assert.equal(speech.supported, true);
  assert.equal(instances.length, 1);
  assert.equal(instances[0].started, 1);
});

test("appends only final transcripts and reports microphone permission errors", () => {
  const { browser, instances } = recognitionBrowser({ preferred: true });
  const speech = createSpeechInput(browser);
  const texts = [];
  const errors = [];

  speech.start({ onText: (text) => texts.push(text), onState() {}, onError: (error) => errors.push(error) });
  instances[0].onresult({
    resultIndex: 0,
    results: [
      [{ transcript: "中间结果" }],
      Object.assign([{ transcript: "最终结果" }], { isFinal: true }),
    ],
  });
  instances[0].onerror({ error: "not-allowed" });

  assert.deepEqual(texts, ["最终结果"]);
  assert.deepEqual(errors, ["麦克风权限未开启"]);
});

test("reports idle and cleans up recognition when recognition errors", () => {
  const { browser, instances } = recognitionBrowser({ preferred: true });
  const speech = createSpeechInput(browser);
  const states = [];

  speech.start({ onText() {}, onState: (state) => states.push(state), onError() {} });
  instances[0].onerror({ error: "network" });
  speech.stop();

  assert.deepEqual(states, ["idle"]);
  assert.equal(instances[0].stopped, 0);
});

test("cleans up recognition when recognition ends", () => {
  const { browser, instances } = recognitionBrowser({ preferred: true });
  const speech = createSpeechInput(browser);
  const states = [];

  speech.start({ onText() {}, onState: (state) => states.push(state), onError() {} });
  instances[0].onend();
  speech.stop();

  assert.deepEqual(states, ["idle"]);
  assert.equal(instances[0].stopped, 0);
});

test("stops the active recognition instance", () => {
  const { browser, instances } = recognitionBrowser({ preferred: true });
  const speech = createSpeechInput(browser);

  speech.start({ onText() {}, onState() {}, onError() {} });
  speech.stop();
  speech.stop();

  assert.equal(instances[0].stopped, 1);
});

test("starting again stops the previous recognition and reports actionable errors", () => {
  const { browser, instances } = recognitionBrowser({ preferred: true });
  const speech = createSpeechInput(browser);
  const errors = [];

  speech.start({ onError: (error) => errors.push(error) });
  speech.start({ onError: (error) => errors.push(error) });
  assert.equal(instances.length, 2);
  assert.equal(instances[0].stopped, 1);

  instances[1].onerror({ error: "audio-capture" });
  assert.deepEqual(errors, ["未检测到可用麦克风"]);
});

test("does not expose a supported voice control when recognition is unavailable", () => {
  const speech = createSpeechInput({});

  assert.deepEqual({ supported: speech.supported }, { supported: false });
  assert.doesNotThrow(() => speech.start({ onText() {}, onState() {}, onError() {} }));
  assert.doesNotThrow(() => speech.stop());
});

const UNSUPPORTED = {
  supported: false,
  start() {},
  stop() {},
};

export function createSpeechInput(browser = globalThis) {
  const Recognition = typeof browser?.SpeechRecognition === "function"
    ? browser.SpeechRecognition
    : typeof browser?.webkitSpeechRecognition === "function"
      ? browser.webkitSpeechRecognition
      : null;

  if (!Recognition) return UNSUPPORTED;

  let recognition = null;
  return {
    supported: true,
    start({ onText = () => {}, onState = () => {}, onError = () => {} } = {}) {
      recognition = new Recognition();
      recognition.lang = "zh-CN";
      recognition.interimResults = true;
      recognition.continuous = false;
      recognition.onstart = () => onState("listening");
      recognition.onend = () => onState("idle");
      recognition.onerror = (event) => onError(event?.error === "not-allowed" ? "未获得麦克风权限" : "语音识别失败，请重试");
      recognition.onresult = (event) => {
        let finalText = "";
        const resultIndex = Number.isInteger(event?.resultIndex) ? event.resultIndex : 0;
        for (let index = resultIndex; index < (event?.results?.length || 0); index += 1) {
          const result = event.results[index];
          if (result?.isFinal) finalText += result[0]?.transcript || "";
        }
        if (finalText) onText(finalText);
      };
      recognition.start();
    },
    stop() {
      recognition?.stop();
    },
  };
}

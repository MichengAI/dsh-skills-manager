const UNSUPPORTED = {
  supported: false,
  start() {},
  stop() {},
};

function speechErrorMessage(reason) {
  const messages = {
    "not-allowed": "麦克风权限未开启",
    "service-not-allowed": "麦克风权限未开启",
    "audio-capture": "未检测到可用麦克风",
    network: "语音服务连接失败",
    "no-speech": "没有识别到语音，请重试",
  };
  return messages[reason] || "语音识别失败，请重试";
}

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
      recognition?.stop?.();
      const current = new Recognition();
      recognition = current;
      current.lang = "zh-CN";
      current.interimResults = true;
      current.continuous = false;
      current.onstart = () => {
        if (recognition === current) onState("listening");
      };
      current.onend = () => {
        if (recognition !== current) return;
        recognition = null;
        onState("idle");
      };
      current.onerror = (event) => {
        if (recognition !== current) return;
        recognition = null;
        onState("idle");
        onError(speechErrorMessage(event?.error));
      };
      current.onresult = (event) => {
        if (recognition !== current) return;
        let finalText = "";
        const resultIndex = Number.isInteger(event?.resultIndex) ? event.resultIndex : 0;
        for (let index = resultIndex; index < (event?.results?.length || 0); index += 1) {
          const result = event.results[index];
          if (result?.isFinal) finalText += result[0]?.transcript || "";
        }
        if (finalText) onText(finalText);
      };
      current.start();
    },
    stop() {
      const current = recognition;
      recognition = null;
      current?.stop();
    },
  };
}

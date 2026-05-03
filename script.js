/* global SpeechSDK */

const STORAGE_KEY = "azureSpeechSettings.v1";

function qs(id) {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element: #${id}`);
  return element;
}

function now() {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function setText(el, text) {
  el.textContent = text;
}

function appendLog(logEl, line) {
  const prefix = `[${now()}] `;
  logEl.textContent = `${logEl.textContent}${logEl.textContent ? "\n" : ""}${prefix}${line}`;
  logEl.scrollTop = logEl.scrollHeight;
}

function setTab(active) {
  const sttTab = qs("tab-stt");
  const ttsTab = qs("tab-tts");
  const sttPanel = qs("panel-stt");
  const ttsPanel = qs("panel-tts");

  const sttActive = active === "stt";
  sttTab.classList.toggle("tab--active", sttActive);
  ttsTab.classList.toggle("tab--active", !sttActive);
  sttTab.setAttribute("aria-selected", String(sttActive));
  ttsTab.setAttribute("aria-selected", String(!sttActive));
  sttPanel.classList.toggle("panel--active", sttActive);
  ttsPanel.classList.toggle("panel--active", !sttActive);
}

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { key: "", region: "" };
    const parsed = JSON.parse(raw);
    return { key: String(parsed.key || ""), region: String(parsed.region || "") };
  } catch {
    return { key: "", region: "" };
  }
}

function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

function clearSettings() {
  localStorage.removeItem(STORAGE_KEY);
}

function updateSettingsStatus() {
  const badge = qs("settingsStatus");
  const { key, region } = loadSettings();
  if (key && region) {
    badge.textContent = "Settings: saved";
    badge.style.borderColor = "rgba(46, 229, 157, 0.35)";
  } else if (key || region) {
    badge.textContent = "Settings: partial";
    badge.style.borderColor = "rgba(255, 255, 255, 0.18)";
  } else {
    badge.textContent = "Settings: not saved";
    badge.style.borderColor = "rgba(255, 255, 255, 0.18)";
  }
}

function getConnectionOrThrow() {
  const key = qs("speechKey").value.trim();
  const region = qs("speechRegion").value.trim();
  if (!key) throw new Error("Missing Speech key. Paste your key in Connection → Speech key.");
  if (!region) throw new Error("Missing region. Enter your region (e.g. eastus).");
  return { key, region };
}

function ensureSdkLoaded() {
  if (!window.SpeechSDK) {
    throw new Error("Azure Speech SDK not loaded. Check your network access to https://aka.ms/csspeech/jsbrowserpackageraw");
  }
}

let sttRecognizer = null;
let ttsSynthesizer = null;

async function copyToClipboard(text) {
  if (!navigator.clipboard) throw new Error("Clipboard API unavailable in this browser context.");
  await navigator.clipboard.writeText(text);
}

function wireConnectionUi() {
  const settings = loadSettings();
  qs("speechKey").value = settings.key;
  qs("speechRegion").value = settings.region;
  updateSettingsStatus();

  qs("saveSettings").addEventListener("click", () => {
    const key = qs("speechKey").value.trim();
    const region = qs("speechRegion").value.trim();
    saveSettings({ key, region });
    updateSettingsStatus();
  });

  qs("clearSettings").addEventListener("click", () => {
    clearSettings();
    qs("speechKey").value = "";
    qs("speechRegion").value = "";
    updateSettingsStatus();
  });

  qs("toggleKeyVisibility").addEventListener("click", () => {
    const input = qs("speechKey");
    input.type = input.type === "password" ? "text" : "password";
  });
}

function wireTabs() {
  qs("tab-stt").addEventListener("click", () => setTab("stt"));
  qs("tab-tts").addEventListener("click", () => setTab("tts"));
}

function setSttButtons(running) {
  qs("sttStart").disabled = running;
  qs("sttStop").disabled = !running;
}

function setTtsButtons(running) {
  qs("ttsSpeak").disabled = running;
  qs("ttsStop").disabled = !running;
}

async function sttStart() {
  ensureSdkLoaded();
  const logEl = qs("sttStatus");
  appendLog(logEl, "Starting recognition…");

  const { key, region } = getConnectionOrThrow();
  const lang = qs("sttLang").value.trim() || "en-US";

  if (sttRecognizer) {
    try {
      await sttStop();
    } catch {
      // ignore; we'll replace it anyway
    }
  }

  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
  speechConfig.speechRecognitionLanguage = lang;

  const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
  sttRecognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

  const output = qs("sttOutput");

  sttRecognizer.recognizing = (_s, e) => {
    if (e && e.result && e.result.text) {
      // show partial in the log, but don't spam if empty
      appendLog(logEl, `Recognizing: ${e.result.text}`);
    }
  };

  sttRecognizer.recognized = (_s, e) => {
    if (!e || !e.result) return;
    if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
      if (e.result.text) {
        output.value = `${output.value}${output.value ? "\n" : ""}${e.result.text}`;
      }
      appendLog(logEl, `Recognized.`);
    } else if (e.result.reason === SpeechSDK.ResultReason.NoMatch) {
      appendLog(logEl, "NoMatch: speech could not be recognized.");
    }
  };

  sttRecognizer.canceled = (_s, e) => {
    appendLog(logEl, `Canceled: ${e.reason || "unknown"}`);
    if (e && e.errorDetails) appendLog(logEl, `Error: ${e.errorDetails}`);
    setSttButtons(false);
  };

  sttRecognizer.sessionStarted = () => appendLog(logEl, "Session started.");
  sttRecognizer.sessionStopped = () => {
    appendLog(logEl, "Session stopped.");
    setSttButtons(false);
  };

  setSttButtons(true);
  await new Promise((resolve, reject) => {
    sttRecognizer.startContinuousRecognitionAsync(resolve, reject);
  });
  appendLog(logEl, "Listening. Speak into your microphone…");
}

async function sttStop() {
  const logEl = qs("sttStatus");
  if (!sttRecognizer) {
    setSttButtons(false);
    return;
  }
  appendLog(logEl, "Stopping recognition…");
  const recognizerToClose = sttRecognizer;
  sttRecognizer = null;

  await new Promise((resolve) => {
    recognizerToClose.stopContinuousRecognitionAsync(
      () => {
        recognizerToClose.close();
        resolve();
      },
      () => {
        try {
          recognizerToClose.close();
        } finally {
          resolve();
        }
      }
    );
  });

  setSttButtons(false);
  appendLog(logEl, "Stopped.");
}

async function ttsSpeak() {
  ensureSdkLoaded();
  const logEl = qs("ttsStatus");
  const { key, region } = getConnectionOrThrow();
  const voice = qs("ttsVoice").value.trim();
  const text = qs("ttsText").value.trim();

  if (!text) {
    appendLog(logEl, "Enter text to speak.");
    return;
  }

  appendLog(logEl, "Synthesizing…");
  setTtsButtons(true);

  if (ttsSynthesizer) {
    try {
      ttsSynthesizer.close();
    } catch {
      // ignore
    }
    ttsSynthesizer = null;
  }

  const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(key, region);
  if (voice) speechConfig.speechSynthesisVoiceName = voice;
  const audioConfig = SpeechSDK.AudioConfig.fromDefaultSpeakerOutput();
  ttsSynthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig, audioConfig);

  const result = await new Promise((resolve, reject) => {
    ttsSynthesizer.speakTextAsync(text, resolve, reject);
  });

  if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
    appendLog(logEl, "Done (played to speakers).");
  } else if (result.reason === SpeechSDK.ResultReason.Canceled) {
    const details = SpeechSDK.CancellationDetails.fromResult(result);
    appendLog(logEl, `Canceled: ${details.reason}`);
    if (details.errorDetails) appendLog(logEl, `Error: ${details.errorDetails}`);
  } else {
    appendLog(logEl, `Unexpected result: ${String(result.reason)}`);
  }

  try {
    ttsSynthesizer.close();
  } catch {
    // ignore
  }
  ttsSynthesizer = null;
  setTtsButtons(false);
}

function ttsStop() {
  const logEl = qs("ttsStatus");
  if (ttsSynthesizer) {
    appendLog(logEl, "Stopping synthesizer…");
    try {
      ttsSynthesizer.close();
    } catch {
      // ignore
    }
    ttsSynthesizer = null;
  }
  setTtsButtons(false);
}

function wireSttUi() {
  qs("sttStart").addEventListener("click", async () => {
    try {
      await sttStart();
    } catch (err) {
      setSttButtons(false);
      appendLog(qs("sttStatus"), err instanceof Error ? err.message : String(err));
    }
  });

  qs("sttStop").addEventListener("click", async () => {
    try {
      await sttStop();
    } catch (err) {
      setSttButtons(false);
      appendLog(qs("sttStatus"), err instanceof Error ? err.message : String(err));
    }
  });

  qs("sttCopy").addEventListener("click", async () => {
    try {
      await copyToClipboard(qs("sttOutput").value);
      appendLog(qs("sttStatus"), "Copied transcript to clipboard.");
    } catch (err) {
      appendLog(qs("sttStatus"), err instanceof Error ? err.message : String(err));
    }
  });

  qs("sttClear").addEventListener("click", () => {
    qs("sttOutput").value = "";
  });
}

function wireTtsUi() {
  qs("ttsSpeak").addEventListener("click", async () => {
    try {
      await ttsSpeak();
    } catch (err) {
      setTtsButtons(false);
      appendLog(qs("ttsStatus"), err instanceof Error ? err.message : String(err));
    }
  });

  qs("ttsStop").addEventListener("click", () => {
    try {
      ttsStop();
    } catch (err) {
      appendLog(qs("ttsStatus"), err instanceof Error ? err.message : String(err));
    }
  });
}

function init() {
  const sdkStatus = qs("sdkStatus");
  setText(sdkStatus, "SDK: loading…");

  wireConnectionUi();
  wireTabs();
  wireSttUi();
  wireTtsUi();

  // Basic focus state
  setTab("stt");

  // SDK may load after DOMContentLoaded; poll briefly and then settle.
  let tries = 0;
  const timer = window.setInterval(() => {
    tries += 1;
    if (window.SpeechSDK) {
      setText(sdkStatus, "SDK: ready");
      sdkStatus.style.borderColor = "rgba(46, 229, 157, 0.35)";
      window.clearInterval(timer);
      return;
    }
    if (tries >= 40) {
      setText(sdkStatus, "SDK: not loaded");
      sdkStatus.style.borderColor = "rgba(255, 90, 106, 0.35)";
      window.clearInterval(timer);
    }
  }, 200);
}

document.addEventListener("DOMContentLoaded", init);

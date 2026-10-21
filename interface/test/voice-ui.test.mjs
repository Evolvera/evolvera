// Browser glue of the voice feature (public/voice.js) run under Node with fake DOM nodes, MediaRecorder,
// Web Audio, fetch and speechSynthesis. No microphone, no network, no server: every dependency is injected.
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { createVoice } from "../public/voice.js";

const flush = () => new Promise((resolve) => setImmediate(resolve));

class FakeEl {
  constructor() {
    this.hidden = false;
    this.disabled = false;
    this.title = "";
    this.textContent = "";
    this.attrs = {};
    this.classes = new Set();
    this.style = {};
    this.listeners = {};
    this.classList = {
      toggle: (name, force) => (force ?? !this.classes.has(name) ? this.classes.add(name) : this.classes.delete(name)),
      contains: (name) => this.classes.has(name),
    };
  }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  fire(type, event = {}) { for (const fn of this.listeners[type] || []) fn(event); }
}

let env;
let els;
let toasts;
let composer;
let voice;
let fetches;
let recorders;
let trackStops;
let clock;
let intervals;
let spoken;
let cancels;

function makeEnv({ status = { available: true, device: "cuda", model: "small", state: "off" }, transcribe = { status: 200, body: { text: "texto falado" } }, getUserMedia, voices } = {}) {
  fetches = [];
  recorders = [];
  trackStops = 0;
  clock = { t: 1000 };
  intervals = [];
  spoken = [];
  cancels = 0;
  class FakeRecorder {
    static isTypeSupported() { return true; }
    constructor(stream, options) {
      this.stream = stream;
      this.mimeType = options?.mimeType || "audio/webm";
      this.state = "inactive";
      recorders.push(this);
    }
    start() { this.state = "recording"; }
    stop() {
      this.state = "inactive";
      queueMicrotask(() => {
        this.ondataavailable?.({ data: new Blob(["abc"], { type: this.mimeType }) });
        this.onstop?.();
      });
    }
  }
  class FakeUtterance {
    constructor(text) { this.text = text; }
  }
  const documentListeners = {};
  return {
    document: { addEventListener: (type, fn) => (documentListeners[type] ||= []).push(fn), listeners: documentListeners },
    navigator: {
      mediaDevices: {
        getUserMedia: getUserMedia || (async () => ({ getTracks: () => [{ stop: () => trackStops++ }] })),
      },
    },
    MediaRecorder: FakeRecorder,
    AudioContext: class {
      createMediaStreamSource() { return { connect() {} }; }
      createAnalyser() { return { fftSize: 0, frequencyBinCount: 32, getByteTimeDomainData: (array) => array.fill(160) }; }
      close() { return Promise.resolve(); }
    },
    fetch: async (url, options = {}) => {
      fetches.push({ url, options });
      if (url === "/api/voice/status") return { ok: status !== null, status: status ? 200 : 404, json: async () => status || {} };
      return { ok: transcribe.status === 200, status: transcribe.status, json: async () => transcribe.body };
    },
    speechSynthesis: {
      getVoices: () => voices || [{ name: "Microsoft Maria Desktop", lang: "pt-BR" }, { name: "Microsoft Francisca Online (Natural)", lang: "pt-BR" }],
      speak: (utterance) => spoken.push(utterance),
      cancel: () => { cancels++; },
    },
    SpeechSynthesisUtterance: FakeUtterance,
    now: () => clock.t,
    setInterval: (fn) => intervals.push(fn),
    clearInterval: () => {},
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
  };
}

function setup(options = {}, readEnabled = false) {
  env = makeEnv(options);
  els = { micBtn: new FakeEl(), micLive: new FakeEl(), micLabel: new FakeEl(), micTimer: new FakeEl(), micLevel: new FakeEl(), speakStop: new FakeEl() };
  toasts = [];
  composer = { value: "", start: 0, end: 0 };
  voice = createVoice({
    els,
    token: "tok123",
    toast: (message, type) => toasts.push([message, type]),
    composer: {
      read: () => ({ ...composer }),
      write: (value, cursor) => Object.assign(composer, { value, start: cursor, end: cursor }),
    },
    isReadEnabled: () => readEnabled,
    onSpeakingChange: () => {},
    env,
  });
}

describe("voice.js: microphone", () => {
  beforeEach(() => setup());

  // The server status decides whether the mic is usable; the token header must accompany the request.
  test("init reads /api/voice/status with the token and enables the mic when available", async () => {
    await voice.init();
    assert.equal(fetches[0].url, "/api/voice/status");
    assert.equal(fetches[0].options.headers["x-pi-studio-token"], "tok123");
    assert.equal(els.micBtn.disabled, false);
    assert.match(els.micBtn.title, /Gravar/);
    assert.equal(els.micBtn.hidden, false);
  });

  // The worker is lazy: state=off means it can start on transcription, so it must not block the first recording.
  test("init keeps the mic enabled while the lazy worker is stopped", async () => {
    setup({ status: { available: false, state: "off" } });
    await voice.init();
    assert.equal(els.micBtn.disabled, false);
    els.micBtn.fire("click");
    await flush();
    assert.equal(voice.phase(), "recording");
    assert.equal(recorders.length, 1);
  });

  // When the Python side cannot run, the mic is disabled and the tooltip says why (no stack trace, no silent failure).
  test("init disables the mic with the server reason when available is false", async () => {
    setup({ status: { available: false, reason: "faster-whisper não instalado." } });
    await voice.init();
    assert.equal(els.micBtn.disabled, true);
    assert.equal(els.micBtn.title, "faster-whisper não instalado.");
  });

  // A server without the voice routes (404) or a network error must not break the page: mic disabled, generic tooltip.
  test("init treats a failing status request as unavailable", async () => {
    setup({ status: null });
    await voice.init();
    assert.equal(els.micBtn.disabled, true);
    assert.match(els.micBtn.title, /indisponível/);
    setup();
    env.fetch = async () => { throw new Error("offline"); };
    await voice.init();
    assert.equal(els.micBtn.disabled, true);
  });

  // A browser without MediaRecorder/getUserMedia gets a disabled mic with an explanation, never an exception on click.
  test("init disables the mic when the browser cannot record", async () => {
    setup();
    env.MediaRecorder = undefined;
    await voice.init();
    assert.equal(els.micBtn.disabled, true);
    assert.match(els.micBtn.title, /navegador/);
    setup();
    env.navigator = {};
    await voice.init();
    assert.equal(els.micBtn.disabled, true);
  });

  // Happy path: click starts, click stops and uploads raw audio/webm with the token, the text lands at the caret, tracks are released.
  test("record, stop and transcribe inserts the text at the cursor and releases the microphone", async () => {
    await voice.init();
    composer = { value: "olá fim", start: 3, end: 3 };
    els.micBtn.fire("click");
    await flush();
    assert.equal(voice.phase(), "recording");
    assert.equal(els.micBtn.attrs["aria-pressed"], "true");
    assert.equal(els.micLive.hidden, false);
    assert.equal(recorders[0].mimeType, "audio/webm;codecs=opus");
    clock.t += 7400;
    intervals[0]();
    assert.equal(els.micTimer.textContent, "0:07");
    els.micBtn.fire("click");
    assert.equal(voice.phase(), "transcribing");
    assert.match(els.micLabel.textContent, /transcrevendo/);
    await flush();
    await flush();
    const upload = fetches.find((call) => call.url === "/api/voice/transcribe");
    assert.equal(upload.options.method, "POST");
    assert.equal(upload.options.headers["content-type"], "audio/webm");
    assert.equal(upload.options.headers["x-pi-studio-token"], "tok123");
    assert.ok(upload.options.body instanceof Blob && upload.options.body.size === 3);
    assert.equal(composer.value, "olá texto falado fim");
    assert.equal(trackStops, 1);
    assert.equal(voice.phase(), "idle");
    assert.equal(els.micLive.hidden, true);
    assert.deepEqual(toasts, []);
  });

  // Enter while recording stops it (the composer wires Enter to toggle); the toggle during transcription must not start a new take.
  test("toggle while transcribing is ignored and the status is refreshed afterwards", async () => {
    await voice.init();
    els.micBtn.fire("click");
    await flush();
    clock.t += 2000;
    voice.toggle();
    voice.toggle();
    voice.toggle();
    assert.equal(recorders.length, 1);
    await flush();
    await flush();
    assert.equal(fetches.filter((call) => call.url === "/api/voice/transcribe").length, 1);
    assert.equal(fetches.filter((call) => call.url === "/api/voice/status").length, 2);
  });

  // A tap shorter than REC_MIN_MS carries no speech: say so and skip the upload.
  test("a recording shorter than the minimum is discarded with a toast and no upload", async () => {
    await voice.init();
    els.micBtn.fire("click");
    await flush();
    clock.t += 100;
    els.micBtn.fire("click");
    await flush();
    await flush();
    assert.equal(fetches.some((call) => call.url === "/api/voice/transcribe"), false);
    assert.match(toasts[0][0], /curta/);
    assert.equal(trackStops, 1);
    assert.equal(voice.phase(), "idle");
  });

  // Recording is capped at the server limit: the timer tick past REC_MAX_MS stops it by itself.
  test("the recording stops by itself at the maximum duration", async () => {
    await voice.init();
    els.micBtn.fire("click");
    await flush();
    clock.t += 121000;
    intervals[0]();
    assert.equal(voice.phase(), "transcribing");
    await flush();
    await flush();
    assert.equal(voice.phase(), "idle");
  });

  // Permission denied / no device: a specific toast, the mic returns to idle, nothing is left open.
  test("getUserMedia failure shows a specific toast and returns to idle", async () => {
    setup({ getUserMedia: async () => { throw Object.assign(new Error("denied"), { name: "NotAllowedError" }); } });
    await voice.init();
    els.micBtn.fire("click");
    await flush();
    assert.match(toasts[0][0], /negada/);
    assert.equal(toasts[0][1], "error");
    assert.equal(voice.phase(), "idle");
    assert.equal(recorders.length, 0);
  });

  // Server errors surface the server's own message in a toast and leave the composer untouched.
  test("a 429 from the server becomes a toast and the composer text is unchanged", async () => {
    setup({ transcribe: { status: 429, body: { error: "busy", message: "Fila cheia, tente depois." } } });
    await voice.init();
    composer = { value: "rascunho", start: 8, end: 8 };
    els.micBtn.fire("click");
    await flush();
    clock.t += 2000;
    els.micBtn.fire("click");
    await flush();
    await flush();
    assert.deepEqual(toasts[0], ["Fila cheia, tente depois.", "error"]);
    assert.equal(composer.value, "rascunho");
    assert.equal(voice.phase(), "idle");
  });

  // Silence: the server returns empty text; tell the user instead of inserting nothing silently.
  test("an empty transcription shows a toast and does not touch the composer", async () => {
    setup({ transcribe: { status: 200, body: { text: "  " } } });
    await voice.init();
    els.micBtn.fire("click");
    await flush();
    clock.t += 2000;
    els.micBtn.fire("click");
    await flush();
    await flush();
    assert.match(toasts[0][0], /Não entendi/);
    assert.equal(composer.value, "");
  });

  // A network failure during upload must not strand the UI in "transcrevendo".
  test("a failing upload shows a toast and returns to idle", async () => {
    await voice.init();
    const original = env.fetch;
    env.fetch = async (url, options) => {
      if (url === "/api/voice/transcribe") throw new Error("rede caiu");
      return original(url, options);
    };
    els.micBtn.fire("click");
    await flush();
    clock.t += 2000;
    els.micBtn.fire("click");
    await flush();
    await flush();
    assert.match(toasts[0][0], /rede caiu/);
    assert.equal(voice.phase(), "idle");
  });

  // The real page (window) has no injected clock: voice.js must fall back to Date.now (a tap is still "too short").
  test("without an injected clock the page clock is used", async () => {
    env.now = undefined;
    await voice.init();
    els.micBtn.fire("click");
    await flush();
    els.micBtn.fire("click");
    await flush();
    await flush();
    assert.match(toasts[0][0], /curta/);
  });

  // Ctrl+Shift+M anywhere on the page toggles recording, and the default browser action is cancelled.
  test("Ctrl+Shift+M toggles recording through a document keydown listener", async () => {
    await voice.init();
    let prevented = 0;
    const event = { key: "M", ctrlKey: true, shiftKey: true, preventDefault: () => prevented++ };
    env.document.listeners.keydown[0](event);
    await flush();
    assert.equal(voice.phase(), "recording");
    assert.equal(prevented, 1);
    env.document.listeners.keydown[0]({ key: "a", preventDefault: () => prevented++ });
    assert.equal(prevented, 1);
  });

  // Unavailable mic: the shortcut must not start a recording either.
  test("the shortcut does nothing while the mic is disabled", async () => {
    setup({ status: { available: false } });
    await voice.init();
    env.document.listeners.keydown[0]({ key: "M", ctrlKey: true, shiftKey: true, preventDefault() {} });
    await flush();
    assert.equal(voice.phase(), "idle");
    assert.equal(recorders.length, 0);
  });

  // isRecording lets the composer turn Enter into "stop"; cancel drops the take without uploading.
  test("cancel discards the recording without uploading and releases the microphone", async () => {
    await voice.init();
    els.micBtn.fire("click");
    await flush();
    assert.equal(voice.isRecording(), true);
    voice.cancel();
    await flush();
    await flush();
    assert.equal(voice.isRecording(), false);
    assert.equal(trackStops, 1);
    assert.equal(fetches.some((call) => call.url === "/api/voice/transcribe"), false);
    voice.cancel();
    assert.equal(voice.phase(), "idle");
  });
});

describe("voice.js: replies read aloud", () => {
  beforeEach(() => setup());

  // The best voice is picked from the browser list; long replies are queued one chunk at a time.
  test("speak uses the Natural pt-BR voice, strips markdown and chains chunks until the end", async () => {
    const changes = [];
    voice = createVoice({ els, token: "t", toast() {}, composer: { read: () => ({}), write() {} }, isReadEnabled: () => false, onSpeakingChange: (key) => changes.push(key), env });
    const text = `${"Frase número um com bastante texto para ocupar espaço. ".repeat(6)}\n\n\`\`\`js\ncodigo()\n\`\`\`\n\nFim **da** resposta.`;
    voice.speak("a:1", text);
    assert.equal(voice.speakingKey(), "a:1");
    assert.equal(spoken.length, 1);
    assert.equal(spoken[0].voice.name, "Microsoft Francisca Online (Natural)");
    assert.equal(spoken[0].lang, "pt-BR");
    assert.equal(/codigo|\*\*/.test(spoken[0].text), false);
    let guard = 0;
    while (spoken.length && guard++ < 20) {
      const current = spoken.shift();
      assert.equal(/codigo|\*\*/.test(current.text), false);
      current.onend();
      if (!voice.speakingKey()) break;
    }
    assert.equal(voice.speakingKey(), null);
    assert.deepEqual(changes, ["a:1", null]);
  });

  // Stop cancels the engine and ignores the "canceled" error the old utterance fires afterwards.
  test("stopSpeaking cancels the engine and late events from the old utterance are ignored", () => {
    voice.speak("a:1", "Primeira frase. Segunda frase.");
    const first = spoken[0];
    voice.stopSpeaking();
    assert.equal(cancels >= 1, true);
    assert.equal(voice.speakingKey(), null);
    assert.equal(els.speakStop.hidden, true);
    first.onerror({ error: "canceled" });
    first.onend();
    assert.equal(voice.speakingKey(), null);
    voice.stopSpeaking();
  });

  // Starting another reply while one is playing replaces it, and an engine error ends the reading cleanly.
  test("speaking a second reply stops the first, and an utterance error ends the reading", () => {
    voice.speak("a:1", "Um.");
    const first = spoken.shift();
    voice.speak("a:2", "Dois.");
    assert.equal(voice.speakingKey(), "a:2");
    first.onend();
    assert.equal(voice.speakingKey(), "a:2");
    spoken.shift().onerror({ error: "synthesis-failed" });
    assert.equal(voice.speakingKey(), null);
  });

  // Nothing speakable (code only) or no speech engine: no crash, no state change.
  test("speak with code-only text or without speechSynthesis does nothing", () => {
    voice.speak("a:1", "```\nx\n```");
    assert.equal(spoken.length, 0);
    assert.equal(voice.speakingKey(), null);
    const bare = createVoice({ els, token: "t", toast() {}, composer: { read: () => ({}), write() {} }, isReadEnabled: () => false, env: { ...env, speechSynthesis: undefined } });
    assert.equal(bare.speechSupported, false);
    bare.speak("a:1", "Olá.");
    bare.stopSpeaking();
    assert.equal(bare.speakingKey(), null);
  });

  // With no pt voice installed the utterance still asks for pt-BR so the engine picks its default.
  test("speak without any Portuguese voice leaves the voice unset but keeps lang pt-BR", () => {
    setup({ voices: [{ name: "Aria", lang: "en-US" }] });
    voice.speak("a:1", "Olá.");
    assert.equal(spoken[0].voice, undefined);
    assert.equal(spoken[0].lang, "pt-BR");
  });

  // The auto-read toggle is honoured and each finished reply is read exactly once.
  test("autoRead reads the newest reply once, only when the toggle is on", () => {
    const messages = [{ role: "assistant", timestamp: 5, content: [{ type: "text", text: "Pronto." }] }];
    voice.autoRead(messages);
    assert.equal(spoken.length, 0);
    setup({}, true);
    voice.autoRead(messages);
    assert.equal(spoken.length, 1);
    voice.autoRead(messages);
    assert.equal(spoken.length, 1);
    spoken[0].onend();
    voice.autoRead(messages);
    assert.equal(spoken.length, 1);
    voice.autoRead([{ role: "assistant", timestamp: 6, content: [{ type: "text", text: "Outra." }] }]);
    assert.equal(spoken.length, 2);
  });

  // An engine that throws (bad voice object, blocked autoplay) must not leave the UI stuck in the speaking state.
  test("a throwing speech engine clears the speaking state", () => {
    env.speechSynthesis.speak = () => { throw new Error("not-allowed"); };
    voice.speak("a:1", "Olá mundo.");
    assert.equal(voice.speakingKey(), null);
    assert.equal(els.speakStop.hidden, true);
  });

  // Silencing: the global stop button and a new message both end the reading.
  test("the stop button stops the reading", () => {
    voice.init();
    voice.speak("a:1", "Olá mundo.");
    assert.equal(els.speakStop.hidden, false);
    els.speakStop.fire("click");
    assert.equal(voice.speakingKey(), null);
    assert.equal(els.speakStop.hidden, true);
  });
});

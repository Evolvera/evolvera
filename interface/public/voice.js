// Voice for the composer: record > local Whisper transcription (server), and read replies aloud (browser speechSynthesis).
// Browser glue only; every decision (phases, labels, voice choice, text cleanup) lives in lib.js and is unit-tested there.
// All browser objects come through `env` (default: the page) so test/voice-ui.test.mjs can run this under Node with fakes.
import {
  REC_MAX_MS,
  REC_MIN_MS,
  formatRecTimer,
  insertAtCursor,
  lastReplyToSpeak,
  levelFromSamples,
  micErrorMessage,
  micShortcut,
  micView,
  nextMicPhase,
  pickVoice,
  recorderMime,
  speakableText,
  speechChunks,
  transcribeErrorMessage,
  uploadMime,
} from "./lib.js";

// Covers the 120s cold worker startup, 60s request budget, and 10s network margin.
const UPLOAD_TIMEOUT_MS = 190000;
const TICK_MS = 250;

// els: { micBtn, micLive, micLabel, micTimer, micLevel, speakStop }; composer: { read() -> {value,start,end}, write(value, cursor) }.
export function createVoice({ els, token, toast, composer, isReadEnabled, onSpeakingChange = () => {}, env = globalThis }) {
  const speechSupported = Boolean(env.speechSynthesis && env.SpeechSynthesisUtterance);
  const headers = { "x-pi-studio-token": token };
  const now = () => (env.now ? env.now() : Date.now());
  let status = null;
  let phase = "idle";
  let take = null;
  let speakingKey = null;
  let speakToken = 0;
  let lastAutoKey = null;

  const canRecord = () => Boolean(env.navigator?.mediaDevices?.getUserMedia && env.MediaRecorder);
  const effectiveStatus = () => (canRecord() ? status : { available: false, reason: "Gravação de áudio indisponível neste navegador." });

  function render() {
    const view = micView(effectiveStatus(), phase);
    els.micBtn.disabled = view.disabled;
    els.micBtn.title = view.title;
    els.micBtn.setAttribute("aria-label", view.title);
    els.micBtn.setAttribute("aria-pressed", view.pressed);
    els.micBtn.classList.toggle("is-recording", phase === "recording");
    els.micLive.hidden = phase === "idle";
    els.micLive.classList.toggle("is-recording", phase === "recording");
    els.micLabel.textContent = view.live;
  }

  function step(event) {
    phase = nextMicPhase(phase, event);
    render();
  }

  async function refreshStatus() {
    try {
      const res = await env.fetch("/api/voice/status", { headers });
      if (res.ok) status = await res.json();
      else status ??= { available: false };
    } catch {
      status ??= { available: false };
    }
    render();
  }

  function stopMeter(current) {
    env.cancelAnimationFrame(current.raf);
    current.ctx?.close?.().catch?.(() => {});
    els.micLevel.style.transform = "scaleX(0)";
  }

  // Cheap on purpose: one analyser read per animation frame, only while recording.
  function startMeter(current) {
    try {
      const ctx = new env.AudioContext();
      ctx.resume?.();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      ctx.createMediaStreamSource(current.stream).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      current.ctx = ctx;
      const frame = () => {
        analyser.getByteTimeDomainData(data);
        els.micLevel.style.transform = `scaleX(${levelFromSamples(data).toFixed(3)})`;
        current.raf = env.requestAnimationFrame(frame);
      };
      current.raf = env.requestAnimationFrame(frame);
    } catch {
      // No level meter is not a reason to refuse recording.
    }
  }

  function tick(current) {
    const elapsed = now() - current.startedAt;
    els.micTimer.textContent = formatRecTimer(elapsed);
    if (elapsed >= REC_MAX_MS) stopRecording();
  }

  async function start() {
    step("toggle");
    let stream = null;
    try {
      stream = await env.navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const mime = recorderMime((type) => env.MediaRecorder.isTypeSupported(type));
      const recorder = new env.MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const current = { stream, recorder, chunks: [], startedAt: now(), endedAt: 0, discard: false };
      recorder.ondataavailable = (event) => {
        if (event.data?.size) current.chunks.push(event.data);
      };
      recorder.onstop = () => finish(current);
      recorder.start();
      take = current;
      els.micTimer.textContent = formatRecTimer(0);
      current.timer = env.setInterval(() => tick(current), TICK_MS);
      startMeter(current);
      step("ready");
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      toast(micErrorMessage(error), "error");
      step("fail");
    }
  }

  // Ends the take: timers and meter stop now; the tracks are released as soon as the recorder has flushed (finish).
  function endTake(current) {
    current.endedAt = now();
    env.clearInterval(current.timer);
    stopMeter(current);
    if (take === current) take = null;
    current.recorder.stop();
  }

  function stopRecording() {
    if (phase !== "recording" || !take) return;
    const current = take;
    step("toggle");
    endTake(current);
  }

  async function finish(current) {
    current.stream.getTracks().forEach((track) => track.stop());
    if (current.discard) return;
    const blob = new Blob(current.chunks, { type: current.recorder.mimeType });
    if (current.endedAt - current.startedAt < REC_MIN_MS || !blob.size) {
      toast("Gravação muito curta.", "info");
      step("fail");
      return;
    }
    await transcribe(blob);
  }

  async function transcribe(blob) {
    try {
      const res = await env.fetch("/api/voice/transcribe", {
        method: "POST",
        headers: { ...headers, "content-type": uploadMime(blob.type) },
        body: blob,
        signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(transcribeErrorMessage(res.status, body));
      const text = String(body?.text ?? "").trim();
      if (text) {
        const selection = composer.read();
        const next = insertAtCursor(selection.value, selection.start, selection.end, text);
        composer.write(next.value, next.cursor);
      } else toast("Não entendi nada. Tente de novo.", "info");
      step("done");
    } catch (error) {
      toast(error?.name === "TimeoutError" ? "A transcrição demorou demais." : error?.message || "Falha ao transcrever o áudio.", "error");
      step("fail");
    }
    await refreshStatus();
  }

  function toggle() {
    if (phase === "recording") stopRecording();
    else if (phase === "idle" && !micView(effectiveStatus(), "idle").disabled) start();
  }

  // Drops the current take without transcribing it.
  function cancel() {
    if (phase !== "recording" || !take) return;
    const current = take;
    current.discard = true;
    step("abort");
    endTake(current);
  }

  // ---------------------------------------------------------------- speech

  function renderSpeaking() {
    els.speakStop.hidden = speakingKey === null;
    onSpeakingChange(speakingKey);
  }

  function stopSpeaking() {
    if (!speechSupported) return;
    speakToken++;
    env.speechSynthesis.cancel();
    if (speakingKey === null) return;
    speakingKey = null;
    renderSpeaking();
  }

  function finishSpeaking(owner) {
    if (owner !== speakToken) return;
    speakingKey = null;
    renderSpeaking();
  }

  // Reads `text` (markdown) piece by piece; `key` identifies the message so its button can show "parar".
  function speak(key, text) {
    if (!speechSupported) return;
    const chunks = speechChunks(speakableText(text));
    if (!chunks.length) return;
    stopSpeaking();
    const owner = speakToken;
    const voice = pickVoice(env.speechSynthesis.getVoices());
    speakingKey = key;
    renderSpeaking();
    let index = 0;
    const next = () => {
      if (owner !== speakToken) return;
      if (index >= chunks.length) return finishSpeaking(owner);
      try {
        const utterance = new env.SpeechSynthesisUtterance(chunks[index++]);
        utterance.lang = "pt-BR";
        if (voice) utterance.voice = voice;
        utterance.onend = next;
        utterance.onerror = () => finishSpeaking(owner);
        env.speechSynthesis.speak(utterance);
      } catch {
        // An engine that refuses must not leave the button stuck on "parar".
        finishSpeaking(owner);
      }
    };
    next();
  }

  // "Ler respostas em voz alta": reads the newest finished reply once.
  function autoRead(messages) {
    if (!speechSupported || !isReadEnabled()) return;
    const reply = lastReplyToSpeak(messages, lastAutoKey);
    if (!reply) return;
    lastAutoKey = reply.key;
    speak(`auto:${reply.key}`, reply.text);
  }

  async function init() {
    els.micBtn.addEventListener("click", toggle);
    els.speakStop.addEventListener("click", stopSpeaking);
    env.document.addEventListener("keydown", (event) => {
      if (!micShortcut(event)) return;
      event.preventDefault();
      toggle();
    }, true);
    els.speakStop.hidden = true;
    render();
    await refreshStatus();
  }

  return {
    init,
    toggle,
    cancel,
    refreshStatus,
    isRecording: () => phase === "recording",
    phase: () => phase,
    speak,
    stopSpeaking,
    autoRead,
    speakingKey: () => speakingKey,
    speechSupported,
  };
}

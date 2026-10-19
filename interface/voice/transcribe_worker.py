#!/usr/bin/env python3
"""Long-lived line-delimited JSON worker for local faster-whisper transcription."""
import json
import os
import struct
import sys
import tempfile
import time
import wave


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def load_model():
    # Never fall back to a model download; Studio is explicitly local-only.
    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    from faster_whisper import WhisperModel

    model_name = os.environ.get("PI_STUDIO_WHISPER_MODEL", "small")
    try:
        return WhisperModel(model_name, device="cuda", compute_type="int8_float16"), "cuda", model_name
    except Exception:
        return WhisperModel(model_name, device="cpu", compute_type="int8"), "cpu", model_name


def main():
    started = time.perf_counter()
    try:
        model, device, model_name = load_model()
    except Exception as exc:
        emit({"ready": False, "error": str(exc)[:300]})
        return 1
    emit({"ready": True, "device": device, "model": model_name, "loadMs": round((time.perf_counter() - started) * 1000)})
    for raw in sys.stdin:
        request = None
        try:
            request = json.loads(raw)
            try:
                segments, info = model.transcribe(request["path"], language="pt", vad_filter=True)
                text = " ".join(segment.text.strip() for segment in segments).strip()
            except Exception:
                if device != "cuda":
                    raise
                from faster_whisper import WhisperModel
                model = WhisperModel(model_name, device="cpu", compute_type="int8")
                device = "cpu"
                segments, info = model.transcribe(request["path"], language="pt", vad_filter=True)
                text = " ".join(segment.text.strip() for segment in segments).strip()
            emit({"id": request["id"], "text": text, "language": info.language, "durationMs": round(info.duration * 1000), "device": device})
        except Exception as exc:
            emit({"id": request.get("id") if isinstance(request, dict) else None, "error": str(exc)[:300]})
    return 0


def self_test():
    with tempfile.TemporaryDirectory(prefix="pi-studio-voice-selftest-") as temp:
        audio = os.path.join(temp, "silence.wav")
        with wave.open(audio, "wb") as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(16000)
            wav.writeframes(struct.pack("<h", 0) * 16000)
        class Input:
            def __iter__(self):
                yield json.dumps({"id": "self-test", "path": audio})
        original = sys.stdin
        sys.stdin = Input()
        started = time.perf_counter()
        try:
            return main()
        finally:
            sys.stdin = original
            print(json.dumps({"selfTestLatencyMs": round((time.perf_counter() - started) * 1000)}), file=sys.stderr, flush=True)


if __name__ == "__main__":
    raise SystemExit(self_test() if "--self-test" in sys.argv else main())

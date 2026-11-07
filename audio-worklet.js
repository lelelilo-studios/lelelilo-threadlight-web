class ThreadlightAudio extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.serial = 0;
    this.cue = 255;
    this.port.onmessage = e => { if (this.w) this.take(e.data); };
    try {
      const module = new WebAssembly.Module(options.processorOptions.wasm);
      const w = new WebAssembly.Instance(module, {}).exports;
      w.init(sampleRate);
      this.w = w;
      this.port.postMessage({ started: sampleRate });
    } catch (e) {
      this.port.postMessage({ error: String(e) });
    }
  }
  take(data) {
    if (data instanceof Uint8Array || data instanceof ArrayBuffer) return this.send(data);
    const w = this.w;
    if (data && data.pcm) {
      const { sheet, at, pcm } = data, p = w.pcm(sheet, at, pcm.length);
      const kept = p ? (new Float32Array(w.memory.buffer, p, pcm.length).set(pcm), w.store(sheet, at, pcm.length)) : 0;
      this.port.postMessage({ stored: sheet, at, kept });
    } else if (data && data.ask) {
      this.port.postMessage({ answer: data.ask, ready: w.ready(), played: w.played(), peak: w.peak(), clock: w.clock() });
    }
  }
  send(data) {
    const bytes = new Uint8Array(data), p = this.w.inbox(bytes.length);
    new Uint8Array(this.w.memory.buffer, p, bytes.length).set(bytes);
    this.w.commands(bytes.length);
  }
  process(_, outputs) {
    const out = outputs[0];
    if (!this.w || !out || !out.length) return true;
    const w = this.w, n = out[0].length, made = w.clock(), at = currentTime;
    const p = w.render(n), memory = w.memory.buffer;
    if (this.memory !== memory || this.at !== p || this.n !== n) {
      [this.memory, this.at, this.n] = [memory, p, n];
      this.left = new Float32Array(memory, p, n);
      this.right = new Float32Array(memory, p + n * 4, n);
    }
    out[0].set(this.left);
    if (out[1]) out[1].set(this.right);
    const serial = w.music_serial(), cue = w.music_cue();
    if (serial !== this.serial || cue !== this.cue) {
      this.serial = serial;
      this.cue = cue;
      this.port.postMessage({ music: { serial, cue, start: at + (w.music_start() - made), bpm: w.music_bpm(), bar: w.music_bar() } });
    }
    return true;
  }
}
registerProcessor('threadlight-audio', ThreadlightAudio);

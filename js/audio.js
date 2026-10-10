// Sound engine for "Ohio is a Piano": sampled grand piano with a synthesized
// fallback. Keys are numbered 0 (A0) to 87 (C8).
(function () {
  'use strict';

  var SAMPLE_DIR = 'audio/salamander/';
  // One sample every minor third; the notes in between are pitch-shifted.
  var SAMPLE_NAMES = ['A', 'C', 'Ds', 'Fs'];
  var MAX_VOICES = 28;

  var ctx = null;
  var master = null;
  var wave = null;
  var mode = 'samples';
  var volume = 0.64;
  var encoded = {};   // key -> ArrayBuffer, fetched before the first gesture
  var buffers = {};   // key -> AudioBuffer
  var voices = [];
  var listeners = [];
  var status = { state: 'idle', loaded: 0, total: 30 };
  var preloading = false;

  function sampleList() {
    var list = [];
    for (var key = 0; key <= 87; key += 3) {
      var octave = Math.floor((key + 9) / 12);
      list.push({ key: key, file: SAMPLE_NAMES[(key / 3) % 4] + octave + '.mp3' });
    }
    return list;
  }

  function setStatus(next) {
    status = next;
    listeners.forEach(function (fn) { fn(status); });
  }

  function decode(key) {
    if (!ctx || !encoded[key]) return;
    var data = encoded[key];
    delete encoded[key];
    var done = function (buffer) { buffers[key] = buffer; };
    var fail = function () { /* the synth covers any sample that will not decode */ };
    var p = ctx.decodeAudioData(data, done, fail);
    if (p && p.catch) p.catch(fail);
  }

  function preload() {
    if (preloading) return;
    preloading = true;
    var list = sampleList();
    setStatus({ state: 'loading', loaded: 0, total: list.length });
    var loaded = 0;
    var failed = 0;
    var finish = function () {
      if (loaded + failed < list.length) {
        setStatus({ state: 'loading', loaded: loaded, total: list.length });
      } else if (loaded === 0) {
        setStatus({ state: 'unavailable', loaded: 0, total: list.length });
      } else {
        setStatus({ state: 'ready', loaded: loaded, total: list.length });
      }
    };
    list.forEach(function (s) {
      fetch(SAMPLE_DIR + s.file)
        .then(function (r) {
          if (!r.ok) throw new Error(String(r.status));
          return r.arrayBuffer();
        })
        .then(function (data) {
          encoded[s.key] = data;
          loaded++;
          decode(s.key);
          finish();
        })
        .catch(function () { failed++; finish(); });
    });
  }

  // Browsers only start audio after a click, tap or key press.
  function unlock() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      var limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -14;
      limiter.ratio.value = 6;
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(limiter);
      limiter.connect(ctx.destination);
      Object.keys(encoded).forEach(function (k) { decode(Number(k)); });
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function fadeOut(voice, seconds) {
    var t = ctx.currentTime;
    try {
      voice.gain.gain.cancelScheduledValues(t);
      voice.gain.gain.setTargetAtTime(0, t, seconds / 4);
      voice.stopAll(t + seconds);
    } catch (e) { /* already stopped */ }
  }

  function track(voice) {
    // Restriking a key damps its previous note, as on a real piano.
    voices = voices.filter(function (v) {
      if (v.key === voice.key) { fadeOut(v, 0.12); return false; }
      return true;
    });
    voices.push(voice);
    while (voices.length > MAX_VOICES) fadeOut(voices.shift(), 0.1);
  }

  function playSample(key, sampleKey) {
    var t = ctx.currentTime;
    var src = ctx.createBufferSource();
    src.buffer = buffers[sampleKey];
    src.playbackRate.value = Math.pow(2, (key - sampleKey) / 12);
    // The recordings ring for up to 25 seconds. Let each note sing briefly, then
    // damp it as if the key had been released, so fast passages stay clear.
    var gain = ctx.createGain();
    gain.gain.setValueAtTime(1.2, t);
    gain.gain.setTargetAtTime(0, t + 1.1, 0.8);
    src.connect(gain);
    gain.connect(master);
    src.start(t);
    src.stop(t + 6);
    var voice = { key: key, gain: gain, stopAll: function (when) { src.stop(when); } };
    src.onended = function () { voices = voices.filter(function (v) { return v !== voice; }); };
    track(voice);
  }

  function playSynth(key) {
    var t = ctx.currentTime;
    var freq = 440 * Math.pow(2, (key - 48) / 12);
    var length = Math.max(0.7, 4.2 - key * 0.04);
    if (!wave) {
      var n = 14;
      var real = new Float32Array(n);
      var imag = new Float32Array(n);
      for (var h = 1; h < n; h++) imag[h] = 1 / Math.pow(h, 1.35);
      wave = ctx.createPeriodicWave(real, imag);
    }
    var filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.6;
    filter.frequency.setValueAtTime(Math.min(freq * 9 + 400, 15000), t);
    filter.frequency.exponentialRampToValueAtTime(Math.min(freq * 2 + 250, 9000), t + length * 0.45);
    var gain = ctx.createGain();
    var peak = 0.34 - key * 0.0017;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.006);
    gain.gain.exponentialRampToValueAtTime(peak * 0.35, t + length * 0.18);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + length);
    filter.connect(gain);
    gain.connect(master);
    var oscs = [0, 4].map(function (cents) {
      var o = ctx.createOscillator();
      o.setPeriodicWave(wave);
      o.frequency.value = freq;
      o.detune.value = cents;
      o.connect(filter);
      o.start(t);
      o.stop(t + length + 0.05);
      return o;
    });
    var voice = {
      key: key, gain: gain,
      stopAll: function (when) { oscs.forEach(function (o) { try { o.stop(when); } catch (e) { /* stopped */ } }); }
    };
    oscs[0].onended = function () { voices = voices.filter(function (v) { return v !== voice; }); };
    track(voice);
  }

  function play(key) {
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (mode === 'samples') {
      var nearest = Math.min(87, Math.round(key / 3) * 3);
      if (buffers[nearest]) { playSample(key, nearest); return; }
    }
    playSynth(key);
  }

  window.OhioSound = {
    preload: preload,
    unlock: unlock,
    play: play,
    isUnlocked: function () { return !!ctx && ctx.state === 'running'; },
    setMode: function (m) { mode = m === 'synth' ? 'synth' : 'samples'; },
    getMode: function () { return mode; },
    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, v));
      if (master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.02);
    },
    getStatus: function () { return status; },
    onStatus: function (fn) { listeners.push(fn); fn(status); }
  };
})();

// "Ohio is a Piano": map, keyboard and playback.
(function () {
  'use strict';

  var D = window.OHIO_DATA;
  var SONGS = window.OHIO_SONGS;
  var Sound = window.OhioSound;
  var SVG_NS = 'http://www.w3.org/2000/svg';
  var N = D.counties.length;
  var BLACK_KEYS = { 1: true, 4: true, 6: true, 9: true, 11: true }; // semitones above A
  var STATIC_VARS = { name: true, area: true };                     // same in every survey
  var MAX_TUNE = 400;
  var GAP_UNIT_MS = 10;

  var $ = function (id) { return document.getElementById(id); };
  var mapSvg = $('map');
  var keysSvg = $('keys');
  var statusEl = $('status');

  var state = {
    varId: 'name',
    yearIdx: D.years.length - 1,
    countyAt: [],     // key -> county
    keyOf: [],        // county -> key
    playing: null,    // id of the button whose playback is running
    recording: false,
    recordStart: 0,
    tune: [],         // [{c: county, t: ms since first note}]
    shared: false,    // the tune came from a link
    sortCount: 0      // bumped on every re-sort
  };

  var countyEls = [];
  var keyEls = [];
  var lit = {};       // county -> {key: element, timer: id}
  var timers = [];
  var playToken = 0;
  var statusTimer = 0;
  var refreshCursor = function () {};  // set by bindKeys

  // ------------------------------------------------------------- build

  function buildMap() {
    mapSvg.setAttribute('viewBox', '0 0 ' + D.view[0] + ' ' + D.view[1]);
    var g = $('counties');
    D.counties.forEach(function (c, i) {
      var p = document.createElementNS(SVG_NS, 'path');
      p.setAttribute('d', c.d);
      p.setAttribute('class', 'county');
      p.setAttribute('data-county', i);
      p.setAttribute('aria-label', c.name + ' County');
      g.appendChild(p);
      countyEls.push(p);
    });
  }

  function isBlack(key) { return !!BLACK_KEYS[key % 12]; }

  function buildKeys() {
    var W = 20, H = 100, BW = 12, BH = 62;
    var whites = [], blacks = [], x = 0;
    for (var k = 0; k < N; k++) {
      var r = document.createElementNS(SVG_NS, 'rect');
      r.setAttribute('data-key', k);
      if (isBlack(k)) {
        r.setAttribute('class', 'key black');
        r.setAttribute('x', x - BW / 2);
        r.setAttribute('y', 0);
        r.setAttribute('width', BW);
        r.setAttribute('height', BH);
        blacks.push(r);
      } else {
        r.setAttribute('class', 'key white');
        r.setAttribute('x', x);
        r.setAttribute('y', 0);
        r.setAttribute('width', W);
        r.setAttribute('height', H);
        whites.push(r);
        x += W;
      }
      keyEls.push(r);
    }
    keysSvg.setAttribute('viewBox', '0 0 ' + x + ' ' + H);
    whites.concat(blacks).forEach(function (r) { keysSvg.appendChild(r); });
  }

  function buildControls() {
    var sort = $('sort-field');
    var original = document.createElement('optgroup');
    original.label = 'From the original map';
    var added = document.createElement('optgroup');
    added.label = 'New in this version';
    D.vars.forEach(function (v) {
      var o = new Option(v.label, v.id);
      (v.added ? added : original).appendChild(o);
    });
    sort.appendChild(original);
    sort.appendChild(added);

    var year = $('year');
    year.min = 0;
    year.max = D.years.length - 1;

    SONGS.forEach(function (s) { $('song').appendChild(new Option(s.title, s.id)); });

    var seats = D.counties.map(function (c, i) { return { i: i, seat: c.seat, name: c.name }; })
      .sort(function (a, b) { return a.seat.localeCompare(b.seat); });
    ['from', 'to'].forEach(function (id) {
      seats.forEach(function (s) {
        $(id).appendChild(new Option(s.seat + ' (' + s.name + ' Co.)', s.i));
      });
    });
    $('from').value = countyIndex('Hamilton');
    $('to').value = countyIndex('Cuyahoga');
  }

  function countyIndex(name) {
    for (var i = 0; i < N; i++) if (D.counties[i].name === name) return i;
    return 0;
  }

  // ------------------------------------------------------- sort and paint

  function varLabel(id) {
    for (var i = 0; i < D.vars.length; i++) if (D.vars[i].id === id) return D.vars[i].label;
    return id;
  }

  function periodLabel(idx) {
    var y = D.years[idx];
    return (y - 4) + '–' + y;
  }

  function applySort() {
    var order = [];
    for (var i = 0; i < N; i++) order.push(i);
    if (state.varId !== 'name') {
      var vals = D.values[state.varId][state.yearIdx];
      order.sort(function (a, b) { return vals[a] - vals[b] || a - b; }); // ties: alphabetical
    }
    state.countyAt = order;
    state.sortCount++;
    order.forEach(function (c, k) { state.keyOf[c] = k; });
    releaseAll();
    countyEls.forEach(function (el, c) {
      el.classList.remove('peek');
      el.classList.toggle('black', isBlack(state.keyOf[c]));
    });

    var isStatic = !!STATIC_VARS[state.varId];
    document.querySelector('.year').classList.toggle('static', isStatic);
    $('year').disabled = isStatic;
    $('year').value = state.yearIdx;
    $('year').setAttribute('aria-valuetext', periodLabel(state.yearIdx));
    $('year-label').textContent = periodLabel(state.yearIdx);
    $('year-hint').textContent = isStatic
      ? 'This one is the same in every survey, so the years do not matter.'
      : 'Each step is a five-year survey that overlaps the next, so most counties stay put and a few swap keys.';
    $('sort-hint').textContent = state.varId === 'name' ? ''
      : state.varId === 'area' ? 'Ties go in alphabetical order.'
      : 'These are survey estimates, so close counties can swap places. Ties go in alphabetical order.';

    var label = varLabel(state.varId);
    if (state.varId === 'name') {
      $('cap-low').textContent = '◀ ' + D.counties[order[0]].name;
      $('cap-high').textContent = D.counties[order[N - 1]].name + ' ▶';
      $('cap-mid').textContent = 'Keys in alphabetical order';
    } else {
      $('cap-low').textContent = '◀ lowest';
      $('cap-high').textContent = 'highest ▶';
      $('cap-mid').textContent = 'Keys sorted by ' + label.charAt(0).toLowerCase() + label.slice(1) +
        (isStatic ? '' : ', ' + periodLabel(state.yearIdx));
    }
    refreshCursor();
    writeHash();
  }

  // ------------------------------------------------------------ striking

  function release(c) {
    var entry = lit[c];
    if (!entry) return;
    clearTimeout(entry.timer);
    countyEls[c].classList.remove('on');
    entry.key.classList.remove('on');
    delete lit[c];
  }

  function releaseAll() {
    Object.keys(lit).forEach(function (c) { release(Number(c)); });
  }

  // Sound a county's note and light it and its key. ms = 0 keeps it lit until release().
  function strike(c, ms, byUser) {
    var k = state.keyOf[c];
    Sound.play(k);
    release(c);
    var keyEl = keyEls[k];
    countyEls[c].classList.add('on');
    keyEl.classList.add('on');
    lit[c] = { key: keyEl, timer: ms ? setTimeout(function () { release(c); }, ms) : 0 };
    if (byUser && state.recording) recordNote(c);
  }

  function say(text, lingerMs) {
    clearTimeout(statusTimer);
    statusEl.textContent = text;
    if (lingerMs) statusTimer = setTimeout(function () { statusEl.textContent = ''; }, lingerMs);
  }

  // ------------------------------------------------------------ playback

  function clearOverlay() {
    $('route-line').setAttribute('points', '');
    $('route-halo').setAttribute('points', '');
    $('center').setAttribute('hidden', '');
  }

  function setPlaying(id) {
    state.playing = id;
    ['play-order', 'play-song', 'play-route', 'replay'].forEach(function (b) {
      var on = b === id;
      $(b).classList.toggle('playing', on);
      $(b).textContent = on ? 'Stop' : $(b).getAttribute('data-label');
    });
  }

  function stopAll() {
    playToken++;
    timers.forEach(clearTimeout);
    timers = [];
    releaseAll();
    clearOverlay();
    setPlaying(null);
  }

  // events: [{t: ms from start, cs: [county, ...]}] or, for music that should follow
  // the current sort, [{t, ks: [key, ...]}]
  function run(id, events, flashMs, hooks) {
    stopAll();
    if (!events.length) return;
    Sound.unlock();
    setPlaying(id);
    var token = playToken;
    var t0 = performance.now();
    var i = 0;
    (function tick() {
      if (token !== playToken) return;
      if (i >= events.length) {
        setPlaying(null);
        if (hooks && hooks.done) hooks.done();
        return;
      }
      var ev = events[i];
      var cs = ev.ks ? ev.ks.map(function (k) { return state.countyAt[k]; }) : ev.cs;
      cs.forEach(function (c) { strike(c, flashMs, false); });
      if (hooks && hooks.step) hooks.step(cs);
      i++;
      var next = i < events.length ? events[i].t : ev.t + flashMs;
      timers.push(setTimeout(tick, Math.max(0, t0 + next - performance.now())));
    })();
  }

  function toggle(id, start) {
    return function () {
      if (state.playing === id) { stopAll(); say(''); } else start();
    };
  }

  function playOrder() {
    var events = state.countyAt.map(function (c, k) { return { t: k * 70, ks: [k] }; });
    say('');
    run('play-order', events, 160);
  }

  function playSong() {
    var song = SONGS.filter(function (s) { return s.id === $('song').value; })[0];
    var events = [];
    song.steps.forEach(function (keys, i) {
      if (keys.length) {
        events.push({ t: i * song.stepMs, ks: keys });
      }
    });
    var sx = 0, sy = 0, n = 0;
    var sortSeen = state.sortCount;
    var resorted = false;
    var center = $('center');
    var label = center.querySelector('text');
    say(song.title + ' — ' + song.composer + ' (simplified excerpt)');
    run('play-song', events, Math.max(150, song.stepMs * 0.95), {
      step: function (cs) {
        if (state.sortCount !== sortSeen) {  // re-sorted mid-song: start the average again
          sortSeen = state.sortCount;
          resorted = true;
          sx = sy = n = 0;
        }
        cs.forEach(function (c) { sx += D.counties[c].c[0]; sy += D.counties[c].c[1]; n++; });
        placeCenter(sx / n, sy / n, 'Center of the song');
      },
      done: function () {
        var c = countyAtPoint(sx / n, sy / n);
        var where = D.counties[c].name + ' County';
        placeCenter(sx / n, sy / n, where);
        var home = D.counties[middleOfOhio()].name + ' County';
        say((resorted ? 'Averaged over the notes since you re-sorted, “' : 'Averaged over every note, “') + song.title + '” centers on ' + where +
          (where === home ? ', which is also the middle of Ohio’s counties.'
            : '. The middle of Ohio’s counties is in ' + home + ', so it never strays far.'), 10000);
        var token = playToken;
        timers.push(setTimeout(function () { if (token === playToken) clearOverlay(); }, 9000));
      }
    });

    function placeCenter(x, y, text) {
      center.removeAttribute('hidden');
      // the marker is drawn in screen pixels, so undo the map's scaling
      var ctm = mapSvg.getScreenCTM();
      var unscale = ctm && ctm.a ? 1 / ctm.a : 1;
      center.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ') scale(' + unscale.toFixed(3) + ')');
      label.textContent = text;
      // keep the label on the map when the center drifts east
      var flip = x > D.view[0] * 0.62;
      label.setAttribute('x', flip ? -12 : 12);
      label.setAttribute('text-anchor', flip ? 'end' : 'start');
    }
  }

  function middleOfOhio() {
    var x = 0, y = 0;
    D.counties.forEach(function (c) { x += c.c[0] / N; y += c.c[1] / N; });
    return countyAtPoint(x, y);
  }

  function countyAtPoint(x, y) {
    var i;
    if (mapSvg.createSVGPoint && countyEls[0].isPointInFill) {
      var pt = mapSvg.createSVGPoint();
      pt.x = x;
      pt.y = y;
      for (i = 0; i < N; i++) {
        try { if (countyEls[i].isPointInFill(pt)) return i; } catch (e) { break; }
      }
    }
    var best = 0, bestD = Infinity;
    for (i = 0; i < N; i++) {
      var dx = D.counties[i].c[0] - x, dy = D.counties[i].c[1] - y;
      if (dx * dx + dy * dy < bestD) { bestD = dx * dx + dy * dy; best = i; }
    }
    return best;
  }

  // Shortest chain of neighboring counties, by distance between county centers.
  function findRoute(a, b) {
    var dist = [], prev = [], done = [], i;
    for (i = 0; i < N; i++) { dist.push(Infinity); prev.push(-1); done.push(false); }
    dist[a] = 0;
    for (;;) {
      var u = -1;
      for (i = 0; i < N; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
      if (u < 0 || u === b || dist[u] === Infinity) break;
      done[u] = true;
      D.counties[u].n.forEach(function (v) {
        var dx = D.counties[u].c[0] - D.counties[v].c[0];
        var dy = D.counties[u].c[1] - D.counties[v].c[1];
        var d = dist[u] + Math.sqrt(dx * dx + dy * dy);
        if (d < dist[v]) { dist[v] = d; prev[v] = u; }
      });
    }
    var path = [];
    for (i = b; i >= 0; i = prev[i]) path.unshift(i);
    return path[0] === a ? path : [a];
  }

  function playRoute() {
    var a = Number($('from').value), b = Number($('to').value);
    var path = findRoute(a, b);
    var events = path.map(function (c, i) { return { t: i * 260, cs: [c] }; });
    var points = path.map(function (c) { return D.counties[c].c.join(','); }).join(' ');
    say(D.counties[a].seat + ' to ' + D.counties[b].seat + ': ' +
      path.map(function (c) { return D.counties[c].name; }).join(' → '));
    run('play-route', events, 250, {
      done: function () {
        var token = playToken;
        timers.push(setTimeout(function () { if (token === playToken) { clearOverlay(); say(''); } }, 2500));
      }
    });
    // run() clears the overlay first, so draw the line afterwards
    $('route-line').setAttribute('points', points);
    $('route-halo').setAttribute('points', points);
  }

  // ------------------------------------------------------ record and share

  function recordNote(c) {
    var now = performance.now();
    if (!state.tune.length) state.recordStart = now;
    state.tune.push({ c: c, t: Math.round(now - state.recordStart) });
    if (state.tune.length >= MAX_TUNE) {
      setRecording(false);
      $('rec-hint').textContent = 'That is ' + MAX_TUNE + ' notes, the most a link can hold. Recording stopped.';
    } else {
      $('rec-hint').textContent = 'Recording… ' + state.tune.length +
        (state.tune.length === 1 ? ' note' : ' notes');
    }
  }

  function setRecording(on) {
    state.recording = on;
    var btn = $('record');
    btn.classList.toggle('recording', on);
    btn.textContent = on ? 'Stop recording' : 'Record';
    if (on) {
      stopAll();
      say('');
      state.tune = [];
      state.shared = false;
      $('share-link').hidden = true;
      $('rec-hint').textContent = 'Recording… play the map or the keys.';
    } else if (state.shared) {
      $('rec-hint').textContent = 'A shared tune with ' + state.tune.length +
        (state.tune.length === 1 ? ' note' : ' notes') + ' is loaded. Replay it, or record your own.';
    } else if (state.tune.length) {
      $('rec-hint').textContent = 'Recorded ' + state.tune.length +
        (state.tune.length === 1 ? ' note.' : ' notes.') + ' Change the sort and replay it to hear it shift.';
    } else {
      $('rec-hint').textContent = 'Record what you play on the map or keys, then share it.';
    }
    $('replay').disabled = on || !state.tune.length;
    $('share').disabled = on || !state.tune.length;
    writeHash();
  }

  function replay() {
    var events = state.tune.map(function (n) { return { t: n.t, cs: [n.c] }; });
    say('');
    run('replay', events, 260);
  }

  function pad36(n) { return (n < 36 ? '0' : '') + n.toString(36); }

  function encodeTune(tune) {
    return tune.map(function (n, i) {
      var gap = i ? Math.round((n.t - tune[i - 1].t) / GAP_UNIT_MS) : 0;
      return pad36(n.c) + pad36(Math.max(0, Math.min(1295, gap)));
    }).join('');
  }

  function decodeTune(text) {
    var tune = [], t = 0;
    if (!/^[0-9a-z]*$/.test(text) || text.length % 4) return tune;
    for (var i = 0; i < text.length && tune.length < MAX_TUNE; i += 4) {
      var c = parseInt(text.substr(i, 2), 36);
      var gap = parseInt(text.substr(i + 2, 2), 36);
      if (!(c >= 0 && c < N)) return [];
      t += gap * GAP_UNIT_MS;
      tune.push({ c: c, t: t });
    }
    return tune;
  }

  function hashFor(withTune) {
    var h = '#v=' + state.varId + '&y=' + D.years[state.yearIdx];
    if (withTune && state.tune.length) h += '&t=' + encodeTune(state.tune);
    return h;
  }

  function writeHash() {
    try { history.replaceState(null, '', hashFor(true)); } catch (e) { /* file:// in some browsers */ }
  }

  function readHash() {
    var params = {};
    location.hash.slice(1).split('&').forEach(function (pair) {
      var eq = pair.indexOf('=');
      if (eq <= 0) return;
      try { params[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1)); } catch (e) { /* mangled link */ }
    });
    if (D.vars.some(function (v) { return v.id === params.v; })) state.varId = params.v;
    var yi = D.years.indexOf(Number(params.y));
    if (yi >= 0) state.yearIdx = yi;
    if (params.t) {
      state.tune = decodeTune(params.t);
      state.shared = state.tune.length > 0;
    }
  }

  function share() {
    var link = location.href.split('#')[0] + hashFor(true);
    var box = $('share-link');
    box.hidden = false;
    box.value = link;
    box.focus({ preventScroll: true });
    box.select();
    var copied = function () { $('rec-hint').textContent = 'Link copied. It opens this sort, these years and your tune.'; };
    var manual = function () { $('rec-hint').textContent = 'Copy this link to share your tune:'; };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(copied, manual);
    } else {
      manual();
    }
  }

  // ------------------------------------------------------------- pointers

  function dataAt(e, attr) {
    var el = document.elementFromPoint(e.clientX, e.clientY);
    var v = el && el.getAttribute ? el.getAttribute(attr) : null;
    return v === null ? null : Number(v);
  }

  function bindMap() {
    var held = null;     // county under a hovering mouse or a dragging finger
    var touching = false;

    function move(c) {
      if (c === held) return;
      if (held !== null) release(held);
      held = c;
      if (c !== null) strike(c, 0, true);
    }

    mapSvg.addEventListener('pointerover', function (e) {
      if (e.pointerType === 'mouse') move(dataAt(e, 'data-county'));
    });
    mapSvg.addEventListener('pointerleave', function (e) {
      if (e.pointerType === 'mouse') move(null);
    });
    mapSvg.addEventListener('pointerdown', function (e) {
      var c = dataAt(e, 'data-county');
      if (e.pointerType === 'mouse') {
        if (c !== null) { held = c; strike(c, 0, true); }  // click to strike again
        return;
      }
      touching = true;
      try { mapSvg.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      move(c);
    });
    mapSvg.addEventListener('pointermove', function (e) {
      if (touching && e.pointerType !== 'mouse') move(dataAt(e, 'data-county'));
    });
    var end = function (e) {
      if (e.pointerType === 'mouse') return;
      touching = false;
      move(null);
    };
    mapSvg.addEventListener('pointerup', end);
    mapSvg.addEventListener('pointercancel', end);
  }

  function bindKeys() {
    var pressed = null;  // key under a pressed pointer
    var peeked = null;   // key under a hovering mouse
    var down = false;
    var cursor = 39;     // middle C, for arrow-key playing
    var showCursor = false;

    refreshCursor = function () {
      keyEls.concat(countyEls).forEach(function (el) { el.classList.remove('cursor'); });
      if (!showCursor) return;
      keyEls[cursor].classList.add('cursor');
      countyEls[state.countyAt[cursor]].classList.add('cursor');
    };

    function peek(k) {
      if (k === peeked) return;
      if (peeked !== null) {
        keyEls[peeked].classList.remove('peek');
        countyEls[state.countyAt[peeked]].classList.remove('peek');
      }
      peeked = k;
      if (k !== null) {
        keyEls[k].classList.add('peek');
        countyEls[state.countyAt[k]].classList.add('peek');
      }
    }

    function press(k) {
      if (k === pressed) return;
      if (pressed !== null) release(state.countyAt[pressed]);
      pressed = k;
      if (k !== null) { cursor = k; strike(state.countyAt[k], 0, true); }
    }

    keysSvg.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      keysSvg.focus({ preventScroll: true });
      showCursor = false;
      refreshCursor();
      down = true;
      try { keysSvg.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
      peek(null);
      press(dataAt(e, 'data-key'));
    });
    keysSvg.addEventListener('pointermove', function (e) {
      var k = dataAt(e, 'data-key');
      if (down) press(k);
      else if (e.pointerType === 'mouse') peek(k);
    });
    var end = function () { down = false; press(null); };
    keysSvg.addEventListener('pointerup', end);
    keysSvg.addEventListener('pointercancel', end);
    keysSvg.addEventListener('pointerleave', function () { peek(null); });

    keysSvg.addEventListener('blur', function () {
      if (showCursor) say('');
      showCursor = false;
      refreshCursor();
    });

    keysSvg.addEventListener('keydown', function (e) {
      if (e.altKey || e.ctrlKey || e.metaKey) return;
      var next = cursor;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = Math.min(N - 1, cursor + 1);
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') next = Math.max(0, cursor - 1);
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = N - 1;
      else if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      cursor = next;
      showCursor = true;
      refreshCursor();
      strike(state.countyAt[cursor], 320, true);
      say('Key ' + (cursor + 1) + ' of ' + N + ': ' + D.counties[state.countyAt[cursor]].name + ' County');
    });
  }

  // ---------------------------------------------------------------- sound

  function bindSound() {
    var radios = document.querySelectorAll('input[name="sound"]');
    var hint = $('sound-hint');
    var saved = null;
    try { saved = localStorage.getItem('ohio-piano-sound'); } catch (e) { /* private mode */ }

    function choose(mode) {
      Sound.setMode(mode);
      radios.forEach(function (r) { r.checked = r.value === mode; });
    }

    radios.forEach(function (r) {
      r.addEventListener('change', function () {
        choose(r.value);
        if (r.value === 'samples') Sound.preload();
        try { localStorage.setItem('ohio-piano-sound', r.value); } catch (e) { /* private mode */ }
        describe(Sound.getStatus());
      });
    });

    function describe(s) {
      var samples = radios[0];
      if (s.state === 'unavailable') {
        samples.disabled = true;
        choose('synth');
        hint.textContent = location.protocol === 'file:'
          ? 'Piano samples only load from a web server, so this is the synthesizer.'
          : 'The piano samples did not load, so this is the synthesizer.';
      } else if (Sound.getMode() === 'synth') {
        hint.textContent = 'Tones made in your browser. Nothing to download.';
      } else if (s.state !== 'ready') {
        hint.textContent = 'Loading the piano… ' + s.loaded + ' of ' + s.total +
          '. The synthesizer fills in until it is ready.';
      } else {
        hint.textContent = s.loaded < s.total
          ? 'A real grand piano. A few samples did not load; the synthesizer covers those notes.'
          : 'A real grand piano, recorded note by note.';
      }
    }

    choose(saved === 'synth' ? 'synth' : 'samples');
    Sound.onStatus(describe);
    if (Sound.getMode() === 'samples') Sound.preload();

    var setVolume = function () { var v = $('volume').value / 100; Sound.setVolume(v * v); };
    $('volume').addEventListener('input', setVolume);
    setVolume();
  }

  function bindStart() {
    var start = $('start');
    var shared = state.tune.length > 0;
    if (shared) {
      start.querySelector('strong').textContent = 'Someone sent you a tune.';
      $('start-text').textContent = 'Tap or click here to hear it played on Ohio.';
    }
    // Phones only allow sound after a finished tap, so keep trying on every kind of
    // gesture until the audio is actually running.
    var gestures = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
    var begin = function () {
      var supported = Sound.unlock();
      if (!supported && !start.hidden) say('This browser cannot play sound, but the map still lights up.');
      start.hidden = true;
      if (!supported || Sound.isUnlocked()) {
        gestures.forEach(function (g) { document.removeEventListener(g, begin, true); });
      }
    };
    gestures.forEach(function (g) { document.addEventListener(g, begin, true); });
    start.addEventListener('click', function () {
      begin();
      if (shared) replay();
    });
  }

  // ----------------------------------------------------------------- init

  function init() {
    buildMap();
    buildKeys();
    buildControls();
    readHash();
    $('sort-field').value = state.varId;
    applySort();
    setRecording(false);
    bindMap();
    bindKeys();
    bindSound();
    bindStart();

    $('sort-field').addEventListener('change', function () {
      state.varId = this.value;
      applySort();
    });
    $('year').addEventListener('input', function () {
      state.yearIdx = Number(this.value);
      applySort();
    });
    $('play-order').addEventListener('click', toggle('play-order', playOrder));
    $('play-song').addEventListener('click', toggle('play-song', playSong));
    $('play-route').addEventListener('click', toggle('play-route', playRoute));
    $('replay').addEventListener('click', toggle('replay', replay));
    $('record').addEventListener('click', function () { setRecording(!state.recording); });
    $('share').addEventListener('click', share);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { stopAll(); say(''); }
    });
    // a pasted or edited link in an already open tab
    window.addEventListener('hashchange', function () {
      stopAll();
      readHash();
      $('sort-field').value = state.varId;
      applySort();
      setRecording(false);
    });
  }

  init();
})();

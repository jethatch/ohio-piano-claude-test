// Songs for "Ohio is a Piano". All four compositions are in the public domain;
// the simplified arrangements below were written for this project.
//
// Each track is a row of equal-length steps separated by spaces. A step is a
// rest (-), a note (C4, F#3, Bb2) or a chord (C3+E3+G3). Bar lines (|) are
// ignored. Tracks are layered on top of each other.
(function () {
  'use strict';

  var entertainer = {
    id: 'entertainer',
    title: 'The Entertainer',
    composer: 'Scott Joplin, 1902',
    stepMs: 165,
    tracks: [
      // right hand
      'D6 E6 C6 A5 - B5 G5 - | D5 E5 C5 A4 - B4 G4 - | D4 E4 C4 A3 - B3 A3 G#3 | G3 - - - B4+D5+F5+G5 - D4 D#4 |' +
      'E4 C5 - E4 C5 - E4 C5 | - - - - - C5 D5 D#5 | E5 C5 D5 E5 - B4 D5 - | C5 - - - - - D4 D#4 |' +
      'E4 C5 - E4 C5 - E4 C5 | - - - - - - A4 G4 | F#4 A4 C5 E5 - D5 C5 A4 | D5 - - - - - D4 D#4 |' +
      'E4 C5 - E4 C5 - E4 C5 | - - - - - C5 D5 D#5 | E5 C5 D5 E5 - B4 D5 - | C5 - - - - - C5 D5 |' +
      'E5 C5 D5 E5 - C5 D5 C5 | E5 C5 D5 E5 - C5 D5 C5 | E5 C5 D5 E5 - B4 D5 - | C5 - - - C5+E5+G5+C6 - - - |',
      // left hand
      '- - - - - - - - | - - - - - - - - | - - - - - - - - | G2 - - - - - - - |' +
      'C3 - E3+G3 - G2 - E3+G3 - | F2 - F3+A3 - C3 - E3+G3 - | G2 - E3+G3 - G2 - F3+G3 - | C3 - E3+G3 - C3 - - - |' +
      'C3 - E3+G3 - G2 - E3+G3 - | F2 - F3+A3 - C3 - E3+G3 - | D3 - F#3+A3 - D3 - F#3+A3 - | G2 - F3+G3 - G2 - B2 - |' +
      'C3 - E3+G3 - G2 - E3+G3 - | F2 - F3+A3 - C3 - E3+G3 - | G2 - E3+G3 - G2 - F3+G3 - | C3 - E3+G3 - C3 - - - |' +
      'C3 - E3+G3 - Bb2 - E3+G3 - | A2 - F3+A3 - Ab2 - F3+Ab3 - | G2 - E3+G3 - G2 - F3+G3 - | C3 - G2 - C2+C3 - - - |'
    ]
  };

  var odeToJoy = {
    id: 'ode',
    title: 'Ode to Joy',
    composer: 'Ludwig van Beethoven, 1824',
    stepMs: 190,
    tracks: [
      'E4 - E4 - F4 - G4 - | G4 - F4 - E4 - D4 - | C4 - C4 - D4 - E4 - | E4 - - D4 D4 - - - |' +
      'E4 - E4 - F4 - G4 - | G4 - F4 - E4 - D4 - | C4 - C4 - D4 - E4 - | D4 - - C4 C4 - - - |' +
      'D4 - D4 - E4 - C4 - | D4 - E4 F4 E4 - C4 - | D4 - E4 F4 E4 - D4 - | C4 - D4 - G3 - - - |' +
      'E4 - E4 - F4 - G4 - | G4 - F4 - E4 - D4 - | C4 - C4 - D4 - E4 - | D4 - - C4 C4 - - - |',
      'C3+G3 - - - C3+G3 - - - | C3+E3 - - - G2+D3 - - - | C3+G3 - - - C3+G3 - - - | C3+G3 - - G2+D3 - - - - |' +
      'C3+G3 - - - C3+G3 - - - | C3+E3 - - - G2+D3 - - - | C3+G3 - - - C3+G3 - - - | G2+D3 - - C3+G3 - - - - |' +
      'G2+D3 - - - C3+G3 - - - | G2+D3 - - - C3+G3 - - - | G2+D3 - - - G2+D3 - - - | A2+E3 - D3+F#3 - G2+D3 - - - |' +
      'C3+G3 - - - C3+G3 - - - | C3+E3 - - - G2+D3 - - - | C3+G3 - - - C3+G3 - - - | G2+D3 - - C2+C3+G3 - - - - |'
    ]
  };

  var furEliseA =
    'E5 D#5 E5 B4 D5 C5 | A4+A2 E3 A3 C4 E4 A4 | B4+E2 E3 G#3 E4 G#4 B4 | C5+A2 E3 A3 E4 E5 D#5 |' +
    'E5 D#5 E5 B4 D5 C5 | A4+A2 E3 A3 C4 E4 A4 | B4+E2 E3 G#3 E4 C5 B4 |';
  var furElise = {
    id: 'elise',
    title: 'Für Elise',
    composer: 'Ludwig van Beethoven, 1810',
    stepMs: 170,
    tracks: [
      'E5 D#5 |' + furEliseA + 'A4+A2 E3 A3 - E5 D#5 |' +
      furEliseA + 'A4+A2 E3 A3 B4 C5 D5 |' +
      'E5+C3 G3 C4 G4 F5 E5 | D5+G2 G3 B3 F4 E5 D5 | C5+A2 E3 A3 E4 D5 C5 | B4+E2 E3 E4 - E4 E5 |' +
      '- E5 E6 - - D#5 | E5 - - D#5 E5 D#5 |' +
      furEliseA + 'A4+A2+E3+A3 - - - - - |'
    ]
  };

  // Prelude in C: every bar is one five-note chord, broken the same way twice.
  var preludeBars = [
    'C4 E4 G4 C5 E5', 'C4 D4 A4 D5 F5', 'B3 D4 G4 D5 F5', 'C4 E4 G4 C5 E5',
    'C4 E4 A4 E5 A5', 'C4 D4 F#4 A4 D5', 'B3 D4 G4 D5 G5', 'B3 C4 E4 G4 C5',
    'A3 C4 E4 G4 C5', 'D3 A3 D4 F#4 C5', 'G3 B3 D4 G4 B4'
  ];
  var preludeSteps = preludeBars.map(function (bar) {
    var n = bar.split(' ');
    var half = [n[0], n[1], n[2], n[3], n[4], n[2], n[3], n[4]].join(' ');
    return half + ' ' + half;
  }).join(' | ') + ' | C2+C3+E3+G3+C4 - - - - - - -';
  var prelude = {
    id: 'prelude',
    title: 'Prelude in C',
    composer: 'J. S. Bach, 1722',
    stepMs: 140,
    tracks: [preludeSteps]
  };

  var SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  // "A0" -> 0 ... "C8" -> 87
  function keyIndex(name) {
    var m = /^([A-G])([#b]?)(\d)$/.exec(name);
    if (!m) throw new Error('Bad note name: ' + name);
    var midi = 12 * (Number(m[3]) + 1) + SEMITONE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    var key = midi - 21;
    if (key < 0 || key > 87) throw new Error('Note is off the keyboard: ' + name);
    return key;
  }

  function compile(song) {
    var steps = [];
    song.tracks.forEach(function (track) {
      var tokens = track.replace(/\|/g, ' ').trim().split(/\s+/);
      tokens.forEach(function (token, i) {
        if (!steps[i]) steps[i] = [];
        if (token !== '-') token.split('+').forEach(function (n) { steps[i].push(keyIndex(n)); });
      });
    });
    return { id: song.id, title: song.title, composer: song.composer, stepMs: song.stepMs, steps: steps };
  }

  window.OHIO_SONGS = [entertainer, odeToJoy, furElise, prelude].map(compile);
})();

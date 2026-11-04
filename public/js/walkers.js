/* ── The yard: walk TOM, ERKPA and JUIXY around ────────────────────
 *
 * Sprites come from public/img/saborosa-walkers.png, repacked out of the
 * game's own masters by tools/pack-walkers.py (1.35 MB of sheets -> 28 KB).
 *
 * The pack holds ONLY the idle pose, in the five directions the art is drawn
 * in. The other three facings are those flipped horizontally, which is what
 * the game does.
 *
 *   columns:  0 down · 1 down_left · 2 left · 3 up_left · 4 up
 *   rows:     0 TOM · 1 ERKPA · 2 JUIXY
 *
 * ⚠ THERE IS NO WALK CYCLE. None exists anywhere in the project — the game
 * itself reuses the idle frame while moving (src/entities/spritesheet.js).
 * So a character that moves is a still image sliding across the floor, which
 * reads as a bug rather than as a style. BOB mode fakes the missing cycle out
 * of one frame: a hop, a stretch on the way up, a squash on the landing, and
 * a shadow that shrinks under it. SLIDE mode is the honest raw version, kept
 * so the difference is visible side by side — flip it with the button.
 *
 * This file does nothing until the yard is focused or clicked. It never
 * listens on document, so it cannot hijack scrolling or trap the keyboard.
 */
(function () {
  'use strict';

  var stage = document.getElementById('yard-stage');
  if (!stage) return;

  // Must match tools/pack-walkers.py's output. It prints these when it runs.
  var CELL = { w: 110, h: 128 };

  var DIG_MS = 1100;    // how long you must lean on the bottom edge to fall through
  var SPEED = 165;      // px per second
  var BOB_LIFT = 9;     // px at the top of a hop
  var BOB_RATE = 0.055; // radians of hop per px walked — tied to distance, not
                        // to time, so the bounce stays with the feet

  // ── the up-facing float ─────────────────────────────────────────
  // The three up-facing poses hover above their shadow while the others sit
  // on it. It is in the art, not in the code: the fruit is drawn from BEHIND
  // in those frames, so its body sits at a different height inside its own
  // crop box, and the pack's single per-character alignment cannot place both
  // groups at once.
  //
  // Measured on the masters, as px between where the alignment puts the feet
  // and where the feet actually are (+ = floating), against each character's
  // own face-on poses as the reference:
  //
  //            up    up_left
  //   TOM     +5.8    +3.3
  //   ERKPA   +7.1    +5.8
  //   JUIXY   +7.8    +6.3
  //
  // So push those frames back down by exactly that, per character, at draw
  // time. Every other direction is untouched. Re-measure with
  // `tools/pack-walkers.py` if the sheets are ever redrawn.
  var SINK = [
    { up: 5.8, up_left: 3.3, up_right: 3.3 },   // TOM
    { up: 7.1, up_left: 5.8, up_right: 5.8 },   // ERKPA
    { up: 7.8, up_left: 6.3, up_right: 6.3 }    // JUIXY
  ];

  // column index per direction, and whether that column is mirrored
  var FACING = {
    down:       [0, false], down_left:  [1, false], left:      [2, false],
    up_left:    [3, false], up:         [4, false], up_right:  [3, true],
    right:      [2, true],  down_right: [1, true]
  };

  var prefersReduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var bob = !prefersReduced;
  var active = 0;
  var keys = Object.create(null);
  var running = false;
  var last = 0;

  // ── the overlay the cast actually lives in ──────────────────────
  // They are authored inside the yard so that with JavaScript off they are
  // three drawings standing in a box. On startup they move out of it into a
  // full-page layer, which is what lets them leave the box at all.
  //
  // This layer is NOT a canvas, deliberately. It spans the whole document and
  // sits above the content, so a canvas here would swallow every click, every
  // link and every text selection underneath it. `pointer-events: none` makes
  // the layer invisible to the mouse entirely — selection, links and scrolling
  // all behave as if it were not there — and each fruit sets `pointer-events:
  // auto` back on itself, so the characters stay clickable and nothing else
  // changes. It sits under the sticky header's z-index, so they walk behind it.
  var layer = document.createElement('div');
  layer.className = 'yard-overlay';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);

  function docHeight() {
    var b = document.body, h = document.documentElement;
    return Math.max(b.scrollHeight, h.scrollHeight, h.offsetHeight);
  }
  function sizeLayer() { layer.style.height = docHeight() + 'px'; }
  sizeLayer();
  // Lazy images landing below the fold make the document taller after this
  // runs, so take the final measurement once everything has arrived.
  window.addEventListener('load', sizeLayer);

  // ── the cast ────────────────────────────────────────────────────
  var cast = [].slice.call(stage.querySelectorAll('.yard__fruit')).map(function (el, i) {
    // Seed from wherever CSS put them — that layout IS the no-JS version —
    // then move them to the page layer, keeping the same spot on the page.
    var r = el.getBoundingClientRect();
    // document coordinates of the feet, which is what everything else uses
    var hx = r.left + window.scrollX + CELL.w / 2;
    var hy = r.top + window.scrollY + CELL.h;

    el.style.left = '0';
    el.style.top = '0';
    layer.appendChild(el);

    // Lift the name out of the character and pin it to the starting spot, so
    // it reads as a label on the ground rather than a tag dragged around.
    var tag = el.querySelector('.yard__tag');
    if (tag) {
      tag.style.left = hx + 'px';
      tag.style.top = (hy + 6) + 'px';
      layer.appendChild(tag);
    }

    return {
      el: el,
      tag: tag,
      body: el.querySelector('.yard__body'),
      shadow: el.querySelector('.yard__shadow'),
      // start where CSS already put them, so the no-JS layout is the start
      x: hx,
      y: hy,
      dir: 'down',
      phase: 0,
      i: i,
      // where they started, so they can always be sent back. Without this it
      // is possible to walk one into the footer and then lose it.
      home: { x: hx, y: hy }
    };
  });
  if (!cast.length) return;

  // The whole page is the floor now, not the yard.
  function bounds() {
    return { w: document.documentElement.clientWidth, h: docHeight() };
  }

  // Walking at the top or bottom edge of the window takes the page with you,
  // so a character can actually cross a document taller than the screen. This
  // only ever runs while an arrow key is held with the yard focused — let go,
  // or press Escape, and scrolling is entirely yours again.
  // ⚠ The site sets `scroll-behavior: smooth` on <html>, which is right for the
  // nav links and fatal here: a scrollTo issued every frame restarts the smooth
  // animation every frame, the two cancel, and the page does not move at all
  // while the character walks off the bottom of the screen. Walking turns that
  // off for the duration and start()/stop() put it back.
  function jump(y) {
    var root = document.documentElement;
    var had = root.style.scrollBehavior;
    root.style.scrollBehavior = 'auto';
    window.scrollTo(0, y);
    root.style.scrollBehavior = had;   // the nav's smooth jumps are untouched
  }

  function follow(c, dy) {
    if (!dy) return;
    var top = c.y - window.scrollY;
    var margin = Math.min(160, window.innerHeight * 0.3);
    if (dy < 0 && top < margin) {
      jump(Math.max(0, window.scrollY + (top - margin)));
    } else if (dy > 0 && top > window.innerHeight - margin) {
      jump(window.scrollY + (top - (window.innerHeight - margin)));
    }
  }

  function draw(c) {
    var lift = 0, sx = 1, sy = 1, shade = 1;
    if (bob && c.moving) {
      var s = Math.abs(Math.sin(c.phase));
      lift = s * BOB_LIFT;
      sy = 1 + 0.06 * s;          // stretch going up
      sx = 1 - 0.06 * s;          // keep the volume honest
      shade = 1 - 0.35 * s;       // shadow shrinks as he leaves the ground
    }
    var f = FACING[c.dir];
    var sink = (SINK[c.i] && SINK[c.i][c.dir]) || 0;   // see SINK above
    c.body.style.backgroundPosition = (-f[0] * CELL.w) + 'px ' + (-c.i * CELL.h) + 'px';
    c.body.style.transform =
      'translateY(' + (sink - lift).toFixed(2) + 'px) scaleX(' + ((f[1] ? -1 : 1) * sx).toFixed(3) +
      ') scaleY(' + sy.toFixed(3) + ')';
    c.shadow.style.transform = 'scale(' + shade.toFixed(3) + ')';
    c.el.style.transform =
      'translate3d(' + (c.x - CELL.w / 2).toFixed(1) + 'px,' + (c.y - CELL.h).toFixed(1) + 'px,0)';
    c.el.style.zIndex = String(100 + Math.round(c.y));  // further down = in front
  }

  function step(now) {
    if (!running) return;
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;

    var c = cast[active];
    var a = axis();                        // keys, thumb stick or tilt
    var mag = Math.min(1, Math.hypot(a.x, a.y));
    var dx = a.x, dy = a.y;

    c.moving = mag > 0.02;
    if (c.moving) {
      var len = Math.hypot(dx, dy) || 1;     // diagonals must not be faster
      // ...but an analogue source still gets to be slower than full tilt
      var sp = SPEED * mag * dt;
      var mx = (dx / len) * sp;
      var my = (dy / len) * sp;

      var b = bounds();
      var floor = b.h - 6;
      c.x = Math.max(CELL.w / 2, Math.min(b.w - CELL.w / 2, c.x + mx));
      c.y = Math.max(CELL.h * 0.55, Math.min(floor, c.y + my));
      follow(c, my);

      // ── the way down ──────────────────────────────────────────
      // Keep pushing downward once there is no more page to walk on and you
      // go through it. Holding for DIG_MS rather than touching the edge, so
      // nobody falls through by merely walking to the footer.
      if (dy > 0.35 && c.y >= floor - 0.5) {
        c.dig = (c.dig || 0) + dt;
        if (c.dig > DIG_MS / 1000) { c.dig = 0; fallThrough(c); return; }
      } else {
        c.dig = 0;
      }

      c.dir = dirOf(dx, dy);
      c.phase += Math.hypot(mx, my) * BOB_RATE;
    } else {
      c.phase = 0;
    }

    draw(c);
    requestAnimationFrame(step);
  }

  // ── where the movement comes from ───────────────────────────────
  // Three sources, one vector. Keys are the only digital one; the thumb stick
  // and the tilt are analogue, so `mag` carries how hard you are pushing and a
  // gentle lean walks slowly.
  var stick = { on: false, x: 0, y: 0 };
  var tilt = { on: false, live: false, x: 0, y: 0, zeroB: null, zeroG: 0 };

  function axis() {
    // A finger on the stick always wins, so the stick stays usable as an
    // override even with the tilt switched on.
    if (stick.on) return { x: stick.x, y: stick.y };
    // ⚠ `live`, not just `on`. Adding a deviceorientation listener succeeds on
    // plenty of devices that then never fire it — desktop Chrome, an Android
    // phone with no gyro. Handing those a tilt vector of 0,0 would silently
    // kill the thumb stick and leave the page looking broken.
    if (tilt.on && tilt.live) return { x: tilt.x, y: tilt.y };
    return {
      x: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
      y: (keys.down ? 1 : 0) - (keys.up ? 1 : 0)
    };
  }

  // Quantise any vector to the eight facings the art is drawn in. For the
  // digital keys this gives exactly what the old string-building gave.
  var OCTANT = ['right', 'down_right', 'down', 'down_left', 'left',
                'up_left', 'up', 'up_right'];
  function dirOf(x, y) {
    var k = Math.round(Math.atan2(y, x) / (Math.PI / 4));
    return OCTANT[((k % 8) + 8) % 8];
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    requestAnimationFrame(step);
  }

  function stop() {
    running = false;
    keys = Object.create(null);
    cast[active].moving = false;
    draw(cast[active]);
  }

  // ── input ───────────────────────────────────────────────────────
  // Bound to the stage, never to document: with the yard unfocused the page
  // behaves as if none of this existed.
  var MAP = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    w: 'up', a: 'left', s: 'down', d: 'right',
    W: 'up', A: 'left', S: 'down', D: 'right'
  };

  stage.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { stage.blur(); return; }       // always a way out
    if (e.key >= '1' && e.key <= String(cast.length)) {
      select(+e.key - 1);
      e.preventDefault();
      return;
    }
    var k = MAP[e.key];
    if (!k) return;                 // Tab and everything else stays the browser's
    keys[k] = true;
    e.preventDefault();             // only arrows, and only while focused
    start();
  });

  stage.addEventListener('keyup', function (e) {
    var k = MAP[e.key];
    if (k) { keys[k] = false; e.preventDefault(); }
  });

  // On a phone there is no focus to lose — tapping the stick takes it off the
  // yard immediately — so blur must not stop the loop while the pad is open.
  stage.addEventListener('blur', function () { if (!padOpen) stop(); });
  stage.addEventListener('focus', function () { stage.classList.add('is-live'); });
  stage.addEventListener('blur', function () { stage.classList.remove('is-live'); });

  function select(i) {
    if (i === active) return;
    cast[active].moving = false;
    draw(cast[active]);
    active = i;
    cast.forEach(function (c, n) {
      c.el.classList.toggle('is-active', n === i);
      if (c.tag) c.tag.classList.toggle('is-active', n === i);
    });
    if (pad) {
      var who = pad.querySelector('.pad__who');
      if (who) who.textContent = cast[i].el.dataset.name || '';
    }
    stage.setAttribute('data-active', cast[i].el.dataset.name || '');
  }

  cast.forEach(function (c, i) {
    c.el.addEventListener('pointerdown', function (e) {
      // ⚠ Must preventDefault. mousedown's own default action moves focus —
      // to the body, since a <span> is not focusable — and it runs AFTER this
      // handler, so it would undo the focus() below and clicking a character
      // would select it but leave the arrow keys dead.
      e.preventDefault();
      select(i);
      // preventScroll matters once they can leave the yard: a plain focus()
      // would jump the page back to the yard the moment you click a character
      // standing somewhere else entirely.
      try { stage.focus({ preventScroll: true }); } catch (err) { stage.focus(); }
      if (isTouch) openPad();        // phones get the stick instead of keys
    });
  });

  // ── the bob / slide switch ──────────────────────────────────────
  var toggle = document.getElementById('yard-bob');
  if (toggle) {
    var sync = function () {
      toggle.setAttribute('aria-pressed', String(bob));
      toggle.textContent = bob ? 'Walk: bobbing' : 'Walk: sliding';
    };
    sync();
    toggle.addEventListener('click', function () {
      bob = !bob;
      sync();
      draw(cast[active]);
    });
  }

  // ── through the floor ───────────────────────────────────────────
  // Lean on the bottom edge of the page long enough and you go through it,
  // into the screen both BATIDÃO DE CÔCO and THE PARTY open on: a photographed
  // compost heap with hand-drawn vermin crawling over it, SABOROSA across the
  // middle. The heap frames are ~420 KB, so they are fetched HERE and never
  // on an ordinary visit — nobody pays for a secret they did not find.
  var HEAP = ['/img/heap-1.webp', '/img/heap-2.webp', '/img/heap-3.webp'];
  var CRAWL_MS = 105;        // the rate both games crawl the heap at, ~9.5fps
  var deep = null;

  function fallThrough(c) {
    if (deep) return;
    // Snapshot what is being held BEFORE stop() clears it — `released` below
    // depends on knowing whether a key or the stick was down on the way in.
    var heldAtEntry = stick.on || Object.keys(keys).some(function (k) { return keys[k]; });
    stop();

    HEAP.forEach(function (src) { var im = new Image(); im.src = src; });

    deep = document.createElement('div');
    deep.className = 'deep is-void';
    deep.innerHTML =
      '<div class="deep__heap"></div>' +
      '<div class="deep__faller"><span class="deep__fruit"></span></div>' +
      '<img class="deep__logo" src="/img/saborosa-logo.webp" alt="" width="705" height="166">' +
      '<p class="deep__exit">any key to climb back out</p>';
    document.body.appendChild(deep);

    // the fruit that fell is the one you were walking
    var fr = deep.querySelector('.deep__fruit');
    fr.style.backgroundPosition = '0px ' + (-c.i * CELL.h) + 'px';

    // ⚠ Nothing may dismiss this until it has actually played, and there are
    // TWO separate ways a held key blows straight through it:
    //
    //   1. You got here by HOLDING the down key, and a held key auto-repeats.
    //      Those repeats are fresh keydown events arriving while the screen
    //      fades in, so the screen opens and closes in the same breath.
    //   2. Even once it has played, that same still-held key would dismiss it
    //      the instant it was allowed to.
    //
    // So: `armed` waits for the animation to finish, and `released` waits for
    // the key that dropped you to actually come up. Both must be true. This is
    // the same guard BATIDÃO puts on its label screen (`LABEL.armMs`, and its
    // note that "a key still down from launching the game would blow through
    // it before it had drawn twice").
    var crawl = null, armed = false, released = false;

    var land = function () {
      deep.classList.remove('is-void');
      deep.classList.add('is-landed');
      var f = 0, heap = deep.querySelector('.deep__heap');
      heap.style.backgroundImage = 'url("' + HEAP[0] + '")';
      crawl = setInterval(function () {
        f = (f + 1) % HEAP.length;
        heap.style.backgroundImage = 'url("' + HEAP[f] + '")';
      }, CRAWL_MS);
      // after the heap is up and he has finished flopping over on it
      setTimeout(function () {
        armed = true;
        if (deep) deep.classList.add('is-armed');   // the hint appears with it
      }, prefersReduced ? 200 : 1200);
    };

    // Whatever was being held when he went through has to come up first.
    // If nothing was held — you got here by TILTING the phone, where there is
    // no key and no finger to release — there is nothing to wait for, and
    // waiting anyway would strand you on the heap forever.
    released = !heldAtEntry;
    function onRelease() { released = true; }
    window.addEventListener('keyup', onRelease, true);
    window.addEventListener('pointerup', onRelease, true);
    window.addEventListener('pointercancel', onRelease, true);

    // Reduced motion gets the destination without the long drop.
    var timer = setTimeout(land, prefersReduced ? 260 : 1700);

    function climbOut(e) {
      if (e && e.type === 'keydown' && e.key === 'Tab') return;  // let them leave by Tab
      if (e) e.preventDefault();
      if (!armed || !released) return;             // see the note above
      clearTimeout(timer);
      if (crawl) clearInterval(crawl);
      window.removeEventListener('keydown', climbOut, true);
      window.removeEventListener('keyup', onRelease, true);
      window.removeEventListener('pointerup', onRelease, true);
      window.removeEventListener('pointercancel', onRelease, true);
      deep.classList.add('is-leaving');
      var gone = deep; deep = null;
      setTimeout(function () {
        if (gone.parentNode) gone.parentNode.removeChild(gone);
        // He climbs back out where he went down: the bottom edge of the page,
        // same x, rather than being teleported back to the yard. The other two
        // never fell, so they are left exactly where they were standing.
        var b = bounds();
        c.y = b.h - 6;
        c.dir = 'down';
        c.moving = false;
        c.phase = 0;
        c.dig = 0;         // or the hold that dropped him would fire again at once
        draw(c);
        jump(Math.max(0, b.h - window.innerHeight));   // bring that edge into view
      }, 360);
    }

    // capture, so it beats the yard's own handler
    window.addEventListener('keydown', climbOut, true);
    deep.addEventListener('pointerdown', climbOut);
  }

  // ── phones: a thumb stick, and the tilt if the device will give it ──
  // Built here rather than in the markup so a visitor with no JavaScript is
  // never shown a dead control pad. The stick always works and needs no
  // permission; the tilt is the better toy but cannot be depended on — it
  // needs HTTPS, it needs a gesture on iOS, and a single denial is sticky —
  // so the stick stays available the whole time and is what we fall back to.
  var isTouch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  var pad = null, padOpen = false;

  function buildPad() {
    pad = document.createElement('div');
    pad.className = 'pad';
    pad.innerHTML =
      '<div class="pad__stick"><span class="pad__knob"></span></div>' +
      '<div class="pad__side">' +
        '<p class="pad__who"></p>' +
        '<div class="pad__btns">' +
          '<button class="pad__btn" type="button" data-act="tilt" aria-pressed="false">Tilt</button>' +
          '<button class="pad__btn" type="button" data-act="next">Next</button>' +
          '<button class="pad__btn pad__btn--x" type="button" data-act="close" aria-label="Put them down">Done</button>' +
        '</div>' +
      '</div>' +
      '<p class="pad__note" role="status"></p>';
    document.body.appendChild(pad);

    var base = pad.querySelector('.pad__stick');
    var knob = pad.querySelector('.pad__knob');
    var grabbed = null;

    function fromPointer(ev) {
      var r = base.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var dx = ev.clientX - cx, dy = ev.clientY - cy;
      var rad = r.width / 2;
      var d = Math.hypot(dx, dy);
      var dead = rad * 0.18;
      if (d < dead) { stick.x = stick.y = 0; }
      else {
        var m = Math.min(1, (d - dead) / (rad - dead));
        stick.x = (dx / d) * m;
        stick.y = (dy / d) * m;
      }
      var kx = Math.max(-1, Math.min(1, dx / rad)) * rad * 0.52;
      var ky = Math.max(-1, Math.min(1, dy / rad)) * rad * 0.52;
      knob.style.transform = 'translate(' + kx.toFixed(1) + 'px,' + ky.toFixed(1) + 'px)';
    }
    function release() {
      grabbed = null;
      stick.on = false; stick.x = stick.y = 0;
      knob.style.transform = '';
    }
    base.addEventListener('pointerdown', function (ev) {
      ev.preventDefault();                  // the stick must not scroll the page
      grabbed = ev.pointerId;
      try { base.setPointerCapture(ev.pointerId); } catch (e) {}
      stick.on = true; fromPointer(ev); start();
    });
    base.addEventListener('pointermove', function (ev) {
      if (grabbed !== ev.pointerId) return;
      ev.preventDefault(); fromPointer(ev);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (t) {
      base.addEventListener(t, release);
    });

    pad.addEventListener('click', function (ev) {
      var b = ev.target.closest('.pad__btn');
      if (!b) return;
      var act = b.dataset.act;
      if (act === 'close') closePad();
      else if (act === 'next') select((active + 1) % cast.length);
      else if (act === 'tilt') toggleTilt(b);
    });
    return pad;
  }

  function note(msg) {
    if (!pad) return;
    pad.querySelector('.pad__note').textContent = msg || '';
  }

  function openPad() {
    if (!isTouch) return;
    if (!pad) buildPad();
    padOpen = true;
    pad.classList.add('is-open');
    pad.querySelector('.pad__who').textContent = cast[active].el.dataset.name || '';
    start();
  }

  function closePad() {
    padOpen = false;
    stopTilt();
    if (pad) pad.classList.remove('is-open');
    stick.on = false; stick.x = stick.y = 0;
    stop();
  }

  // ── the tilt ────────────────────────────────────────────────────
  // beta is the front-to-back lean, gamma the left-to-right one. Rather than
  // assuming a holding angle, the first reading after switching on becomes
  // neutral — so it is centred on however you happen to be holding the phone.
  var TILT_DEAD = 4;    // degrees of slack before anything moves
  var TILT_MAX = 26;    // degrees that means full speed

  function onOrient(e) {
    if (e.beta === null && e.gamma === null) return;   // a listener, but no sensor
    tilt.live = true;
    var beta = e.beta || 0, gamma = e.gamma || 0;
    if (tilt.zeroB === null) { tilt.zeroB = beta; tilt.zeroG = gamma; note('Tilt centred. Lean to walk.'); }

    var b = beta - tilt.zeroB;
    var g = gamma - tilt.zeroG;

    // The phone can be rotated under the page; remap so "lean right" is always
    // screen-right whichever way round it is being held.
    var ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    var x = g, y = b;
    if (ang === 90)       { x = b;  y = -g; }
    else if (ang === 180) { x = -g; y = -b; }
    else if (ang === 270 || ang === -90) { x = -b; y = g; }

    var ramp = function (v) {
      if (Math.abs(v) < TILT_DEAD) return 0;
      var s = v > 0 ? 1 : -1;
      return s * Math.min(1, (Math.abs(v) - TILT_DEAD) / (TILT_MAX - TILT_DEAD));
    };
    tilt.x = ramp(x);
    tilt.y = ramp(y);
  }

  function startTilt(btn) {
    tilt.on = true; tilt.live = false; tilt.zeroB = null; tilt.x = tilt.y = 0;
    window.addEventListener('deviceorientation', onOrient);
    btn.setAttribute('aria-pressed', 'true');
    note('Hold the phone still for a moment…');
    start();
    // If nothing has arrived by now there is no sensor behind that listener,
    // so say so and hand it back to the stick rather than looking broken.
    setTimeout(function () {
      if (tilt.on && !tilt.live) {
        stopTilt(btn);
        note('No tilt readings from this device — use the stick.');
      }
    }, 1600);
  }

  function stopTilt(btn) {
    if (tilt.on) window.removeEventListener('deviceorientation', onOrient);
    tilt.on = false; tilt.live = false; tilt.x = tilt.y = 0; tilt.zeroB = null;
    if (btn) { btn.setAttribute('aria-pressed', 'false'); }
    else if (pad) {
      var b2 = pad.querySelector('[data-act="tilt"]');
      if (b2) { b2.setAttribute('aria-pressed', 'false'); }
    }
  }

  function toggleTilt(btn) {
    if (tilt.on) { stopTilt(btn); note('Back to the stick.'); return; }
    if (typeof DeviceOrientationEvent === 'undefined') {
      note('This device has no tilt sensor — use the stick.');
      return;
    }
    // ⚠ iOS 13+ only grants this from inside the gesture, so request it
    // synchronously here. Nothing may be awaited before this call.
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function (res) {
        if (res === 'granted') startTilt(btn);
        else note('Tilt was refused, so the stick it is.');
      }).catch(function () {
        // thrown when the page is not on HTTPS, among other things
        note('Tilt needs a secure (https) page — use the stick.');
      });
      return;
    }
    startTilt(btn);                      // Android and the rest: no prompt
  }

  // ── send them home ──────────────────────────────────────────────
  var recall = document.getElementById('yard-home');
  if (recall) {
    recall.addEventListener('click', function () {
      cast.forEach(function (c) {
        c.x = c.home.x; c.y = c.home.y; c.dir = 'down'; c.moving = false; c.phase = 0;
        draw(c);
      });
      stage.scrollIntoView({ block: 'center' });
    });
  }

  // ── first paint ─────────────────────────────────────────────────
  // Lay everyone out from their CSS positions, then take over.
  stage.classList.add('is-ready');

  // Only promise arrow keys on something that has them. Until this class
  // lands, the hint says the neutral thing — which is also what someone with
  // JavaScript off is left reading.
  if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    stage.classList.add('is-keys');
  }

  // Tapping anywhere in the yard on a phone also brings up the controls, so
  // you do not have to hit a 110px fruit to get started.
  if (isTouch) {
    stage.classList.add('is-touch');
    stage.addEventListener('pointerdown', function (e) {
      if (e.target.closest('.yard__fruit')) return;   // that path selects first
      openPad();
    });
  }

  select(0);
  cast.forEach(draw);

  window.addEventListener('resize', function () {
    sizeLayer();                       // the document reflows, so the floor does
    var b = bounds();
    cast.forEach(function (c) {
      c.x = Math.min(c.x, b.w - CELL.w / 2);
      c.y = Math.min(c.y, b.h - 6);
      draw(c);
    });
  });
})();

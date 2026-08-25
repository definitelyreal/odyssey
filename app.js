/* THE ODYSSEY — a jukebox · v1.0
   Claude · 2026-08-25 · Session: a29cc8d8-8643-4e90-97bd-25de479ae329 */
(function () {
  'use strict';

  var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var records = [];
  var byCode = {};
  var current = null;          // record object currently on the platter
  var platterOpen = false;
  var armedLetter = null;
  var audioEl = null;          // active <audio>
  var flipTimer = null;
  var lastStripFocused = null;
  var elapsedSec = 0;
  try { elapsedSec = parseInt(sessionStorage.getItem('ody-elapsed') || '0', 10) || 0; } catch (e) {}
  var played = {};
  try { played = JSON.parse(sessionStorage.getItem('ody-played') || '{}'); } catch (e) { played = {}; }

  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  };
  var sealTimers = [];
  function clearSealTimers() {
    sealTimers.forEach(clearTimeout);
    sealTimers = [];
  }

  /* ---------- tiny synth (no samples) ---------- */
  var actx = null;
  function ac() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return actx; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function noiseBuf(ctx, secs) {
    var b = ctx.createBuffer(1, Math.floor(ctx.sampleRate * secs), ctx.sampleRate);
    var d = b.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  function sClick() {
    var ctx = ac(); if (!ctx) return;
    var src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx, 0.05);
    var f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800;
    var g = ctx.createGain(); g.gain.setValueAtTime(0.09, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    src.connect(f); f.connect(g); g.connect(ctx.destination); src.start();
  }
  function sThunk() {
    var ctx = ac(); if (!ctx) return;
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(110, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(48, ctx.currentTime + 0.16);
    var g = ctx.createGain(); g.gain.setValueAtTime(0.28, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
    o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.22);
    var src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx, 0.06);
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500;
    var g2 = ctx.createGain(); g2.gain.setValueAtTime(0.12, ctx.currentTime);
    g2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    src.connect(f); f.connect(g2); g2.connect(ctx.destination); src.start();
  }
  function sWhirr() {
    var ctx = ac(); if (!ctx) return;
    var src = ctx.createBufferSource(); src.buffer = noiseBuf(ctx, 0.7);
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(180, ctx.currentTime);
    f.frequency.exponentialRampToValueAtTime(420, ctx.currentTime + 0.55); f.Q.value = 2.5;
    var g = ctx.createGain(); g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.05, ctx.currentTime + 0.2);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.7);
    src.connect(f); f.connect(g); g.connect(ctx.destination); src.start();
  }

  /* ---------- data ---------- */
  function loadData(cb) {
    var inline = function () {
      var el = document.getElementById('records-data');
      cb(el ? JSON.parse(el.textContent) : { records: [] });
    };
    if (location.protocol === 'file:') { inline(); return; }
    fetch('data/records.json')
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(cb)
      .catch(inline);
  }

  /* ---------- memorial prelude ---------- */
  function memorial() {
    var m = $('#memorial');
    var advanced = false;
    var started = false;
    function advance() {
      if (advanced) return;
      advanced = true;
      m.classList.add('leaving');
      $('#jukebox').classList.add('on');
      document.body.style.overflow = '';
      setTimeout(function () { m.remove(); }, 1600);
    }
    function startSeq() {
      if (started) return;
      started = true;
      setTimeout(function () { m.classList.add('lit'); }, 60);
      var hold = location.hash.indexOf('now') !== -1 ? 60000 : (REDUCED ? 5400 : 8600);
      setTimeout(advance, hold);
    }
    m.addEventListener('click', advance);
    m.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') advance(); });
    document.body.style.overflow = 'hidden';
    // begin only once the page is actually visible (links often open in background tabs)
    if (document.hidden && location.hash.indexOf('now') === -1) {
      document.addEventListener('visibilitychange', function onVis() {
        if (!document.hidden) { document.removeEventListener('visibilitychange', onVis); startSeq(); }
      });
    } else {
      startSeq();
    }
  }

  /* ---------- strips ---------- */
  function renderStrips() {
    var ul = $('#strips');
    ul.innerHTML = '';
    records.forEach(function (r) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.className = 'strip' + (r.media.type === 'sealed' ? ' sealed' : '') + (played[r.code] ? ' played' : '');
      b.style.setProperty('--wear', r.wear);
      b.style.setProperty('--seed', r.seed);
      if (r.chips) b.setAttribute('data-chips', r.chips);
      b.setAttribute('data-code', r.code);
      var credit = [r.artist, r.year, r.runtime, r.medium].filter(Boolean).join(' · ');
      b.setAttribute('aria-label', 'Select record ' + r.code + ': THE ODYSSEY. ' + credit +
        (played[r.code] ? '. Played.' : ''));
      b.innerHTML =
        '<span class="row">' +
          '<span class="code" aria-hidden="true">' + esc(r.code) + '</span>' +
          '<span class="mid">' +
            '<span class="title" aria-hidden="true">THE&nbsp;ODYSSEY</span>' +
            '<span class="credit" aria-hidden="true">' + esc(credit) + '</span>' +
          '</span>' +
          '<span class="punch" aria-hidden="true"></span>' +
        '</span>';
      b.addEventListener('click', function () {
        lastStripFocused = b;
        armedLetter = null;
        punchThrough(r.code);
      });
      li.appendChild(b);
      ul.appendChild(li);
    });
  }
  function stripEl(code) { return $('.strip[data-code="' + code + '"]'); }

  /* strip tap routes through the keypad visually, then selects */
  function punchThrough(code) {
    sClick();
    pressKeyVisual(code[0]);
    setReadout(code[0] + ' –');
    setTimeout(function () { pressKeyVisual(code[1]); }, 140);
    select(code);
  }

  /* ---------- keypad ---------- */
  function setReadout(text, msg) {
    var r = $('#readout');
    r.textContent = text;
    r.classList.toggle('msg', !!msg);
  }
  function pressKeyVisual(k) {
    var el = $('.key[data-k="' + k + '"]');
    if (!el) return;
    el.classList.add('pressed');
    setTimeout(function () { el.classList.remove('pressed'); }, 160);
  }
  function keypadInput(k) {
    sClick();
    if (/[ABCD]/.test(k)) {
      armedLetter = k;
      $$('.key').forEach(function (el) { el.classList.toggle('armed', el.getAttribute('data-k') === k); });
      setReadout(k + ' –');
      return;
    }
    // number
    if (!armedLetter) { badCode('SELECT A LETTER FIRST'); return; }
    var code = armedLetter + k;
    armedLetter = null;
    $$('.key').forEach(function (el) { el.classList.remove('armed'); });
    if (!byCode[code]) { badCode('NO SUCH RECORD'); return; }
    setReadout(code[0] + ' ' + code[1]);
    select(code);
  }
  function badCode(msg) {
    var r = $('#readout');
    setReadout(msg, true);
    r.classList.remove('shake');
    void r.offsetWidth;
    r.classList.add('shake');
    setTimeout(function () { setReadout('– –'); }, 1600);
  }

  /* ---------- selection ---------- */
  function roomDip() {
    document.documentElement.style.setProperty('--room-dim', '0.55');
    setTimeout(function () {
      document.documentElement.style.setProperty('--room-dim', '0');
    }, 420);
  }
  function select(code) {
    var r = byCode[code];
    if (!r) return;
    clearSealTimers();
    var strip = stripEl(code);
    sThunk();
    if (!REDUCED) roomDip();
    if (strip) {
      strip.classList.add('flare');
      setTimeout(function () { strip.classList.remove('flare'); }, 900);
    }
    if (r.media.type === 'sealed') {
      sealTimers.push(setTimeout(function () { setReadout('NOT YET PRESSED', true); }, 380));
      sealTimers.push(setTimeout(function () {
        openPlatter(r);
        setReadout('– –');
      }, 1500));
      return;
    }
    // playable records open synchronously so audio can start inside the user gesture
    openPlatter(r);
    setTimeout(function () { setReadout('– –'); }, 1200);
  }

  /* ---------- platter ---------- */
  function stopMedia() {
    if (audioEl) { try { audioEl.pause(); } catch (e) {} audioEl = null; }
    if (flipTimer) { clearInterval(flipTimer); flipTimer = null; }
    $('#player-zone').innerHTML = '';
  }
  function closePlatter() {
    clearSealTimers();
    var closingCode = current ? current.code : null;
    stopMedia();
    platterOpen = false;
    current = null;
    $('#platter').classList.remove('open');
    $$('.strip').forEach(function (s) { s.classList.remove('now'); });
    $('#jukebox').removeAttribute('inert');
    $('#jukebox').removeAttribute('aria-hidden');
    document.body.style.overflow = '';
    var target = lastStripFocused || (closingCode && stripEl(closingCode));
    if (target) target.focus();
  }
  function markPlayed(r) {
    if (r.media.type === 'sealed' || played[r.code]) return;
    played[r.code] = true;
    try { sessionStorage.setItem('ody-played', JSON.stringify(played)); } catch (e) {}
    var s = stripEl(r.code);
    if (s) s.classList.add('played');
  }
  function openPlatter(r) {
    stopMedia();
    current = r;
    platterOpen = true;
    markPlayed(r);
    var p = $('#platter');
    $$('.strip').forEach(function (s) { s.classList.toggle('now', s.getAttribute('data-code') === r.code); });

    $('#platter .now-code').textContent = r.code + '  ·  ' + r.artist.toUpperCase();

    // disc
    var sealed = r.media.type === 'sealed';
    var disc = $('#disc');
    disc.className = 'disc' + (sealed ? ' sealed-disc' : '');
    disc.style.setProperty('--wear', r.wear);
    disc.style.setProperty('--seed', r.seed);
    $('#disc .l-title').innerHTML = 'THE<br>ODYSSEY';
    $('#disc .l-artist').textContent = r.artist + ' · ' + r.year;
    if (!REDUCED) {
      disc.classList.add('dropping');
      setTimeout(function () { disc.classList.remove('dropping'); }, 800);
      if (!sealed) sWhirr();
    }

    buildPlayer(r);
    buildCard(r);

    p.classList.remove('open');
    void p.offsetWidth;
    p.classList.add('open');
    p.scrollTop = 0;
    document.body.style.overflow = 'hidden';
    var jb = $('#jukebox');
    jb.setAttribute('inert', '');
    jb.setAttribute('aria-hidden', 'true');
    $('#platter .back').focus({ preventScroll: true });
  }
  /* keep Tab inside the dialog while it is open */
  function trapTab(e) {
    if (e.key !== 'Tab' || !platterOpen) return;
    var focusables = $$('#platter button, #platter a[href], #platter [tabindex]:not([tabindex="-1"])')
      .filter(function (el) { return el.offsetParent !== null; });
    if (!focusables.length) return;
    var first = focusables[0], last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { last.focus(); e.preventDefault(); }
    else if (!e.shiftKey && document.activeElement === last) { first.focus(); e.preventDefault(); }
    else if (!$('#platter').contains(document.activeElement)) { first.focus(); e.preventDefault(); }
  }
  function setSpin(on) {
    $('#disc').classList.toggle('spinning', on && !REDUCED);
  }

  /* ---------- players ---------- */
  function ytFrame(videoId, title, autoplay) {
    var w = document.createElement('div');
    w.className = 'yt-frame';
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(videoId) +
      '?rel=0&color=white&playsinline=1' + (autoplay ? '&autoplay=1' : '');
    f.title = title || 'Video player';
    f.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
    f.setAttribute('allowfullscreen', '');
    w.appendChild(f);
    return w;
  }
  /* facade: our own quiet poster; the iframe (and its chrome) only arrives on the visitor's tap */
  function ytFacade(videoId, title, opts) {
    opts = opts || {};
    var w = document.createElement('div');
    w.className = 'yt-frame facade' + (opts.noThumb ? ' typo' : '');
    var b = document.createElement('button');
    b.className = 'facade-btn';
    b.setAttribute('aria-label', 'Play: ' + (title || 'video'));
    if (!opts.noThumb) {
      b.style.backgroundImage = 'url("https://i.ytimg.com/vi/' + encodeURIComponent(videoId) + '/hqdefault.jpg")';
    }
    b.innerHTML =
      '<span class="facade-tint" aria-hidden="true"></span>' +
      (opts.facadeTitle ? '<span class="facade-title" aria-hidden="true">' + esc(opts.facadeTitle) + '</span>' : '') +
      '<span class="facade-play" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg></span>';
    b.addEventListener('click', function () {
      var frame = ytFrame(videoId, title, true);
      w.replaceWith(frame);
      setSpin(true);
    });
    w.appendChild(b);
    return w;
  }
  function fmt(s) {
    s = Math.max(0, Math.floor(s));
    return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function buildTransport(r) {
    var zone = $('#player-zone');
    var t = document.createElement('div');
    t.className = 'transport';
    var known = r.media.duration || 0;
    t.innerHTML =
      '<button class="pp" aria-label="Play or pause">&#9654;</button>' +
      '<div class="track">' +
        '<div class="t-name">' + esc(r.media.trackName || r.artist) + '</div>' +
        '<div class="bar" role="slider" aria-label="Seek" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" tabindex="0"><div class="fill"></div></div>' +
        '<div class="time">0:00 / ' + (known ? fmt(known) : '–:––') + '</div>' +
      '</div>';
    zone.appendChild(t);

    var pp = $('.pp', t), bar = $('.bar', t), fill = $('.fill', t), time = $('.time', t);
    var a = new Audio(r.media.src);
    a.preload = 'auto';
    audioEl = a;

    function render() {
      var d = a.duration || known || 0;
      var pct = d ? (a.currentTime / d) * 100 : 0;
      fill.style.width = pct + '%';
      bar.setAttribute('aria-valuenow', Math.round(pct));
      time.textContent = fmt(a.currentTime) + ' / ' + (d ? fmt(d) : '–:––');
      pp.innerHTML = a.paused ? '&#9654;' : '&#10073;&#10073;';
      setSpin(!a.paused);
    }
    a.addEventListener('timeupdate', render);
    a.addEventListener('play', render);
    a.addEventListener('pause', render);
    a.addEventListener('ended', function () { setSpin(false); render(); });
    a.addEventListener('error', function () {
      // degrade: never show a broken player
      t.remove();
      degradeNote(r);
      setSpin(false);
    });
    pp.addEventListener('click', function () { if (a.paused) { a.play(); } else { a.pause(); } });
    function seekTo(clientX) {
      var rect = bar.getBoundingClientRect();
      var frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      if (a.duration) a.currentTime = frac * a.duration;
    }
    bar.addEventListener('click', function (e) { seekTo(e.clientX); });
    bar.addEventListener('keydown', function (e) {
      if (!a.duration) return;
      if (e.key === 'ArrowRight') { a.currentTime = Math.min(a.duration, a.currentTime + 5); e.preventDefault(); }
      if (e.key === 'ArrowLeft') { a.currentTime = Math.max(0, a.currentTime - 5); e.preventDefault(); }
    });

    // begin — inside the punch gesture, so mobile allows it
    var pr = a.play();
    if (pr && pr.catch) pr.catch(function () { /* user taps play instead */ });
  }
  function degradeNote(r) {
    var zone = $('#player-zone');
    if ($('.no-media', zone)) return;
    var n = document.createElement('div');
    n.className = 'no-media';
    var links = (r.media.linkouts || []).map(function (l) {
      return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + '</a>';
    }).join('<br>');
    n.innerHTML = 'THE RECORDING IS OFF THE SHELF AT THE MOMENT.' + (links ? '<br>' + links : '');
    zone.appendChild(n);
  }
  function greekPanel(title, text, poem) {
    var g = document.createElement('div');
    g.className = 'greek-panel' + (poem ? ' poem' : '');
    g.setAttribute('lang', 'el');
    if (title) {
      var h = document.createElement('div');
      h.style.cssText = 'font-family:var(--greek);font-size:0.86rem;letter-spacing:0.06em;color:rgba(232,165,75,0.8);margin-bottom:0.8rem;text-align:center;';
      h.textContent = title;
      g.appendChild(h);
    }
    var body = document.createElement('div');
    text.split('\n').forEach(function (line) {
      var d = document.createElement('div');
      d.className = 'vline';
      d.textContent = line || ' ';
      body.appendChild(d);
    });
    g.appendChild(body);
    return g;
  }

  function buildPlayer(r) {
    var zone = $('#player-zone');
    zone.innerHTML = '';
    var m = r.media;

    if (m.type === 'audio') {
      buildTransport(r);
      if (r.extra && r.extra.greekProem) {
        zone.appendChild(greekPanel(r.extra.greekTitle, r.extra.greekProem));
      }
    }

    if (m.type === 'youtube') {
      if (m.videoId) {
        zone.appendChild(ytFacade(m.videoId, m.videoLabel || 'THE ODYSSEY', {}));
      } else { degradeNote(r); }
    }

    if (m.type === 'poem') {
      if (m.videoId) {
        var wrap = document.createElement('div');
        wrap.appendChild(ytFacade(m.videoId, m.videoLabel || 'Reading',
          { noThumb: m.noThumb, facadeTitle: m.facadeTitle }));
        if (m.videoLabel) {
          var cap = document.createElement('div');
          cap.style.cssText = 'font-family:var(--mono);font-size:0.58rem;letter-spacing:0.12em;color:rgba(242,233,216,0.5);margin-top:0.5rem;text-align:center;';
          cap.textContent = m.videoLabel.toUpperCase();
          wrap.appendChild(cap);
        }
        zone.appendChild(wrap);
      }
      if (r.extra && r.extra.greekPoem) {
        zone.appendChild(greekPanel(r.extra.greekTitle, r.extra.greekPoem, true));
      }
    }

    if (m.type === 'tracks') {
      var list = document.createElement('div');
      list.className = 'tracks';
      var frameHolder = document.createElement('div');
      var currentAlt = false;

      function loadTrack(i, alt, autoplay) {
        currentAlt = !!alt;
        var tr = m.tracks[i];
        var vid = alt && tr.alt ? tr.alt.videoId : tr.videoId;
        frameHolder.innerHTML = '';
        if (autoplay) {
          frameHolder.appendChild(ytFrame(vid, tr.name, true));
          setSpin(true);
        } else {
          frameHolder.appendChild(ytFacade(vid, tr.name, {}));
          setSpin(false);
        }
        $$('.track-btn', list).forEach(function (b, j) {
          b.classList.toggle('on', j === i);
          b.setAttribute('aria-pressed', j === i ? 'true' : 'false');
        });
        $$('.version-toggle button', list).forEach(function (b) {
          var on = (b.getAttribute('data-alt') === '1') === currentAlt;
          b.classList.toggle('on', on);
          b.setAttribute('aria-pressed', on ? 'true' : 'false');
        });
      }

      m.tracks.forEach(function (tr, i) {
        var b = document.createElement('button');
        b.className = 'track-btn';
        b.innerHTML = '<span class="no">' + (i + 1) + '</span><span class="t-title">' + esc(tr.name) +
          (tr.year ? ' <span style="opacity:.5">· ' + esc(tr.year) + '</span>' : '') + '</span>';
        if (tr.alt) {
          var vt = document.createElement('span');
          vt.className = 'version-toggle';
          vt.innerHTML =
            '<button data-alt="0" class="on" aria-pressed="true" aria-label="' + esc(tr.name + ', ' + (tr.alt.primaryLabel || 'original')) + '">' + esc(tr.alt.primaryLabel || 'A') + '</button>' +
            '<button data-alt="1" aria-pressed="false" aria-label="' + esc(tr.name + ', ' + tr.alt.label) + '">' + esc(tr.alt.label) + '</button>';
          $$('button', vt).forEach(function (tb) {
            tb.addEventListener('click', function (e) {
              e.stopPropagation();
              loadTrack(i, tb.getAttribute('data-alt') === '1', true);
            });
          });
          b.appendChild(vt);
        }
        b.addEventListener('click', function () { loadTrack(i, false, true); });
        list.appendChild(b);
      });

      zone.appendChild(list);
      zone.appendChild(frameHolder);
      loadTrack(0, false, false);
    }

    if (m.type === 'text') {
      buildFlipper(r);
      setSpin(true);
    }

    if (m.type === 'sealed') {
      setSpin(false);
    }
  }

  /* ---------- B1 flipper ---------- */
  function buildFlipper(r) {
    var zone = $('#player-zone');
    var trs = r.extra.translations || [];
    var idx = 0;
    var f = document.createElement('div');
    f.className = 'flipper';
    f.innerHTML =
      '<div class="flip-tabs" role="tablist"></div>' +
      '<div class="flip-frame">' +
        '<div class="flip-text"></div>' +
        '<div class="flip-meta"></div>' +
        '<div class="flip-linkout" style="font-family:var(--mono);font-size:0.6rem;"></div>' +
      '</div>' +
      '<div class="polytropos">' +
        '<div class="p-greek" lang="grc">' + (r.extra.greekLine1 || '') + '</div>' +
        '<div class="p-words"></div>' +
      '</div>';
    zone.appendChild(f);

    var tabs = $('.flip-tabs', f), txt = $('.flip-text', f), meta = $('.flip-meta', f),
        lo = $('.flip-linkout', f), words = $('.p-words', f);

    trs.forEach(function (t, i) {
      var b = document.createElement('button');
      b.className = 'flip-tab';
      b.setAttribute('role', 'tab');
      b.textContent = t.year;
      b.setAttribute('aria-label', t.translator + ', ' + t.year);
      b.addEventListener('click', function () { show(i, true); });
      tabs.appendChild(b);
      var w = document.createElement('span');
      w.className = 'p-word';
      w.innerHTML = '<b>' + esc(t.polytropos) + '</b>&thinsp;<span style="opacity:.55">' + esc(t.year) + '</span>';
      words.appendChild(w);
    });

    function show(i, manual) {
      idx = i;
      $$('.flip-tab', tabs).forEach(function (b, j) {
        b.classList.toggle('on', j === i);
        b.setAttribute('aria-selected', j === i ? 'true' : 'false');
      });
      $$('.p-word', words).forEach(function (w, j) { w.classList.toggle('hot', j === i); });
      var t = trs[i];
      txt.classList.add('fading');
      setTimeout(function () {
        txt.textContent = t.text;
        meta.textContent = t.translator + ' · ' + t.year;
        lo.innerHTML = t.linkout
          ? '<a style="color:var(--tungsten)" href="' + esc(t.linkout.url) + '" target="_blank" rel="noopener">' + esc(t.linkout.label) + ' →</a>'
          : '';
        txt.classList.remove('fading');
      }, REDUCED ? 0 : 300);
      if (manual) restartFlip();
    }
    function restartFlip() {
      if (flipTimer) clearInterval(flipTimer);
      flipTimer = setInterval(function () { show((idx + 1) % trs.length, false); }, 9000);
    }
    show(0, false);
    restartFlip();
  }

  /* ---------- card ---------- */
  function buildCard(r) {
    var card = $('#card');
    var head = r.code + ' · ' + r.artist + ' · ' + r.year;
    var body = r.card.map(function (p) {
      var m = p.match(/^(\d)\|\s*(.*)$/s);
      if (m) return '<p><span class="num">' + m[1] + '</span>' + m[2] + '</p>';
      return '<p>' + p + '</p>';
    }).join('');
    var links = (r.media.linkouts || []).map(function (l) {
      return '<a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label) + ' →</a>';
    }).join('<br>');
    card.innerHTML =
      '<div class="c-head"><span>' + esc(head) + '</span><span>' + esc(r.runtime || 'SEALED') + '</span></div>' +
      '<div class="c-body">' + body + '</div>' +
      (links ? '<div class="c-links">' + links + '</div>' : '');
    card.classList.remove('printed');
    void card.offsetWidth;
    card.classList.add('printed');
  }

  /* ---------- elapsed ---------- */
  function tickElapsed() {
    if (platterOpen && current && current.media.type !== 'sealed') {
      elapsedSec++;
      try { sessionStorage.setItem('ody-elapsed', String(elapsedSec)); } catch (e) {}
    }
    var el = $('#elapsed');
    el.textContent = fmt(elapsedSec) + ' · about twenty minutes';
  }

  /* ---------- keyboard ---------- */
  function globalKeys(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    var k = e.key.toUpperCase();
    if (k === 'ESCAPE') {
      if (platterOpen) { closePlatter(); e.preventDefault(); }
      else if (armedLetter) { armedLetter = null; $$('.key').forEach(function (el) { el.classList.remove('armed'); }); setReadout('– –'); }
      return;
    }
    if (/^[ABCD]$/.test(k)) { pressKeyVisual(k); keypadInput(k); }
    if (/^[12]$/.test(k)) { pressKeyVisual(k); keypadInput(k); }
  }

  /* ---------- boot ---------- */
  function boot(data) {
    records = data.records || [];
    byCode = {};
    records.forEach(function (r) { byCode[r.code] = r; });
    renderStrips();

    $$('.key').forEach(function (b) {
      b.addEventListener('click', function () { keypadInput(b.getAttribute('data-k')); });
    });
    $('#platter .back').addEventListener('click', closePlatter);
    document.addEventListener('keydown', globalKeys);
    document.addEventListener('keydown', trapTab);
    setReadout('– –');
    setInterval(tickElapsed, 1000);
    tickElapsed();
    memorial();
  }

  document.addEventListener('DOMContentLoaded', function () {
    loadData(boot);
  });
})();

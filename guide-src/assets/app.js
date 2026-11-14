(function () {
  'use strict';
  var doc = document, root = doc.documentElement;
  function $(s, r) { return (r || doc).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); }
  function closest(el, sel) { return el && el.closest ? el.closest(sel) : null; }
  function escapeHtml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var DATA = JSON.parse($('#guide-data').textContent);
  var CH = DATA.chapters, byId = {};
  CH.forEach(function (c, i) { c.i = i; byId[c.id] = c; });
  var tracked = CH.filter(function (c) { return c.kind !== 'appendix'; });

  /* ── saved state (falls back to memory when storage is unavailable) ── */
  var KEY = 'rust-guide-v1', persistent = false, state = {};
  try {
    var ls = window.localStorage;
    ls.setItem(KEY + '-test', '1'); ls.removeItem(KEY + '-test');
    persistent = true;
    state = JSON.parse(ls.getItem(KEY) || '{}') || {};
  } catch (e) { persistent = false; state = {}; }
  function normalise() {
    ['done', 'saved', 'quiz'].forEach(function (k) { if (!state[k] || typeof state[k] !== 'object') state[k] = {}; });
  }
  normalise();
  function save() { if (persistent) { try { window.localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { } } }

  /* ── toast ── */
  var toastEl = $('#toast'), toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg; toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, 5200);
  }

  /* ── navigation ── */
  var current = null, sidebar = $('#sidebar'), scrim = $('#scrim'), rail = $('#rail');
  var app = $('.app'), mainCol = $('.main-col'), menu = $('#menu');
  var sidebarClose = $('#sidebar-close');
  var mobileNav = window.matchMedia('(max-width: 900px)');
  var sections = $$('.chapter');

  function openDrawer(open) {
    var mobile = mobileNav.matches;
    var focusWasInSidebar = sidebar.contains(doc.activeElement);
    if (mobile) {
      app.classList.remove('sidebar-collapsed');
      sidebar.classList.toggle('open', open);
      sidebar.inert = !open;
      mainCol.inert = open;
      scrim.hidden = !open;
      if (open) {
        var firstLink = $('.toc-part-btn', sidebar);
        if (firstLink) firstLink.focus();
      } else if (focusWasInSidebar) {
        menu.focus();
      }
    } else {
      sidebar.classList.remove('open');
      sidebar.inert = false;
      mainCol.inert = false;
      scrim.hidden = true;
      app.classList.toggle('sidebar-collapsed', !open);
    }
    menu.setAttribute('aria-expanded', open ? 'true' : 'false');
    var label = open ? (mobile ? 'Close navigation' : 'Hide navigation')
      : (mobile ? 'Open navigation' : 'Show navigation');
    menu.setAttribute('aria-label', label);
    menu.title = label;
  }

  function show(id, anchor, opts) {
    opts = opts || {};
    if (id !== 'home' && !byId[id]) { id = 'home'; anchor = null; }
    var target = doc.getElementById('ch-' + id);
    if (!target) return;
    sections.forEach(function (s) { s.hidden = (s !== target); });
    $('#page').classList.toggle('wide', id === 'home');
    current = id;
    var c = byId[id];
    $$('#toc a').forEach(function (a) {
      var on = a.getAttribute('data-nav') === id;
      a.classList.toggle('active', on);
      if (on) {
        a.setAttribute('aria-current', 'page');
        var btn = $('.toc-part-btn', closest(a, '.toc-part'));
        if (btn) btn.setAttribute('aria-expanded', 'true');
        if (!opts.initial && a.scrollIntoView) { try { a.scrollIntoView({ block: 'nearest' }); } catch (e) { } }
      } else a.removeAttribute('aria-current');
    });
    $('#crumb').innerHTML = c
      ? escapeHtml(c.partTitle) + '<span class="sep">›</span><b>' + (c.kind === 'appendix' ? 'Appendix ' + c.num + ' · ' : (c.num !== '0' ? c.num + ' · ' : '')) + escapeHtml(plain(c.title)) + '</b>'
      : '<b>Rust from Zero</b><span class="sep">·</span>the complete hands-on guide';
    doc.title = (c ? plain(c.title) + ' — ' : '') + 'Rust from Zero';
    prepare(target);
    buildRail(target);
    var el = null;
    if (anchor) el = doc.getElementById(anchor) || doc.getElementById(id + '--' + anchor);
    if (el && el.scrollIntoView) el.scrollIntoView(); else window.scrollTo(0, 0);
    if (id !== 'home') { state.last = id; save(); }
    var hash = '#' + id + (anchor && el ? '/' + anchor.replace(id + '--', '') : '');
    try {
      if (opts.push) window.history.pushState(null, '', hash); else window.history.replaceState(null, '', hash);
    } catch (e) { }
    if (mobileNav.matches) openDrawer(false);
    if (opts.push) { var h = $('h1', target); if (h && !anchor) { try { h.focus({ preventScroll: true }); } catch (e) { } } }
    onScroll();
  }
  function plain(s) { return String(s).replace(/[`*]/g, ''); }

  function route(initial) {
    var h = '';
    try { h = decodeURIComponent((window.location.hash || '').slice(1)); } catch (e) { h = ''; }
    var parts = h.split('/');
    show(parts[0] || 'home', parts[1] || null, { initial: initial });
  }

  function buildRail(sec) {
    var hs = $$('.ch-body h2', sec);
    if (hs.length < 2) { rail.innerHTML = ''; return; }
    rail.innerHTML = '<p class="rail-h">In this chapter</p>' + hs.map(function (h) {
      return '<a href="#' + h.id + '" data-jump="' + h.id + '">' + escapeHtml(h.textContent) + '</a>';
    }).join('');
  }

  /* ── progress ── */
  function refreshProgress() {
    var n = tracked.filter(function (c) { return state.done[c.id]; }).length;
    var pct = tracked.length ? Math.round(100 * n / tracked.length) : 0;
    $('#progress-text').textContent = n + ' of ' + tracked.length + ' chapters complete';
    $('#progress-pct').textContent = pct + '%';
    $('#progress-fill').style.width = pct + '%';
    $$('a[data-nav]').forEach(function (a) { a.classList.toggle('done', !!state.done[a.getAttribute('data-nav')]); });
    $$('.toc-part').forEach(function (p) {
      var links = $$('.toc-list a', p), d = links.filter(function (a) { return a.classList.contains('done'); }).length;
      var key = p.getAttribute('data-part');
      $('.toc-count', p).textContent = key === 'app' ? '' : d + '/' + links.length;
      var pp = $('.path-part[data-part="' + key + '"]');
      if (pp) pp.classList.toggle('complete', links.length > 0 && d === links.length);
    });
    $$('.btn-done').forEach(function (b) {
      var d = !!state.done[b.getAttribute('data-done')];
      b.classList.toggle('is-done', d); b.classList.toggle('primary', !d);
      b.setAttribute('aria-pressed', d ? 'true' : 'false');
      $('span', b).textContent = d ? 'Completed — click to undo' : 'Mark as complete';
    });
    var resume = $('#resume');
    if (resume) {
      var last = state.last && byId[state.last];
      resume.hidden = !last;
      if (last) { resume.setAttribute('data-nav', last.id); resume.href = '#' + last.id; $('span', resume).textContent = 'Continue: ' + plain(last.title); }
    }
    $('#save-note').textContent = persistent ? 'Progress is saved in this browser' : 'Progress is kept until you close this page';
  }

  /* ── quizzes ── */
  function markQuestion(q, idx) {
    var opts = $$('.opt', q);
    if (!opts[idx] || q.classList.contains('answered')) return;
    var ok = opts[idx].getAttribute('data-ok') === '1';
    q.classList.add('answered', ok ? 'ok' : 'no');
    opts.forEach(function (o, i) {
      o.disabled = true;
      if (o.getAttribute('data-ok') === '1') o.classList.add('right');
      else if (i === idx) o.classList.add('wrong');
    });
    var exp = $('.q-exp', q);
    exp.hidden = false;
    $('.q-verdict', exp).textContent = ok ? 'Correct.' : 'Not quite.';
  }
  function scoreQuiz(quiz) {
    var qs = $$('.q', quiz), answered = qs.filter(function (q) { return q.classList.contains('answered'); });
    var right = answered.filter(function (q) { return q.classList.contains('ok'); }).length;
    $('.quiz-score', quiz).textContent = answered.length ? right + ' of ' + qs.length + ' correct' : '';
    $('.quiz-reset', quiz).hidden = !answered.length;
  }
  function resetQuiz(quiz) {
    $$('.q', quiz).forEach(function (q) {
      q.classList.remove('answered', 'ok', 'no');
      $$('.opt', q).forEach(function (o) { o.disabled = false; o.classList.remove('right', 'wrong'); });
      $('.q-exp', q).hidden = true;
    });
    delete state.quiz[quiz.getAttribute('data-quiz')]; save(); scoreQuiz(quiz);
  }

  /* ── memory stepper ── */
  var CIRCLED = ['①', '②', '③', '④', '⑤', '⑥'];
  function valueHtml(v) {
    return escapeHtml(v).replace(/-&gt;#(\d+)/g, function (_, n) {
      return '<span class="ptr h' + (((+n - 1) % 4) + 1) + '">→ ' + (CIRCLED[+n - 1] || n) + '</span>';
    });
  }
  var STATE_TAG = { moved: 'moved out', gone: 'gone', freed: 'freed', 'new': '', mut: 'mutable', ref: 'borrow' };
  function initStepper(el) {
    var steps = JSON.parse($('script', el).textContent).steps, i = 0;
    var lines = $$('.st-code li', el), mem = $('.st-mem', el), note = $('.st-note', el), pos = $('.st-pos', el);
    var prev = $('.st-prev', el), next = $('.st-next', el), seen = {}, tallMem = 0, tallNote = 0;
    function render() {
      var s = steps[i];
      s.lines.forEach(function (n) { seen[n] = true; });
      lines.forEach(function (li, k) {
        li.classList.toggle('on', s.lines.indexOf(k + 1) >= 0);
        li.classList.toggle('seen', !!seen[k + 1]);
      });
      var frames = [], map = {};
      s.stack.forEach(function (v) { if (!map[v.f]) { map[v.f] = []; frames.push(v.f); } map[v.f].push(v); });
      var stack = frames.slice().reverse().map(function (f) {
        return '<div class="frame"><div class="frame-name">' + escapeHtml(f) + '()</div>' + map[f].map(function (v) {
          var tag = STATE_TAG[v.s] ? '<span class="tag' + (v.s === 'mut' || v.s === 'ref' ? ' good' : '') + '">' + STATE_TAG[v.s] + '</span>' : '';
          return '<div class="cell ' + v.s + '"><b>' + escapeHtml(v.n) + '</b><span class="v">' + valueHtml(v.v) + tag + '</span></div>';
        }).join('') + '</div>';
      }).join('') || '<div class="mem-empty">nothing yet</div>';
      var heap = s.heap.map(function (h) {
        var tag = h.s === 'freed' ? '<span class="tag">freed</span>' : '';
        return '<div class="cell ' + h.s + '"><span><span class="hid h' + (((h.id - 1) % 4) + 1) + '">' + (CIRCLED[h.id - 1] || h.id) + '</span></span><span class="v">' + valueHtml(h.v) + tag + '</span></div>';
      }).join('') || '<div class="mem-empty">empty</div>';
      mem.innerHTML = '<div><div class="mem-h">Stack<small>small, fast, automatic</small></div>' + stack + '</div>' +
        '<div><div class="mem-h">Heap<small>big, flexible, must be freed</small></div>' + heap + '</div>';
      mem.style.minHeight = note.style.minHeight = '';
      note.innerHTML = s.note;
      pos.textContent = 'Step ' + (i + 1) + ' of ' + steps.length;
      prev.disabled = i === 0;
      next.firstChild.nodeValue = (i === steps.length - 1) ? 'Start over' : 'Next';
      /* the boxes only ever grow, so the page below does not jump while stepping */
      tallMem = Math.max(tallMem, mem.offsetHeight); tallNote = Math.max(tallNote, note.offsetHeight);
      if (tallMem) mem.style.minHeight = tallMem + 'px';
      if (tallNote) note.style.minHeight = tallNote + 'px';
    }
    prev.addEventListener('click', function () { if (i > 0) { i--; render(); } });
    next.addEventListener('click', function () { i = (i === steps.length - 1) ? 0 : i + 1; if (i === 0) seen = {}; render(); });
    render();
  }

  /* ── one-time setup for a chapter when it is first shown ── */
  function prepare(sec) {
    if (sec.getAttribute('data-ready')) return;
    sec.setAttribute('data-ready', '1');
    $$('.stepper', sec).forEach(initStepper);
    $$('.quiz', sec).forEach(function (quiz) {
      var saved = state.quiz[quiz.getAttribute('data-quiz')] || {};
      $$('.q', quiz).forEach(function (q, qi) { if (saved[qi] != null) markQuestion(q, saved[qi]); });
      scoreQuiz(quiz);
    });
    $$('input[data-save]', sec).forEach(function (inp) { inp.checked = !!state.saved[inp.getAttribute('data-save')]; });
  }

  /* ── copy & run ── */
  function codeOf(fig) {
    var cmds = $$('.cmd', fig);
    if (cmds.length) return cmds.map(function (c) { return c.textContent; }).join('\n');
    return $('pre', fig).textContent;
  }
  function flash(btn, text) {
    var span = $('span', btn), old = span.textContent;
    span.textContent = text; setTimeout(function () { span.textContent = old; }, 1600);
  }
  function copy(text, btn) {
    function ok() { flash(btn, 'Copied'); }
    function fallback() {
      var ta = doc.createElement('textarea'), done = false;
      ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
      doc.body.appendChild(ta); ta.select();
      try { done = doc.execCommand('copy'); } catch (e) { done = false; }
      doc.body.removeChild(ta);
      if (done) ok(); else toast('Copying is blocked here. Select the code and press Ctrl+C (Cmd+C on a Mac).');
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(ok, fallback); return; }
    } catch (e) { }
    fallback();
  }
  function runInPlayground(fig) {
    var mode = fig.classList.contains('rel') ? 'release' : 'debug';
    var url = 'https://play.rust-lang.org/?version=stable&mode=' + mode + '&edition=2024&code=' + encodeURIComponent(fig.getAttribute('data-full') || codeOf(fig));
    var a = doc.createElement('a');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    doc.body.appendChild(a); a.click(); doc.body.removeChild(a);
    toast('Opening the Rust Playground in a new tab (needs internet). If nothing opens, copy the code and paste it at play.rust-lang.org.');
  }

  /* ── search ── */
  var index = null, searchInput = $('#search'), results = $('#results'), toc = $('#toc'), searchTimer = 0;
  function buildIndex() {
    index = [];
    sections.forEach(function (sec) {
      var c = byId[sec.getAttribute('data-id')], body = $('.ch-body', sec);
      if (!c || !body) return;
      var hid = '', htext = '';
      index.push({ id: c.id, a: '', h: '', t: plain(c.title), w: 30 });
      $$('h2,h3,p,li,td,dt,dd,pre', body).forEach(function (el) {
        var tag = el.tagName, text = el.textContent;
        if (tag === 'H2' || tag === 'H3') { hid = el.id; htext = text; index.push({ id: c.id, a: hid, h: htext, t: text, w: 20 }); return; }
        if (text.length < 3 || (tag === 'LI' && $('li,p,pre', el))) return;
        index.push({ id: c.id, a: hid, h: htext, t: text, w: tag === 'PRE' ? 4 : 8 });
      });
    });
    index.forEach(function (e) { e.l = e.t.toLowerCase(); });
  }
  function snippet(e, word) {
    var p = e.l.indexOf(word), start = Math.max(0, p - 36), end = Math.min(e.t.length, p + word.length + 64);
    var s = (start ? '…' : '') + e.t.slice(start, end).replace(/\s+/g, ' ') + (end < e.t.length ? '…' : '');
    var low = s.toLowerCase(), q = low.indexOf(word);
    if (q < 0) return escapeHtml(s);
    return escapeHtml(s.slice(0, q)) + '<mark>' + escapeHtml(s.slice(q, q + word.length)) + '</mark>' + escapeHtml(s.slice(q + word.length));
  }
  function search(qs) {
    var words = qs.toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) { results.hidden = true; toc.hidden = false; return; }
    if (!index) buildIndex();
    var best = {}, order = [];
    index.forEach(function (e) {
      for (var i = 0; i < words.length; i++) if (e.l.indexOf(words[i]) < 0) return;
      var score = e.w + (e.l.indexOf(words[0]) === 0 ? 5 : 0) - Math.min(4, e.t.length / 200);
      var key = e.id + '|' + e.a;
      if (!best[key]) { best[key] = { e: e, s: score }; order.push(key); }
      else if (score > best[key].s) best[key] = { e: e, s: score };
    });
    var hits = order.map(function (k) { return best[k]; }).sort(function (a, b) { return b.s - a.s || a.e.id.localeCompare(b.e.id); }).slice(0, 40);
    results.innerHTML = hits.length ? hits.map(function (h) {
      var e = h.e, c = byId[e.id];
      return '<a class="res" href="#' + e.id + '" data-nav="' + e.id + '"' + (e.a ? ' data-anchor="' + e.a + '"' : '') + '>' +
        '<span class="res-ch">' + c.num + ' · ' + escapeHtml(plain(c.title)) + '</span>' +
        (e.h ? '<span class="res-h">' + escapeHtml(e.h) + '</span>' : '') +
        '<span class="res-snip">' + snippet(e, words[0]) + '</span></a>';
    }).join('') : '<p class="res-none">Nothing found for “' + escapeHtml(qs) + '”. Try a single, shorter word — or look in the glossary.</p>';
    results.hidden = false; toc.hidden = true; results.scrollTop = 0;
  }
  searchInput.addEventListener('input', function () {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { search(searchInput.value.trim()); }, 140);
  });

  /* ── glossary pop-ups ── */
  var tip = $('#tip'), tipFor = null;
  function showTip(el) {
    var g = DATA.glossary[el.getAttribute('data-term')];
    if (!g) return;
    tip.innerHTML = '<b>' + escapeHtml(g.t) + '</b>' + g.d;
    tip.hidden = false; tipFor = el;
    var r = el.getBoundingClientRect(), w = tip.offsetWidth, hgt = tip.offsetHeight;
    var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), root.clientWidth - w - 8);
    var top = r.bottom + 8;
    if (top + hgt > window.innerHeight - 8 && r.top - hgt - 8 > 0) top = r.top - hgt - 8;
    tip.style.left = (left + window.pageXOffset) + 'px';
    tip.style.top = (top + window.pageYOffset) + 'px';
  }
  function hideTip() { tip.hidden = true; tipFor = null; }
  /* flame graph: a click on a bar zooms in on it, a click on the bottom bar zooms out again */
  function zoomFlame(bar) {
    var root = closest(bar, '.fl-root'), node = bar.parentNode, n, i, sibs;
    $$('.fl-node', root).forEach(function (x) { x.classList.remove('fl-wide', 'fl-off'); });
    if (node.parentNode === root) return;
    for (n = node; n && n !== root; n = n.parentNode) {
      if (!n.classList.contains('fl-node')) continue;
      n.classList.add('fl-wide');
      sibs = n.parentNode.children;
      for (i = 0; i < sibs.length; i++) if (sibs[i] !== n) sibs[i].classList.add('fl-off');
    }
  }

  doc.addEventListener('mouseover', function (e) { var t = closest(e.target, '.term'); if (t) showTip(t); });
  doc.addEventListener('mouseout', function (e) { if (closest(e.target, '.term')) hideTip(); });
  doc.addEventListener('focusin', function (e) { var t = closest(e.target, '.term'); if (t) showTip(t); });
  doc.addEventListener('focusout', function (e) { if (closest(e.target, '.term')) hideTip(); });

  /* ── clicks ── */
  doc.addEventListener('click', function (e) {
    var t = e.target, el;
    if ((el = closest(t, '[data-nav]'))) {
      e.preventDefault();
      show(el.getAttribute('data-nav'), el.getAttribute('data-anchor'), { push: true });
      return;
    }
    if ((el = closest(t, '[data-jump]'))) {
      e.preventDefault();
      var target = doc.getElementById(el.getAttribute('data-jump'));
      if (target) { target.scrollIntoView(); try { window.history.replaceState(null, '', '#' + current + '/' + target.id.replace(current + '--', '')); } catch (err) { } }
      return;
    }
    if ((el = closest(t, '.term'))) { if (tipFor === el) hideTip(); else showTip(el); return; }
    if (!tip.hidden) hideTip();
    if ((el = closest(t, '.opt'))) {
      var q = closest(el, '.q'), quiz = closest(q, '.quiz'), idx = $$('.opt', q).indexOf(el);
      markQuestion(q, idx);
      var qid = quiz.getAttribute('data-quiz');
      if (!state.quiz[qid]) state.quiz[qid] = {};
      state.quiz[qid][q.getAttribute('data-q')] = idx; save(); scoreQuiz(quiz);
      return;
    }
    if ((el = closest(t, '.quiz-reset'))) { resetQuiz(closest(el, '.quiz')); return; }
    if ((el = closest(t, '.btn-copy'))) { copy(codeOf(closest(el, '.code')), el); return; }
    if ((el = closest(t, '.btn-run'))) { runInPlayground(closest(el, '.code')); return; }
    if ((el = closest(t, '.fl-bar'))) { zoomFlame(el); return; }
    if ((el = closest(t, '.btn-done'))) {
      var id = el.getAttribute('data-done');
      if (state.done[id]) delete state.done[id]; else state.done[id] = 1;
      save(); refreshProgress(); return;
    }
    if ((el = closest(t, '.toc-part-btn'))) {
      el.setAttribute('aria-expanded', el.getAttribute('aria-expanded') === 'false' ? 'true' : 'false'); return;
    }
    if ((el = closest(t, 'a[href^="#"]'))) {   /* any other in-page link */
      e.preventDefault();
      var tgt = doc.getElementById(el.getAttribute('href').slice(1));
      if (tgt) { tgt.scrollIntoView(); if (tgt.focus) { try { tgt.focus({ preventScroll: true }); } catch (err2) { } } }
    }
  });
  doc.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.getAttribute && t.getAttribute('data-save')) {
      if (t.checked) state.saved[t.getAttribute('data-save')] = 1; else delete state.saved[t.getAttribute('data-save')];
      save();
    }
  });

  /* ── top bar controls ── */
  menu.addEventListener('click', function () {
    openDrawer(mobileNav.matches
      ? !sidebar.classList.contains('open')
      : app.classList.contains('sidebar-collapsed'));
  });
  sidebarClose.addEventListener('click', function () { openDrawer(false); });
  scrim.addEventListener('click', function () { openDrawer(false); });
  doc.addEventListener('keydown', function (e) {
    if (!mobileNav.matches || !sidebar.classList.contains('open')) return;
    if (e.key === 'Escape') {
      openDrawer(false); return;
    }
    if (e.key !== 'Tab') return;
    var focusable = $$('a[href],button:not([disabled]),input:not([disabled])', sidebar)
      .filter(function (el) { return el.getClientRects().length > 0 && !el.closest('[hidden]'); });
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey && doc.activeElement === first) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && doc.activeElement === last) {
      e.preventDefault(); first.focus();
    }
  });
  if (mobileNav.addEventListener) {
    mobileNav.addEventListener('change', function (e) {
      if (e.matches) {
        app.classList.remove('sidebar-collapsed');
        openDrawer(false);
      } else {
        openDrawer(true);
      }
    });
  }
  $('#theme').addEventListener('click', function () {
    var t = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', t); state.theme = t; save();
  });
  function setFs(delta) {
    var cur = parseFloat(window.getComputedStyle(root).fontSize) || 18;
    var v = Math.max(14, Math.min(24, Math.round(cur + delta)));
    root.style.setProperty('--fs', v + 'px'); state.fs = v; save();
  }
  $('#fs-down').addEventListener('click', function () { setFs(-1); });
  $('#fs-up').addEventListener('click', function () { setFs(1); });

  var resetBtn = $('#reset'), resetTimer = 0;
  resetBtn.addEventListener('click', function () {
    if (!resetBtn.classList.contains('armed')) {
      resetBtn.classList.add('armed'); resetBtn.textContent = 'Click again to erase everything';
      resetTimer = setTimeout(function () { resetBtn.classList.remove('armed'); resetBtn.textContent = 'Reset my progress'; }, 4000);
      return;
    }
    clearTimeout(resetTimer);
    var keep = { theme: state.theme, fs: state.fs };
    state = keep; normalise(); save();
    resetBtn.classList.remove('armed'); resetBtn.textContent = 'Reset my progress';
    $$('.chapter[data-ready]').forEach(function (s) {
      $$('.quiz', s).forEach(function (quiz) {
        $$('.q', quiz).forEach(function (q) {
          q.classList.remove('answered', 'ok', 'no');
          $$('.opt', q).forEach(function (o) { o.disabled = false; o.classList.remove('right', 'wrong'); });
          $('.q-exp', q).hidden = true;
        });
        scoreQuiz(quiz);
      });
      $$('input[data-save]', s).forEach(function (i) { i.checked = false; });
    });
    refreshProgress(); toast('Progress erased.');
  });

  /* ── keyboard ── */
  doc.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (e.key === 'Escape') {
      hideTip(); openDrawer(false);
      if (searchInput.value) { searchInput.value = ''; search(''); }
      return;
    }
    if (e.key === '/' && tag !== 'INPUT' && tag !== 'TEXTAREA' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault(); if (window.innerWidth <= 900) openDrawer(true); searchInput.focus();
    }
    if ((e.key === 'Enter' || e.key === ' ') && closest(e.target, '.term')) { e.preventDefault(); showTip(e.target); }
  });

  /* ── scroll: reading bar and "in this chapter" highlight ── */
  var readbar = $('#readbar'), ticking = false;
  function onScroll() {
    ticking = false;
    var max = root.scrollHeight - window.innerHeight;
    readbar.style.width = (max > 0 && current !== 'home' ? Math.min(100, 100 * window.pageYOffset / max) : 0) + '%';
    var links = $$('a', rail);
    if (!links.length) return;
    var on = null;
    links.forEach(function (a) {
      var h = doc.getElementById(a.getAttribute('data-jump'));
      if (h && h.getBoundingClientRect().top < 130) on = a;
    });
    links.forEach(function (a) { a.classList.toggle('on', a === on); });
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; (window.requestAnimationFrame || setTimeout)(onScroll); }
    if (!tip.hidden) hideTip();
  }, { passive: true });
  window.addEventListener('popstate', function () { route(false); });

  /* ── glossary filter ── */
  var gf = $('#gloss-filter');
  if (gf) gf.addEventListener('input', function () {
    var q = gf.value.trim().toLowerCase(), shown = 0;
    $$('.gloss-item').forEach(function (it) {
      var hit = !q || it.textContent.toLowerCase().indexOf(q) >= 0;
      it.hidden = !hit; if (hit) shown++;
    });
    $('.gloss-empty').hidden = shown > 0;
  });

  /* ── printing: show everything ── */
  var printState = null;
  window.addEventListener('beforeprint', function () {
    printState = { open: $$('details:not([open])') };
    printState.open.forEach(function (d) { d.open = true; });
    sections.forEach(function (s) { s.hidden = false; prepare(s); });
  });
  window.addEventListener('afterprint', function () {
    if (!printState) return;
    printState.open.forEach(function (d) { d.open = false; });
    sections.forEach(function (s) { s.hidden = (s.getAttribute('data-id') !== current); });
    printState = null;
  });

  refreshProgress();
  route(true);
})();

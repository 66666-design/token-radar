// Token Radar dashboard: renders window.RADAR (written by main.ts as data.js).
// No fetch, no network. Filter, sort, search and a detail view per protocol.
// URL params, for a fixed shot: ?detail=<slug> opens one protocol,
// ?cat=<category> filters, ?watch=1 keeps the watchlist only, ?sort=<key> sorts.

(function () {
  var D = window.RADAR;
  if (!D) return;
  var $ = function (id) { return document.getElementById(id); };
  var params = new URLSearchParams(location.search);
  var watchSet = new Set(D.watchlist || []);
  var rows = D.rows.slice();
  var selected = null;

  function money(n) {
    if (n === null || n === undefined) return '—';
    if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return '$' + (n / 1e3).toFixed(0) + 'K';
    return '$' + n;
  }
  function pct(n) {
    if (n === null || n === undefined) return '—';
    return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
  }
  function ageText(days) {
    if (days === null || days === undefined) return '—';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return days + 'd';
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Header stats and method.
  $('asOf').textContent = D.as_of;
  $('asOf2').textContent = D.as_of;
  $('source').textContent = D.source;
  $('modelVersion').textContent = D.model_version;
  $('modelVersion2').textContent = D.model_version;
  $('boardSize').textContent = D.board_size;
  $('statWatch').textContent = D.watchlist_size + ' / ' + D.watchlist_size;
  $('statRows').textContent = D.board_size;
  $('statEarly').textContent = D.early_size;
  $('statTop').textContent = money(rows[0] ? rows[0].implied_value_usd : 0);

  // Calibration table: category multiples read off this snapshot.
  var calib = D.calibration;
  $('calibBody').innerHTML = calib.categories.map(function (c) {
    return '<tr><td>' + esc(c.category) + '</td><td>' + c.multiple.toFixed(3) +
      (c.peers < D.model.category_min_peers ? ' *' : '') + '</td><td>' + c.peers + '</td></tr>';
  }).join('') + '<tr><td>Whole market (fallback)</td><td>' + calib.global_multiple.toFixed(3) +
    '</td><td>&mdash;</td></tr>';
  var note = document.createElement('p');
  note.className = 'fine';
  note.textContent = '* Fewer than ' + D.model.category_min_peers + ' live-token peers: the whole-market median is used instead.';
  $('calibrationBox').appendChild(note);

  // Filter controls.
  var cats = [...new Set(rows.map(function (r) { return r.category; }).filter(Boolean))].sort();
  var chains = [...new Set(rows.flatMap(function (r) { return r.chains; }))].sort();
  cats.forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; $('cat').appendChild(o);
  });
  chains.forEach(function (c) {
    var o = document.createElement('option'); o.value = c; o.textContent = c; $('chain').appendChild(o);
  });
  if (params.get('cat')) $('cat').value = params.get('cat');
  if (params.get('chain')) $('chain').value = params.get('chain');
  if (params.get('sort')) $('sort').value = params.get('sort');
  if (params.get('watch') === '1') $('watchOnly').checked = true;
  if (params.get('q')) $('q').value = params.get('q');

  function visible() {
    var q = $('q').value.trim().toLowerCase();
    var cat = $('cat').value;
    var chain = $('chain').value;
    var watchOnly = $('watchOnly').checked;
    var out = rows.filter(function (r) {
      if (q && (r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1)) return false;
      if (cat && r.category !== cat) return false;
      if (chain && r.chains.indexOf(chain) === -1) return false;
      if (watchOnly && !watchSet.has(r.slug)) return false;
      return true;
    });
    var sort = $('sort').value;
    var key = {
      implied: function (r) { return -r.implied_value_usd; },
      tvl: function (r) { return -r.tvl_usd; },
      growth: function (r) { return -(r.change_7d === null ? -999 : r.change_7d); },
      age: function (r) { return -(r.age_days === null ? 0 : r.age_days); },
      name: function (r) { return r.name; },
    }[sort];
    out.sort(function (a, b) {
      var ka = key(a), kb = key(b);
      return ka < kb ? -1 : ka > kb ? 1 : a.rank - b.rank;
    });
    return out;
  }

  function render() {
    var list = visible();
    $('count').textContent = 'Showing ' + list.length + ' of ' + rows.length + ' ranked protocols';
    $('rows').innerHTML = list.map(function (r) {
      var g = r.change_7d;
      var cls = g === null ? '' : g >= 0 ? 'up' : 'down';
      var onWatch = watchSet.has(r.slug);
      return '<tr data-slug="' + esc(r.slug) + '" class="' + (selected === r.slug ? 'sel' : '') + '">' +
        '<td>' + r.rank + '</td>' +
        '<td><strong>' + esc(r.name) + '</strong>' + (onWatch ? ' <span class="watch" title="On the watchlist">●</span>' : '') + '<br><span style="color:var(--muted);font-size:12px">' + esc(r.slug) + '</span></td>' +
        '<td>' + esc(r.category || '—') + '</td>' +
        '<td>' + r.chains.slice(0, 3).map(function (c) { return '<span class="pill">' + esc(c) + '</span>'; }).join('') + (r.chains.length > 3 ? ' +' + (r.chains.length - 3) : '') + '</td>' +
        '<td class="num">' + money(r.tvl_usd) + '</td>' +
        '<td class="num ' + cls + '">' + pct(g) + '</td>' +
        '<td class="num">' + ageText(r.age_days) + '</td>' +
        '<td class="num val">' + money(r.implied_value_usd) + '</td></tr>';
    }).join('');
  }

  function showDetail(slug) {
    var r = rows.find(function (x) { return x.slug === slug; });
    if (!r) return;
    selected = slug;
    var breadth = 1 + Math.min(Math.max(r.chains.length - 1, 0), 4) * 0.02;
    $('dName').textContent = '#' + r.rank + ' ' + r.name;
    $('dMeta').textContent = (r.category || 'Uncategorised') + ' · ' + r.chains.join(', ') +
      ' · TVL ' + money(r.tvl_usd) + ' · 7d ' + pct(r.change_7d) +
      ' · tracked since ' + (r.listed_at || 'unknown') + (watchSet.has(r.slug) ? ' · on the watchlist' : '');
    $('dBreak').innerHTML =
      '<div><dt>Implied value</dt><dd>' + money(r.implied_value_usd) + '</dd></div>' +
      '<div><dt>Category multiple</dt><dd>' + r.base_multiple.toFixed(3) + '×</dd></div>' +
      '<div><dt>Growth multiplier</dt><dd>' + r.growth_multiplier.toFixed(2) + '×</dd></div>' +
      '<div><dt>Maturity multiplier</dt><dd>' + r.maturity_multiplier.toFixed(2) + '×</dd></div>' +
      '<div><dt>Chain breadth</dt><dd>' + breadth.toFixed(2) + '×</dd></div>';
    $('dSteps').innerHTML = r.farm_steps.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    $('detail').hidden = false;
    render();
    $('detail').scrollIntoView({ block: 'nearest' });
  }

  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest('tr[data-slug]');
    if (tr) showDetail(tr.getAttribute('data-slug'));
  });
  $('detailClose').addEventListener('click', function () {
    selected = null; $('detail').hidden = true; render();
  });
  ['q', 'cat', 'chain', 'sort', 'watchOnly'].forEach(function (id) {
    $(id).addEventListener('input', render);
    $(id).addEventListener('change', render);
  });

  // Live-token table: the market's own values.
  $('liveRows').innerHTML = D.live.map(function (p) {
    var ratio = p.mcap_usd && p.tvl_usd ? (p.mcap_usd / p.tvl_usd).toFixed(2) + '×' : '—';
    return '<tr><td><strong>' + esc(p.name) + '</strong></td><td>' + esc(p.category || '—') + '</td>' +
      '<td class="num">' + money(p.tvl_usd) + '</td><td class="num">' + money(p.mcap_usd) + '</td>' +
      '<td class="num">' + ratio + '</td></tr>';
  }).join('');

  render();
  if (params.get('detail')) showDetail(params.get('detail'));
})();

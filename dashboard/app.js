// Token Radar's plain dashboard, model radar-3. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the board, the fitted power law, the held-out tests and the live anchors. No network: every
// byte it shows is in data.js. The page recomputes each row's implied value from the row's own
// figures and says whether it matches the board, so the code and the data are visibly the same
// arithmetic. A row's detail view opens on click and on #p=<slug>.

var DATA = window.RADAR;
var $ = function (id) { return document.getElementById(id); };

function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function fmtUsd(n) {
  if (n == null) return '—';
  if (n >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + Math.round(n);
}
function fmtUsdFull(n) {
  if (n == null) return '—';
  return '$' + Math.round(n).toLocaleString('en-US');
}
function fmtPct(n) {
  if (n == null) return '—';
  return (n > 0 ? '+' : '') + n.toFixed(1) + '%';
}
function fmtAge(days) {
  if (days == null) return '—';
  if (days < 365) return days + 'd';
  return (days / 365).toFixed(1) + 'y';
}
function fmtMult(n) { return n.toFixed(3); }

/** The implied value recomputed from the row's own figures, the same arithmetic main.ts runs. */
function impliedOf(row) {
  return Math.max(1, Math.round(row.tvl_usd * Math.exp(row.power_intercept + row.power_slope * Math.log(row.tvl_usd))));
}

function readHash() {
  var out = { q: '', cat: '', verdict: '', wl: false, sort: 'implied', p: '' };
  var hash = window.location.hash.replace(/^#/, '');
  if (!hash) return out;
  hash.split('&').forEach(function (part) {
    var kv = part.split('=');
    var k = decodeURIComponent(kv[0] || '');
    var v = decodeURIComponent(kv[1] || '');
    if (k === 'q') out.q = v;
    else if (k === 'cat') out.cat = v;
    else if (k === 'v') out.verdict = v;
    else if (k === 'wl') out.wl = v === '1';
    else if (k === 'sort') out.sort = v;
    else if (k === 'p') out.p = v;
  });
  return out;
}
function writeHash(state) {
  var parts = [];
  if (state.q) parts.push('q=' + encodeURIComponent(state.q));
  if (state.cat) parts.push('cat=' + encodeURIComponent(state.cat));
  if (state.verdict) parts.push('v=' + state.verdict);
  if (state.wl) parts.push('wl=1');
  if (state.sort && state.sort !== 'implied') parts.push('sort=' + state.sort);
  if (state.p) parts.push('p=' + encodeURIComponent(state.p));
  var next = parts.join('&');
  if (next) window.history.replaceState(null, '', '#' + next);
  else window.history.replaceState(null, '', window.location.pathname + window.location.search);
}

var state = readHash();

function filteredRows() {
  var q = state.q.trim().toLowerCase();
  var rows = DATA.rows.filter(function (r) {
    if (state.cat && (r.category || '') !== state.cat) return false;
    if (state.verdict && r.verdict !== state.verdict) return false;
    if (state.wl && !r.watchlist) return false;
    if (q) {
      var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '')).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  });
  var by = {
    implied: function (a, b) { return b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : 1); },
    tvl: function (a, b) { return b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : 1); },
    growth: function (a, b) { return (b.change_7d == null ? -1e9 : b.change_7d) - (a.change_7d == null ? -1e9 : a.change_7d); },
    age: function (a, b) { return (b.age_days == null ? -1 : b.age_days) - (a.age_days == null ? -1 : a.age_days); },
    odds: function (a, b) { return b.launch_odds - a.launch_odds || b.implied_value_usd - a.implied_value_usd; },
    breakeven: function (a, b) {
      var x = a.break_even_deposit_usd < 0 ? 1e12 : a.break_even_deposit_usd;
      var y = b.break_even_deposit_usd < 0 ? 1e12 : b.break_even_deposit_usd;
      return x - y || b.implied_value_usd - a.implied_value_usd;
    }
  }[state.sort] || function (a, b) { return a.rank - b.rank; };
  return rows.sort(by);
}

function renderKpis() {
  var loo = DATA.validation[0];
  var kpis = [
    [DATA.coverage.watchlist + '/' + DATA.watchlist_size, 'watchlist covered'],
    [String(DATA.board_size), 'rows ranked'],
    ['TVL^' + DATA.power_law.exponent.toFixed(2), 'power law exponent'],
    [loo ? loo.mdape_pct.toFixed(0) + '% MdAPE' : '—', 'held-out error (leave-one-out)'],
    [String(DATA.verdict_counts.FARM), 'FARM verdicts'],
    [DATA.as_of, 'snapshot date']
  ];
  $('kpis').innerHTML = kpis.map(function (k) {
    return '<div class="kpi"><b>' + esc(k[0]) + '</b><span>' + esc(k[1]) + '</span></div>';
  }).join('');
  $('top-sub').textContent = 'Sealed snapshot ' + DATA.as_of + ' · ' + DATA.source + ' · model ' + DATA.model_version;
}

function renderMethodStrip() {
  var pl = DATA.power_law;
  var loo = DATA.validation[0];
  $('method-strip').innerHTML =
    '<b>How this ranks:</b> implied value = TVL × exp(' + pl.intercept.toFixed(3) + ' ' + (pl.slope < 0 ? '−' : '+') + ' ' + Math.abs(pl.slope).toFixed(3) + ' · log TVL), ' +
    'the power law fitted on the ' + pl.anchors + ' traded protocols by Theil-Sen. ' +
    'It beats a flat 0.25 multiple on all three held-out tests (leave-one-out ' + loo.mdape_pct.toFixed(1) + '% vs ' + loo.baseline_mdape_pct.toFixed(1) + '% MdAPE). ' +
    'Launch odds come from the peers&rsquo; age record; the farm verdict is costed against gas. ' +
    'Wrapped, bridged and staked products of tokens that already trade are set aside, not ranked. ' +
    'No protocol name is ever special-cased — the same function scores every row.';
}

function renderBoard() {
  var rows = filteredRows();
  var maxImplied = DATA.rows.length ? DATA.rows[0].implied_value_usd : 1;
  $('count').textContent = rows.length + ' of ' + DATA.rows.length + ' ranked protocols shown' +
    (state.wl ? ' (watchlist only)' : '') + (state.cat ? ' · ' + state.cat : '') +
    (state.verdict ? ' · ' + state.verdict : '');
  $('rows').innerHTML = rows.map(function (r) {
    var pct = Math.max(2, Math.round((r.implied_value_usd / maxImplied) * 100));
    var chg = r.change_7d == null ? '<span class="dim">—</span>' :
      '<span class="' + (r.change_7d < 0 ? 'neg' : 'pos') + '">' + fmtPct(r.change_7d) + '</span>';
    return '<tr data-slug="' + esc(r.slug) + '"' + (r.watchlist ? ' class="wlrow"' : '') + '>' +
      '<td class="num">' + r.rank + '</td>' +
      '<td><div class="pname">' + esc(r.name) + (r.watchlist ? ' <span class="wlmark">WATCHLIST</span>' : '') + '</div>' +
      '<div class="psub">' + esc(r.category || 'Unknown') + ' · ' + esc(r.chains.slice(0, 3).join(', ') || '—') + '</div></td>' +
      '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
      '<td class="num">' + chg + '</td>' +
      '<td class="num">' + fmtAge(r.age_days) + '</td>' +
      '<td class="num">' + fmtMult(r.effective_multiple) + '</td>' +
      '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b><div class="bar"><i style="width:' + pct + '%"></i></div></td>' +
      '<td class="num">' + Math.round(r.launch_odds * 100) + '%</td>' +
      '<td><span class="pill ' + r.verdict + '">' + r.verdict + '</span></td>' +
      '<td class="num">' + r.integrity_score + '/5</td>' +
      '</tr>';
  }).join('') || '<tr><td colspan="10" style="text-align:center;color:var(--dim);padding:24px">No rows match these filters.</td></tr>';
}

function renderMethod() {
  var pl = DATA.power_law;
  var valRows = DATA.validation.map(function (t) {
    return '<tr><td>' + esc(t.name) + '</td><td class="num">' + t.n_train + ' / ' + t.n_test + '</td>' +
      '<td class="num"><b>' + t.mdape_pct.toFixed(1) + '%</b></td><td class="num">' + t.within_2x_pct.toFixed(0) + '%</td>' +
      '<td class="num">' + t.spearman.toFixed(2) + '</td>' +
      '<td class="num">' + t.baseline_mdape_pct.toFixed(1) + '%</td>' +
      '<td class="num">' + t.alt_mdape_pct.toFixed(1) + '%</td></tr>';
  }).join('');
  var oddsRows = DATA.odds_buckets.map(function (b) {
    return '<tr><td>' + esc(b.label) + '</td><td class="num">' + b.n + '</td><td class="num">' + b.tokens + '</td><td class="num">' + Math.round(b.rate * 100) + '%</td></tr>';
  }).join('');
  var gasRows = Object.keys(DATA.gas_per_tx).sort().map(function (c) {
    return '<tr><td>' + esc(c) + '</td><td class="num">$' + DATA.gas_per_tx[c].toFixed(2) + '</td></tr>';
  }).join('') + '<tr><td>Any other chain</td><td class="num">$' + DATA.gas_default.toFixed(2) + '</td></tr>';
  var setAsideRows = DATA.set_aside.map(function (s) {
    return '<tr><td>' + esc(s.name) + '</td><td>' + esc(s.category || 'Unknown') + '</td><td class="num">' + fmtUsd(s.tvl_usd) + '</td><td>' + esc(s.reason) + '</td></tr>';
  }).join('');
  var c = DATA.coverage;
  var effAt = function (tvl) { return Math.exp(pl.intercept + pl.slope * Math.log(tvl)); };
  $('method').innerHTML =
    '<h2>Method, in full</h2>' +
    '<h3>Held out three ways — and what it actually shows</h3>' +
    '<table><thead><tr><th>Split</th><th class="num">Train / test</th><th class="num">Power law MdAPE</th><th class="num">Within 2×</th><th class="num">Spearman</th><th class="num">Flat 0.25 MdAPE</th><th class="num">Radar-2 MdAPE</th></tr></thead><tbody>' + valRows + '</tbody></table>' +
    '<p>The power law beats the flat 0.25 baseline on every split — leave-one-out ' + DATA.validation[0].mdape_pct.toFixed(1) + '% vs ' + DATA.validation[0].baseline_mdape_pct.toFixed(1) + '%, time ' + DATA.validation[1].mdape_pct.toFixed(1) + '% vs ' + DATA.validation[1].baseline_mdape_pct.toFixed(1) + '%, parity ' + DATA.validation[2].mdape_pct.toFixed(1) + '% vs ' + DATA.validation[2].baseline_mdape_pct.toFixed(1) + '% — and on within-2× too. ' +
    'The radar-2 category-median model (per-category medians with growth and maturity) loses to flat on all three splits, which is why it was replaced: category medians fitted on 5–15 anchors are noisier than the single slope, and the growth and maturity terms add variance without signal. ' +
    'Growth and age were also tested as extra terms on the power law and did not improve held-out accuracy consistently, so the shipped model does not use them; age still drives the launch odds, and 7-day growth is shown on every row.</p>' +
    '<p class="warn">Read this honestly: the fitted model is better than flat, but the noise floor is ~86% MdAPE — no model that only sees TVL predicts a single token&rsquo;s market cap closely. Market-cap / TVL varies about 200× across traded tokens (10th percentile 0.013, 90th 2.975). ' +
    'The board is a ranking of launch candidates by implied value, not a price forecast, and the farm verdicts are costed against that ranking, not against a promised return.</p>' +
    '<div class="two"><div>' +
    '<h3>The fit — one power law, not a table of multiples</h3>' +
    '<table><tbody>' +
    '<tr><td>Equation</td><td class="num">log(mcap / TVL) = ' + pl.intercept.toFixed(3) + ' ' + (pl.slope < 0 ? '−' : '+') + ' ' + Math.abs(pl.slope).toFixed(3) + ' × log(TVL)</td></tr>' +
    '<tr><td>Market cap ~ TVL ^</td><td class="num">' + pl.exponent.toFixed(3) + '</td></tr>' +
    '<tr><td>Traded anchors fitted on</td><td class="num">' + pl.anchors + '</td></tr>' +
    '<tr><td>Std of log(mcap / TVL) across anchors</td><td class="num">' + pl.log_ratio_std.toFixed(3) + '</td></tr>' +
    '<tr><td>Std of the fit&rsquo;s residuals</td><td class="num">' + pl.residual_std.toFixed(3) + '</td></tr>' +
    '<tr><td>Effective multiple at $10M TVL</td><td class="num">' + fmtMult(effAt(1e7)) + '×</td></tr>' +
    '<tr><td>Effective multiple at $100M TVL</td><td class="num">' + fmtMult(effAt(1e8)) + '×</td></tr>' +
    '<tr><td>Effective multiple at $1B TVL</td><td class="num">' + fmtMult(effAt(1e9)) + '×</td></tr>' +
    '</tbody></table>' +
    '<p>The slope is the Theil-Sen median pairwise slope over the traded anchors, and the intercept is the median residual — the fit predicts the conditional median of the ratio, which is the forecast that minimises the median absolute percentage error. ' +
    'Theil-Sen is used because the ratio varies ~200× and a least-squares slope is dragged around by the extremes; the median slope is not. No name, no category and no hardcoded multiple enters the fit — only the protocol&rsquo;s own TVL.</p>' +
    '<h3>Launch odds — the peers&rsquo; record</h3>' +
    '<table><thead><tr><th>Age bucket</th><th class="num">Protocols</th><th class="num">With a token</th><th class="num">Odds</th></tr></thead><tbody>' + oddsRows + '</tbody></table>' +
    '<p>Odds are the share of protocols in the same age bucket that already record a token, over all ' + c.total + ' protocols in the snapshot.</p>' +
    '</div><div>' +
    '<h3>Farm verdicts — costed, not asserted</h3>' +
    '<table><thead><tr><th>First chain</th><th class="num">Assumed gas / tx</th></tr></thead><tbody>' + gasRows + '</tbody></table>' +
    '<p>A farm plan makes ' + DATA.model.farm_tx_count + ' transactions. The airdrop pool is assumed to be ' +
    Math.round(DATA.model.farmer_share * 100) + '% of the implied value, split among depositors in proportion to deposits, ' +
    'so a $1 deposit expects (implied / TVL) × odds × ' + DATA.model.farmer_share + '. ' +
    'The break-even deposit is the deposit at which that expected value covers ' + DATA.model.break_even_margin + '× the gas: ' +
    'FARM at or below $' + DATA.model.verdict_farm_max_usd + ', THIN at or below $' + DATA.model.verdict_thin_max_usd + ', SKIP above. ' +
    'Gas is an assumption, not snapshot data; the verdict moves with it.</p>' +
    '<h3>Coverage — every protocol accounted for</h3>' +
    '<p>' + c.total + ' protocols in the snapshot: ' + c.pre_token + ' pre-token and ' + c.live_token + ' live-token. ' +
    'The board ranks ' + c.board + ' of them. Set aside, not hidden: ' + c.excluded_wrapped + ' wrapped, bridged or staked products of tokens that already trade, ' +
    c.excluded_cex + ' pre-token exchanges (a centralised exchange is not a launch candidate) ' +
    'and ' + c.excluded_versioned + ' versioned pools (a release of another protocol). ' +
    'All ' + c.watchlist + ' watchlist slugs are ranked. The Live section shows the top ' + c.live_shown + ' traded protocols by market cap.</p>' +
    '<h3>Data quality</h3>' +
    '<p>Each row carries an integrity score out of 5: 7-day change present, age known, more than one chain, TVL at least $10M, ' +
    '7-day change within 100%. A row that fails a check names it in its detail view.</p>' +
    '</div></div>' +
    '<h3>Set aside — not ranked, not hidden (' + DATA.set_aside.length + ')</h3>' +
    '<p>Every pre-token protocol the board does not rank, with the reason. These are wrapped, bridged or staked products of tokens that already trade, versioned pools of another protocol, or exchanges.</p>' +
    '<div class="scrollbox"><table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th>Reason</th></tr></thead><tbody>' + setAsideRows + '</tbody></table></div>';
}

function renderLive() {
  var rows = DATA.live.map(function (p) {
    return '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.category || 'Unknown') + '</td>' +
      '<td class="num">' + fmtUsd(p.tvl_usd) + '</td><td class="num">' + fmtUsd(p.mcap_usd) + '</td>' +
      '<td class="num">' + (p.mcap_tvl == null ? '—' : fmtMult(p.mcap_tvl)) + '</td></tr>';
  }).join('');
  $('live').innerHTML =
    '<h2>Live-token anchors — the market&rsquo;s own values</h2>' +
    '<p style="color:var(--mut);font-size:13px">The top ' + DATA.live.length + ' traded protocols by market cap. Their market-cap / TVL ratios — and how the ratio falls as TVL rises — are what the power law is fitted on. Traded tokens are never ranked on this board.</p>' +
    '<table><thead><tr><th>Protocol</th><th>Category</th><th class="num">TVL</th><th class="num">Market cap</th><th class="num">Mcap / TVL</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function renderFoot() {
  $('foot').innerHTML =
    '<p>Implied value is this entry&rsquo;s own estimate of what a launch would be worth, built only from the sealed snapshot&rsquo;s figures — TVL and age with no token — and the traded protocols&rsquo; own market-cap / TVL record. It is not a price, a prediction of a listing, or investment advice.</p>' +
    '<p>Snapshot: ' + esc(DATA.source) + ', as of ' + esc(DATA.as_of) + ', floor ' + fmtUsd(DATA.floor_usd) + '. Model ' + esc(DATA.model_version) + '. No protocol name is special-cased; the same function scores every row. Gas figures are assumptions, stated in the method.</p>';
}

function openDetail(slug) {
  var row = null;
  for (var i = 0; i < DATA.rows.length; i++) if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; }
  if (!row) return;
  var dlg = $('detail');
  var recomputed = impliedOf(row);
  var agree = Math.abs(recomputed - row.implied_value_usd) / Math.max(row.implied_value_usd, 1) <= 0.01;
  var ev = row.expected_value_per_100_usd;
  var be = row.break_even_deposit_usd < 0 ? '—' : fmtUsdFull(row.break_even_deposit_usd);
  var pl = DATA.power_law;
  var steps = row.farm_steps.map(function (s, i) {
    var m = s.match(/^(.*) Cost: (.*)\. Time: (.*)\.$/);
    var body = m ? m[1] : s;
    var cost = m ? m[2] : '';
    var time = m ? m[3] : '';
    return '<li>' + esc(body) + '<div class="c">Cost: ' + esc(cost) + ' · Time: ' + esc(time) + '</div></li>';
  }).join('');
  var flags = row.integrity_flags.length
    ? row.integrity_flags.map(esc).join('; ')
    : 'No flags — all five data-quality checks pass.';
  dlg.innerHTML =
    '<div class="d-head"><div><h2>#' + row.rank + ' ' + esc(row.name) + '</h2>' +
    '<div class="sub">' + esc(row.category || 'Unknown') + ' · ' + esc(row.chains.join(', ') || '—') +
    (row.watchlist ? ' · WATCHLIST' : '') + '</div></div>' +
    '<button class="d-close" id="d-close">Close</button></div>' +
    '<div class="d-body">' +
    '<h3>Implied value — the arithmetic</h3>' +
    '<table><tbody>' +
    '<tr><td class="k">TVL</td><td class="num">' + fmtUsdFull(row.tvl_usd) + '</td></tr>' +
    '<tr><td class="k">Power law</td><td class="num">log ratio = ' + pl.intercept.toFixed(3) + ' ' + (pl.slope < 0 ? '−' : '+') + ' ' + Math.abs(pl.slope).toFixed(3) + ' × log TVL</td></tr>' +
    '<tr><td class="k">Effective multiple (this row)</td><td class="num">× ' + fmtMult(row.effective_multiple) + '</td></tr>' +
    '<tr><td class="k"><b>Implied value</b></td><td class="num"><b>' + fmtUsdFull(row.implied_value_usd) + '</b></td></tr>' +
    '</tbody></table>' +
    '<p class="' + (agree ? 'agree' : 'disagree') + '">' + (agree
      ? 'The page recomputes this row as ' + fmtUsdFull(recomputed) + ', the same number the board carries.'
      : 'The page recomputes this row as ' + fmtUsdFull(recomputed) + ', which differs from the board: the data would be stale.') + '</p>' +
    '<h3>Launch odds &amp; farm verdict</h3>' +
    '<table><tbody>' +
    '<tr><td class="k">Launch odds (' + esc(row.odds_bucket) + ' bucket)</td><td class="num">' + Math.round(row.launch_odds * 100) + '%</td></tr>' +
    '<tr><td class="k">Expected value per $100 deposited</td><td class="num">$' + ev.toFixed(2) + '</td></tr>' +
    '<tr><td class="k">Gas across the plan (' + DATA.model.farm_tx_count + ' txs on ' + esc(row.chains[0] || 'its main chain') + ')</td><td class="num">$' + row.farm_gas_total_usd.toFixed(2) + '</td></tr>' +
    '<tr><td class="k">Break-even deposit (3× gas cover)</td><td class="num">' + be + '</td></tr>' +
    '<tr><td class="k">Verdict</td><td class="num"><span class="pill ' + row.verdict + '">' + row.verdict + '</span></td></tr>' +
    '<tr><td class="k">Data quality</td><td class="num">' + row.integrity_score + '/5 — ' + esc(flags) + '</td></tr>' +
    '</tbody></table>' +
    '<h3>Farm plan — $' + row.farm_deposit_usd + ' deposit</h3>' +
    '<ol>' + steps + '</ol>' +
    '</div>';
  $('d-close').addEventListener('click', function () { dlg.close(); state.p = ''; writeHash(state); });
  dlg.showModal();
}

function bindControls() {
  var catSel = $('cat');
  var cats = [];
  DATA.rows.forEach(function (r) { if (r.category && cats.indexOf(r.category) === -1) cats.push(r.category); });
  cats.sort();
  catSel.innerHTML = '<option value="">All categories</option>' + cats.map(function (c) {
    return '<option value="' + esc(c) + '"' + (state.cat === c ? ' selected' : '') + '>' + esc(c) + '</option>';
  }).join('');
  $('q').value = state.q;
  $('verdict').value = state.verdict;
  $('wl').checked = state.wl;
  $('sort').value = state.sort;
  $('q').addEventListener('input', function (e) { state.q = e.target.value; writeHash(state); renderBoard(); });
  catSel.addEventListener('change', function (e) { state.cat = e.target.value; writeHash(state); renderBoard(); });
  $('verdict').addEventListener('change', function (e) { state.verdict = e.target.value; writeHash(state); renderBoard(); });
  $('wl').addEventListener('change', function (e) { state.wl = e.target.checked; writeHash(state); renderBoard(); });
  $('sort').addEventListener('change', function (e) { state.sort = e.target.value; writeHash(state); renderBoard(); });
  $('rows').addEventListener('click', function (e) {
    var tr = e.target.closest ? e.target.closest('tr[data-slug]') : null;
    if (!tr) return;
    state.p = tr.getAttribute('data-slug');
    writeHash(state);
    openDetail(state.p);
  });
  $('detail').addEventListener('close', function () { if (state.p) { state.p = ''; writeHash(state); } });
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && $('detail').open) { state.p = ''; writeHash(state); }
  });
}

renderKpis();
renderMethodStrip();
renderMethod();
renderLive();
renderFoot();
bindControls();
renderBoard();
if (state.p) openDetail(state.p);

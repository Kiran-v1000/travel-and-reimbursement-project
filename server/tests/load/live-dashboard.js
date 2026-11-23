/**
 * Live view for the load test: a tiny local web page (Server-Sent Events) showing each
 * scenario's throughput, latency and errors second by second, plus the results table.
 * Started by `node tests/load/load-test.js --live` (default http://localhost:4099).
 */
import http from 'node:http';

const PAGE = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Voyage load test - live</title>
<style>
  :root{--bg:#0b1020;--card:#121933;--line:#263056;--ink:#e6eaf5;--muted:#96a0b9;--brand:#818cf8;--ok:#4ade80;--warn:#fbbf24;--bad:#f87171}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:28px}
  h1{margin:0;font-size:24px;font-weight:600;letter-spacing:-.01em}.sub{color:var(--muted);margin:4px 0 22px}
  .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:14px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:16px;padding:16px 18px}
  .k{color:var(--muted);font-size:12px}.v{font-size:30px;font-weight:600;font-variant-numeric:tabular-nums;margin-top:4px}
  .now{display:flex;align-items:center;gap:10px;margin-bottom:14px}.dot{width:10px;height:10px;border-radius:50%;background:var(--ok);box-shadow:0 0 0 0 rgba(74,222,128,.6);animation:p 1.4s infinite}
  @keyframes p{70%{box-shadow:0 0 0 10px rgba(74,222,128,0)}100%{box-shadow:0 0 0 0 rgba(74,222,128,0)}}
  .done .dot{animation:none;background:var(--brand)}
  .bar{height:6px;background:var(--line);border-radius:6px;overflow:hidden;margin-top:10px}.bar>i{display:block;height:100%;background:var(--brand);transition:width .4s}
  canvas{width:100%;height:220px;display:block}
  table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{text-align:left;padding:9px 10px;border-top:1px solid var(--line)}
  th{color:var(--muted);font-size:11.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:600;border-top:0}td.n{text-align:right}th.n{text-align:right}
  .pill{display:inline-block;padding:2px 8px;border-radius:99px;font-size:12px;font-weight:600}.good{background:rgba(74,222,128,.12);color:var(--ok)}.badp{background:rgba(248,113,113,.14);color:var(--bad)}
  .legend{display:flex;gap:16px;color:var(--muted);font-size:12px;margin-bottom:6px}.legend b{display:inline-block;width:10px;height:3px;border-radius:2px;margin-right:6px;vertical-align:middle}
  @media (max-width:800px){.grid{grid-template-columns:repeat(2,1fr)}body{padding:16px}}
</style></head><body>
<h1>Voyage load test</h1>
<div class="sub" id="sub">Connecting...</div>
<div class="card now" id="nowcard"><span class="dot"></span><div style="flex:1"><div class="k">Now running</div><div id="scenario" style="font-size:17px;font-weight:600">-</div>
<div class="bar"><i id="prog" style="width:0"></i></div></div><div class="k" id="step"></div></div>
<div class="grid">
  <div class="card"><div class="k">Requests / second</div><div class="v" id="rps">-</div></div>
  <div class="card"><div class="k">Median response (p50)</div><div class="v" id="p50">-</div></div>
  <div class="card"><div class="k">Slowest 1% (p99)</div><div class="v" id="p99">-</div></div>
  <div class="card"><div class="k">Errors</div><div class="v" id="err">-</div></div>
</div>
<div class="card" style="margin-bottom:14px"><div class="legend"><span><b style="background:var(--brand)"></b>requests / second</span><span><b style="background:var(--warn)"></b>p99 response (ms)</span></div><canvas id="chart"></canvas></div>
<div class="card"><table><thead><tr><th>Scenario</th><th class="n">Req/s</th><th class="n">p50</th><th class="n">p99</th><th class="n">Requests</th><th class="n">Errors</th></tr></thead><tbody id="rows"></tbody></table></div>
<script>
const $ = (id) => document.getElementById(id);
let series = [];
function draw() {
  const c = $('chart'), dpr = devicePixelRatio || 1, w = c.clientWidth, h = c.clientHeight;
  c.width = w * dpr; c.height = h * dpr; const g = c.getContext('2d'); g.scale(dpr, dpr); g.clearRect(0, 0, w, h);
  g.strokeStyle = '#263056'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, h * i / 4); g.lineTo(w, h * i / 4); g.stroke(); }
  if (series.length < 2) return;
  const n = Math.max(series.length, 15), x = (i) => (i / (n - 1)) * (w - 8) + 4;
  const line = (key, color, max) => { g.strokeStyle = color; g.lineWidth = 2.5; g.beginPath();
    series.forEach((s, i) => { const y = h - 8 - (s[key] / max) * (h - 16); i ? g.lineTo(x(i), y) : g.moveTo(x(i), y); }); g.stroke(); };
  line('rps', '#818cf8', Math.max(...series.map((s) => s.rps), 1) * 1.15);
  line('p99', '#fbbf24', Math.max(...series.map((s) => s.p99), 1) * 1.15);
}
addEventListener('resize', draw);
const es = new EventSource('/events');
es.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.type === 'info') $('sub').textContent = m.text;
  if (m.type === 'start') { series = []; draw(); $('scenario').textContent = m.name; $('step').textContent = 'Scenario ' + m.index + ' of ' + m.total + ' · ' + m.connections + ' concurrent users'; $('prog').style.width = '0'; }
  if (m.type === 'tick') { series.push(m); draw(); $('rps').textContent = m.rps; $('p50').textContent = m.p50 + ' ms'; $('p99').textContent = m.p99 + ' ms';
    $('err').textContent = m.errors; $('err').style.color = m.errors ? 'var(--bad)' : 'var(--ok)'; $('prog').style.width = Math.min(100, m.elapsed / m.duration * 100) + '%'; }
  if (m.type === 'result') { const r = m.row, tr = document.createElement('tr');
    tr.innerHTML = '<td>' + r.scenario + '</td><td class="n">' + r['req/s'] + '</td><td class="n">' + r['p50 ms'] + ' ms</td><td class="n">' + r['p99 ms'] + ' ms</td><td class="n">' + r.requests.toLocaleString('en-IN') + '</td><td class="n"><span class="pill ' + (r.errors ? 'badp' : 'good') + '">' + r.errors + '</span></td>';
    $('rows').appendChild(tr); }
  if (m.type === 'done') { $('nowcard').classList.add('done'); $('scenario').textContent = 'Finished - ' + m.text; $('step').textContent = ''; $('prog').style.width = '100%'; }
};
</script></body></html>`;

/** Start the live page; returns { send(event) } for the load test to publish progress. */
export function startLiveDashboard(port = 4099) {
  const clients = new Set();
  const history = [];
  const server = http.createServer((req, res) => {
    if (req.url === '/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
      history.forEach((m) => res.write(`data: ${JSON.stringify(m)}\n\n`)); // late joiners catch up
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  server.listen(port, '127.0.0.1');
  console.log(`Live dashboard: http://localhost:${port}`);
  return {
    send(m) {
      if (m.type !== 'tick') history.push(m);
      for (const c of clients) c.write(`data: ${JSON.stringify(m)}\n\n`);
    },
    close: () => new Promise((r) => { clients.forEach((c) => c.end()); server.close(r); }),
  };
}

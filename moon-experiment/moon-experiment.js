// ===========================================================================
// Moon Drop Experiment
// Drop a ball from a 100 m tower on the airless Moon. Newton's second law gives
//   m x'' = m g  =>  x'' = g  =>  x(t) = 1/2 g t^2   (released from rest).
// Red marks every 5 m flash as the ball passes; the student clicks at each
// flash. Their reaction time is the measurement error. From the recorded
// (t_k, x_k) pairs we recover g_moon ~ 1.625 m/s^2.
// ===========================================================================

const G = 1.625;          // true (unknown) lunar gravity, m/s^2
const H = 100;            // tower height, m
const MARK_STEP = 5;      // red marks every 5 m

// Mark heights 5, 10, ..., 100 (20 marks) and their true pass times.
const MARKS = [];
for (let x = MARK_STEP; x <= H; x += MARK_STEP) MARKS.push(x);
const trueTimeAt = (x) => Math.sqrt((2 * x) / G);

// ---- State -----------------------------------------------------------------
let state = 'ready';      // 'ready' | 'falling' | 'done'
let speed = 1;            // simulated seconds per real second
let showFlash = true;     // draw the red glow as the ball passes each mark
let lastPerf = 0;         // performance.now() of previous frame
let simTime = 0;          // elapsed simulated time since the drop (s)
let nextFlashIdx = 0;     // next mark to flash (drives the visual cue)
let recordIdx = 0;        // next mark a click will be recorded against
const records = [];       // { mark, x, tObs, tTrue }
const flashes = [];       // active flash glows: { idx, started }  (started = simTime)
const FLASH_DUR = 0.45;   // flash glow lifetime, in simulated seconds
let chart = null;

// ---- DOM -------------------------------------------------------------------
const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const clockEl = document.getElementById('clock');
const instructionEl = document.getElementById('instruction');
const markCountEl = document.getElementById('markCount');
const nextMarkEl = document.getElementById('nextMark');
const dataBody = document.getElementById('dataBody');
const speedInput = document.getElementById('speed');
const speedLabel = document.getElementById('speedLabel');
const showFlashInput = document.getElementById('showFlash');
const resetBtn = document.getElementById('resetBtn');
const csvBtn = document.getElementById('csvBtn');
const gEstimateEl = document.getElementById('gEstimate');
const meanDelayEl = document.getElementById('meanDelay');

// ---- Geometry (pixel layout of the tower) ----------------------------------
const W = canvas.width;
const TOP = 40;                       // y of the top of the tower (drop point)
const GROUND = canvas.height - 56;    // y of the Moon surface
const PX_PER_M = (GROUND - TOP) / H;  // vertical scale
const TOWER_X = W * 0.62;             // x of the tower's left edge
const TOWER_W = 26;
const BALL_R = 4.5;
const BALL_X = TOWER_X - 4;           // ball rides just left of the tower

// Pre-rendered star field so it doesn't twinkle every frame.
const STARS = [];
for (let i = 0; i < 70; i++) {
    STARS.push({
        x: ((i * 73) % W),
        y: ((i * 137) % GROUND),
        r: (i % 3 === 0) ? 1.4 : 0.8,
        a: 0.3 + ((i * 31) % 50) / 100,
    });
}

// ===========================================================================
// Interaction
// ===========================================================================
function handleAction() {
    if (state === 'ready') {
        startDrop();
    } else if (state === 'falling') {
        recordClick();
    }
}

canvas.addEventListener('mousedown', handleAction);
window.addEventListener('keydown', (e) => {
    if (e.code === 'Space') { e.preventDefault(); handleAction(); }
});

function startDrop() {
    state = 'falling';
    simTime = 0;
    lastPerf = performance.now();
    instructionEl.innerHTML =
        'A red mark <strong>flashes</strong> as the ball passes — ' +
        '<strong>click</strong> (or press Space) on each flash.';
    requestAnimationFrame(loop);
}

function recordClick() {
    if (recordIdx >= MARKS.length) return;
    const x = MARKS[recordIdx];
    records.push({ mark: recordIdx + 1, x, tObs: simTime, tTrue: trueTimeAt(x) });
    recordIdx++;
    updateReadouts();
    csvBtn.disabled = false;
    // Briefly tint the clock so the click registers visually.
    clockEl.classList.add('flash');
    setTimeout(() => clockEl.classList.remove('flash'), 120);
    if (recordIdx >= MARKS.length) finish();
}

// ===========================================================================
// Animation loop
// ===========================================================================
function loop(now) {
    const dtReal = (now - lastPerf) / 1000;
    lastPerf = now;
    simTime += dtReal * speed;

    // Trigger flashes for any marks the ball has just passed.
    while (nextFlashIdx < MARKS.length && simTime >= trueTimeAt(MARKS[nextFlashIdx])) {
        flashes.push({ idx: nextFlashIdx, started: simTime });
        nextFlashIdx++;
    }

    // Update only the leading numeric text node, keep the <span class="unit">.
    clockEl.childNodes[0].nodeValue = simTime.toFixed(2);

    draw();

    // The ball lands when it reaches the ground (t for x = H).
    if (simTime >= trueTimeAt(H)) {
        simTime = trueTimeAt(H);
        clockEl.childNodes[0].nodeValue = simTime.toFixed(2);
        draw();
        if (state === 'falling') finish();
        return;
    }
    if (state === 'falling') requestAnimationFrame(loop);
}

// ===========================================================================
// Drawing
// ===========================================================================
function draw() {
    // Background
    const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#070912');
    g.addColorStop(1, '#10152b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, canvas.height);

    // Stars
    for (const s of STARS) {
        ctx.globalAlpha = s.a;
        ctx.fillStyle = '#cdd6ff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Distant Earth for flavor
    ctx.fillStyle = '#3a6fd8';
    ctx.beginPath();
    ctx.arc(46, 56, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(110,200,140,0.5)';
    ctx.beginPath();
    ctx.arc(42, 52, 6, 0, Math.PI * 2);
    ctx.fill();

    drawGround();
    drawTower();
    drawBall();
}

function drawGround() {
    const gg = ctx.createLinearGradient(0, GROUND, 0, canvas.height);
    gg.addColorStop(0, '#5a5f72');
    gg.addColorStop(1, '#33384a');
    ctx.fillStyle = gg;
    ctx.fillRect(0, GROUND, W, canvas.height - GROUND);
    // a couple of craters
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (const c of [[60, 14, 14], [150, 20, 9], [250, 12, 16]]) {
        ctx.beginPath();
        ctx.ellipse(c[0], GROUND + c[1], c[2], c[1] * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawTower() {
    // Tower body
    ctx.fillStyle = '#454c66';
    ctx.fillRect(TOWER_X, TOP, TOWER_W, GROUND - TOP);
    ctx.strokeStyle = '#2c3252';
    ctx.lineWidth = 1;
    ctx.strokeRect(TOWER_X, TOP, TOWER_W, GROUND - TOP);

    // Red marks + flashes + labels
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < MARKS.length; i++) {
        const y = TOP + MARKS[i] * PX_PER_M;
        const flash = showFlash ? activeFlash(i) : null;

        if (flash) {
            const fade = 1 - (simTime - flash.started) / FLASH_DUR;
            ctx.save();
            ctx.shadowColor = '#ff5a5a';
            ctx.shadowBlur = 18 * fade;
            ctx.fillStyle = `rgba(255,90,90,${0.5 + 0.5 * fade})`;
            ctx.fillRect(TOWER_X - 4, y - 2.5, TOWER_W + 8, 5);
            ctx.restore();
        } else {
            ctx.fillStyle = '#c0395a';
            ctx.fillRect(TOWER_X, y - 1.5, TOWER_W, 3);
        }

        // height label every 25 m to avoid clutter
        if (MARKS[i] % 25 === 0) {
            ctx.fillStyle = '#9aa3c4';
            ctx.textAlign = 'left';
            ctx.fillText(MARKS[i] + ' m', TOWER_X + TOWER_W + 6, y);
        }
    }

    // Top platform
    ctx.fillStyle = '#5b6486';
    ctx.fillRect(TOWER_X - 8, TOP - 6, TOWER_W + 16, 6);
}

function drawBall() {
    const d = Math.min(0.5 * G * simTime * simTime, H);  // distance fallen
    // Rest on the platform before the drop; otherwise track the fall.
    const cy = (state === 'ready') ? TOP - BALL_R : TOP + d * PX_PER_M;

    ctx.save();
    ctx.shadowColor = 'rgba(255,221,87,0.5)';
    ctx.shadowBlur = 6;
    const bg = ctx.createRadialGradient(BALL_X - 2, cy - 2, 0.5, BALL_X, cy, BALL_R);
    bg.addColorStop(0, '#fff3b0');
    bg.addColorStop(1, '#f5c518');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(BALL_X, cy, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function activeFlash(idx) {
    for (let k = flashes.length - 1; k >= 0; k--) {
        if (flashes[k].idx === idx && simTime - flashes[k].started < FLASH_DUR) {
            return flashes[k];
        }
    }
    return null;
}

// ===========================================================================
// Readouts
// ===========================================================================
function updateReadouts() {
    markCountEl.textContent = `${records.length} / ${MARKS.length}`;
    nextMarkEl.textContent =
        recordIdx < MARKS.length ? `${MARKS[recordIdx]} m` : '—';

    dataBody.innerHTML = records
        .map((r) => {
            const d = r.tObs - r.tTrue;
            const cls = d > 0 ? ' class="delta-pos"' : '';
            return `<tr><td>${r.mark}</td><td>${r.x}</td>` +
                `<td>${r.tObs.toFixed(2)}</td><td>${r.tTrue.toFixed(2)}</td>` +
                `<td${cls}>${d >= 0 ? '+' : ''}${d.toFixed(2)}</td></tr>`;
        })
        .join('');
    // Keep the newest row in view and refresh the live analysis.
    const wrap = dataBody.parentElement.parentElement;
    wrap.scrollTop = wrap.scrollHeight;
    updateAnalysis();
}

// ===========================================================================
// Live statistics + plot
// ===========================================================================
function finish() {
    state = 'done';
    instructionEl.innerHTML = records.length
        ? 'Drop complete — the graph and statistics include every recorded click.'
        : 'Drop complete. Reset and click the red flashes to collect data.';
}

function calculateStats() {
    if (!records.length) return { gHat: null, meanDelay: null };

    // Estimate g from x = 1/2 g t² with least squares through the origin:
    // g_hat = 2 * sum(x * t²) / sum(t⁴).
    let numerator = 0;
    let denominator = 0;
    let delaySum = 0;
    for (const record of records) {
        const tSquared = record.tObs * record.tObs;
        numerator += record.x * tSquared;
        denominator += tSquared * tSquared;
        delaySum += record.tObs - record.tTrue;
    }

    return {
        gHat: denominator > 0 ? (2 * numerator) / denominator : null,
        meanDelay: delaySum / records.length,
    };
}

function makeCurve(gravity) {
    if (!Number.isFinite(gravity) || gravity <= 0) return [];
    const endTime = Math.sqrt((2 * H) / gravity);
    const curve = [];
    for (let index = 0; index <= 80; index++) {
        const time = (endTime * index) / 80;
        curve.push({ x: time, y: 0.5 * gravity * time * time });
    }
    return curve;
}

function updateAnalysis() {
    const stats = calculateStats();
    gEstimateEl.textContent = Number.isFinite(stats.gHat)
        ? stats.gHat.toFixed(3) + ' m/s²'
        : '—';

    if (Number.isFinite(stats.meanDelay)) {
        const sign = stats.meanDelay >= 0 ? '+' : '';
        meanDelayEl.textContent = sign + stats.meanDelay.toFixed(3) + ' s';
    } else {
        meanDelayEl.textContent = '—';
    }

    renderChart(stats.gHat);
}

function renderChart(gHat) {
    if (typeof Chart === 'undefined') return;

    const observedPoints = records.map((record) => ({ x: record.tObs, y: record.x }));
    const trueCurve = makeCurve(G);
    const fittedCurve = makeCurve(gHat);

    if (chart) {
        chart.data.datasets[0].data = trueCurve;
        chart.data.datasets[1].data = fittedCurve;
        chart.data.datasets[2].data = observedPoints;
        chart.update('none');
        return;
    }

    chart = new Chart(document.getElementById('chart'), {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'True Moon: x = ½gt²',
                    data: trueCurve,
                    type: 'line',
                    borderColor: 'rgba(91, 140, 255, 0.4)',
                    borderWidth: 1.7,
                    pointRadius: 0,
                    tension: 0.22,
                },
                {
                    label: 'Live fit: x = ½ĝt²',
                    data: fittedCurve,
                    type: 'line',
                    borderColor: '#4ade80',
                    borderDash: [7, 5],
                    borderWidth: 2,
                    pointRadius: 0,
                    tension: 0.22,
                },
                {
                    label: 'Your clicks',
                    data: observedPoints,
                    backgroundColor: '#ff5a5a',
                    borderColor: '#ffd0d0',
                    borderWidth: 1.5,
                    pointRadius: 5,
                    pointHoverRadius: 6,
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            normalized: true,
            scales: {
                x: {
                    title: { display: true, text: 'observed time t (s)', color: '#9aa3c4' },
                    min: 0,
                    max: Math.ceil(trueTimeAt(H) + 0.75),
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    ticks: { color: '#9aa3c4', maxTicksLimit: 7 },
                },
                y: {
                    title: { display: true, text: 'distance fallen x (m)', color: '#9aa3c4' },
                    min: 0,
                    max: H,
                    grid: { color: 'rgba(255,255,255,0.06)' },
                    ticks: { color: '#9aa3c4', maxTicksLimit: 6 },
                },
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        boxWidth: 18,
                        boxHeight: 2,
                        color: '#e8ecf8',
                        font: { size: 11 },
                        padding: 14,
                    },
                },
                tooltip: {
                    callbacks: {
                        label(context) {
                            return `${context.dataset.label}: (${context.parsed.x.toFixed(2)} s, ${context.parsed.y.toFixed(1)} m)`;
                        },
                    },
                },
            },
        },
    });
}

// ===========================================================================
// CSV export
// ===========================================================================
csvBtn.addEventListener('click', () => {
    const header = 'mark,x_m,t_obs_s,t_true_s\n';
    const rows = records
        .map((r) => `${r.mark},${r.x},${r.tObs.toFixed(3)},${r.tTrue.toFixed(3)}`)
        .join('\n');
    const blob = new Blob([header + rows + '\n'], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'moon-drop.csv';
    a.click();
    URL.revokeObjectURL(url);
});

// ===========================================================================
// Speed + reset
// ===========================================================================
speedInput.addEventListener('input', () => {
    speed = parseFloat(speedInput.value);
    speedLabel.textContent = speed.toFixed(1) + '×';
});

showFlashInput.addEventListener('change', () => {
    showFlash = showFlashInput.checked;
    draw();  // reflect the change immediately when paused
});

resetBtn.addEventListener('click', reset);

function reset() {
    state = 'ready';
    simTime = 0;
    nextFlashIdx = 0;
    recordIdx = 0;
    records.length = 0;
    flashes.length = 0;
    clockEl.childNodes[0].nodeValue = '0.00';
    instructionEl.innerHTML =
        'Click anywhere on the scene to <strong>drop the ball</strong> and start the clock.';
    csvBtn.disabled = true;
    updateReadouts();
    draw();
}

// ---- Init ------------------------------------------------------------------
updateReadouts();
draw();

// Game state
let selectedBoxIndex = -1;
let actualProportion = 0;
let drawnBalls = [];
let totalCost = 0;
let hasBoughtExtraBall = false;
let userGuess = null;
let revealUnlocked = false;
let revealToggleInitialized = false;

// Round tracking (in-memory only)
let roundsPlayed = 0;
let totalWinnings = 0;
let totalLosses = 0;

// Implied probabilities for box selection
let impliedProbabilities = {
    0.25: 1 / 2,
    0.50: 1 / 3,
    0.75: 1 / 6
};

// Prizes for correct guesses (will be set from config)
let prizes = {
    0.25: 15,
    0.50: 20,
    0.75: 35
};

// Number of balls to draw (will be set from config)
let numBallsToDraw = 5;

// Price per ball (will be set from config)
let initialBallPrice = 1;
let additionalBallPrice = 0.5;
let simCumulativeChart = null;
let simAverageChart = null;

// Initialize game
function initGame() {
    // Show config phase first
    document.querySelectorAll('.phase').forEach(phase => {
        phase.classList.add('hidden');
    });
    document.getElementById('configPhase').classList.remove('hidden');

    setupConfigHandlers();
    updateGrossPayoffs();
    setupRevealToggle();
}

function setupConfigHandlers() {
    const numBallsInput = document.getElementById('numBalls');
    const initialPriceInput = document.getElementById('initialBallPrice');
    const payoff025Input = document.getElementById('payoff025');
    const payoff050Input = document.getElementById('payoff050');
    const payoff075Input = document.getElementById('payoff075');
    if (numBallsInput && initialPriceInput) {
        const handler = () => updateGrossPayoffs();
        numBallsInput.addEventListener('input', handler);
        initialPriceInput.addEventListener('input', handler);
    }
    if (payoff025Input && payoff050Input && payoff075Input) {
        const handler = () => updateImpliedProbabilities();
        payoff025Input.addEventListener('input', handler);
        payoff050Input.addEventListener('input', handler);
        payoff075Input.addEventListener('input', handler);
    }
}

function setupRevealToggle() {
    if (revealToggleInitialized) return;
    const revealToggle = document.getElementById('revealBoxes');
    const grid = document.getElementById('boxGrid');
    if (!revealToggle || !grid) return;
    revealToggleInitialized = true;
    const updateRevealState = () => {
        const shouldReveal = revealToggle.checked && revealUnlocked;
        grid.classList.toggle('reveal', shouldReveal);
        grid.querySelectorAll('.box-cell').forEach(cell => {
            cell.textContent = shouldReveal ? cell.dataset.proportion : '';
        });
    };

    revealToggle.addEventListener('click', async () => {
        if (revealToggle.checked) {
            if (!await checkRevealPassword()) {
                revealToggle.checked = false;
                revealUnlocked = false;
                updateRevealState();
                return;
            }
            revealUnlocked = true;
        } else {
            revealUnlocked = false;
        }
        updateRevealState();
    });
}

function reshuffleBoxes() {
    buildBoxGrid();
}

function checkRevealPassword() {
    return openPasswordModal().then(input => {
        if (!input) return false;
        const hash = fnv1aHash(input.trim());
        return hash === 285467932;
    });
}

function fnv1aHash(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = (hash * 0x01000193) >>> 0;
    }
    return hash >>> 0;
}

function openPasswordModal() {
    const modal = document.getElementById('passwordModal');
    const input = document.getElementById('passwordInput');
    const confirmBtn = document.getElementById('passwordConfirm');
    const cancelBtn = document.getElementById('passwordCancel');
    if (!modal || !input || !confirmBtn || !cancelBtn) {
        return Promise.resolve('');
    }

    return new Promise(resolve => {
        const cleanup = () => {
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
            modal.classList.add('hidden');
            input.value = '';
        };

        const onConfirm = () => {
            const value = input.value;
            cleanup();
            resolve(value);
        };

        const onCancel = () => {
            cleanup();
            resolve('');
        };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
        modal.classList.remove('hidden');
        input.focus();
    });
}

function updateGrossPayoffs() {
    const numBalls = parseInt(document.getElementById('numBalls').value) || 5;
    const initialPrice = parseFloat(document.getElementById('initialBallPrice').value) || 1;
    const baseCost = initialPrice * numBalls;

    prizes[0.25] = 5 + baseCost;
    prizes[0.50] = 10 + baseCost;
    prizes[0.75] = 25 + baseCost;

    document.getElementById('payoff025').value = prizes[0.25].toFixed(2);
    document.getElementById('payoff050').value = prizes[0.50].toFixed(2);
    document.getElementById('payoff075').value = prizes[0.75].toFixed(2);

    updateImpliedProbabilities();
}

function updateImpliedProbabilities() {
    const numBalls = parseInt(document.getElementById('numBalls').value) || 5;
    const initialPrice = parseFloat(document.getElementById('initialBallPrice').value) || 1;
    const baseCost = initialPrice * numBalls;

    const payoff025 = parseFloat(document.getElementById('payoff025').value);
    const payoff050 = parseFloat(document.getElementById('payoff050').value);
    const payoff075 = parseFloat(document.getElementById('payoff075').value);

    const implied025 = payoff025 > 0 ? baseCost / payoff025 : 0;
    const implied050 = payoff050 > 0 ? baseCost / payoff050 : 0;
    const implied075 = payoff075 > 0 ? baseCost / payoff075 : 0;

    document.getElementById('implied025').textContent = formatProbability(implied025);
    document.getElementById('implied050').textContent = formatProbability(implied050);
    document.getElementById('implied075').textContent = formatProbability(implied075);

    const sum = implied025 + implied050 + implied075;
    if (sum > 0) {
        impliedProbabilities = {
            0.25: implied025 / sum,
            0.50: implied050 / sum,
            0.75: implied075 / sum
        };
    } else {
        impliedProbabilities = {
            0.25: 1 / 3,
            0.50: 1 / 3,
            0.75: 1 / 3
        };
    }
    buildBoxGrid();
}

function runSimulation() {
    const simGamesInput = document.getElementById('simGames');
    const simGames = parseInt(simGamesInput ? simGamesInput.value : '100', 10) || 100;
    if (simGames < 1) {
        alert('Number of games must be at least 1');
        return;
    }

    numBallsToDraw = parseInt(document.getElementById('numBalls').value) || 5;
    initialBallPrice = parseFloat(document.getElementById('initialBallPrice').value) || 1;
    additionalBallPrice = parseFloat(document.getElementById('additionalBallPrice').value) || 0.5;
    prizes[0.25] = parseFloat(document.getElementById('payoff025').value) || prizes[0.25];
    prizes[0.50] = parseFloat(document.getElementById('payoff050').value) || prizes[0.50];
    prizes[0.75] = parseFloat(document.getElementById('payoff075').value) || prizes[0.75];
    updateImpliedProbabilities();

    const thetas = [0.25, 0.50, 0.75];
    const payoff = [prizes[0.25], prizes[0.50], prizes[0.75]];
    const N = numBallsToDraw;
    const C = initialBallPrice * N;
    const extraC = additionalBallPrice;

    const impliedPrior = [impliedProbabilities[0.25], impliedProbabilities[0.50], impliedProbabilities[0.75]];
    const uniformPrior = [1 / 3, 1 / 3, 1 / 3];

    const impliedResults = simulateWithPrior(simGames, thetas, impliedPrior, impliedPrior, payoff, N, C, extraC, 'ev');
    const uniformResults = simulateWithPrior(simGames, thetas, impliedPrior, uniformPrior, payoff, N, C, extraC, 'always_extra_map');
    const impliedMapExtraResults = simulateWithPrior(simGames, thetas, impliedPrior, impliedPrior, payoff, N, C, extraC, 'always_extra_map');

    renderSimulationCharts(impliedResults, uniformResults, impliedMapExtraResults);
}

function simulateWithPrior(simGames, thetas, samplingPrior, bettingPrior, payoff, N, C, extraC, strategy) {
    const cumulative = [];
    const average = [];
    let totalNet = 0;
    let correctGuesses = 0;

    for (let game = 1; game <= simGames; game++) {
        const actualTheta = sampleTheta(thetas, samplingPrior);
        let k = drawReds(N, actualTheta);

        const post = posterior(thetas, bettingPrior, N, k);
        let totalCost = C;
        let finalPost = post;
        let guessedTheta = thetas[0];

        if (strategy === 'always_extra_map') {
            const extraRed = Math.random() < actualTheta;
            totalCost += extraC;
            finalPost = extraRed
                ? normalize(post.map((p, i) => p * thetas[i]))
                : normalize(post.map((p, i) => p * (1 - thetas[i])));
            guessedTheta = mostLikelyTheta(finalPost, thetas);
        } else {
            const decisionNow = bestDecision(post, payoff);
            const netNowEV = decisionNow.bestExpected - C;

            const extraDecision = extraBallDecision(thetas, post, payoff, C, extraC);
            const chooseExtra = extraDecision.netEV > netNowEV;

            if (chooseExtra) {
                const extraRed = Math.random() < actualTheta;
                totalCost += extraC;
                if (extraRed) {
                    finalPost = extraDecision.postRed;
                } else {
                    finalPost = extraDecision.postGreen;
                }
            }

            const finalDecision = bestDecision(finalPost, payoff);
            guessedTheta = finalDecision.bestTheta;
        }

        const netResult = guessedTheta === actualTheta ? payoff[thetas.indexOf(guessedTheta)] - totalCost : -totalCost;
        if (guessedTheta === actualTheta) {
            correctGuesses += 1;
        }

        totalNet += netResult;
        cumulative.push(totalNet);
        average.push(totalNet / game);
    }

    return { cumulative, average, correctGuesses };
}

function mostLikelyTheta(post, thetas) {
    let bestIdx = 0;
    let bestVal = post[0];
    for (let i = 1; i < post.length; i++) {
        if (post[i] > bestVal) {
            bestVal = post[i];
            bestIdx = i;
        }
    }
    return thetas[bestIdx];
}

function renderSimulationCharts(impliedResults, uniformResults, impliedMapExtraResults) {
    const section = document.getElementById('simulationSection');
    if (section) {
        section.classList.remove('hidden');
    }
    updateSimulationSummary(impliedResults, uniformResults, impliedMapExtraResults);

    const labels = impliedResults.cumulative.map((_, i) => i + 1);
    const cumCanvas = document.getElementById('simCumulativeChart');
    const avgCanvas = document.getElementById('simAverageChart');
    if (!cumCanvas || !avgCanvas || !window.Chart) return;

    if (simCumulativeChart) simCumulativeChart.destroy();
    if (simAverageChart) simAverageChart.destroy();

    simCumulativeChart = new Chart(cumCanvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Optimal Strategy',
                    data: impliedResults.cumulative,
                    borderColor: '#667eea',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.1
                },
                {
                    label: 'Uniform prior (always extra ball + MLE)',
                    data: uniformResults.cumulative,
                    borderColor: '#2ecc71',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.1
                },
                {
                    label: 'MAP posterior (always extra)',
                    data: impliedMapExtraResults.cumulative,
                    borderColor: '#e67e22',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true } },
            scales: {
                x: { title: { display: true, text: 'Game' } },
                y: { title: { display: true, text: 'Net ($)' } }
            }
        }
    });

    simAverageChart = new Chart(avgCanvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'Optimal Strategy',
                    data: impliedResults.average,
                    borderColor: '#667eea',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.1
                },
                {
                    label: 'Uniform prior (always extra ball + MLE)',
                    data: uniformResults.average,
                    borderColor: '#2ecc71',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.1
                },
                {
                    label: 'MAP posterior (always extra)',
                    data: impliedMapExtraResults.average,
                    borderColor: '#e67e22',
                    borderWidth: 1,
                    pointRadius: 0,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: true } },
            scales: {
                x: {
                    type: 'logarithmic',
                    title: { display: true, text: 'Game (log scale)' },
                    ticks: { callback: value => value }
                },
                y: { title: { display: true, text: 'Average Net ($)' } }
            }
        }
    });
}

function updateSimulationSummary(impliedResults, uniformResults, impliedMapExtraResults) {
    const impliedCum = impliedResults.cumulative[impliedResults.cumulative.length - 1] || 0;
    const impliedAvg = impliedResults.average[impliedResults.average.length - 1] || 0;
    const uniformCum = uniformResults.cumulative[uniformResults.cumulative.length - 1] || 0;
    const uniformAvg = uniformResults.average[uniformResults.average.length - 1] || 0;
    const mapAvg = impliedMapExtraResults.average[impliedMapExtraResults.average.length - 1] || 0;
    const mapCum = impliedMapExtraResults.cumulative[impliedMapExtraResults.cumulative.length - 1] || 0;
    const impliedCorrect = impliedResults.correctGuesses || 0;
    const uniformCorrect = uniformResults.correctGuesses || 0;
    const mapCorrect = impliedMapExtraResults.correctGuesses || 0;
    const totalGames = impliedResults.average.length || 0;

    const impliedCumEl = document.getElementById('simSummaryOptimalCumulative');
    const uniformCumEl = document.getElementById('simSummaryUniformCumulative');
    const mapAvgEl = document.getElementById('simAverageMap');
    const optimalAvgEl = document.getElementById('simAverageOptimal');
    const uniformAvgEl = document.getElementById('simAverageUniform');
    const impliedCorrectEl = document.getElementById('simSummaryOptimalCorrect');
    const uniformCorrectEl = document.getElementById('simSummaryUniformCorrect');
    const mapCumEl = document.getElementById('simSummaryMapCumulative');
    const mapCorrectEl = document.getElementById('simSummaryMapCorrect');

    if (impliedCumEl) impliedCumEl.textContent = `$${impliedCum.toFixed(2)}`;
    if (uniformCumEl) uniformCumEl.textContent = `$${uniformCum.toFixed(2)}`;
    if (mapAvgEl) mapAvgEl.textContent = `$${mapAvg.toFixed(4)}`;
    if (optimalAvgEl) optimalAvgEl.textContent = `$${impliedAvg.toFixed(4)}`;
    if (uniformAvgEl) uniformAvgEl.textContent = `$${uniformAvg.toFixed(4)}`;
    if (mapCumEl) mapCumEl.textContent = `$${mapCum.toFixed(2)}`;
    if (impliedCorrectEl && totalGames) {
        impliedCorrectEl.textContent = `${((impliedCorrect / totalGames) * 100).toFixed(1)}%`;
    }
    if (uniformCorrectEl && totalGames) {
        uniformCorrectEl.textContent = `${((uniformCorrect / totalGames) * 100).toFixed(1)}%`;
    }
    if (mapCorrectEl && totalGames) {
        mapCorrectEl.textContent = `${((mapCorrect / totalGames) * 100).toFixed(1)}%`;
    }
}

function sampleTheta(thetas, probs) {
    const r = Math.random();
    let acc = 0;
    for (let i = 0; i < thetas.length; i++) {
        acc += probs[i];
        if (r <= acc) return thetas[i];
    }
    return thetas[thetas.length - 1];
}

function drawReds(n, theta) {
    let k = 0;
    for (let i = 0; i < n; i++) {
        if (Math.random() < theta) k++;
    }
    return k;
}

function posterior(thetas, prior, n, k) {
    const unnorm = thetas.map((theta, i) => {
        const likelihood = binomialCoeff(n, k) * Math.pow(theta, k) * Math.pow(1 - theta, n - k);
        return likelihood * prior[i];
    });
    const total = unnorm.reduce((a, b) => a + b, 0) || 1;
    return unnorm.map(v => v / total);
}

function bestDecision(post, payoff) {
    let bestExpected = -Infinity;
    let bestTheta = 0.25;
    for (let i = 0; i < post.length; i++) {
        const expected = post[i] * payoff[i];
        if (expected > bestExpected) {
            bestExpected = expected;
            bestTheta = [0.25, 0.50, 0.75][i];
        }
    }
    return { bestExpected, bestTheta };
}

function extraBallDecision(thetas, post, payoff, C, extraC) {
    const pRed = post.reduce((acc, p, i) => acc + p * thetas[i], 0);
    const pGreen = 1 - pRed;

    const postRed = normalize(post.map((p, i) => p * thetas[i]));
    const postGreen = normalize(post.map((p, i) => p * (1 - thetas[i])));

    const bestRed = bestDecision(postRed, payoff).bestExpected;
    const bestGreen = bestDecision(postGreen, payoff).bestExpected;

    const netEV = pRed * bestRed + pGreen * bestGreen - (C + extraC);
    return { netEV, postRed, postGreen };
}

function normalize(values) {
    const total = values.reduce((a, b) => a + b, 0) || 1;
    return values.map(v => v / total);
}

function binomialCoeff(n, k) {
    if (k < 0 || k > n) return 0;
    k = Math.min(k, n - k);
    let c = 1;
    for (let i = 0; i < k; i++) {
        c = (c * (n - i)) / (i + 1);
    }
    return c;
}

function formatProbability(value) {
    if (!isFinite(value) || value <= 0) {
        return '-';
    }
    return `${value.toFixed(3)} (${toFraction(value)})`;
}

function toFraction(value) {
    const denominators = [2, 3, 4, 5, 6, 8, 10, 12, 16];
    let best = { n: 1, d: 1, err: Math.abs(value - 1) };
    denominators.forEach(d => {
        const n = Math.round(value * d);
        const err = Math.abs(value - n / d);
        if (err < best.err) {
            best = { n, d, err };
        }
    });
    return `${best.n}/${best.d}`;
}

// Start game with configuration
function startGame() {
    // Read configuration values
    numBallsToDraw = parseInt(document.getElementById('numBalls').value) || 5;
    initialBallPrice = parseFloat(document.getElementById('initialBallPrice').value) || 1;
    additionalBallPrice = parseFloat(document.getElementById('additionalBallPrice').value) || 0.5;
    prizes[0.25] = parseFloat(document.getElementById('payoff025').value) || prizes[0.25];
    prizes[0.50] = parseFloat(document.getElementById('payoff050').value) || prizes[0.50];
    prizes[0.75] = parseFloat(document.getElementById('payoff075').value) || prizes[0.75];
    updateImpliedProbabilities();
    
    // Validate inputs
    if (numBallsToDraw < 1 || numBallsToDraw > 50) {
        alert('Number of balls must be between 1 and 50');
        return;
    }
    
    if (initialBallPrice < 0 || additionalBallPrice < 0) {
        alert('Ball prices must be non-negative');
        return;
    }
    
    // Initialize game state
    totalCost = 0;
    hasBoughtExtraBall = false;
    
    // Hide config phase, show box selection
    document.getElementById('configPhase').classList.add('hidden');
    document.getElementById('boxSelection').classList.remove('hidden');
    const tallyDisplay = document.getElementById('tallyDisplay');
    if (tallyDisplay) {
        tallyDisplay.classList.remove('hidden');
    }
    revealUnlocked = false;
    const revealToggle = document.getElementById('revealBoxes');
    if (revealToggle) {
        revealToggle.checked = false;
    }
    buildBoxGrid();
    setupRevealToggle();
}

function showSimulation() {
    document.querySelectorAll('.phase').forEach(phase => {
        phase.classList.add('hidden');
    });
    document.getElementById('simulationPhase').classList.remove('hidden');
    const tallyDisplay = document.getElementById('tallyDisplay');
    if (tallyDisplay) {
        tallyDisplay.classList.add('hidden');
    }
}

function backToConfigFromSimulation() {
    document.querySelectorAll('.phase').forEach(phase => {
        phase.classList.add('hidden');
    });
    document.getElementById('configPhase').classList.remove('hidden');
    const tallyDisplay = document.getElementById('tallyDisplay');
    if (tallyDisplay) {
        tallyDisplay.classList.remove('hidden');
    }
}

// Change settings (go back to config)
function changeSettings() {
    // Hide all phases
    document.querySelectorAll('.phase').forEach(phase => {
        phase.classList.add('hidden');
    });
    
    // Show config phase
    document.getElementById('configPhase').classList.remove('hidden');
}

function buildBoxGrid() {
    const grid = document.getElementById('boxGrid');
    if (!grid) return;
    const revealToggle = document.getElementById('revealBoxes');

    const counts = allocateCounts(impliedProbabilities, 100);
    const cells = [];
    Object.entries(counts).forEach(([proportion, count]) => {
        for (let i = 0; i < count; i++) {
            cells.push(parseFloat(proportion));
        }
    });

    // Shuffle cells for random placement
    for (let i = cells.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [cells[i], cells[j]] = [cells[j], cells[i]];
    }

    grid.innerHTML = '';
    cells.forEach((proportion, index) => {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'box-cell';
        cell.dataset.proportion = proportion.toString();
        cell.setAttribute('aria-label', `Box ${index + 1}`);
        cell.textContent = '';
        cell.addEventListener('click', () => selectBox(index, proportion));
        grid.appendChild(cell);
    });

    if (revealToggle) {
        const shouldReveal = revealToggle.checked && revealUnlocked;
        grid.classList.toggle('reveal', shouldReveal);
        grid.querySelectorAll('.box-cell').forEach(cell => {
            cell.textContent = shouldReveal ? cell.dataset.proportion : '';
        });
    }
}

function allocateCounts(probabilities, total) {
    const entries = Object.entries(probabilities).map(([key, value]) => ({
        key,
        value: value || 0
    }));
    const sum = entries.reduce((acc, e) => acc + e.value, 0) || 1;
    const normalized = entries.map(e => ({
        key: e.key,
        value: e.value / sum
    }));

    const raw = normalized.map(e => ({ key: e.key, exact: e.value * total }));
    const counts = raw.map(r => ({ key: r.key, count: Math.floor(r.exact), remainder: r.exact - Math.floor(r.exact) }));
    let used = counts.reduce((acc, c) => acc + c.count, 0);
    counts.sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; used < total; i = (i + 1) % counts.length) {
        counts[i].count += 1;
        used += 1;
    }

    const result = {};
    counts.forEach(c => {
        result[c.key] = c.count;
    });
    return result;
}

// Select a box
function selectBox(index, proportion) {
    selectedBoxIndex = index;
    actualProportion = proportion;
    
    // Reset game state
    totalCost = 0;
    hasBoughtExtraBall = false;
    drawnBalls = [];
    
    // Calculate initial cost
    totalCost = initialBallPrice * numBallsToDraw;
    
    // Hide box selection, show drawing phase
    document.getElementById('boxSelection').classList.add('hidden');
    document.getElementById('drawingPhase').classList.remove('hidden');
    
    document.getElementById('selectedBoxNum').textContent = `Box ${index + 1}`;
    document.getElementById('totalBalls').textContent = numBallsToDraw;
    
    // Draw configured number of balls
    drawBalls(numBallsToDraw);
}

// Draw balls with replacement
function drawBalls(count) {
    const container = document.getElementById('ballsContainer');
    container.innerHTML = '';
    drawnBalls = []; // Reset drawn balls
    
    // Hide stats initially
    document.getElementById('redCount').textContent = '?';
    document.getElementById('greenCount').textContent = '?';
    document.getElementById('proportion').textContent = '?';
    
    // Draw all balls first (store results but don't show)
    for (let i = 0; i < count; i++) {
        const isRed = Math.random() < actualProportion;
        drawnBalls.push(isRed);
    }
    
    // Show rolling animation for each ball, then reveal all at once
    let animationComplete = 0;
    const animationDuration = 300; // 1 second per ball
    
    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            // Update ball counter
            document.getElementById('ballsDrawn').textContent = i + 1;
            
            // Create rolling ball animation
            const rollingBall = document.createElement('div');
            rollingBall.className = 'rolling-ball';
            container.appendChild(rollingBall);
            
            // Remove rolling ball after animation
            setTimeout(() => {
                rollingBall.remove();
                animationComplete++;
                
                // After all animations complete, show all results
                if (animationComplete === count) {
                    revealResults();
                }
            }, animationDuration);
        }, i * animationDuration);
    }
}

// Reveal all drawn balls at once
function revealResults() {
    const container = document.getElementById('ballsContainer');
    container.innerHTML = '';
    
    // Show all balls with a staggered animation
    drawnBalls.forEach((isRed, index) => {
        setTimeout(() => {
            const ball = document.createElement('div');
            ball.className = `ball ${isRed ? 'red' : 'green'}`;
            ball.textContent = isRed ? 'R' : 'G';
            ball.style.opacity = '0';
            ball.style.transform = 'scale(0)';
            container.appendChild(ball);
            
            // Animate appearance
            setTimeout(() => {
                ball.style.transition = 'all 0.3s';
                ball.style.opacity = '1';
                ball.style.transform = 'scale(1)';
            }, 10);
        }, index * 50);
    });
    
    // Update stats after a short delay
    setTimeout(() => {
        updateStats();
        
        // Show decision phase after revealing all balls
        setTimeout(() => {
            document.getElementById('drawingPhase').classList.add('hidden');
            document.getElementById('decisionPhase').classList.remove('hidden');
            updateDecisionPhase();
        }, 300);
    }, drawnBalls.length * 50 + 200);
}

// Update statistics
function updateStats() {
    const redCount = drawnBalls.filter(b => b).length;
    const greenCount = drawnBalls.filter(b => !b).length;
    const proportion = drawnBalls.length > 0 ? (redCount / drawnBalls.length).toFixed(2) : '0.00';
    
    document.getElementById('redCount').textContent = redCount;
    document.getElementById('greenCount').textContent = greenCount;
    document.getElementById('proportion').textContent = proportion;
    document.getElementById('ballsDrawn').textContent = drawnBalls.length;
    document.getElementById('currentCost').textContent = totalCost.toFixed(2);
}

// Update decision phase display
function updateDecisionPhase() {
    const redCount = drawnBalls.filter(b => b).length;
    const greenCount = drawnBalls.filter(b => !b).length;
    const proportion = drawnBalls.length > 0 ? (redCount / drawnBalls.length).toFixed(2) : '0.00';
    
    document.getElementById('decisionRedCount').textContent = redCount;
    document.getElementById('decisionGreenCount').textContent = greenCount;
    document.getElementById('decisionProportion').textContent = proportion;
    document.getElementById('decisionBallsDrawn').textContent = drawnBalls.length;
    document.getElementById('decisionCost').textContent = totalCost.toFixed(2);
    
    // Update buy button text
    const buyBtn = document.getElementById('buyBallBtn');
    if (buyBtn) {
        buyBtn.textContent = `Buy Another Ball ($${additionalBallPrice.toFixed(2)})`;
    }
    
    // Show all drawn balls
    const container = document.getElementById('decisionBallsContainer');
    container.innerHTML = '';
    drawnBalls.forEach(isRed => {
        const ball = document.createElement('div');
        ball.className = `ball ${isRed ? 'red' : 'green'}`;
        ball.textContent = isRed ? 'R' : 'G';
        container.appendChild(ball);
    });
}

// Guess now (no additional cost, just proceed to guess)
function guessNow() {
    showGuessPhase();
}

// Buy another ball (can buy multiple)
function buyAnotherBall() {
    totalCost += additionalBallPrice;
    hasBoughtExtraBall = true;
    
    const container = document.getElementById('decisionBallsContainer');
    
    // Draw one more ball
    const isRed = Math.random() < actualProportion;
    drawnBalls.push(isRed);
    
    // Show rolling animation
    const rollingBall = document.createElement('div');
    rollingBall.className = 'rolling-ball';
    container.appendChild(rollingBall);
    
    // After rolling animation, reveal the ball
    setTimeout(() => {
        rollingBall.remove();
        
        const ball = document.createElement('div');
        ball.className = `ball ${isRed ? 'red' : 'green'}`;
        ball.textContent = isRed ? 'R' : 'G';
        ball.style.opacity = '0';
        ball.style.transform = 'scale(0)';
        container.appendChild(ball);
        
        // Animate appearance
        setTimeout(() => {
            ball.style.transition = 'all 0.3s';
            ball.style.opacity = '1';
            ball.style.transform = 'scale(1)';
        }, 10);
        
        // Update stats
        updateDecisionPhase();
    }, 1000);
}

// Show guess phase
function showGuessPhase() {
    document.getElementById('decisionPhase').classList.add('hidden');
    document.getElementById('guessPhase').classList.remove('hidden');
    
    const redCount = drawnBalls.filter(b => b).length;
    const greenCount = drawnBalls.filter(b => !b).length;
    const proportion = drawnBalls.length > 0 ? (redCount / drawnBalls.length).toFixed(2) : '0.00';
    
    document.getElementById('guessRedCount').textContent = redCount;
    document.getElementById('guessGreenCount').textContent = greenCount;
    document.getElementById('guessProportion').textContent = proportion;
    document.getElementById('guessBallsDrawn').textContent = drawnBalls.length;
    document.getElementById('guessCost').textContent = totalCost.toFixed(2);
    
    // Show all drawn balls
    const container = document.getElementById('guessBallsContainer');
    container.innerHTML = '';
    drawnBalls.forEach(isRed => {
        const ball = document.createElement('div');
        ball.className = `ball ${isRed ? 'red' : 'green'}`;
        ball.textContent = isRed ? 'R' : 'G';
        container.appendChild(ball);
    });
}

// Make a guess
function makeGuess(proportion) {
    userGuess = proportion;
    
    // Calculate prize
    let prize = 0;
    if (Math.abs(userGuess - actualProportion) < 0.01) { // Correct guess (accounting for floating point)
        prize = prizes[actualProportion];
    }
    
    // Calculate net result
    const netResult = prize - totalCost;
    
    // Track round
    roundsPlayed++;
    if (netResult > 0) {
        totalWinnings += netResult;
    } else if (netResult < 0) {
        totalLosses += Math.abs(netResult);
    }
    
    // Update tally display
    updateTally();
    
    // Show results
    document.getElementById('guessPhase').classList.add('hidden');
    document.getElementById('resultsPhase').classList.remove('hidden');
    
    document.getElementById('resultBox').textContent = `Box ${selectedBoxIndex + 1}`;
    document.getElementById('resultActual').textContent = actualProportion.toFixed(2);
    document.getElementById('resultGuess').textContent = userGuess.toFixed(2);
    document.getElementById('resultBalls').textContent = drawnBalls.length;
    document.getElementById('resultCost').textContent = totalCost.toFixed(2);
    document.getElementById('resultPrize').textContent = `$${prize}`;
    
    const netElement = document.getElementById('resultNet');
    netElement.textContent = `$${netResult.toFixed(2)}`;
    netElement.className = netResult >= 0 ? 'positive' : 'negative';
}

// Update tally display
function updateTally() {
    document.getElementById('tallyRounds').textContent = roundsPlayed;
    document.getElementById('tallyWinnings').textContent = `$${totalWinnings.toFixed(2)}`;
    document.getElementById('tallyLosses').textContent = `$${totalLosses.toFixed(2)}`;
    
    const netTotal = totalWinnings - totalLosses;
    const netElement = document.getElementById('tallyNet');
    netElement.textContent = `$${netTotal.toFixed(2)}`;
    netElement.className = netTotal >= 0 ? 'positive' : 'negative';
}

// Reset game
function resetGame() {
    selectedBoxIndex = -1;
    actualProportion = 0;
    drawnBalls = [];
    totalCost = 0;
    hasBoughtExtraBall = false;
    userGuess = null;
    
    // Rebuild grid with current implied probabilities
    buildBoxGrid();
    
    // Hide all phases
    document.querySelectorAll('.phase').forEach(phase => {
        phase.classList.add('hidden');
    });
    
    // Show box selection (keep same configuration)
    document.getElementById('boxSelection').classList.remove('hidden');
}

// Initialize on load
initGame();
updateTally(); // Initialize tally display

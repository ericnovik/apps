const canvas = document.getElementById('simCanvas');
const ctx = canvas.getContext('2d');

// Simulation State
let paused = true; // Start paused
let orbitProgress = 0; // 0 to 1 (1 = full year)
const baseOrbitSpeed = 0.002; // Base speed of simulation
let speedMultiplier = 1.0; // Speed multiplier
let orbitSpeed = baseOrbitSpeed * speedMultiplier; // Current speed

// CONFIGURATION
// Solar days per orbit (user adjustable)
// Sidereal rotations = Solar days + 1 (because Earth rotates one extra time relative to sun)
let solarDaysPerOrbit = 1;
let ROTATIONS_PER_ORBIT = solarDaysPerOrbit + 1; // Will be updated when solar days change 

function togglePause() {
    paused = !paused;
}

function increaseSpeed() {
    speedMultiplier = Math.min(speedMultiplier * 1.5, 10.0); // Max 10x speed
    orbitSpeed = baseOrbitSpeed * speedMultiplier;
    updateSpeedDisplay();
}

function decreaseSpeed() {
    speedMultiplier = Math.max(speedMultiplier / 1.5, 0.1); // Min 0.1x speed
    orbitSpeed = baseOrbitSpeed * speedMultiplier;
    updateSpeedDisplay();
}

function updateSpeedDisplay() {
    document.getElementById('speedValue').innerText = speedMultiplier.toFixed(1) + 'x';
}

function resetSimulation() {
    // Reset to initial state
    orbitProgress = 0;
    speedMultiplier = 1.0;
    orbitSpeed = baseOrbitSpeed * speedMultiplier;
    solarDaysPerOrbit = 1; // Initial value
    ROTATIONS_PER_ORBIT = solarDaysPerOrbit + 1;
    paused = true; // Start paused
    
    // Update all displays
    updateSpeedDisplay();
    updateSolarDaysDisplay();
}

function increaseSolarDays() {
    solarDaysPerOrbit = Math.min(solarDaysPerOrbit + 1, 20); // Max 20 solar days
    ROTATIONS_PER_ORBIT = solarDaysPerOrbit + 1;
    updateSolarDaysDisplay();
}

function decreaseSolarDays() {
    solarDaysPerOrbit = Math.max(solarDaysPerOrbit - 1, -2); // Min -2, -1 (frozen Earth), 0 (locked Earth)
    // Calculate sidereal rotations: solar days + 1
    // For -2: -1 rotations, for -1: 0 rotations (frozen), for 0: 1 rotation (locked), for 1+: normal
    ROTATIONS_PER_ORBIT = solarDaysPerOrbit + 1;
    updateSolarDaysDisplay();
}

function updateSolarDaysDisplay() {
    document.getElementById('solarDaysPerOrbit').innerText = solarDaysPerOrbit;
    // Update the description text
    if (solarDaysPerOrbit === -2) {
        document.getElementById('siderealRotText').innerText = '-1 times';
        document.getElementById('solarDaysText').innerText = '-2 days';
    } else if (solarDaysPerOrbit === -1) {
        document.getElementById('siderealRotText').innerText = '0 times';
        document.getElementById('solarDaysText').innerText = '-1 days (Frozen Earth)';
    } else if (solarDaysPerOrbit === 0) {
        document.getElementById('siderealRotText').innerText = '1 time';
        document.getElementById('solarDaysText').innerText = '0 days (Locked Earth)';
    } else {
        document.getElementById('siderealRotText').innerText = ROTATIONS_PER_ORBIT + ' times';
        document.getElementById('solarDaysText').innerText = solarDaysPerOrbit + ' days';
    }
}

// Keyboard controls for step rotation
window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') {
        // 45 degrees counter-clockwise relative to sun = -1/8 of orbit (since we use negative angles)
        orbitProgress -= 1/8;
        if (orbitProgress < 0) orbitProgress += 1; // Wrap around
        e.preventDefault();
    } else if (e.key === 'ArrowLeft') {
        // 45 degrees clockwise relative to sun = +1/8 of orbit
        orbitProgress += 1/8;
        if (orbitProgress >= 1) orbitProgress -= 1; // Wrap around
        e.preventDefault();
    }
});

function draw() {
    if (!paused) {
        orbitProgress += orbitSpeed;
    }
    
    // Clear screen
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;
    const orbitRadius = 180;

    // 1. Draw Star Reference (The "Infinity" point)
    // We assume the star is infinitely far to the RIGHT (0 degrees)
    // Draw a visual star indicator on the right edge
    ctx.save();
    ctx.translate(canvas.width - 20, cy);
    
    // Draw star shape (simple 4-pointed star)
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(8, -8);
    ctx.lineTo(0, -12);
    ctx.lineTo(-8, -8);
    ctx.lineTo(0, 0);
    ctx.lineTo(-8, 8);
    ctx.lineTo(0, 12);
    ctx.lineTo(8, 8);
    ctx.closePath();
    ctx.fillStyle = "#4af";
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.stroke();
    
    // Add glow effect
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#4af";
    ctx.fill();
    ctx.shadowBlur = 0;
    
    ctx.restore();

    // 2. Draw Sun
    ctx.beginPath();
    ctx.arc(cx, cy, 25, 0, Math.PI * 2);
    ctx.fillStyle = "#fd0";
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#fa0";
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.fillText("SUN", cx, cy + 4);

    // 3. Calculate Earth Position
    // Counter-clockwise orbit (standard in solar system)
    // Starting from right (0 degrees), going counter-clockwise
    // In canvas, negative angle goes counter-clockwise (Y increases downward)
    const orbitAngle = -orbitProgress * Math.PI * 2; 
    
    const earthX = cx + Math.cos(orbitAngle) * orbitRadius;
    const earthY = cy + Math.sin(orbitAngle) * orbitRadius;

    // 4. Calculate Earth Rotation
    // Counter-clockwise rotation (standard in solar system)
    // Total rotation angle = (Progress * Total Rotations * 2PI)
    // In canvas, negative angle rotates counter-clockwise (Y increases downward)
    const earthRotationAngle = -orbitProgress * ROTATIONS_PER_ORBIT * Math.PI * 2;

    // 5. Draw Earth System
    ctx.save();
    ctx.translate(earthX, earthY);
    
    // Draw Orbit Path (faint line)
    ctx.strokeStyle = "#333";
    ctx.beginPath();
    ctx.arc(-earthX+cx, -earthY+cy, orbitRadius, 0, Math.PI*2);
    ctx.stroke();

    // Rotate the context to match Earth's current spin
    ctx.rotate(earthRotationAngle);

    // Draw Earth Body (Disk)
    ctx.beginPath();
    ctx.arc(0, 0, 30, 0, Math.PI * 2);
    ctx.fillStyle = "#222";
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();

    // Draw Cardinal Directions (N, S, E, W)
    // N is "up" relative to the Earth disk
    ctx.fillStyle = "#fff";
    ctx.font = "bold 14px monospace";
    ctx.textBaseline = "middle";
    
    // We draw them at 0, 90, 180, 270 relative to the disk center
    // Note: In canvas, 0 is Right. So we adjust to make N "Up".
    ctx.fillText("E", 20, 0);
    ctx.fillText("W", -20, 0);
    ctx.fillText("S", 0, 20);
    ctx.fillText("N", 0, -20);

    // 6. Draw Indicators
    // We need to draw the arrows *relative to the Earth*, but pointing at specific things.
    
    // A. Sidereal Pointer (Green) - Always points to the Fixed Star (Right of screen)
    // Since we rotated the context by `earthRotationAngle`, we rotate BACK to draw a fixed-direction line.
    ctx.save();
    ctx.rotate(-earthRotationAngle); // Cancel out earth rotation to point absolute right
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(70, 0); // Pointing Right (0 degrees) - made longer
    ctx.strokeStyle = "#4af"; // Blue/Green
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Label for Sidereal - starts at the end of the vector
    ctx.fillStyle = "#4af";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Sidereal", 70, 0);
    ctx.restore();

    // B. Solar Pointer (Red) - Always points to the Sun (Center of screen)
    // We need the angle from Earth to Sun.
    // Earth is at orbitAngle. Sun is at center.
    // Vector Earth->Sun is exactly opposite to Vector Center->Earth.
    // Angle is (orbitAngle + PI).
    ctx.save();
    // Rotate back to neutral, then rotate to face sun
    ctx.rotate(-earthRotationAngle + orbitAngle + Math.PI); 
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(70, 0); // Made longer
    ctx.strokeStyle = "#f55"; // Red
    ctx.lineWidth = 3;
    ctx.stroke();
    
    // Label for Solar - starts at the end of the vector
    ctx.fillStyle = "#f55";
    ctx.font = "10px sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("Solar", 70, 0);
    ctx.restore();

    // Restore Earth context
    ctx.restore();

    // 7. Update Stats
    // Sidereal Days = Total Rotations
    // Solar Days = Total Rotations - Orbit Progress
    const siderealDays = orbitProgress * ROTATIONS_PER_ORBIT;
    const solarDays = siderealDays - orbitProgress;

    document.getElementById('siderealCount').innerText = siderealDays.toFixed(2);
    document.getElementById('solarCount').innerText = Math.max(0, solarDays).toFixed(2);

    requestAnimationFrame(draw);
}

// Start
updateSpeedDisplay(); // Initialize speed display
updateSolarDaysDisplay(); // Initialize solar days display
draw();

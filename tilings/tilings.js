const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let width, height;

// Game State
let shapes = []; // { x, y, type, rotation, scaleX, color, verts }
let selectedShapeIndex = -1;
let currentType = 1;
let isDragging = false;
let dragOffsetX = 0, dragOffsetY = 0;

// Define Shape Geometries (centered around 0,0 roughly)
const SHAPE_DEFS = {
    1: [ // House / Parallel
        {x: -60, y: -60}, {x: 60, y: -60}, {x: 60, y: 20}, {x: 0, y: 80}, {x: -60, y: 20}
    ],
    2: [ // Cairo - From Mathematica: {{0,0}, {1,-e}, {2,0}, {2-e,1}, {e,1}}
        // Using e = 0.6 (typical for Cairo), scaled by 80 (doubled), centered at origin
        // Original vertices: (0,0), (1,-0.6), (2,0), (1.4,1), (0.6,1)
        // Center is at (1, 0.2), so subtract to center, then scale
        {x: -80, y: -16},      // (0,0) -> (-80, -16) after centering and scaling
        {x: 0, y: -64},        // (1,-0.6) -> (0, -64)
        {x: 80, y: -16},      // (2,0) -> (80, -16)
        {x: 32, y: 64},        // (1.4,1) -> (32, 64)
        {x: -32, y: 64}        // (0.6,1) -> (-32, 64)
    ],
    5: (function() {
        // Type 5: a=b, d=e; angles: A=60°, C=120°
        function solveType5(a, d, angleBDeg) {
            const rad = deg => deg * Math.PI / 180;
            const angleB = rad(angleBDeg);

            // 1. Place A at (0,0)
            const A = { x: 0, y: 0 };

            // 2. Place B on X-axis at distance 'a'
            const B = { x: a, y: 0 };

            // 3. Place E based on Angle A (fixed at 60°) and distance 'd'
            // Type 5 definition: d = e (side EA = side DE)
            const E = { 
                x: d * Math.cos(rad(60)), 
                y: d * Math.sin(rad(60)) 
            };

            // 4. Place C based on B, angle B, and distance 'a'
            // Type 5 definition: a = b (side AB = side BC)
            // Note: Direction starts at 0 (East). B is pivot.
            // To turn interior angle B, we subtract from 180 relative to vector AB.
            const dirBC = Math.PI - angleB; 
            const C = {
                x: B.x + a * Math.cos(dirBC),
                y: B.y + a * Math.sin(dirBC)
            };

            // 5. Find D
            // D is the intersection of:
            //   a. A ray starting from C at Angle C (fixed at 120°)
            //   b. A circle around E with radius 'd'
            
            // Direction of CD: Previous direction (BC) + 60° turn (since interior C is 120°)
            const dirCD = dirBC + rad(60);
            const vx = Math.cos(dirCD);
            const vy = Math.sin(dirCD);
            
            // Vector E->C
            const dx = C.x - E.x;
            const dy = C.y - E.y;

            // Solve Quadratic: |(C - E) + t*v|^2 = d^2
            const A_quad = 1; 
            const B_quad = 2 * (dx * vx + dy * vy);
            const C_quad = (dx*dx + dy*dy) - (d*d);

            const discriminant = B_quad*B_quad - 4*A_quad*C_quad;

            // Construct Partial Result (for debugging visualization)
            const result = { A, B, C, E, dirCD, valid: false };

            if (discriminant < 0) {
                // No real intersection = Impossible geometry
                return result; 
            }

            // Calculate t (distance from C to D along the ray)
            // We take the smaller root usually to keep it convex, 
            // though strictly we should check t > 0
            const t = (-B_quad - Math.sqrt(discriminant)) / 2;

            if (t < 0) {
                // Intersection exists but it's "behind" C
                return result;
            }

            const D = {
                x: C.x + t * vx,
                y: C.y + t * vy
            };

            return { ...result, D, valid: true };
        }
        
        // Try different parameter combinations to find a valid closed shape
        const size = 100;
        let bestResult = null;
        let bestError = Infinity;
        
        // Try different values for a, d, and angleB
        for (let a = size * 0.8; a <= size * 1.2; a += size * 0.1) {
            for (let d = size * 0.6; d <= size * 1.0; d += size * 0.1) {
                for (let angleB = 100; angleB <= 140; angleB += 5) {
                    const result = solveType5(a, d, angleB);
                    
                    if (result.valid && result.D) {
                        // Check if the shape closes properly (EA should equal d)
                        const distEA = Math.sqrt(
                            (result.A.x - result.E.x)**2 + 
                            (result.A.y - result.E.y)**2
                        );
                        
                        // Check if DE equals d
                        const distDE = Math.sqrt(
                            (result.D.x - result.E.x)**2 + 
                            (result.D.y - result.E.y)**2
                        );
                        
                        // Calculate errors
                        const errorEA = Math.abs(distEA - d);
                        const errorDE = Math.abs(distDE - d);
                        
                        // Check angles
                        const vecAB = {x: result.B.x - result.A.x, y: result.B.y - result.A.y};
                        const vecAE = {x: result.E.x - result.A.x, y: result.E.y - result.A.y};
                        const dotA = vecAB.x * vecAE.x + vecAB.y * vecAE.y;
                        const lenAB = Math.sqrt(vecAB.x**2 + vecAB.y**2);
                        const lenAE = Math.sqrt(vecAE.x**2 + vecAE.y**2);
                        const angleA = Math.acos(Math.max(-1, Math.min(1, dotA / (lenAB * lenAE)))) * 180 / Math.PI;
                        const errorAngleA = Math.abs(angleA - 60);
                        
                        const vecCB = {x: result.B.x - result.C.x, y: result.B.y - result.C.y};
                        const vecCD = {x: result.D.x - result.C.x, y: result.D.y - result.C.y};
                        const dotC = vecCB.x * vecCD.x + vecCB.y * vecCD.y;
                        const lenCB = Math.sqrt(vecCB.x**2 + vecCB.y**2);
                        const lenCD = Math.sqrt(vecCD.x**2 + vecCD.y**2);
                        const angleC = Math.acos(Math.max(-1, Math.min(1, dotC / (lenCB * lenCD)))) * 180 / Math.PI;
                        const errorAngleC = Math.abs(angleC - 120);
                        
                        const totalError = errorEA + errorDE + errorAngleA * 5 + errorAngleC * 5;
                        
                        if (totalError < bestError) {
                            bestError = totalError;
                            bestResult = result;
                        }
                    }
                }
            }
        }
        
        if (!bestResult || !bestResult.valid) {
            // Fallback if no valid solution found
            return [{x: -50, y: 0}, {x: 50, y: 0}, {x: 25, y: 43}, {x: -25, y: 43}, {x: -50, y: 0}];
        }
        
        const verts = [bestResult.A, bestResult.B, bestResult.C, bestResult.D, bestResult.E];
        
        // Center around origin
        const cx = verts.reduce((s, v) => s + v.x, 0) / 5;
        const cy = verts.reduce((s, v) => s + v.y, 0) / 5;
        return verts.map(v => ({x: v.x - cx, y: v.y - cy}));
    })(),
    15: (function() {
        // Type 15: a=c=e, b=2a; angles: A=150°, B=60°, C=135°, D=105°, E=90°
        // Generate using the provided logic
        function generateType15Pentagon(size, centerX = 0, centerY = 0) {
            // 1. Define the geometry relative to Vertex E at (0,0)
            // We walk E -> A -> B -> C -> D -> E based on the angles.
            // Lengths: a=size, b=2*size, c=size, e=size.
            
            const s = size; 
            const sqrt3 = Math.sqrt(3);

            // Raw coordinates derived from the angles and side lengths:
            // We start with side DE on the x-axis, then rotate later to match the image.
            const E = { x: 0, y: 0 };
            const A = { x: 0, y: s }; // Angle E=90 implies A is vertical from E
            const B = { x: -s, y: s * (1 + sqrt3) }; // Derived from Angle A=150, Length b=2s
            const C = { x: -1.5 * s, y: s * (1 + sqrt3 / 2) }; // Derived from Angle B=60, Length c=s
            const D = { x: -s, y: 0 }; // Derived from geometry closing the loop
            
            // 2. Align the shape to match the image (Side CD horizontal at the bottom)
            // In raw coords, Vector CD is sloping down. We rotate by 75 degrees.
            const angleOffset = 75 * (Math.PI / 180); 
            const cosTheta = Math.cos(angleOffset);
            const sinTheta = Math.sin(angleOffset);

            const rawVerts = [A, B, C, D, E];
            
            const rotatedVerts = rawVerts.map(v => ({
                x: v.x * cosTheta - v.y * sinTheta,
                y: v.x * sinTheta + v.y * cosTheta
            }));

            // 3. Center the polygon on the requested coordinates
            // Find bounding box
            const minX = Math.min(...rotatedVerts.map(v => v.x));
            const maxX = Math.max(...rotatedVerts.map(v => v.x));
            const minY = Math.min(...rotatedVerts.map(v => v.y));
            const maxY = Math.max(...rotatedVerts.map(v => v.y));

            const currentCenterX = (minX + maxX) / 2;
            const currentCenterY = (minY + maxY) / 2;

            return rotatedVerts.map(v => ({
                x: v.x - currentCenterX + centerX,
                y: v.y - currentCenterY + centerY
            }));
        }
        
        // Generate with size 50, centered at origin
        return generateType15Pentagon(50, 0, 0);
    })()
};

const COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#FFA07A", "#98D8C8", "#F7DC6F", "#FFB347", "#9B59B6", "#E74C3C", "#3498DB", "#2ECC71", "#F39C12"];

// Resize handling
function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    draw();
}
window.addEventListener('resize', resize);
resize();

// Make canvas focusable for keyboard events
canvas.addEventListener('click', () => {
    canvas.focus();
});

// UI Handling
function setShape(type) {
    currentType = type;
    document.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    document.getElementById('btn' + type).classList.add('active');
}

// Input Handling
const keys = {};
window.addEventListener('keydown', (e) => {
    keys[e.key] = true;
    
    if (selectedShapeIndex !== -1) {
        if (e.key.toLowerCase() === 'f') {
            e.preventDefault(); // Prevent any default behavior
            // Flip horizontally (reflect across vertical axis)
            shapes[selectedShapeIndex].scaleX *= -1;
            draw();
        }
        if (e.key.toLowerCase() === 'c') {
            e.preventDefault(); // Prevent any default behavior
            // Cycle through colors
            const currentColor = shapes[selectedShapeIndex].color;
            const currentIndex = COLORS.indexOf(currentColor);
            const nextIndex = (currentIndex + 1) % COLORS.length;
            shapes[selectedShapeIndex].color = COLORS[nextIndex];
            draw();
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            shapes.splice(selectedShapeIndex, 1);
            selectedShapeIndex = -1;
            draw();
        }
    }
});
window.addEventListener('keyup', (e) => keys[e.key] = false);

canvas.addEventListener('mousedown', (e) => {
    const mx = e.clientX;
    const my = e.clientY;

    // Check if clicking existing shape (reverse order to pick top)
    let clickedIndex = -1;
    for (let i = shapes.length - 1; i >= 0; i--) {
        if (isPointInShape(mx, my, shapes[i])) {
            clickedIndex = i;
            break;
        }
    }

    if (clickedIndex !== -1) {
        // Select existing
        selectedShapeIndex = clickedIndex;
        // Move to top of stack
        const s = shapes.splice(clickedIndex, 1)[0];
        shapes.push(s);
        selectedShapeIndex = shapes.length - 1;
        
        isDragging = true;
        dragOffsetX = mx - s.x;
        dragOffsetY = my - s.y;
    } else {
        // Spawn new shape logic if not clicking existing
        // But usually dragging is better. Let's make click on empty space spawn.
        spawnShape(mx, my);
        isDragging = true; // Immediately start dragging the new one
        dragOffsetX = 0;
        dragOffsetY = 0;
    }
    draw();
});

// Snap threshold in pixels
const SNAP_THRESHOLD = 15;

// Get edges from vertices (array of {start, end} objects)
function getEdges(vertices) {
    const edges = [];
    for (let i = 0; i < vertices.length; i++) {
        edges.push({
            start: vertices[i],
            end: vertices[(i + 1) % vertices.length]
        });
    }
    return edges;
}

// Calculate distance from a point to a line segment
function pointToEdgeDistance(px, py, edge) {
    const {start, end} = edge;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length2 = dx * dx + dy * dy;
    
    if (length2 === 0) {
        // Edge is a point
        const distX = px - start.x;
        const distY = py - start.y;
        return Math.sqrt(distX * distX + distY * distY);
    }
    
    const t = Math.max(0, Math.min(1, ((px - start.x) * dx + (py - start.y) * dy) / length2));
    const projX = start.x + t * dx;
    const projY = start.y + t * dy;
    const distX = px - projX;
    const distY = py - projY;
    return Math.sqrt(distX * distX + distY * distY);
}

// Calculate distance between two edges (minimum distance between any two points)
function edgeToEdgeDistance(edge1, edge2) {
    // Check distance from each endpoint of edge1 to edge2
    const dist1 = pointToEdgeDistance(edge1.start.x, edge1.start.y, edge2);
    const dist2 = pointToEdgeDistance(edge1.end.x, edge1.end.y, edge2);
    const dist3 = pointToEdgeDistance(edge2.start.x, edge2.start.y, edge1);
    const dist4 = pointToEdgeDistance(edge2.end.x, edge2.end.y, edge1);
    
    return Math.min(dist1, dist2, dist3, dist4);
}

// Calculate edge length
function edgeLength(edge) {
    const dx = edge.end.x - edge.start.x;
    const dy = edge.end.y - edge.start.y;
    return Math.sqrt(dx * dx + dy * dy);
}

// Snap a tile to align with another tile
function snapTile(selectedShape, otherShapes) {
    if (otherShapes.length === 0) return false;
    
    const selectedVerts = getTransformedVertices(selectedShape);
    const selectedEdges = getEdges(selectedVerts);
    
    let bestSnap = null;
    let minDistance = SNAP_THRESHOLD;
    
    // Check against all other shapes
    for (const otherShape of otherShapes) {
        const otherVerts = getTransformedVertices(otherShape);
        const otherEdges = getEdges(otherVerts);
        
        // Check each edge of selected shape against each edge of other shape
        for (let i = 0; i < selectedEdges.length; i++) {
            const selEdge = selectedEdges[i];
            const selLength = edgeLength(selEdge);
            
            for (let j = 0; j < otherEdges.length; j++) {
                const otherEdge = otherEdges[j];
                const otherLength = edgeLength(otherEdge);
                
                // Only snap if edge lengths are similar (within 10%)
                if (Math.abs(selLength - otherLength) / Math.max(selLength, otherLength) > 0.1) {
                    continue;
                }
                
                const distance = edgeToEdgeDistance(selEdge, otherEdge);
                
                if (distance < minDistance) {
                    minDistance = distance;
                    // Calculate snap offset to align edges
                    // Simple approach: align the closest endpoints
                    const dist1 = Math.sqrt(
                        Math.pow(selEdge.start.x - otherEdge.end.x, 2) +
                        Math.pow(selEdge.start.y - otherEdge.end.y, 2)
                    );
                    const dist2 = Math.sqrt(
                        Math.pow(selEdge.end.x - otherEdge.start.x, 2) +
                        Math.pow(selEdge.end.y - otherEdge.start.y, 2)
                    );
                    const dist3 = Math.sqrt(
                        Math.pow(selEdge.start.x - otherEdge.start.x, 2) +
                        Math.pow(selEdge.start.y - otherEdge.start.y, 2)
                    );
                    const dist4 = Math.sqrt(
                        Math.pow(selEdge.end.x - otherEdge.end.x, 2) +
                        Math.pow(selEdge.end.y - otherEdge.end.y, 2)
                    );
                    
                    const minDist = Math.min(dist1, dist2, dist3, dist4);
                    let offsetX = 0, offsetY = 0;
                    
                    if (minDist === dist1) {
                        // Align selEdge.start with otherEdge.end
                        offsetX = otherEdge.end.x - selEdge.start.x;
                        offsetY = otherEdge.end.y - selEdge.start.y;
                    } else if (minDist === dist2) {
                        // Align selEdge.end with otherEdge.start
                        offsetX = otherEdge.start.x - selEdge.end.x;
                        offsetY = otherEdge.start.y - selEdge.end.y;
                    } else if (minDist === dist3) {
                        // Align selEdge.start with otherEdge.start
                        offsetX = otherEdge.start.x - selEdge.start.x;
                        offsetY = otherEdge.start.y - selEdge.start.y;
                    } else {
                        // Align selEdge.end with otherEdge.end
                        offsetX = otherEdge.end.x - selEdge.end.x;
                        offsetY = otherEdge.end.y - selEdge.end.y;
                    }
                    
                    bestSnap = {
                        offsetX: offsetX,
                        offsetY: offsetY
                    };
                }
            }
        }
    }
    
    if (bestSnap) {
        selectedShape.x += bestSnap.offsetX;
        selectedShape.y += bestSnap.offsetY;
        return true;
    }
    
    return false;
}

canvas.addEventListener('mousemove', (e) => {
    if (isDragging && selectedShapeIndex !== -1) {
        const selectedShape = shapes[selectedShapeIndex];
        
        // Update position
        selectedShape.x = e.clientX - dragOffsetX;
        selectedShape.y = e.clientY - dragOffsetY;
        
        // Try to snap to other tiles
        const otherShapes = shapes.filter((_, idx) => idx !== selectedShapeIndex);
        snapTile(selectedShape, otherShapes);
        
        draw();
    }
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault(); // Prevent page scrolling
    if (selectedShapeIndex !== -1) {
        // Rotate based on wheel direction
        // Negative deltaY means scrolling up (rotate counter-clockwise)
        // Positive deltaY means scrolling down (rotate clockwise)
        const rotationSpeed = 0.05;
        shapes[selectedShapeIndex].rotation -= e.deltaY * rotationSpeed * 0.01;
        draw();
    }
});

function spawnShape(x, y) {
    shapes.push({
        x: x,
        y: y,
        type: currentType,
        rotation: 0,
        scaleX: 1, // 1 or -1 for flip
        color: COLORS[shapes.length % COLORS.length],
        verts: SHAPE_DEFS[currentType]
    });
    selectedShapeIndex = shapes.length - 1;
}

// Collision Detection (Ray Casting)
function isPointInShape(px, py, shape) {
    // Transform point to local shape space is hard, easier to transform shape to world
    const transformedVerts = getTransformedVertices(shape);
    
    let inside = false;
    for (let i = 0, j = transformedVerts.length - 1; i < transformedVerts.length; j = i++) {
        const xi = transformedVerts[i].x, yi = transformedVerts[i].y;
        const xj = transformedVerts[j].x, yj = transformedVerts[j].y;
        
        const intersect = ((yi > py) !== (yj > py)) &&
            (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function getTransformedVertices(shape) {
    return shape.verts.map(v => {
        // Apply transformations in order: Flip, Rotate, Translate
        // 1. Flip horizontally (reflect across Y-axis)
        let tx = v.x * shape.scaleX;
        let ty = v.y;
        
        // 2. Rotate around origin
        const rad = shape.rotation;
        const rx = tx * Math.cos(rad) - ty * Math.sin(rad);
        const ry = tx * Math.sin(rad) + ty * Math.cos(rad);
        
        // 3. Translate to position
        return { x: rx + shape.x, y: ry + shape.y };
    });
}

// Main Loop
function loop() {
    if (selectedShapeIndex !== -1) {
        // Continuous rotation keys
        if (keys['q'] || keys['Q']) {
            shapes[selectedShapeIndex].rotation -= 0.05;
            draw();
        }
        if (keys['e'] || keys['E']) {
            shapes[selectedShapeIndex].rotation += 0.05;
            draw();
        }
    }
    requestAnimationFrame(loop);
}
loop();

// Drawing
function draw() {
    // Clear background
    ctx.fillStyle = '#f0f0f0';
    ctx.fillRect(0, 0, width, height);
    
    // Draw Grid
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let x=0; x<width; x+=50) { ctx.moveTo(x,0); ctx.lineTo(x,height); }
    for(let y=0; y<height; y+=50) { ctx.moveTo(0,y); ctx.lineTo(width,y); }
    ctx.stroke();

    // Draw Shapes
    shapes.forEach((s, index) => {
        const verts = getTransformedVertices(s);
        ctx.beginPath();
        ctx.moveTo(verts[0].x, verts[0].y);
        for (let i = 1; i < verts.length; i++) {
            ctx.lineTo(verts[i].x, verts[i].y);
        }
        ctx.closePath();

        ctx.fillStyle = s.color;
        // Add transparency
        ctx.globalAlpha = 0.8; 
        ctx.fill();
        
        // Selection highlight
        ctx.lineWidth = (index === selectedShapeIndex) ? 3 : 1;
        ctx.strokeStyle = (index === selectedShapeIndex) ? '#000' : '#444';
        ctx.globalAlpha = 1.0;
        ctx.stroke();

        // Draw orientation marker (to see flips)
        ctx.fillStyle = 'rgba(0,0,0,0.2)';
        ctx.beginPath();
        ctx.arc(verts[0].x, verts[0].y, 3, 0, Math.PI*2);
        ctx.fill();
    });
}

draw();

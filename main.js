// --- Canvas & Context ---
const canvas = document.getElementById('gearCanvas');
const ctx = canvas.getContext('2d');
const viewport = document.getElementById('viewport');

// --- State Variables ---
let params = { R: 80, Zp: 12, rp: 5, e: 4 };
let kinematics = 'STD'; // 'STD' (Fixed Pins) or 'RV' (Fixed Cycloid)
let rotationAngle = 0; // Input shaft angle

// Viewport State
let view = {
	scale: 3.5,     // Pixels per mm
	x: 0,           // Pan X
	y: 0,           // Pan Y
	isDragging: false,
	lastX: 0,
	lastY: 0
};

// --- UI References ---
const inputs = {
	R: document.getElementById('inp-R'),
	Zp: document.getElementById('inp-Zp'),
	rp: document.getElementById('inp-rp'),
	e: document.getElementById('inp-e')
};
const displays = {
	R: document.getElementById('val-R'),
	Zp: document.getElementById('val-Zp'),
	rp: document.getElementById('val-rp'),
	e: document.getElementById('val-e'),
	ratio: document.getElementById('disp-ratio'),
	k1: document.getElementById('disp-k1'),
	dir: document.getElementById('disp-dir'),
	warn: document.getElementById('warn-undercut'),
	modeDesc: document.getElementById('mode-desc'),
	scaleText: document.getElementById('scale-text'),
	scaleLine: document.getElementById('scale-line')
};

// --- Initialization ---
function resize() {
	canvas.width = viewport.clientWidth;
	canvas.height = viewport.clientHeight;
	view.x = canvas.width / 2;
	view.y = canvas.height / 2;
	draw();
}
window.addEventListener('resize', resize);

// --- Input Handling ---
function updateParams() {
	params.R = parseFloat(inputs.R.value);
	params.Zp = parseInt(inputs.Zp.value);
	params.rp = parseFloat(inputs.rp.value);
	params.e = parseFloat(inputs.e.value);

	// Update Text
	displays.R.textContent = params.R;
	displays.Zp.textContent = params.Zp;
	displays.rp.textContent = params.rp;
	displays.e.textContent = params.e;
	
	const Zc = params.Zp - 1;
	const K1 = (params.e * params.Zp) / params.R;
	
	displays.k1.textContent = K1.toFixed(3);

	// Logic for Ratio and Warnings based on Mode
	if (kinematics === 'STD') {
		displays.ratio.textContent = "1 : " + Zc;
		displays.dir.textContent = "反向 (Opposite)";
	} else {
		displays.ratio.textContent = "1 : " + params.Zp;
		displays.dir.textContent = "同向 (Same)";
	}

	// Warning Logic
	if (params.rp > (params.R/params.Zp) * 1.1 || K1 > 0.98) {
		displays.warn.style.display = 'block';
	} else {
		displays.warn.style.display = 'none';
	}
}

function setMode(mode) {
	kinematics = mode;
	document.getElementById('mode-std').className = mode === 'STD' ? 'mode-option active' : 'mode-option';
	document.getElementById('mode-rv').className = mode === 'RV' ? 'mode-option active' : 'mode-option';
	
	if(mode === 'STD') {
		displays.modeDesc.innerHTML = "殼體固定 (Fixed Pins)<br>輸出: 擺線輪 (Wobble)";
	} else {
		displays.modeDesc.innerHTML = "擺線輪固定相位 (Wobble)<br>輸出: 針輪殼體 (Housing)";
	}
	updateParams();
}

// --- Interactive View Logic ---
function resetView() {
	view.scale = 3.5; // Default "100%" roughly
	view.x = canvas.width / 2;
	view.y = canvas.height / 2;
}

canvas.addEventListener('wheel', (e) => {
	e.preventDefault();
	const zoomIntensity = 0.001;
	const delta = -e.deltaY * zoomIntensity;
	const newScale = Math.min(Math.max(0.5, view.scale * (1 + delta)), 20);
	
	// Zoom towards mouse pointer
	const mouseX = e.offsetX;
	const mouseY = e.offsetY;
	
	view.x = mouseX - (mouseX - view.x) * (newScale / view.scale);
	view.y = mouseY - (mouseY - view.y) * (newScale / view.scale);
	view.scale = newScale;
});

canvas.addEventListener('mousedown', (e) => {
	view.isDragging = true;
	view.lastX = e.clientX;
	view.lastY = e.clientY;
});

window.addEventListener('mousemove', (e) => {
	if (view.isDragging) {
		const dx = e.clientX - view.lastX;
		const dy = e.clientY - view.lastY;
		view.x += dx;
		view.y += dy;
		view.lastX = e.clientX;
		view.lastY = e.clientY;
	}
});

window.addEventListener('mouseup', () => { view.isDragging = false; });

// --- Mathematical Core ---
function getCycloidPoint(theta, R, Zp, rp, e) {
	// Parametric equations for equidistant epitrochoid
	const x0 = R * Math.cos(theta) - e * Math.cos(Zp * theta);
	const y0 = R * Math.sin(theta) - e * Math.sin(Zp * theta);
	
	const dxdt = -R * Math.sin(theta) + e * Zp * Math.sin(Zp * theta);
	const dydt = R * Math.cos(theta) - e * Zp * Math.cos(Zp * theta);
	
	const len = Math.sqrt(dxdt*dxdt + dydt*dydt);
	// Avoid division by zero
	if(len < 1e-6) return {x: x0, y:y0};

	// Inward offset normal vector
	const nx = -dydt / len;
	const ny = dxdt / len;

	return {
		x: x0 + rp * nx,
		y: y0 + rp * ny
	};
}

// --- Drawing Loop ---
function drawGrid() {
	const step = 10 * view.scale; // Grid every 10mm logical
	const w = canvas.width;
	const h = canvas.height;
	
	ctx.strokeStyle = '#333';
	ctx.lineWidth = 0.5;
	
	// Optimize: only draw visible lines
	// A simple background grid
	ctx.beginPath();
	// Just drawing crosshair at 0,0 for reference
	ctx.moveTo(-1000, 0); ctx.lineTo(1000, 0);
	ctx.moveTo(0, -1000); ctx.lineTo(0, 1000);
	ctx.stroke();
}

function updateScaleBar() {
	// Logic: Find a nice round number (1, 2, 5, 10, 20...) that fits in approx 60-100px
	const targetPixelWidth = 80;
	const mmPerPixel = 1 / view.scale;
	let rawMM = targetPixelWidth * mmPerPixel;
	
	// Round to nice interval
	const magnitude = Math.pow(10, Math.floor(Math.log10(rawMM)));
	const residual = rawMM / magnitude;
	let niceMM;
	if (residual > 5) niceMM = 10 * magnitude;
	else if (residual > 2) niceMM = 5 * magnitude;
	else niceMM = 2 * magnitude; // or 1
	
	const pixelWidth = niceMM * view.scale;
	
	displays.scaleText.textContent = niceMM + " mm";
	displays.scaleLine.style.width = pixelWidth + "px";
}

function draw() {
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	
	updateScaleBar();

	ctx.save();
	// Apply Viewport Transform
	ctx.translate(view.x, view.y);
	ctx.scale(view.scale, view.scale);
	// Note: Y axis is usually down in Canvas, standard CAD is Up.
	// Let's flip Y to make it CAD-like
	ctx.scale(1, -1);

	drawGrid();

	const { R, Zp, rp, e } = params;
	const Zc = Zp - 1;

	// --- Kinematics Logic ---
	
	// Base Rotation Speed
	// Let's say Input Shaft rotates at 1.0 rad/frame visual speed
	// Actually, we use 'rotationAngle' as input shaft angle theta_in
	
	let pinGroupAngle = 0;
	let discCenter = { x: 0, y: 0 };
	let discRotation = 0;

	if (kinematics === 'STD') {
		// FIXED PINS (Housing Fixed)
		pinGroupAngle = 0;
		
		// Disc Center orbits at radius 'e' with input angle
		discCenter.x = e * Math.cos(rotationAngle);
		discCenter.y = e * Math.sin(rotationAngle);
		
		// Disc Rotates opposite: theta_disc = - theta_in / Zc
		discRotation = -rotationAngle / Zc;

	} else {
		// FIXED CYCLOID (RV Mode)
		// Disc is static at 0,0
		discCenter.x = e * Math.cos(rotationAngle);
		discCenter.y = e * Math.sin(rotationAngle);
		discRotation = 0;

		// To achieve this relative motion:
		// The Pin Housing must rotate.
		// Speed relation: Omega_out = Omega_in * (Zc / Zp) ... wait.
		// Ratio is Zp. So Omega_out = Omega_in / Zp.
		// Direction: Same as input.
		pinGroupAngle = rotationAngle / Zp;
		
		// The eccentric shaft (visualized as the "bulge" or center offset of relative motion)
		// relative to the fixed disc is still rotating.
		// But visually, we just see the pins rotating around the static disc.
		// The "Force" point (contact) moves.
	}

	// 1. Draw Pins (Stator or Rotor depending on mode)
	ctx.save();
	ctx.rotate(pinGroupAngle);
	ctx.fillStyle = '#333';
	ctx.strokeStyle = '#666';
	ctx.lineWidth = 1/view.scale; // Constant hairline width
	
	// Draw Housing Circle (Visual aid)
	ctx.beginPath();
	ctx.arc(0, 0, R + rp + 5, 0, Math.PI*2);
	ctx.stroke();

	for(let i=0; i<Zp; i++) {
		const angle = (2 * Math.PI * i) / Zp;
		const px = R * Math.cos(angle);
		const py = R * Math.sin(angle);
		
		ctx.beginPath();
		ctx.arc(px, py, rp, 0, Math.PI*2);
		ctx.fill();
		ctx.stroke();
	}
	ctx.restore();

	// 2. Draw Cycloid Disc
	ctx.save();
	ctx.translate(discCenter.x, discCenter.y);
	ctx.rotate(discRotation);
	
	ctx.beginPath();
	ctx.strokeStyle = '#4db8ff';
	ctx.lineWidth = 2/view.scale; // Thicker line
	ctx.fillStyle = 'rgba(77, 184, 255, 0.15)';

	// Draw Profile
	const steps = 3600; 
	for(let i=0; i<=steps; i++) {
		const theta = (i / steps) * 2 * Math.PI;
		const p = getCycloidPoint(theta, R, Zp, rp, e);
		if(i===0) ctx.moveTo(p.x, p.y);
		else ctx.lineTo(p.x, p.y);
	}
	ctx.closePath();
	ctx.fill();
	ctx.stroke();

	// Draw Center / Input Shaft indicator
	// In STD mode, this center moves. In RV mode, it stays.
	// Let's draw the "Eccentric Bearing" hole
	ctx.beginPath();
	ctx.arc(0, 0, e + 2, 0, Math.PI*2); // Visual bearing
	ctx.strokeStyle = '#ffcc00';
	ctx.lineWidth = 1/view.scale;
	ctx.stroke();
	
	// Draw Reference Line on Disc to visualize rotation
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(R/2, 0);
	ctx.strokeStyle = 'rgba(255,255,255,0.3)';
	ctx.stroke();

	ctx.restore();

	// 3. Draw Eccentric Center Point (The Input Shaft Axis relative to World)
	// In STD mode: Input Shaft is at 0,0 (World).
	// In RV mode: Input Shaft is at 0,0 (World).
	// The visual representation of the "high point" of the cam:
	ctx.save();
	// The eccentric direction is always 'rotationAngle' relative to the rest frame logic
	// But in RV mode (Disc Fixed), the input shaft rotates at 'rotationAngle'.
	// In STD mode, input shaft rotates at 'rotationAngle'.
	// So we can draw a visual arrow for Input Shaft
	ctx.rotate(rotationAngle);
	ctx.beginPath();
	ctx.moveTo(0, 0);
	ctx.lineTo(e, 0); // Pointing to the eccentric offset
	ctx.strokeStyle = '#ffcc00';
	ctx.lineWidth = 2/view.scale;
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(0, 0, 1, 0, Math.PI*2);
	ctx.fillStyle = '#ffcc00';
	ctx.fill();
	ctx.restore();

	ctx.restore(); // End Viewport Transform

	rotationAngle += 0.02; // Animation Speed
	requestAnimationFrame(draw);
}

// --- Listeners ---
Object.values(inputs).forEach(input => {
	input.addEventListener('input', updateParams);
});

// Start
resize();
updateParams();
resetView();

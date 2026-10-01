/* ==========================================================================
   OCCUSENSE CORE APPLICATION STATE & LOGIC
   ========================================================================== */

// State variables
const state = {
    currentOccupancy: 0,
    maxCapacity: 100,
    warningThresholdPct: 80,
    totalInToday: 0,
    totalOutToday: 0,
    peakOccupancy: 0,
    peakTime: '--:--',
    turnAways: 0,
    hourlyData: {
        labels: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'],
        in: [12, 18, 25, 0, 0, 0, 0, 0],
        out: [4, 10, 10, 0, 0, 0, 0, 0]
    }
};

// Global variables for canvas and chart instances
let trafficChart = null;
let animatedDots = [];
let canvas = null;
let ctx = null;

// Wrap all DOM-dependent setup inside DOMContentLoaded
document.addEventListener('DOMContentLoaded', () => {

    // DOM Elements
    const currentOccupancyText = document.getElementById('currentOccupancyText');
    const maxCapDisplay = document.getElementById('maxCapDisplay');
    const occupancyStateBadge = document.getElementById('occupancyStateBadge');
    const capacityBar = document.getElementById('capacityBar');
    const capacityPercentText = document.getElementById('capacityPercentText');
    const totalInCount = document.getElementById('totalInCount');
    const totalOutCount = document.getElementById('totalOutCount');
    const peakOccupancyText = document.getElementById('peakOccupancyText');
    const peakTimeText = document.getElementById('peakTimeText');
    const turnAwayCount = document.getElementById('turnAwayCount');
    const statusBgGlow = document.getElementById('statusBgGlow');

    const btnIn = document.getElementById('btnIn');
    const btnOut = document.getElementById('btnOut');
    const resetCountBtn = document.getElementById('resetCountBtn');

    const maxCapInput = document.getElementById('maxCapInput');
    const applyCapBtn = document.getElementById('applyCapBtn');
    const warningRange = document.getElementById('warningRange');
    const warningRangeVal = document.getElementById('warningRangeVal');

    const logContainer = document.getElementById('logContainer');
    const liveClock = document.getElementById('liveClock');

    // Signage Elements
    const signageModal = document.getElementById('signageModal');
    const launchSignageBtn = document.getElementById('launchSignageBtn');
    const closeSignageBtn = document.getElementById('closeSignageBtn');
    const signageMainText = document.getElementById('signageMainText');
    const signageSubText = document.getElementById('signageSubText');
    const signageCurrentCount = document.getElementById('signageCurrentCount');
    const signageMaxCount = document.getElementById('signageMaxCount');
    const signageStatusIcon = document.getElementById('signageStatusIcon');
    const signageIconBox = document.getElementById('signageIconBox');

    // Canvas Setup
    canvas = document.getElementById('sensorCanvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }

    // Chart initialization helper
    function checkAndInitChart() {
        if (typeof Chart !== 'undefined') {
            const chartCanvas = document.getElementById('trafficChart');
            if (chartCanvas) {
                const chartCtx = chartCanvas.getContext('2d');
                trafficChart = new Chart(chartCtx, {
                    type: 'bar',
                    data: {
                        labels: state.hourlyData.labels,
                        datasets: [
                            {
                                label: 'Entries (IN)',
                                data: state.hourlyData.in,
                                backgroundColor: 'rgba(16, 185, 129, 0.6)',
                                borderColor: '#10b981',
                                borderWidth: 1.5,
                                borderRadius: 6
                            },
                            {
                                label: 'Exits (OUT)',
                                data: state.hourlyData.out,
                                backgroundColor: 'rgba(244, 63, 94, 0.6)',
                                borderColor: '#f43f5e',
                                borderWidth: 1.5,
                                borderRadius: 6
                            }
                        ]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                labels: {
                                    color: '#9ca3af',
                                    font: { family: 'Inter', size: 12 }
                                }
                            }
                        },
                        scales: {
                            x: {
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { color: '#9ca3af' }
                            },
                            y: {
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { color: '#9ca3af', stepSize: 5 }
                            }
                        }
                    }
                });
            }
        } else {
            setTimeout(checkAndInitChart, 200);
        }
    }

    // Update UI state
    function updateUI() {
        if (currentOccupancyText) currentOccupancyText.innerText = state.currentOccupancy;
        if (maxCapDisplay) maxCapDisplay.innerText = state.maxCapacity;
        if (totalInCount) totalInCount.innerText = state.totalInToday;
        if (totalOutCount) totalOutCount.innerText = state.totalOutToday;
        if (peakOccupancyText) peakOccupancyText.innerText = state.peakOccupancy;
        if (peakTimeText) peakTimeText.innerText = state.peakTime;
        if (turnAwayCount) turnAwayCount.innerText = state.turnAways;

        const pct = Math.min(100, Math.round((state.currentOccupancy / state.maxCapacity) * 100));
        if (capacityPercentText) capacityPercentText.innerText = `${pct}%`;
        if (capacityBar) capacityBar.style.width = `${pct}%`;

        const warningVal = (state.maxCapacity * state.warningThresholdPct) / 100;

        if (state.currentOccupancy >= state.maxCapacity) {
            if (capacityBar) capacityBar.className = "h-full bg-rose-500 rounded-full transition-all duration-300 shadow-lg shadow-rose-500/50";
            if (occupancyStateBadge) {
                occupancyStateBadge.className = "px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-rose-500/20 text-rose-400 border border-rose-500/30";
                occupancyStateBadge.innerText = "CRITICAL / AT MAX";
            }
            if (capacityPercentText) capacityPercentText.className = "font-mono font-bold text-rose-400";
            if (statusBgGlow) statusBgGlow.className = "absolute inset-0 bg-rose-500/10 transition-colors duration-500 pointer-events-none";

            if (signageModal) signageModal.className = signageModal.className.replace(/signage-bg-\w+/, '') + " signage-bg-danger";
            if (signageMainText) signageMainText.innerText = "PLEASE WAIT - MAXIMUM CAPACITY";
            if (signageSubText) signageSubText.innerText = "Venue has reached capacity limit. Please wait until occupants exit.";
            if (signageStatusIcon) signageStatusIcon.className = "fa-solid fa-hand text-7xl text-rose-400";
            if (signageIconBox) signageIconBox.className = "w-32 h-32 mx-auto rounded-full flex items-center justify-center bg-rose-500/20 backdrop-blur shadow-2xl transition-all duration-500 animate-pulse";
        } else if (state.currentOccupancy >= warningVal) {
            if (capacityBar) capacityBar.className = "h-full bg-amber-500 rounded-full transition-all duration-300 shadow-lg shadow-amber-500/50";
            if (occupancyStateBadge) {
                occupancyStateBadge.className = "px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-amber-500/20 text-amber-400 border border-amber-500/30";
                occupancyStateBadge.innerText = "WARNING / NEAR CAP";
            }
            if (capacityPercentText) capacityPercentText.className = "font-mono font-bold text-amber-400";
            if (statusBgGlow) statusBgGlow.className = "absolute inset-0 bg-amber-500/10 transition-colors duration-500 pointer-events-none";

            if (signageModal) signageModal.className = signageModal.className.replace(/signage-bg-\w+/, '') + " signage-bg-safe";
            if (signageMainText) signageMainText.innerText = "WELCOME - ENTRY PERMITTED";
            if (signageSubText) signageSubText.innerText = "Venue is reaching capacity. Please move efficiently.";
            if (signageStatusIcon) signageStatusIcon.className = "fa-solid fa-triangle-exclamation text-7xl text-amber-400";
            if (signageIconBox) signageIconBox.className = "w-32 h-32 mx-auto rounded-full flex items-center justify-center bg-amber-500/20 backdrop-blur shadow-2xl transition-all duration-500";
        } else {
            if (capacityBar) capacityBar.className = "h-full bg-emerald-500 rounded-full transition-all duration-300 shadow-lg shadow-emerald-500/50";
            if (occupancyStateBadge) {
                occupancyStateBadge.className = "px-3 py-1 rounded-full text-xs font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30";
                occupancyStateBadge.innerText = "OPTIMAL / SAFE";
            }
            if (capacityPercentText) capacityPercentText.className = "font-mono font-bold text-emerald-400";
            if (statusBgGlow) statusBgGlow.className = "absolute inset-0 bg-emerald-500/5 transition-colors duration-500 pointer-events-none";

            if (signageModal) signageModal.className = signageModal.className.replace(/signage-bg-\w+/, '') + " signage-bg-safe";
            if (signageMainText) signageMainText.innerText = "WELCOME - SAFE TO ENTER";
            if (signageSubText) signageSubText.innerText = "Current capacity limits permit entry. Enjoy your visit.";
            if (signageStatusIcon) signageStatusIcon.className = "fa-solid fa-circle-check text-7xl text-emerald-400";
            if (signageIconBox) signageIconBox.className = "w-32 h-32 mx-auto rounded-full flex items-center justify-center bg-emerald-500/20 backdrop-blur shadow-2xl transition-all duration-500";
        }

        if (signageCurrentCount) signageCurrentCount.innerText = state.currentOccupancy;
        if (signageMaxCount) signageMaxCount.innerText = state.maxCapacity;
    }

    // Record Entry
    function registerEntry() {
        if (state.currentOccupancy >= state.maxCapacity) {
            state.turnAways++;
            addLog('ENTRY BLOCKED', 'Door A', 'Capacity Limit Exceeded', 'rose');
            showToast('Entry Blocked: Maximum Capacity Reached!', 'error');
            updateUI();
            return;
        }

        state.currentOccupancy++;
        state.totalInToday++;

        if (state.currentOccupancy > state.peakOccupancy) {
            state.peakOccupancy = state.currentOccupancy;
            state.peakTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        if (trafficChart) {
            state.hourlyData.in[2] += 1;
            trafficChart.update();
        }

        addLog('PERSON ENTERED', 'Entrance Gate A', `Occupancy: ${state.currentOccupancy}`, 'emerald');
        spawnCanvasDot('IN');

        if (state.currentOccupancy === state.maxCapacity) {
            showToast('Warning: Venue has reached 100% Maximum Capacity!', 'error');
        }

        updateUI();
    }

    // Record Exit
    function registerExit() {
        if (state.currentOccupancy <= 0) {
            showToast('Occupancy is already at 0', 'info');
            return;
        }

        state.currentOccupancy--;
        state.totalOutToday++;

        if (trafficChart) {
            state.hourlyData.out[2] += 1;
            trafficChart.update();
        }

        addLog('PERSON EXITED', 'Exit Gate A', `Occupancy: ${state.currentOccupancy}`, 'amber');
        spawnCanvasDot('OUT');

        updateUI();
    }

    // Add item to directional log feed
    function addLog(action, location, detail, color = 'emerald') {
        if (!logContainer) return;
        const timeStr = new Date().toLocaleTimeString();
        const colorMap = {
            emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
            amber: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
            rose: 'text-rose-400 border-rose-500/30 bg-rose-500/5'
        };

        const html = `
            <div class="p-2.5 rounded-xl border ${colorMap[color]} flex items-center justify-between transition">
                <div class="flex items-center space-x-2">
                    <i class="fa-solid ${color === 'rose' ? 'fa-ban' : color === 'emerald' ? 'fa-arrow-right-to-bracket' : 'fa-arrow-right-from-bracket'}"></i>
                    <div>
                        <span class="font-bold block">${action}</span>
                        <span class="text-[10px] text-gray-400 block">${location} • ${detail}</span>
                    </div>
                </div>
                <span class="text-[10px] text-gray-500">${timeStr}</span>
            </div>
        `;

        logContainer.insertAdjacentHTML('afterbegin', html);
    }

    // Toast Notification System
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        const bgClass = type === 'error' ? 'bg-rose-600 text-white' : 'bg-gray-800 text-gray-100 border border-gray-700';

        toast.className = `px-4 py-3 rounded-xl shadow-2xl flex items-center space-x-3 text-xs font-semibold ${bgClass} transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto`;
        toast.innerHTML = `
            <i class="fa-solid ${type === 'error' ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i>
            <span>${message}</span>
        `;

        const container = document.getElementById('toastContainer');
        if (container) {
            container.appendChild(toast);
            setTimeout(() => { toast.classList.remove('translate-y-2', 'opacity-0'); }, 10);
            setTimeout(() => {
                toast.classList.add('opacity-0', 'translate-y-2');
                setTimeout(() => toast.remove(), 300);
            }, 3500);
        }
    }

    // Canvas Helpers
    function resizeCanvas() {
        if (!canvas) return;
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    }

    function spawnCanvasDot(direction) {
        if (!canvas) return;
        const isEntry = direction === 'IN';
        animatedDots.push({
            x: isEntry ? 30 : canvas.width - 30,
            y: canvas.height / 2 + (Math.random() * 40 - 20),
            targetX: isEntry ? canvas.width - 30 : 30,
            speed: 3 + Math.random() * 2,
            color: isEntry ? '#10b981' : '#f43f5e',
            dir: direction
        });
    }

    function drawSensorCanvas() {
        if (!canvas || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // Grid Lines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.lineWidth = 1;
        const gridSize = 20;
        for (let x = 0; x < canvas.width; x += gridSize) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += gridSize) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
        }

        // Trigger Lines
        const inLineX = canvas.width * 0.35;
        ctx.strokeStyle = 'rgba(16, 185, 129, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(inLineX, 20); ctx.lineTo(inLineX, canvas.height - 20); ctx.stroke();
        ctx.fillStyle = '#10b981'; ctx.font = '10px JetBrains Mono'; ctx.fillText('TRIGGER LINE: IN', inLineX - 45, 15);

        const outLineX = canvas.width * 0.65;
        ctx.strokeStyle = 'rgba(244, 63, 94, 0.6)';
        ctx.beginPath(); ctx.moveTo(outLineX, 20); ctx.lineTo(outLineX, canvas.height - 20); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = '#f43f5e'; ctx.fillText('TRIGGER LINE: OUT', outLineX - 45, 15);

        // Animate Dots
        for (let i = animatedDots.length - 1; i >= 0; i--) {
            const dot = animatedDots[i];
            if (dot.dir === 'IN') {
                dot.x += dot.speed;
                if (dot.x >= dot.targetX) animatedDots.splice(i, 1);
            } else {
                dot.x -= dot.speed;
                if (dot.x <= dot.targetX) animatedDots.splice(i, 1);
            }

            ctx.beginPath();
            ctx.arc(dot.x, dot.y, 6, 0, Math.PI * 2);
            ctx.fillStyle = dot.color;
            ctx.shadowColor = dot.color;
            ctx.shadowBlur = 10;
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        requestAnimationFrame(drawSensorCanvas);
    }

    // Attach Event Listeners
    if (btnIn) btnIn.addEventListener('click', registerEntry);
    if (btnOut) btnOut.addEventListener('click', registerExit);

    window.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        if (e.key === '+' || e.key === '=') registerEntry();
        if (e.key === '-' || e.key === '_') registerExit();
    });

    if (applyCapBtn) {
        applyCapBtn.addEventListener('click', () => {
            const val = parseInt(maxCapInput.value, 10);
            if (val && val > 0) {
                state.maxCapacity = val;
                updateUI();
                showToast(`Max Capacity set to ${val}`);
            }
        });
    }

    if (warningRange) {
        warningRange.addEventListener('input', (e) => {
            state.warningThresholdPct = parseInt(e.target.value, 10);
            if (warningRangeVal) warningRangeVal.innerText = `${state.warningThresholdPct}%`;
            updateUI();
        });
    }

    const q50 = document.getElementById('quickPreset50');
    const q100 = document.getElementById('quickPreset100');
    const q250 = document.getElementById('quickPreset250');
    if (q50) q50.addEventListener('click', () => { if (maxCapInput) maxCapInput.value = 50; if (applyCapBtn) applyCapBtn.click(); });
    if (q100) q100.addEventListener('click', () => { if (maxCapInput) maxCapInput.value = 100; if (applyCapBtn) applyCapBtn.click(); });
    if (q250) q250.addEventListener('click', () => { if (maxCapInput) maxCapInput.value = 250; if (applyCapBtn) applyCapBtn.click(); });

    if (resetCountBtn) {
        resetCountBtn.addEventListener('click', () => {
            state.currentOccupancy = 0;
            updateUI();
            showToast('Current occupancy reset to 0');
        });
    }

    if (launchSignageBtn && signageModal) {
        launchSignageBtn.addEventListener('click', () => signageModal.classList.remove('hidden'));
    }
    if (closeSignageBtn && signageModal) {
        closeSignageBtn.addEventListener('click', () => signageModal.classList.add('hidden'));
    }

    // Clock Interval
    if (liveClock) {
        setInterval(() => {
            liveClock.innerText = new Date().toLocaleTimeString();
        }, 1000);
    }

    // Initial Execution Steps
    checkAndInitChart();
    updateUI();
    if (canvas) drawSensorCanvas();
    addLog('SYSTEM STARTED', 'Main Sensor Gate A', 'Optical Sensor Active', 'emerald');
});
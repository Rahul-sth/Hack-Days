/* ==========================================================================
   OCCUSENSE CORE APPLICATION STATE & LOGIC (WITH FULL PERSISTENCE)
   ========================================================================== */

// Default state structure including activity logs
const defaultState = {
    currentOccupancy: 0,
    maxCapacity: 100,
    warningThresholdPct: 80,
    totalInToday: 0,
    totalOutToday: 0,
    peakOccupancy: 0,
    peakTime: '--:--',
    turnAways: 0,
    visitors: [], // Stores logged visitor objects { id, name, time, status }
    activityLogs: [], // Stores log objects { id, action, location, detail, color, timeStr }
    hourlyData: {
        labels: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00'],
        in: [12, 18, 25, 0, 0, 0, 0, 0],
        out: [4, 10, 10, 0, 0, 0, 0, 0]
    }
};

// Load saved state from LocalStorage or initialize default
let state = loadState();

function loadState() {
    try {
        const saved = localStorage.getItem('occuSense_data');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (!parsed.activityLogs) parsed.activityLogs = [];
            return parsed;
        }
    } catch (e) {
        console.error("Could not load saved state from localStorage", e);
    }
    return JSON.parse(JSON.stringify(defaultState));
}

function saveState() {
    try {
        localStorage.setItem('occuSense_data', JSON.stringify(state));
    } catch (e) {
        console.error("Could not save state to localStorage", e);
    }
}

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

    const visitorNameInput = document.getElementById('visitorNameInput');
    const btnIn = document.getElementById('btnIn');
    const btnOut = document.getElementById('btnOut');
    const resetCountBtn = document.getElementById('resetCountBtn');

    const visitorTableBody = document.getElementById('visitorTableBody');
    const visitorCountBadge = document.getElementById('visitorCountBadge');
    const clearVisitorsBtn = document.getElementById('clearVisitorsBtn');

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

    // Sync input fields with restored settings
    if (maxCapInput) maxCapInput.value = state.maxCapacity;
    if (warningRange) warningRange.value = state.warningThresholdPct;
    if (warningRangeVal) warningRangeVal.innerText = `${state.warningThresholdPct}%`;

    // Canvas Setup
    canvas = document.getElementById('sensorCanvas');
    if (canvas) {
        ctx = canvas.getContext('2d');
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }

    // Render Saved Activity Feed
    function renderActivityLogs() {
        if (!logContainer) return;

        if (!state.activityLogs || state.activityLogs.length === 0) {
            logContainer.innerHTML = '';
            return;
        }

        const colorMap = {
            emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
            amber: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
            rose: 'text-rose-400 border-rose-500/30 bg-rose-500/5'
        };

        logContainer.innerHTML = state.activityLogs.map(log => `
            <div class="p-2.5 rounded-xl border ${colorMap[log.color] || colorMap.emerald} flex items-center justify-between transition">
                <div class="flex items-center space-x-2">
                    <i class="fa-solid ${log.color === 'rose' ? 'fa-ban' : log.color === 'emerald' ? 'fa-arrow-right-to-bracket' : 'fa-arrow-right-from-bracket'}"></i>
                    <div>
                        <span class="font-bold block">${log.action}</span>
                        <span class="text-[10px] text-gray-400 block">${log.location} • ${log.detail}</span>
                    </div>
                </div>
                <span class="text-[10px] text-gray-500">${log.timeStr}</span>
            </div>
        `).join('');
    }

    // Add item to directional log feed and persist it
    function addLog(action, location, detail, color = 'emerald') {
        const logEntry = {
            id: Date.now(),
            action,
            location,
            detail,
            color,
            timeStr: new Date().toLocaleTimeString()
        };

        // Keep last 50 log items to prevent memory bloat
        state.activityLogs.unshift(logEntry);
        if (state.activityLogs.length > 50) {
            state.activityLogs.pop();
        }

        saveState();
        renderActivityLogs();
    }

    // Render Visitor Directory Table
    function renderVisitorTable() {
        if (!visitorTableBody) return;

        if (!state.visitors || state.visitors.length === 0) {
            visitorTableBody.innerHTML = `
                <tr id="noVisitorsRow">
                    <td colspan="5" class="py-8 text-center text-gray-500 font-sans">
                        <i class="fa-solid fa-user-clock text-2xl block mb-2 opacity-50"></i>
                        No entries registered yet. Enter a visitor's name above to start tracking.
                    </td>
                </tr>
            `;
            if (visitorCountBadge) visitorCountBadge.innerText = '0';
            return;
        }

        if (visitorCountBadge) visitorCountBadge.innerText = state.visitors.length;

        visitorTableBody.innerHTML = state.visitors.map((visitor, index) => {
            const statusBadge = visitor.status === 'ACTIVE' 
                ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Inside Venue</span>`
                : `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">Blocked (Cap Full)</span>`;

            return `
                <tr class="hover:bg-gray-800/30 transition">
                    <td class="py-3 px-4 font-mono text-gray-400">${state.visitors.length - index}</td>
                    <td class="py-3 px-4 font-bold text-gray-100 flex items-center space-x-2">
                        <i class="fa-solid fa-circle-user text-brand-400 text-sm"></i>
                        <span>${visitor.name}</span>
                    </td>
                    <td class="py-3 px-4 font-mono text-gray-300">${visitor.time}</td>
                    <td class="py-3 px-4">${statusBadge}</td>
                    <td class="py-3 px-4 text-right">
                        <button onclick="removeVisitor(${visitor.id})" class="px-2 py-1 text-gray-400 hover:text-rose-400 hover:bg-rose-500/10 rounded transition" title="Remove Entry">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Expose removeVisitor to global window object
    window.removeVisitor = function(id) {
        state.visitors = state.visitors.filter(v => v.id !== id);
        saveState();
        renderVisitorTable();
        showToast('Visitor entry removed from list', 'info');
    };

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
        let name = visitorNameInput ? visitorNameInput.value.trim() : '';

        if (!name) {
            name = prompt("Please enter the visitor's name to process entry:");
            if (!name || name.trim() === '') {
                showToast('Entry cancelled: Name is required.', 'error');
                return;
            }
            name = name.trim();
        }

        const timeStr = new Date().toLocaleTimeString();

        if (state.currentOccupancy >= state.maxCapacity) {
            state.turnAways++;
            
            state.visitors.unshift({
                id: Date.now(),
                name: name,
                time: timeStr,
                status: 'BLOCKED'
            });

            addLog('ENTRY BLOCKED', `Visitor: ${name}`, 'Capacity Limit Exceeded', 'rose');
            showToast(`Entry Blocked for ${name}: Max Capacity Reached!`, 'error');
            if (visitorNameInput) visitorNameInput.value = '';
            saveState();
            renderVisitorTable();
            updateUI();
            return;
        }

        state.currentOccupancy++;
        state.totalInToday++;

        state.visitors.unshift({
            id: Date.now(),
            name: name,
            time: timeStr,
            status: 'ACTIVE'
        });

        if (state.currentOccupancy > state.peakOccupancy) {
            state.peakOccupancy = state.currentOccupancy;
            state.peakTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        if (trafficChart) {
            state.hourlyData.in[2] += 1;
            trafficChart.update();
        }

        addLog('PERSON ENTERED', `Visitor: ${name}`, `Occupancy: ${state.currentOccupancy}`, 'emerald');
        spawnCanvasDot('IN');
        showToast(`Welcome, ${name}! Entry registered.`, 'info');

        if (visitorNameInput) visitorNameInput.value = '';

        if (state.currentOccupancy === state.maxCapacity) {
            showToast('Warning: Venue has reached 100% Maximum Capacity!', 'error');
        }

        saveState();
        renderVisitorTable();
        updateUI();
    }

    // Record Exit & Remove Visitor
    function registerExit() {
        if (state.currentOccupancy <= 0) {
            showToast('Occupancy is already at 0', 'info');
            return;
        }

        let inputName = visitorNameInput ? visitorNameInput.value.trim() : '';
        let targetIndex = -1;
        let removedVisitorName = 'Anonymous Visitor';

        if (inputName) {
            targetIndex = state.visitors.findIndex(
                v => v.name.toLowerCase() === inputName.toLowerCase() && v.status === 'ACTIVE'
            );
        }

        if (targetIndex === -1) {
            for (let i = state.visitors.length - 1; i >= 0; i--) {
                if (state.visitors[i].status === 'ACTIVE') {
                    targetIndex = i;
                    break;
                }
            }
        }

        if (targetIndex !== -1) {
            removedVisitorName = state.visitors[targetIndex].name;
            state.visitors.splice(targetIndex, 1);
        }

        state.currentOccupancy--;
        state.totalOutToday++;

        if (trafficChart) {
            state.hourlyData.out[2] += 1;
            trafficChart.update();
        }

        addLog('PERSON EXITED', `Visitor: ${removedVisitorName}`, `Occupancy: ${state.currentOccupancy}`, 'amber');
        spawnCanvasDot('OUT');
        showToast(`${removedVisitorName} has exited and was removed from the list.`, 'info');

        if (visitorNameInput) visitorNameInput.value = '';

        saveState();
        renderVisitorTable();
        updateUI();
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

    if (visitorNameInput) {
        visitorNameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                registerEntry();
            }
        });
    }

    if (clearVisitorsBtn) {
        clearVisitorsBtn.addEventListener('click', () => {
            state.visitors = [];
            saveState();
            renderVisitorTable();
            showToast('Visitor directory cleared', 'info');
        });
    }

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
                saveState();
                updateUI();
                showToast(`Max Capacity set to ${val}`);
            }
        });
    }

    if (warningRange) {
        warningRange.addEventListener('input', (e) => {
            state.warningThresholdPct = parseInt(e.target.value, 10);
            if (warningRangeVal) warningRangeVal.innerText = `${state.warningThresholdPct}%`;
            saveState();
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
            saveState();
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
    renderVisitorTable();
    renderActivityLogs();
    updateUI();
    if (canvas) drawSensorCanvas();

    // Log initial page session start if feed is empty
    if (state.activityLogs.length === 0) {
        addLog('SYSTEM STARTED', 'Main Sensor Gate A', 'Optical Sensor Active', 'emerald');
    }
});
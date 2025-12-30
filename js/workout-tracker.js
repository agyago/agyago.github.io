/**
 * Workout Tracker PWA
 * Uses GitHub OAuth (same as upload page)
 * Data stored in IndexedDB (local to device)
 */

// ============================================
// DATABASE CONFIGURATION
// ============================================

const DB_NAME = 'WorkoutTrackerDB';
const DB_VERSION = 1;
const STORES = {
    workouts: 'workouts',
    exercises: 'exercises',
    settings: 'settings'
};

const DEFAULT_EXERCISES = [
    'Bench Press',
    'Squat',
    'Deadlift',
    'Overhead Press',
    'Barbell Row',
    'Pull-ups',
    'Dips',
    'Bicep Curl',
    'Tricep Extension',
    'Lat Pulldown',
    'Leg Press',
    'Leg Curl',
    'Leg Extension',
    'Calf Raise',
    'Plank',
    'Romanian Deadlift',
    'Lunges',
    'Face Pull',
    'Lateral Raise',
    'Cable Fly'
];

// ============================================
// APP STATE
// ============================================

let db = null;
let chart = null;
let settings = {
    unit: 'kg'
};
let currentUser = null;

// ============================================
// INDEXEDDB OPERATIONS
// ============================================

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            if (!database.objectStoreNames.contains(STORES.workouts)) {
                const workoutStore = database.createObjectStore(STORES.workouts, { 
                    keyPath: 'id', 
                    autoIncrement: true 
                });
                workoutStore.createIndex('date', 'date', { unique: false });
                workoutStore.createIndex('exercise', 'exercise', { unique: false });
            }

            if (!database.objectStoreNames.contains(STORES.exercises)) {
                database.createObjectStore(STORES.exercises, { keyPath: 'name' });
            }

            if (!database.objectStoreNames.contains(STORES.settings)) {
                database.createObjectStore(STORES.settings, { keyPath: 'key' });
            }
        };
    });
}

function dbTransaction(storeName, mode = 'readonly') {
    return db.transaction(storeName, mode).objectStore(storeName);
}

function dbAdd(storeName, data) {
    return new Promise((resolve, reject) => {
        const store = dbTransaction(storeName, 'readwrite');
        const request = store.add(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dbPut(storeName, data) {
    return new Promise((resolve, reject) => {
        const store = dbTransaction(storeName, 'readwrite');
        const request = store.put(data);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dbGet(storeName, key) {
    return new Promise((resolve, reject) => {
        const store = dbTransaction(storeName);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dbGetAll(storeName) {
    return new Promise((resolve, reject) => {
        const store = dbTransaction(storeName);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function dbDelete(storeName, key) {
    return new Promise((resolve, reject) => {
        const store = dbTransaction(storeName, 'readwrite');
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

function dbClear(storeName) {
    return new Promise((resolve, reject) => {
        const store = dbTransaction(storeName, 'readwrite');
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// ============================================
// DATA OPERATIONS
// ============================================

async function initializeData() {
    const savedSettings = await dbGet(STORES.settings, 'userSettings');
    if (savedSettings) {
        settings = { ...settings, ...savedSettings.value };
    } else {
        await dbPut(STORES.settings, { key: 'userSettings', value: settings });
    }

    const exercises = await dbGetAll(STORES.exercises);
    if (exercises.length === 0) {
        for (const name of DEFAULT_EXERCISES) {
            await dbAdd(STORES.exercises, { name });
        }
    }

    updateWeightUnit();
}

async function saveSettings() {
    await dbPut(STORES.settings, { key: 'userSettings', value: settings });
}

async function getExercises() {
    const exercises = await dbGetAll(STORES.exercises);
    return exercises.sort((a, b) => a.name.localeCompare(b.name));
}

async function addExercise(name) {
    const trimmed = name.trim();
    if (!trimmed) return false;
    
    const existing = await dbGet(STORES.exercises, trimmed);
    if (existing) return false;
    
    await dbAdd(STORES.exercises, { name: trimmed });
    return true;
}

async function deleteExercise(name) {
    await dbDelete(STORES.exercises, name);
}

async function addWorkout(workout) {
    workout.timestamp = Date.now();
    return dbAdd(STORES.workouts, workout);
}

async function deleteWorkout(id) {
    await dbDelete(STORES.workouts, id);
}

async function getWorkouts(options = {}) {
    const allWorkouts = await dbGetAll(STORES.workouts);
    let filtered = allWorkouts;

    if (options.exercise) {
        filtered = filtered.filter(w => w.exercise === options.exercise);
    }

    if (options.days && options.days !== 'all') {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - parseInt(options.days));
        cutoff.setHours(0, 0, 0, 0);
        filtered = filtered.filter(w => new Date(w.date) >= cutoff);
    }

    filtered.sort((a, b) => {
        const dateComp = new Date(b.date) - new Date(a.date);
        if (dateComp !== 0) return dateComp;
        return b.timestamp - a.timestamp;
    });

    return filtered;
}

async function getTodayWorkouts() {
    const today = new Date().toISOString().split('T')[0];
    const allWorkouts = await dbGetAll(STORES.workouts);
    return allWorkouts
        .filter(w => w.date === today)
        .sort((a, b) => b.timestamp - a.timestamp);
}

async function exportData() {
    const workouts = await dbGetAll(STORES.workouts);
    const exercises = await dbGetAll(STORES.exercises);
    
    const data = {
        version: 1,
        exportDate: new Date().toISOString(),
        settings: { unit: settings.unit },
        exercises: exercises.map(e => e.name),
        workouts: workouts
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workout-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function importData(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                if (!data.workouts || !data.exercises) {
                    throw new Error('Invalid backup file');
                }

                await dbClear(STORES.workouts);
                await dbClear(STORES.exercises);

                for (const name of data.exercises) {
                    await dbAdd(STORES.exercises, { name });
                }

                for (const workout of data.workouts) {
                    const { id, ...workoutData } = workout;
                    await dbAdd(STORES.workouts, workoutData);
                }

                if (data.settings?.unit) {
                    settings.unit = data.settings.unit;
                    await saveSettings();
                }

                resolve(data.workouts.length);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

async function clearAllData() {
    await dbClear(STORES.workouts);
    await dbClear(STORES.exercises);
    
    for (const name of DEFAULT_EXERCISES) {
        await dbAdd(STORES.exercises, { name });
    }
}

// ============================================
// UI HELPERS
// ============================================

function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return document.querySelectorAll(selector);
}

function showToast(message, type = 'success') {
    const toast = $('#wt-toast');
    toast.textContent = message;
    toast.className = `wt-toast ${type}`;
    toast.offsetHeight; // Force reflow
    toast.classList.add('show');
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function formatDate(dateStr) {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.getTime() === today.getTime()) {
        return 'Today';
    } else if (date.getTime() === yesterday.getTime()) {
        return 'Yesterday';
    } else {
        return date.toLocaleDateString('en-GB', { 
            weekday: 'short', 
            day: 'numeric', 
            month: 'short' 
        });
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function updateWeightUnit() {
    const unitEl = $('#wt-weight-unit');
    if (unitEl) unitEl.textContent = settings.unit;
    
    const selectEl = $('#wt-unit-select');
    if (selectEl) selectEl.value = settings.unit;
}

// ============================================
// AUTHENTICATION
// ============================================

async function checkAuth() {
    try {
        const response = await fetch('/api/auth/status');
        if (response.ok) {
            const data = await response.json();
            if (data.authenticated) {
                currentUser = data.username;
                showApp();
                return true;
            }
        }
    } catch (error) {
        console.error('Auth check failed:', error);
    }
    showAuth();
    return false;
}

function showAuth() {
    $('#auth-section').style.display = 'flex';
    $('#app-section').style.display = 'none';
}

function showApp() {
    $('#auth-section').style.display = 'none';
    $('#app-section').style.display = 'block';
    $('#wt-username').textContent = currentUser;
    initApp();
}

async function workoutLogout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        location.reload();
    } catch (error) {
        showToast('Logout failed', 'error');
    }
}

// Make logout available globally
window.workoutLogout = workoutLogout;

// ============================================
// TAB NAVIGATION
// ============================================

function initTabs() {
    const tabs = $$('.wt-tab');
    const contents = $$('.wt-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            tab.classList.add('active');
            $(`#tab-${tabId}`).classList.add('active');
            
            if (tabId === 'history') refreshHistory();
            if (tabId === 'progress') refreshProgress();
            if (tabId === 'settings') refreshExerciseList();
        });
    });
}

// ============================================
// LOG TAB
// ============================================

async function initLogTab() {
    const dateInput = $('#wt-date');
    dateInput.value = new Date().toISOString().split('T')[0];

    await refreshExerciseDropdowns();

    $('#wt-log-btn').addEventListener('click', async () => {
        const exercise = $('#wt-exercise').value;
        const weight = parseFloat($('#wt-weight').value);
        const reps = parseInt($('#wt-reps').value);
        const sets = parseInt($('#wt-sets').value);
        const date = $('#wt-date').value;
        const notes = $('#wt-notes').value.trim();

        if (!exercise) {
            showToast('Select an exercise', 'error');
            return;
        }
        if (isNaN(weight) || weight <= 0) {
            showToast('Enter valid weight', 'error');
            return;
        }
        if (isNaN(reps) || reps <= 0) {
            showToast('Enter valid reps', 'error');
            return;
        }
        if (isNaN(sets) || sets <= 0) {
            showToast('Enter valid sets', 'error');
            return;
        }

        await addWorkout({
            exercise,
            weight,
            reps,
            sets,
            date,
            notes,
            unit: settings.unit
        });

        $('#wt-weight').value = '';
        $('#wt-reps').value = '';
        $('#wt-sets').value = '';
        $('#wt-notes').value = '';

        showToast('Workout logged! 💪');
        refreshTodayWorkouts();
    });

    $('#wt-add-exercise-btn').addEventListener('click', openModal);

    refreshTodayWorkouts();
}

async function refreshTodayWorkouts() {
    const container = $('#wt-today-list');
    const workouts = await getTodayWorkouts();

    if (workouts.length === 0) {
        container.innerHTML = '<div class="wt-empty">No workouts logged today</div>';
        return;
    }

    container.innerHTML = workouts.map(w => `
        <div class="wt-workout-item" data-id="${w.id}">
            <div class="wt-workout-main">
                <div class="wt-workout-exercise">${escapeHtml(w.exercise)}</div>
                <div class="wt-workout-details">
                    <span><strong>${w.weight}</strong> ${w.unit || settings.unit}</span>
                    <span><strong>${w.reps}</strong> reps</span>
                    <span><strong>${w.sets}</strong> sets</span>
                </div>
                ${w.notes ? `<div class="wt-workout-notes">${escapeHtml(w.notes)}</div>` : ''}
            </div>
            <button class="wt-delete-btn" title="Delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                </svg>
            </button>
        </div>
    `).join('');

    container.querySelectorAll('.wt-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const item = e.target.closest('.wt-workout-item');
            const id = parseInt(item.dataset.id);
            if (confirm('Delete this workout?')) {
                await deleteWorkout(id);
                showToast('Deleted');
                refreshTodayWorkouts();
            }
        });
    });
}

async function refreshExerciseDropdowns() {
    const exercises = await getExercises();
    const options = exercises.map(e => 
        `<option value="${escapeHtml(e.name)}">${escapeHtml(e.name)}</option>`
    ).join('');

    $('#wt-exercise').innerHTML = '<option value="">Select exercise...</option>' + options;
    $('#wt-history-exercise').innerHTML = '<option value="">All exercises</option>' + options;
    $('#wt-progress-exercise').innerHTML = '<option value="">Select exercise...</option>' + options;
}

// ============================================
// HISTORY TAB
// ============================================

function initHistoryTab() {
    $('#wt-history-exercise').addEventListener('change', refreshHistory);
    $('#wt-history-period').addEventListener('change', refreshHistory);
}

async function refreshHistory() {
    const container = $('#wt-history-list');
    const exercise = $('#wt-history-exercise').value;
    const days = $('#wt-history-period').value;

    const workouts = await getWorkouts({ exercise, days });

    if (workouts.length === 0) {
        container.innerHTML = '<div class="wt-empty">No workouts found</div>';
        return;
    }

    const grouped = {};
    workouts.forEach(w => {
        if (!grouped[w.date]) grouped[w.date] = [];
        grouped[w.date].push(w);
    });

    container.innerHTML = Object.entries(grouped).map(([date, dayWorkouts]) => `
        <div class="wt-history-day">
            <div class="wt-history-date">
                ${formatDate(date)}
                <span class="wt-date-badge">${dayWorkouts.length}</span>
            </div>
            <div class="wt-workout-list">
                ${dayWorkouts.map(w => `
                    <div class="wt-workout-item" data-id="${w.id}">
                        <div class="wt-workout-main">
                            <div class="wt-workout-exercise">${escapeHtml(w.exercise)}</div>
                            <div class="wt-workout-details">
                                <span><strong>${w.weight}</strong> ${w.unit || settings.unit}</span>
                                <span><strong>${w.reps}</strong> reps</span>
                                <span><strong>${w.sets}</strong> sets</span>
                            </div>
                            ${w.notes ? `<div class="wt-workout-notes">${escapeHtml(w.notes)}</div>` : ''}
                        </div>
                        <button class="wt-delete-btn" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                                <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                `).join('')}
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.wt-delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const item = e.target.closest('.wt-workout-item');
            const id = parseInt(item.dataset.id);
            if (confirm('Delete this workout?')) {
                await deleteWorkout(id);
                showToast('Deleted');
                refreshHistory();
                refreshTodayWorkouts();
            }
        });
    });
}

// ============================================
// PROGRESS TAB
// ============================================

function initProgressTab() {
    $('#wt-progress-exercise').addEventListener('change', refreshProgress);
    initChart();
}

function initChart() {
    const ctx = $('#wt-progress-chart').getContext('2d');
    
    chart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Weight',
                data: [],
                borderColor: '#00d4aa',
                backgroundColor: 'rgba(0, 212, 170, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: '#00d4aa',
                pointBorderColor: '#1a1a1a',
                pointBorderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#2a2a2a',
                    titleColor: '#fff',
                    bodyColor: '#a0a0a0',
                    borderColor: '#333',
                    borderWidth: 1,
                    padding: 10,
                    displayColors: false,
                    callbacks: {
                        label: (ctx) => `${ctx.parsed.y} ${settings.unit}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#666', font: { size: 11 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.05)' },
                    ticks: { color: '#666', font: { size: 11 } }
                }
            }
        }
    });
}

async function refreshProgress() {
    const exercise = $('#wt-progress-exercise').value;
    const statsContainer = $('#wt-progress-stats');

    if (!exercise) {
        chart.data.labels = [];
        chart.data.datasets[0].data = [];
        chart.update();
        statsContainer.innerHTML = '<div class="wt-empty">Select an exercise to view stats</div>';
        return;
    }

    const workouts = await getWorkouts({ exercise, days: 90 });
    
    if (workouts.length === 0) {
        chart.data.labels = [];
        chart.data.datasets[0].data = [];
        chart.update();
        statsContainer.innerHTML = `<div class="wt-empty">No data for ${escapeHtml(exercise)}</div>`;
        return;
    }

    // Group by date, get max weight per day
    const byDate = {};
    workouts.forEach(w => {
        if (!byDate[w.date] || w.weight > byDate[w.date].weight) {
            byDate[w.date] = w;
        }
    });

    const sorted = Object.values(byDate).sort((a, b) => 
        new Date(a.date) - new Date(b.date)
    );

    chart.data.labels = sorted.map(w => {
        const d = new Date(w.date + 'T00:00:00');
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    });
    chart.data.datasets[0].data = sorted.map(w => w.weight);
    chart.update();

    // Stats
    const weights = sorted.map(w => w.weight);
    const first = weights[0];
    const last = weights[weights.length - 1];
    const max = Math.max(...weights);
    const change = last - first;
    const pct = ((change / first) * 100).toFixed(1);

    statsContainer.innerHTML = `
        <div class="wt-stat-card">
            <div class="wt-stat-label">Current</div>
            <div class="wt-stat-value">${last}</div>
            <div class="wt-stat-subtext">${settings.unit}</div>
        </div>
        <div class="wt-stat-card">
            <div class="wt-stat-label">Personal Best</div>
            <div class="wt-stat-value">${max}</div>
            <div class="wt-stat-subtext">${settings.unit}</div>
        </div>
        <div class="wt-stat-card">
            <div class="wt-stat-label">Starting</div>
            <div class="wt-stat-value">${first}</div>
            <div class="wt-stat-subtext">${settings.unit}</div>
        </div>
        <div class="wt-stat-card">
            <div class="wt-stat-label">Progress</div>
            <div class="wt-stat-value ${change >= 0 ? 'positive' : 'negative'}">
                ${change >= 0 ? '+' : ''}${change.toFixed(1)}
            </div>
            <div class="wt-stat-subtext">${pct}%</div>
        </div>
    `;
}

// ============================================
// SETTINGS TAB
// ============================================

function initSettingsTab() {
    // Unit change
    $('#wt-unit-select').addEventListener('change', async (e) => {
        settings.unit = e.target.value;
        await saveSettings();
        updateWeightUnit();
        showToast(`Unit: ${settings.unit}`);
    });

    // Add exercise
    $('#wt-add-exercise-setting').addEventListener('click', async () => {
        const input = $('#wt-new-exercise');
        const name = input.value.trim();
        if (!name) {
            showToast('Enter name', 'error');
            return;
        }
        const added = await addExercise(name);
        if (added) {
            input.value = '';
            refreshExerciseList();
            refreshExerciseDropdowns();
            showToast('Added');
        } else {
            showToast('Already exists', 'error');
        }
    });

    // Export
    $('#wt-export-btn').addEventListener('click', async () => {
        await exportData();
        showToast('Exported');
    });

    // Import
    const importFile = $('#wt-import-file');
    $('#wt-import-btn').addEventListener('click', () => importFile.click());
    
    importFile.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const count = await importData(file);
            showToast(`Imported ${count} workouts`);
            refreshExerciseDropdowns();
            refreshTodayWorkouts();
            refreshExerciseList();
        } catch (error) {
            showToast('Import failed', 'error');
        }
        importFile.value = '';
    });

    // Clear
    $('#wt-clear-btn').addEventListener('click', async () => {
        if (confirm('Delete ALL data? This cannot be undone!')) {
            if (confirm('Are you sure?')) {
                await clearAllData();
                showToast('Data cleared');
                refreshExerciseDropdowns();
                refreshExerciseList();
                refreshTodayWorkouts();
            }
        }
    });
}

async function refreshExerciseList() {
    const container = $('#wt-exercise-list');
    const exercises = await getExercises();

    container.innerHTML = exercises.map(e => `
        <div class="wt-exercise-item">
            <span>${escapeHtml(e.name)}</span>
            <button class="wt-exercise-delete" data-name="${escapeHtml(e.name)}" title="Delete">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16">
                    <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
            </button>
        </div>
    `).join('');

    container.querySelectorAll('.wt-exercise-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const name = e.target.closest('.wt-exercise-delete').dataset.name;
            if (confirm(`Delete "${name}"?`)) {
                await deleteExercise(name);
                refreshExerciseList();
                refreshExerciseDropdowns();
                showToast('Deleted');
            }
        });
    });
}

// ============================================
// MODAL
// ============================================

function initModal() {
    const modal = $('#wt-modal');
    const closeBtn = $('#wt-modal-close');
    const addBtn = $('#wt-modal-add');
    const input = $('#wt-modal-exercise');

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    addBtn.addEventListener('click', async () => {
        const name = input.value.trim();
        if (!name) {
            showToast('Enter name', 'error');
            return;
        }
        const added = await addExercise(name);
        if (added) {
            input.value = '';
            closeModal();
            refreshExerciseDropdowns();
            $('#wt-exercise').value = name;
            showToast('Added');
        } else {
            showToast('Already exists', 'error');
        }
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') addBtn.click();
    });
}

function openModal() {
    $('#wt-modal').classList.add('active');
    $('#wt-modal-exercise').value = '';
    $('#wt-modal-exercise').focus();
}

function closeModal() {
    $('#wt-modal').classList.remove('active');
}

// ============================================
// OFFLINE HANDLING
// ============================================

function initOffline() {
    const indicator = $('#wt-offline');
    
    function updateStatus() {
        if (!navigator.onLine) {
            indicator.classList.add('show');
        } else {
            indicator.classList.remove('show');
        }
    }

    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
}

// ============================================
// SERVICE WORKER
// ============================================

async function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/workout-tracker/sw.js');
            console.log('SW registered');
        } catch (error) {
            console.log('SW failed:', error);
        }
    }
}

// ============================================
// INITIALIZATION
// ============================================

async function initApp() {
    await initializeData();
    initTabs();
    await initLogTab();
    initHistoryTab();
    initProgressTab();
    initSettingsTab();
    initModal();
    initOffline();
}

// Entry point
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await openDatabase();
        await checkAuth();
        registerServiceWorker();
    } catch (error) {
        console.error('Init failed:', error);
        showToast('Failed to load', 'error');
    }
});

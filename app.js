/**
 * DocView Mini-App — Preview & Edit
 * Telegram WebApp for inline editing of processing results.
 */

// ── Parse URL params ─────────────────────────
const params = new URLSearchParams(window.location.search);
const TOKEN = params.get('token');
const API_BASE = params.get('api') || '';

// ── Telegram WebApp SDK ──────────────────────
const tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
    tg.ready();
    // Enable close confirmation if user has edits
    tg.enableClosingConfirmation();
}

// ── DOM refs ─────────────────────────────────
const $loading = document.getElementById('loading');
const $error = document.getElementById('error');
const $errorMsg = document.getElementById('error-message');
const $app = document.getElementById('app');
const $editor = document.getElementById('editor');
const $modeBadge = document.getElementById('mode-badge');
const $charCount = document.getElementById('char-count');
const $toast = document.getElementById('toast');

const $btnCopy = document.getElementById('btn-copy');
const $btnDocx = document.getElementById('btn-docx');
const $btnShorten = document.getElementById('btn-shorten');
const $btnLengthen = document.getElementById('btn-lengthen');

// ── State ────────────────────────────────────
let originalText = '';
let currentMode = '';
let isProcessing = false;

// ── Mode labels ──────────────────────────────
const MODE_LABELS = {
    tldr: '📝 TL;DR',
    structure: '📑 Структура',
    action_plan: '✅ План действий',
    letter: '💌 Письмо клиенту',
    protocol: '📋 Протокол встречи',
    fix_only: '✏️ Исправлено',
    shorten: '✂️ Укорочено',
    expand: '📖 Расширено',
    tones: '🎭 Тон',
    cleanup: '🧹 Очищено',
    extract: '📌 Задачи',
    risks: '⚠️ Риски',
    questions: '❓ Вопросы',
    template: '📐 Шаблон',
};

// ── API helpers ──────────────────────────────
async function apiGet(path) {
    const resp = await fetch(`${API_BASE}${path}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });
    if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
    }
    return resp;
}

async function apiPost(path, body) {
    const resp = await fetch(`${API_BASE}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
    if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${resp.status}`);
    }
    return resp.json();
}

// ── Init ─────────────────────────────────────
async function init() {
    if (!TOKEN || !API_BASE) {
        showError('Отсутствует токен доступа. Откройте ссылку из бота.');
        return;
    }

    try {
        const resp = await apiGet(`/api/job/${TOKEN}`);
        const data = await resp.json();

        originalText = data.text || '';
        currentMode = data.mode || '';

        $editor.value = originalText;
        $modeBadge.textContent = MODE_LABELS[currentMode] || currentMode || '—';
        updateCharCount();

        $loading.style.display = 'none';
        $app.style.display = 'flex';

        // Auto-resize awareness
        $editor.addEventListener('input', updateCharCount);
    } catch (e) {
        showError(
            e.message === 'invalid_token'
                ? 'Ссылка устарела или недействительна. Обработайте документ заново.'
                : e.message === 'not_found'
                    ? 'Результат не найден. Возможно, он уже удалён.'
                    : `Ошибка загрузки: ${e.message}`
        );
    }
}

// ── UI helpers ───────────────────────────────
function showError(msg) {
    $loading.style.display = 'none';
    $errorMsg.textContent = msg;
    $error.style.display = 'flex';
}

function updateCharCount() {
    const len = $editor.value.length;
    if (len < 1000) {
        $charCount.textContent = `${len} символов`;
    } else {
        $charCount.textContent = `~${Math.round(len / 1000)}K символов`;
    }
}

function showToast(text, type = '') {
    $toast.textContent = text;
    $toast.className = 'toast show' + (type ? ` ${type}` : '');
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
        $toast.className = 'toast';
    }, 2500);
}

function setProcessing(btn, processing) {
    isProcessing = processing;
    btn.classList.toggle('processing', processing);

    // Disable all buttons during processing
    [$btnCopy, $btnDocx, $btnShorten, $btnLengthen].forEach(b => {
        b.disabled = processing;
    });
}

// ── Actions ──────────────────────────────────
async function copyText() {
    try {
        await navigator.clipboard.writeText($editor.value);
        showToast('✅ Скопировано!', 'success');
    } catch {
        // Fallback for older browsers
        $editor.select();
        document.execCommand('copy');
        showToast('✅ Скопировано!', 'success');
    }
}

async function downloadDocx() {
    if (isProcessing) return;
    setProcessing($btnDocx, true);

    try {
        // Send current (possibly edited) text via POST body would be cleaner,
        // but our API uses GET with query param for simplicity.
        // For large texts, encode as base64 would be needed. Using URL param for now.
        const text = encodeURIComponent($editor.value);
        const url = `${API_BASE}/api/job/${TOKEN}/docx?text=${text}`;

        // If text is too long for URL, fall back to blob
        if (url.length > 8000) {
            // Generate docx client-side is complex, so just download without edits
            const resp = await fetch(`${API_BASE}/api/job/${TOKEN}/docx`);
            if (!resp.ok) throw new Error('Download failed');
            const blob = await resp.blob();
            downloadBlob(blob, 'result.docx');
        } else {
            const resp = await fetch(url);
            if (!resp.ok) throw new Error('Download failed');
            const blob = await resp.blob();
            downloadBlob(blob, 'result.docx');
        }

        showToast('📄 Файл скачан!', 'success');
    } catch (e) {
        showToast('❌ Ошибка скачивания', 'error');
    } finally {
        setProcessing($btnDocx, false);
    }
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

async function runAction(action) {
    if (isProcessing) return;

    const btn = action === 'shorten' ? $btnShorten : $btnLengthen;
    setProcessing(btn, true);

    const label = action === 'shorten' ? 'Сокращаю…' : 'Расширяю…';
    showToast(`⏳ ${label}`);

    try {
        const data = await apiPost(`/api/job/${TOKEN}/action`, {
            action,
            text: $editor.value,
        });

        if (data.text) {
            $editor.value = data.text;
            updateCharCount();
            showToast(
                action === 'shorten' ? '✂️ Текст сокращён!' : '📖 Текст расширен!',
                'success'
            );
        }
    } catch (e) {
        showToast(
            e.message === 'llm_error'
                ? '❌ Ошибка обработки. Попробуйте ещё раз.'
                : `❌ ${e.message}`,
            'error'
        );
    } finally {
        setProcessing(btn, false);
    }
}

// ── Boot ─────────────────────────────────────
init();

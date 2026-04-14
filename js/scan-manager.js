import { saveCropConfig, loadCropConfig } from './storage-manager.js';
import { requestMiningData } from './ai-client.js';

let captureStream = null;
let videoEl = null;
let canvasEl = null;
let processingCanvasEl = null;
let overlayEl = null;
let cropBoxEl = null;
let resizeHandleEl = null;
let containerEl = null;
let cropPreviewContainerEl = null;
let cropLiveCanvasEl = null;
let scanPanelEl = null;
let scanPanelToggleEl = null;

export let currentScanBase64 = '';

const cropConfig = {
    cropX: 0,
    cropY: 0,
    cropWidth: 400,
    cropHeight: 200
};

let isDragging = false;
let isResizing = false;
let dragStart = { x: 0, y: 0 };
let cropStart = { x: 0, y: 0 };
let sizeStart = { w: 0, h: 0 };
let previewActive = false;
let previewRaf = 0;
let hasStoredCrop = false;

function ensureCanvasElement() {
    if (canvasEl) return canvasEl;
    canvasEl = document.createElement('canvas');
    canvasEl.style.position = 'fixed';
    canvasEl.style.left = '-9999px';
    canvasEl.style.top = '-9999px';
    document.body.appendChild(canvasEl);
    return canvasEl;
}

function ensureProcessingCanvas() {
    if (processingCanvasEl) return processingCanvasEl;
    processingCanvasEl = document.createElement('canvas');
    processingCanvasEl.style.position = 'fixed';
    processingCanvasEl.style.left = '-9999px';
    processingCanvasEl.style.top = '-9999px';
    document.body.appendChild(processingCanvasEl);
    return processingCanvasEl;
}

export function setCropConfig(nextConfig) {
    Object.assign(cropConfig, nextConfig || {});
    saveCropConfig({ ...cropConfig });
}

export function getCropConfig() {
    return { ...cropConfig };
}

export async function selectGameWindow() {
    captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false
    });

    if (!videoEl) return captureStream;

    videoEl.srcObject = captureStream;
    await videoEl.play();

    return captureStream;
}

export function processImage() {
    if (!videoEl) return '';
    if (videoEl.readyState < 2) return '';
    const canvas = ensureCanvasElement();
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';
    const processingCanvas = ensureProcessingCanvas();
    const pctx = processingCanvas.getContext('2d');
    if (!pctx) return '';

    const { cropX, cropY, cropWidth, cropHeight } = cropConfig;
    const sourceWidth = videoEl.videoWidth || 0;
    const sourceHeight = videoEl.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) return '';

    const safeX = Math.max(0, Math.min(cropX, sourceWidth - 1));
    const safeY = Math.max(0, Math.min(cropY, sourceHeight - 1));
    const safeW = Math.max(1, Math.min(cropWidth, sourceWidth - safeX));
    const safeH = Math.max(1, Math.min(cropHeight, sourceHeight - safeY));

    canvas.width = safeW;
    canvas.height = safeH;

    ctx.drawImage(
        videoEl,
        safeX,
        safeY,
        safeW,
        safeH,
        0,
        0,
        safeW,
        safeH
    );

    const upscale = 3;
    processingCanvas.width = safeW * upscale;
    processingCanvas.height = safeH * upscale;
    pctx.clearRect(0, 0, processingCanvas.width, processingCanvas.height);
    pctx.imageSmoothingEnabled = false;
    pctx.filter = 'grayscale(100%) contrast(150%) brightness(110%)';
    pctx.drawImage(canvas, 0, 0, processingCanvas.width, processingCanvas.height);
    pctx.filter = 'none';

    currentScanBase64 = processingCanvas.toDataURL('image/png');
    window.currentScanBase64 = currentScanBase64;
    return currentScanBase64;
}

function waitForVideoFrame(timeoutMs = 1500) {
    return new Promise((resolve) => {
        if (!videoEl) return resolve(false);
        if (videoEl.readyState >= 2) return resolve(true);

        let settled = false;
        const onReady = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(true);
        };
        const onTimeout = () => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve(false);
        };
        const cleanup = () => {
            videoEl.removeEventListener('loadeddata', onReady);
            clearTimeout(timer);
        };
        videoEl.addEventListener('loadeddata', onReady, { once: true });
        const timer = setTimeout(onTimeout, timeoutMs);
    });
}

async function captureBase64WithRetry(attempts = 3) {
    for (let i = 0; i < attempts; i++) {
        const ready = await waitForVideoFrame(800);
        if (ready) {
            const base64 = processImage();
            if (base64) return base64;
        }
        await new Promise(resolve => setTimeout(resolve, 120));
    }
    return '';
}

function renderLiveCrop() {
    if (!videoEl || !cropLiveCanvasEl) return;
    const ctx = cropLiveCanvasEl.getContext('2d');
    if (!ctx) return;

    const { cropX, cropY, cropWidth, cropHeight } = cropConfig;
    const sourceWidth = videoEl.videoWidth || 0;
    const sourceHeight = videoEl.videoHeight || 0;
    if (!sourceWidth || !sourceHeight) return;

    const safeX = Math.max(0, Math.min(cropX, sourceWidth - 1));
    const safeY = Math.max(0, Math.min(cropY, sourceHeight - 1));
    const safeW = Math.max(1, Math.min(cropWidth, sourceWidth - safeX));
    const safeH = Math.max(1, Math.min(cropHeight, sourceHeight - safeY));

    cropLiveCanvasEl.width = safeW;
    cropLiveCanvasEl.height = safeH;
    ctx.drawImage(videoEl, safeX, safeY, safeW, safeH, 0, 0, safeW, safeH);

    const displayWidth = Math.min(640, Math.max(240, safeW));
    cropLiveCanvasEl.style.width = `${displayWidth}px`;
    if (cropPreviewContainerEl) {
        cropPreviewContainerEl.style.width = `${displayWidth}px`;
    }
}

function getDisplayScale() {
    if (!videoEl || !containerEl) return { scaleX: 1, scaleY: 1 };
    const rect = videoEl.getBoundingClientRect();
    const sourceWidth = videoEl.videoWidth || rect.width;
    const sourceHeight = videoEl.videoHeight || rect.height;
    return {
        scaleX: sourceWidth / rect.width,
        scaleY: sourceHeight / rect.height
    };
}

function updateCropBoxPositionFromConfig() {
    if (!cropBoxEl || !videoEl) return;
    const rect = videoEl.getBoundingClientRect();
    const { scaleX, scaleY } = getDisplayScale();
    const left = cropConfig.cropX / scaleX;
    const top = cropConfig.cropY / scaleY;
    const width = cropConfig.cropWidth / scaleX;
    const height = cropConfig.cropHeight / scaleY;

    cropBoxEl.style.left = `${Math.max(0, left)}px`;
    cropBoxEl.style.top = `${Math.max(0, top)}px`;
    cropBoxEl.style.width = `${Math.max(40, Math.min(width, rect.width))}px`;
    cropBoxEl.style.height = `${Math.max(40, Math.min(height, rect.height))}px`;
}

function updateConfigFromCropBox() {
    if (!cropBoxEl || !videoEl) return;
    const rect = videoEl.getBoundingClientRect();
    const boxRect = cropBoxEl.getBoundingClientRect();
    const { scaleX, scaleY } = getDisplayScale();

    const relX = boxRect.left - rect.left;
    const relY = boxRect.top - rect.top;
    const relW = boxRect.width;
    const relH = boxRect.height;

    cropConfig.cropX = Math.round(relX * scaleX);
    cropConfig.cropY = Math.round(relY * scaleY);
    cropConfig.cropWidth = Math.round(relW * scaleX);
    cropConfig.cropHeight = Math.round(relH * scaleY);

    saveCropConfig({ ...cropConfig });
}

function clampCropBox() {
    if (!cropBoxEl || !videoEl) return;
    const rect = videoEl.getBoundingClientRect();
    const boxRect = cropBoxEl.getBoundingClientRect();

    let left = boxRect.left - rect.left;
    let top = boxRect.top - rect.top;
    let width = boxRect.width;
    let height = boxRect.height;

    left = Math.max(0, Math.min(left, rect.width - width));
    top = Math.max(0, Math.min(top, rect.height - height));

    cropBoxEl.style.left = `${left}px`;
    cropBoxEl.style.top = `${top}px`;
}

function attachDragHandlers() {
    if (!cropBoxEl || !overlayEl) return;

    cropBoxEl.addEventListener('pointerdown', (event) => {
        if (event.target === resizeHandleEl) return;
        isDragging = true;
        cropBoxEl.setPointerCapture(event.pointerId);
        dragStart = { x: event.clientX, y: event.clientY };
        const boxRect = cropBoxEl.getBoundingClientRect();
        const overlayRect = overlayEl.getBoundingClientRect();
        cropStart = { x: boxRect.left - overlayRect.left, y: boxRect.top - overlayRect.top };
        event.preventDefault();
    });

    resizeHandleEl?.addEventListener('pointerdown', (event) => {
        isResizing = true;
        cropBoxEl.setPointerCapture(event.pointerId);
        dragStart = { x: event.clientX, y: event.clientY };
        const boxRect = cropBoxEl.getBoundingClientRect();
        sizeStart = { w: boxRect.width, h: boxRect.height };
        event.preventDefault();
    });

    window.addEventListener('pointermove', (event) => {
        if (!isDragging) return;
        const overlayRect = overlayEl.getBoundingClientRect();
        const deltaX = event.clientX - dragStart.x;
        const deltaY = event.clientY - dragStart.y;

        cropBoxEl.style.left = `${cropStart.x + deltaX}px`;
        cropBoxEl.style.top = `${cropStart.y + deltaY}px`;
        clampCropBox();
    });

    window.addEventListener('pointermove', (event) => {
        if (!isResizing) return;
        const overlayRect = overlayEl.getBoundingClientRect();
        const deltaX = event.clientX - dragStart.x;
        const deltaY = event.clientY - dragStart.y;
        const nextW = Math.max(40, sizeStart.w + deltaX);
        const nextH = Math.max(40, sizeStart.h + deltaY);

        cropBoxEl.style.width = `${Math.min(nextW, overlayRect.width)}px`;
        cropBoxEl.style.height = `${Math.min(nextH, overlayRect.height)}px`;
        clampCropBox();
    });

    window.addEventListener('pointerup', () => {
        if (isDragging || isResizing) {
            isDragging = false;
            isResizing = false;
            updateConfigFromCropBox();
        }
    });
}

function applyStoredCropDefaults() {
    const stored = loadCropConfig();
    if (stored && typeof stored === 'object') {
        Object.assign(cropConfig, stored);
        hasStoredCrop = Boolean(stored.cropWidth && stored.cropHeight);
    }
}

function setPreviewMode(isActive) {
    previewActive = isActive;
    if (previewActive) {
        containerEl.classList.add('hidden');
        cropPreviewContainerEl.classList.remove('hidden');
        startLivePreview();
    } else {
        stopLivePreview();
        cropPreviewContainerEl.classList.add('hidden');
        containerEl.classList.remove('hidden');
    }
}

function updatePreviewToggleLabel() {
    const togglePreviewBtn = document.getElementById('toggleCropPreviewBtn');
    if (!togglePreviewBtn) return;
    togglePreviewBtn.textContent = previewActive ? 'Show Full View' : 'Show Crop Preview';
}

function syncScanPanelAria() {
    if (!scanPanelToggleEl || !scanPanelEl) return;
    const expanded = !scanPanelEl.classList.contains('collapsed');
    scanPanelToggleEl.setAttribute('aria-expanded', expanded ? 'true' : 'false');
}

export function setupScanUI() {
    const selectBtn = document.getElementById('selectGameWindowBtn');
    const scanBtn = document.getElementById('scanHudBtn');
    const togglePreviewBtn = document.getElementById('toggleCropPreviewBtn');
    const resetViewBtn = document.getElementById('resetCropViewBtn');
    const preview = document.getElementById('scanPreview');
    const statusLine = document.getElementById('scanStatus');
    containerEl = document.getElementById('captureContainer');
    videoEl = document.getElementById('captureVideo');
    overlayEl = document.getElementById('captureOverlay');
    cropBoxEl = document.getElementById('cropBox');
    resizeHandleEl = document.getElementById('cropResizeHandle');
    cropPreviewContainerEl = document.getElementById('cropPreviewContainer');
    cropLiveCanvasEl = document.getElementById('cropLiveCanvas');
    scanPanelEl = document.getElementById('scanPanel');
    scanPanelToggleEl = document.getElementById('scanPanelToggle');

    if (!selectBtn || !scanBtn || !togglePreviewBtn || !resetViewBtn || !preview || !statusLine ||
        !containerEl || !videoEl || !overlayEl || !cropBoxEl || !resizeHandleEl ||
        !cropPreviewContainerEl || !cropLiveCanvasEl || !scanPanelEl || !scanPanelToggleEl) {
        console.warn('Scan UI elements not found');
        return;
    }

    applyStoredCropDefaults();
    attachDragHandlers();
    syncScanPanelAria();

    scanPanelToggleEl.addEventListener('click', () => {
        scanPanelEl.classList.toggle('collapsed');
        syncScanPanelAria();
    });

    selectBtn.addEventListener('click', async () => {
        try {
            await selectGameWindow();
            containerEl.classList.remove('hidden');
            scanBtn.disabled = false;
            togglePreviewBtn.disabled = false;
            resetViewBtn.disabled = false;
            statusLine.textContent = 'Capture started. Ready to scan.';
            videoEl.addEventListener('loadedmetadata', () => {
                updateCropBoxPositionFromConfig();
                if (hasStoredCrop) {
                    setPreviewMode(true);
                    updatePreviewToggleLabel();
                }
            }, { once: true });
        } catch (err) {
            console.warn('Failed to start capture:', err);
            statusLine.textContent = 'Capture failed. Check browser permissions.';
        }
    });

    scanBtn.addEventListener('click', async () => {
        statusLine.textContent = 'Scanning HUD...';
        if (!previewActive) {
            updateConfigFromCropBox();
        }
        let base64 = await captureBase64WithRetry();
        if (!base64 && cropLiveCanvasEl) {
            try {
                base64 = cropLiveCanvasEl.toDataURL('image/png');
            } catch (e) {
                base64 = '';
            }
        }
        if (base64) {
            preview.src = base64;
            preview.classList.remove('hidden');
            preview.style.display = 'block';
            preview.style.visibility = 'visible';
            statusLine.textContent = `Scan captured (${Math.round(base64.length / 1024)} KB).`;

            try {
                statusLine.textContent = 'Loading...';
                const result = await requestMiningData(base64);
                const rawMass = result?.mass ?? '';
                const rawResistance = result?.resistance ?? '';
                const massDigits = rawMass.toString().replace(/\D/g, '');
                const massValue = parseInt(massDigits, 10);
                const resistanceValue = typeof rawResistance === 'number'
                    ? rawResistance
                    : parseFloat(rawResistance);

                if (!massValue || Number.isNaN(massValue)) {
                    statusLine.textContent = 'Scan failed: Could not determine Rock Mass.';
                    console.warn('AI mining data (invalid mass):', result);
                    return;
                }

                console.log('AI mining data:', { mass: massValue, resistance: resistanceValue });
                if (window.setMassResistance) {
                    window.setMassResistance(massValue, resistanceValue);
                }
                statusLine.textContent = 'AI data received.';
            } catch (err) {
                console.warn('AI request failed:', err);
                statusLine.textContent = 'AI request failed. Check console.';
            }
        } else {
            console.warn('Scan HUD failed to capture frame.');
            statusLine.textContent = 'Scan failed. Try again after moving the window.';
        }
    });

    togglePreviewBtn.addEventListener('click', () => {
        setPreviewMode(!previewActive);
        updatePreviewToggleLabel();
    });

    resetViewBtn.addEventListener('click', () => {
        setPreviewMode(false);
        updatePreviewToggleLabel();
        updateCropBoxPositionFromConfig();
    });

    window.addEventListener('resize', () => {
        updateCropBoxPositionFromConfig();
    });
}

function startLivePreview() {
    if (!cropLiveCanvasEl) return;
    const drawFrame = () => {
        if (!previewActive) return;
        renderLiveCrop();
        previewRaf = requestAnimationFrame(drawFrame);
    };

    previewRaf = requestAnimationFrame(drawFrame);
}

function stopLivePreview() {
    if (previewRaf) {
        cancelAnimationFrame(previewRaf);
        previewRaf = 0;
    }
}

window.currentScanBase64 = currentScanBase64;
window.getCropConfig = getCropConfig;
window.setCropConfig = setCropConfig;

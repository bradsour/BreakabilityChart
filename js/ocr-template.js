/**
 * Template-based digit matching for OCR.
 * Loads 0-9 digit templates and matches 28x28 normalized character images.
 */

import { toGrayscale } from './ocr-filters.js';

let templates = null;
let templatesLoaded = false;

/**
 * Load digit templates (0-9) from a base path.
 * Expects files like `${basePath}/0.jpg` ... `${basePath}/9.jpg`.
 * @param {string} basePath
 * @returns {Promise<boolean>}
 */
export async function loadDigitTemplates(basePath) {
    templates = {};
    templatesLoaded = false;

    const loadPromises = [];
    for (let d = 0; d <= 9; d++) {
        const path = `${basePath}/${d}.jpg`;
        loadPromises.push(loadTemplateImage(path).then(tmpl => {
            if (tmpl) {
                templates[d.toString()] = tmpl;
            }
        }));
    }

    await Promise.all(loadPromises);
    templatesLoaded = Object.keys(templates).length === 10;
    if (!templatesLoaded) {
        console.warn('Template OCR: not all digit templates were loaded.');
    }
    return templatesLoaded;
}

/**
 * @returns {boolean}
 */
export function isTemplateLoaded() {
    return templatesLoaded;
}

/**
 * Predict a sequence using template matching.
 * @param {Float32Array[]} images - Array of 28x28 normalized images
 * @returns {string}
 */
export function predictSequenceTemplate(images) {
    if (!templatesLoaded || !images || images.length === 0) return '';
    let text = '';
    for (const img of images) {
        let bestDigit = '?';
        let bestScore = Infinity;
        for (const [digit, tmpl] of Object.entries(templates)) {
            const dist = sumAbsDiff(img, tmpl);
            if (dist < bestScore) {
                bestScore = dist;
                bestDigit = digit;
            }
        }
        text += bestDigit;
    }
    return text;
}

async function loadTemplateImage(src) {
    return new Promise((resolve) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth;
            canvas.height = img.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const gray = toGrayscale(imageData);
            const resized = resizeBilinear(gray, canvas.width, canvas.height, 28, 28);
            const normalized = new Float32Array(28 * 28);
            for (let i = 0; i < normalized.length; i++) {
                normalized[i] = resized[i] / 255.0;
            }
            resolve(normalized);
        };
        img.onerror = () => resolve(null);
        img.src = src;
    });
}

function sumAbsDiff(a, b) {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
        sum += Math.abs(a[i] - b[i]);
    }
    return sum;
}

function resizeBilinear(src, srcW, srcH, dstW, dstH) {
    const dst = new Uint8Array(dstW * dstH);
    const xRatio = srcW / dstW;
    const yRatio = srcH / dstH;

    for (let dy = 0; dy < dstH; dy++) {
        for (let dx = 0; dx < dstW; dx++) {
            const sx = dx * xRatio;
            const sy = dy * yRatio;
            const x0 = Math.floor(sx);
            const y0 = Math.floor(sy);
            const x1 = Math.min(x0 + 1, srcW - 1);
            const y1 = Math.min(y0 + 1, srcH - 1);
            const xFrac = sx - x0;
            const yFrac = sy - y0;

            const tl = src[y0 * srcW + x0];
            const tr = src[y0 * srcW + x1];
            const bl = src[y1 * srcW + x0];
            const br = src[y1 * srcW + x1];

            const top = tl + (tr - tl) * xFrac;
            const bottom = bl + (br - bl) * xFrac;
            dst[dy * dstW + dx] = Math.round(top + (bottom - top) * yFrac);
        }
    }

    return dst;
}

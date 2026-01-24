/**
 * Pose.id - App Script
 * Logic: AR Filters -> Multi-Layout Capture -> Layered Editor (BG + Photo + Sticker)
 */

const video = document.getElementById("video");
const canvas = document.getElementById("canvas");
const previewCanvas = document.getElementById("previewCanvas");
const timerEl = document.getElementById("timer");

let capturedPhotos = [];
let currentLayout = 1;
let selectedBg = "";
let selectedSticker = "";

const config = {
    1: { canvasW: 500, canvasH: 750, photoW: 400, photoH: 550, startY: 100, gap: 0, target: 1 },
    2: { canvasW: 1000, canvasH: 700, photoW: 440, photoH: 550, startY: 75, gap: 460, target: 2, isHorizontal: true },
    3: { canvasW: 590, canvasH: 1770, photoW: 480, photoH: 480, startY: 130, gap: 540, target: 3 },
    4: { canvasW: 1000, canvasH: 1000, photoW: 440, photoH: 440, startY: 50, gap: 460, target: 4, isGrid: true },
    5: { canvasW: 500, canvasH: 1800, photoW: 400, photoH: 300, startY: 100, gap: 320, target: 5 }
};

// Start Camera
navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } })
    .then(stream => video.srcObject = stream);

// --- LOGIKA CAPTURE ---
window.changeLayout = (l, btn) => {
    currentLayout = l;
    document.querySelectorAll('.l-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

window.startCapture = () => {
    capturedPhotos = [];
    runCountdown();
};

function runCountdown() {
    let count = 3;
    timerEl.style.display = 'block';
    const itv = setInterval(() => {
        timerEl.innerText = count === 0 ? "📸" : count;
        if (count < 0) {
            clearInterval(itv);
            timerEl.style.display = 'none';
            takeSnapshot();
            if (capturedPhotos.length < config[currentLayout].target) runCountdown();
            else openEditor();
        }
        count--;
    }, 1000);
}

function takeSnapshot() {
    const temp = document.createElement("canvas");
    temp.width = 640; temp.height = 480;
    temp.getContext("2d").drawImage(video, 0, 0);
    capturedPhotos.push(temp.toDataURL('image/png'));
}

// --- LOGIKA EDITOR ---
function openEditor() {
    document.getElementById("cameraSection").style.display = "none";
    document.getElementById("editSection").style.display = "block";
    document.getElementById("layoutControls").style.display = "none";
    document.getElementById("editorControls").style.display = "block";
    document.getElementById("snap").style.display = "none";
    document.getElementById("downloadBtn").style.display = "block";
    document.getElementById("resetBtn").style.display = "block";

    loadAssets('bgSelector', 'background', 'bg');
    loadAssets('stickerSelector', 'sticker', 'sticker');
    
    // Default
    selectedBg = `assets/background/layout${currentLayout}/bg1.png`;
    selectedSticker = `assets/sticker/layout${currentLayout}/sticker1.png`;
    updatePreview();
}

function loadAssets(id, folder, prefix) {
    const el = document.getElementById(id);
    el.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
        const img = document.createElement("img");
        const path = `assets/${folder}/layout${currentLayout}/${prefix}${i}.png`;
        img.src = path; img.className = "asset-thumb";
        img.onclick = () => {
            if (prefix === 'bg') selectedBg = path; else selectedSticker = path;
            updatePreview();
        };
        img.onerror = () => img.remove();
        el.appendChild(img);
    }
}

async function updatePreview() {
    const ctx = previewCanvas.getContext("2d");
    const conf = config[currentLayout];
    previewCanvas.width = conf.canvasW; 
    previewCanvas.height = conf.canvasH;

    const loadImg = (s) => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });

    // 1. BG
    const bg = await loadImg(selectedBg);
    ctx.drawImage(bg, 0, 0, previewCanvas.width, previewCanvas.height);

    // 2. Photos
    for (let i = 0; i < capturedPhotos.length; i++) {
        const p = await loadImg(capturedPhotos[i]);
        let x, y;
        if (conf.isGrid) {
            x = 50 + (i % 2 * conf.gap);
            y = conf.startY + (Math.floor(i / 2) * conf.gap);
        } else if (conf.isHorizontal) {
            x = 50 + (i * conf.gap); y = conf.startY;
        } else {
            x = (previewCanvas.width - conf.photoW) / 2;
            y = conf.startY + (i * conf.gap);
        }
        ctx.drawImage(p, x, y, conf.photoW, conf.photoH);
    }

    // 3. Sticker
    const st = await loadImg(selectedSticker);
    ctx.drawImage(st, 0, 0, previewCanvas.width, previewCanvas.height);
}

function downloadFinal() {
    const link = document.createElement('a');
    link.download = 'poseid.png';
    link.href = document.getElementById("previewCanvas").toDataURL();
    link.click();
}

// Jalankan aplikasi
startApp();


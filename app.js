const video = document.getElementById("camera");
const cameraCanvas = document.getElementById("camera_canvas");
const arCanvas = document.getElementById("ar_canvas");
const timerEl = document.getElementById("timer");
const ctx2D = cameraCanvas.getContext("2d");

let detector, scene, camera3D, renderer, filterMesh;
let currentLayout = 1;
let capturedPhotos = [];
let isCapturing = false;
let selectedBg = "";
let selectedSticker = "";

// 1. CONFIG LAYOUT 1-5
const config = {
    1: { canvasW: 506, canvasH: 765, photoW: 380, photoH: 550, startY: 100, gap: 0, target: 1 },
    2: { canvasW: 1000, canvasH: 700, photoW: 440, photoH: 550, startY: 75, gap: 460, target: 2, isHorizontal: true },
    3: { canvasW: 591, canvasH: 1773, photoW: 485, photoH: 485, startY: 135, gap: 540, target: 3 },
    4: { canvasW: 1000, canvasH: 1000, photoW: 440, photoH: 440, startY: 50, gap: 460, target: 4, isGrid: true },
    5: { canvasW: 500, canvasH: 1800, photoW: 400, photoH: 300, startY: 100, gap: 320, target: 5 }
};

// 2. START APP
async function init() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
        cameraCanvas.width = arCanvas.width = video.videoWidth;
        cameraCanvas.height = arCanvas.height = video.videoHeight;
        initThreeJS();
        initFaceMesh();
        loadARFilters();
        renderLoop();
    };
}

// ... (initThreeJS, initFaceMesh, loadARFilters tetap ada di file Anda) ...

async function renderLoop() {
    ctx2D.save();
    ctx2D.translate(cameraCanvas.width, 0); ctx2D.scale(-1, 1);
    ctx2D.drawImage(video, 0, 0);
    ctx2D.restore();
    if (renderer) renderer.render(scene, camera3D);
    requestAnimationFrame(renderLoop);
}

// 3. CAPTURE LOGIC
window.changeLayout = (l, btn) => {
    currentLayout = l;
    document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
};

window.startCapture = () => {
    if (isCapturing) return;
    capturedPhotos = []; isCapturing = true;
    runCountdown();
};

function runCountdown() {
    let count = 3;
    timerEl.style.display = 'block';
    const timer = setInterval(() => {
        timerEl.innerText = count === 0 ? "📸" : count;
        if (count < 0) {
            clearInterval(timer); timerEl.style.display = 'none';
            takeSnapshot();
            if (capturedPhotos.length < config[currentLayout].target) runCountdown();
            else { isCapturing = false; openEditor(); }
        }
        count--;
    }, 1000);
}

function takeSnapshot() {
    const temp = document.createElement("canvas");
    temp.width = 600; temp.height = 480;
    const tCtx = temp.getContext("2d");
    tCtx.drawImage(cameraCanvas, 0, 0);
    tCtx.drawImage(arCanvas, 0, 0);
    capturedPhotos.push(temp.toDataURL('image/png'));
}

// 4. EDITOR LOGIC (Mix & Match)
function openEditor() {
    document.getElementById("cameraSection").style.display = "none";
    document.getElementById("editSection").style.display = "block";
    
    selectedBg = `assets/background/layout${currentLayout}/bg1.png`;
    selectedSticker = `assets/sticker/layout${currentLayout}/sticker1.png`;
    
    renderAssetList('bgSelector', 'background', 'bg');
    renderAssetList('stickerSelector', 'sticker', 'sticker');
    updatePreview();
}

function renderAssetList(id, folder, prefix) {
    const el = document.getElementById(id);
    if(!el) return; // Tambahan aman agar tidak error
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
    const canvas = document.getElementById("previewCanvas");
    const ctx = canvas.getContext("2d");
    const conf = config[currentLayout];
    canvas.width = conf.canvasW; canvas.height = conf.canvasH;

    const loadImg = (src) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });

    const bg = await loadImg(selectedBg);
    ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    for (let i = 0; i < capturedPhotos.length; i++) {
        const p = await loadImg(capturedPhotos[i]);
        let x, y;
        if (conf.isGrid) {
            x = 50 + (i % 2 * conf.gap);
            y = conf.startY + (Math.floor(i / 2) * conf.gap);
        } else if (conf.isHorizontal) {
            x = 50 + (i * conf.gap); y = conf.startY;
        } else {
            x = (canvas.width - conf.photoW) / 2;
            y = conf.startY + (i * conf.gap);
        }
        ctx.drawImage(p, x, y, conf.photoW, conf.photoH);
    }

    const st = await loadImg(selectedSticker);
    ctx.drawImage(st, 0, 0, canvas.width, canvas.height);
}

window.downloadFinal = () => {
    const link = document.createElement('a');
    link.download = 'poseid.png';
    link.href = document.getElementById("previewCanvas").toDataURL();
    link.click();
}

// --- BAGIAN YANG SAYA TAMBAHKAN UNTUK FIX TOMBOL ---

// Alias fungsi agar tombol setLayout di HTML bisa memanggil changeLayout di JS
window.setLayout = (l, btn) => {
    window.changeLayout(l, btn);
};

// Pastikan inisialisasi dipanggil setelah DOM benar-benar siap
document.addEventListener("DOMContentLoaded", () => {
    init();
    // Tambahan jeda sedikit agar detector AR siap
    setTimeout(() => {
        if(typeof loadARFilters === "function") loadARFilters();
    }, 1000);
}

// Tambahkan di baris paling bawah app.js
window.setLayout = (l, btn) => {
    if (typeof window.changeLayout === "function") {
        window.changeLayout(l, btn);
    }
};

document.addEventListener("DOMContentLoaded", () => {
    if (typeof init === "function") init();
    setTimeout(() => {
        if (typeof updateARSelector === "function") updateARSelector();
        if (typeof updateAssetSelectors === "function") updateAssetSelectors();
    }, 500);
});

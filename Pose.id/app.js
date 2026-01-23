const video = document.getElementById("camera");
const cameraCanvas = document.getElementById("camera_canvas");
const arCanvas = document.getElementById("ar_canvas");
const timerEl = document.getElementById("timer");
const ctx2D = cameraCanvas.getContext("2d");

let currentLayout = 1;
let capturedPhotos = [];
let isCapturing = false;
let selectedBg = null;
let selectedSticker = null;

// Konfigurasi Ukuran
const config = {
    1: { canvasW: 506, canvasH: 765, photoW: 380, photoH: 550, startY: 100, gap: 0, target: 1 },
    3: { canvasW: 591, canvasH: 1773, photoW: 485, photoH: 485, startY: 130, gap: 540, target: 3 }
};

async function startCamera() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: false });
    video.srcObject = stream;
    video.onloadedmetadata = () => {
        cameraCanvas.width = arCanvas.width = video.videoWidth;
        cameraCanvas.height = arCanvas.height = video.videoHeight;
        renderLoop();
    };
}

function renderLoop() {
    ctx2D.save();
    ctx2D.translate(cameraCanvas.width, 0);
    ctx2D.scale(-1, 1);
    ctx2D.drawImage(video, 0, 0, cameraCanvas.width, cameraCanvas.height);
    ctx2D.restore();
    requestAnimationFrame(renderLoop);
}

function changeLayout(l, btn) {
    currentLayout = l;
    document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}

function startCapture() {
    if (isCapturing) return;
    capturedPhotos = [];
    isCapturing = true;
    runCountdown();
}

function runCountdown() {
    let count = 3;
    timerEl.style.display = 'block';
    const timer = setInterval(() => {
        timerEl.innerText = count === 0 ? "📸" : count;
        if (count < 0) {
            clearInterval(timer);
            timerEl.style.display = 'none';
            takeSnapshot();
            if (capturedPhotos.length < config[currentLayout].target) runCountdown();
            else finishCapture();
        }
        count--;
    }, 1000);
}

function takeSnapshot() {
    const temp = document.createElement("canvas");
    temp.width = 480; temp.height = 600;
    const tCtx = temp.getContext("2d");
    const sH = cameraCanvas.height;
    const sW = sH * (480/600);
    const sX = (cameraCanvas.width - sW) / 2;
    tCtx.drawImage(cameraCanvas, sX, 0, sW, sH, 0, 0, 480, 600);
    capturedPhotos.push(temp.toDataURL('image/png'));
}

function finishCapture() {
    isCapturing = false;
    document.getElementById("cameraSection").style.display = "none";
    document.getElementById("editSection").style.display = "block";
    
    // Set default awal
    selectedBg = `assets/background/layout${currentLayout}/bg1.png`;
    selectedSticker = `assets/sticker/layout${currentLayout}/sticker1.png`;
    
    initSelectors();
    updatePreview();
}

function initSelectors() {
    const loadList = (id, folder, prefix, type) => {
        const el = document.getElementById(id);
        el.innerHTML = "";
        for (let i = 1; i <= 200; i++) {
            const img = document.createElement("img");
            const path = `assets/${folder}/layout${currentLayout}/${prefix}${i}.png`;
            img.src = path;
            img.className = "thumb";
            img.onclick = () => {
                if(type === 'bg') selectedBg = path;
                else selectedSticker = path;
                updatePreview();
            };
            img.onerror = () => img.remove();
            el.appendChild(img);
        }
    };
    loadList('bgSelector', 'background', 'bg', 'bg');
    loadList('stickerSelector', 'sticker', 'sticker', 'sticker');
}

async function updatePreview() {
    const canvas = document.getElementById("previewCanvas");
    const ctx = canvas.getContext("2d");
    const conf = config[currentLayout];

    canvas.width = conf.canvasW;
    canvas.height = conf.canvasH;

    const load = (src) => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });

    // 1. BG
    const bgImg = await load(selectedBg);
    ctx.drawImage(bgImg, 0, 0, canvas.width, canvas.height);

    // 2. Photos
    for (let i = 0; i < capturedPhotos.length; i++) {
        const pImg = await load(capturedPhotos[i]);
        const x = (canvas.width - conf.photoW) / 2;
        const y = conf.startY + (i * conf.gap);
        ctx.drawImage(pImg, x, y, conf.photoW, conf.photoH);
    }

    // 3. Sticker
    const sImg = await load(selectedSticker);
    ctx.drawImage(sImg, 0, 0, canvas.width, canvas.height);
}

function downloadFinal() {
    const link = document.createElement('a');
    link.download = 'poseid.png';
    link.href = document.getElementById("previewCanvas").toDataURL();
    link.click();
}

startCamera();
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

// --- KONFIGURASI FILTER 3D OTOMATIS ---
const TOTAL_FILTERS = 10; // Ubah angka ini jika jumlah filter bertambah
const PATH_3D = "assets/Ar/";
const PATH_PREVIEW = "assets/Ar/preview/";

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
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
        video.srcObject = stream;
        video.onloadedmetadata = () => {
            cameraCanvas.width = arCanvas.width = video.videoWidth;
            cameraCanvas.height = arCanvas.height = video.videoHeight;
            if (typeof initThreeJS === "function") initThreeJS();
            if (typeof initFaceMesh === "function") initFaceMesh();
            // Load filter default jika diinginkan
            if (typeof loadARFilters === "function") {
                // Contoh: loadARFilters(PATH_3D + 'filter1.glb'); 
            }
            renderLoop();
        };
    } catch (err) {
        console.error("Kamera tidak dapat diakses:", err);
    }
}

async function renderLoop() {
    ctx2D.save();
    ctx2D.translate(cameraCanvas.width, 0); 
    ctx2D.scale(-1, 1);
    ctx2D.drawImage(video, 0, 0);
    ctx2D.restore();
    if (renderer && scene && camera3D) renderer.render(scene, camera3D);
    requestAnimationFrame(renderLoop);
}

// --- LOGIKA LOAD & SELECTOR FILTER 3D (PENYATUAN) ---

window.loadARFilters = (path) => {
    if (!scene || !window.THREE) return;
    const loader = new THREE.GLTFLoader();
    
    loader.load(path, (gltf) => {
        if (filterMesh) scene.remove(filterMesh); // Hapus model lama
        filterMesh = gltf.scene;
        scene.add(filterMesh);
        console.log("Filter 3D Aktif:", path);
    }, undefined, (err) => console.error("Gagal memuat model 3D:", err));
};

window.updateARSelector = () => {
    // Menyesuaikan dengan ID "arSelector" di HTML Anda
    const el = document.getElementById("arSelector"); 
    if (!el) return;
    el.innerHTML = "";

    for (let i = 10; i <= TOTAL_FILTERS; i++) {
        const img = document.createElement("img");
        const modelPath = `${PATH_3D}filter${i}.glb`;
        const previewPath = `${PATH_PREVIEW}filter${i}.png`;

        img.src = previewPath;
        img.className = "asset-thumb";
        
        // Klik gambar langsung aktifkan model 3D
        img.onclick = () => {
            window.loadARFilters(modelPath);
            document.querySelectorAll('#arSelector .asset-thumb').forEach(b => b.classList.remove('active'));
            img.classList.add('active');
        };

        img.onerror = () => img.remove(); // Sembunyikan jika file preview tidak ada
        el.appendChild(img);
    }
};

// 3. CAPTURE LOGIC
window.changeLayout = (l, btn) => {
    currentLayout = l;
    document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
};

window.setLayout = (l, btn) => {
    window.changeLayout(l, btn);
};

window.startCapture = () => {
    if (isCapturing) return;
    capturedPhotos = []; 
    isCapturing = true;
    runCountdown();
};

function runCountdown() {
    let count = 3;
    timerEl.style.display = 'block';
    const timer = setInterval(() => {
        timerEl.innerText = count === 0 ? "📸" : count;
        if (count < 0) {
            clearInterval(timer); 
            timerEl.style.display = 'none';
            takeSnapshot();
            if (capturedPhotos.length < config[currentLayout].target) {
                runCountdown();
            } else { 
                isCapturing = false; 
                openEditor(); 
            }
        }
        count--;
    }, 1000);
}

function takeSnapshot() {
    const temp = document.createElement("canvas");
    temp.width = cameraCanvas.width; 
    temp.height = cameraCanvas.height;
    const tCtx = temp.getContext("2d");
    tCtx.drawImage(cameraCanvas, 0, 0);
    tCtx.drawImage(arCanvas, 0, 0);
    capturedPhotos.push(temp.toDataURL('image/png'));
}

// 4. EDITOR LOGIC
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
    if(!el) return;
    el.innerHTML = "";
    for (let i = 1; i <= 10; i++) {
        const img = document.createElement("img");
        const path = `assets/${folder}/layout${currentLayout}/${prefix}${i}.png`;
        img.src = path; 
        img.className = "asset-thumb";
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
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const conf = config[currentLayout];
    canvas.width = conf.canvasW; 
    canvas.height = conf.canvasH;

    const loadImg = (src) => new Promise(res => { 
        const i = new Image(); 
        i.onload = () => res(i); 
        i.onerror = () => res(null);
        i.src = src; 
    });

    const bg = await loadImg(selectedBg);
    if (bg) ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    for (let i = 0; i < capturedPhotos.length; i++) {
        const p = await loadImg(capturedPhotos[i]);
        if (!p) continue;

        let x, y;
        if (conf.isGrid) {
            x = 50 + (i % 2 * conf.gap);
            y = conf.startY + (Math.floor(i / 2) * conf.gap);
        } else if (conf.isHorizontal) {
            x = 50 + (i * conf.gap); 
            y = conf.startY;
        } else {
            x = (canvas.width - conf.photoW) / 2;
            y = conf.startY + (i * conf.gap);
        }

        const imgW = p.width;
        const imgH = p.height;
        const targetW = conf.photoW;
        const targetH = conf.photoH;

        const imgAspect = imgW / imgH;
        const targetAspect = targetW / targetH;

        let sX, sY, sW, sH;
        if (imgAspect > targetAspect) {
            sH = imgH;
            sW = imgH * targetAspect;
            sX = (imgW - sW) / 2;
            sY = 0;
        } else {
            sW = imgW;
            sH = imgW / targetAspect;
            sX = 0;
            sY = (imgH - sH) / 2;
        }

        ctx.drawImage(p, sX, sY, sW, sH, x, y, targetW, targetH);
    }

    const st = await loadImg(selectedSticker);
    if (st) ctx.drawImage(st, 0, 0, canvas.width, canvas.height);
}

window.downloadFinal = () => {
    const canvas = document.getElementById("previewCanvas");
    const link = document.createElement('a');
    link.download = 'poseid.png';
    link.href = canvas.toDataURL();
    link.click();
};

// INITIALIZATION
document.addEventListener("DOMContentLoaded", () => {
    init();
    setTimeout(() => {
        if (typeof updateARSelector === "function") updateARSelector();
        if (typeof updateAssetSelectors === "function") updateAssetSelectors();
    }, 1000);
});

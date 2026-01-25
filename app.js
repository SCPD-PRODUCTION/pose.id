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

const TOTAL_FILTERS = 10; 
const PATH_3D = "assets/Ar/";
const PATH_PREVIEW = "assets/Ar/preview/";

const config = {
    1: { canvasW: 506, canvasH: 765, photoW: 380, photoH: 550, startY: 100, gap: 0, target: 1 },
    2: { canvasW: 1000, canvasH: 700, photoW: 440, photoH: 550, startY: 75, gap: 460, target: 2, isHorizontal: true },
    3: { canvasW: 591, canvasH: 1773, photoW: 485, photoH: 485, startY: 135, gap: 540, target: 3 },
    4: { canvasW: 1000, canvasH: 1000, photoW: 440, photoH: 440, startY: 50, gap: 460, target: 4, isGrid: true },
    5: { canvasW: 500, canvasH: 1800, photoW: 400, photoH: 300, startY: 100, gap: 320, target: 5 }
};

// --- 1. INISIALISASI ENGINE 3D (THREE.JS) ---
function initThreeJS() {
    scene = new THREE.Scene();
    camera3D = new THREE.PerspectiveCamera(50, video.videoWidth / video.videoHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ 
        canvas: arCanvas, 
        alpha: true, 
        preserveDrawingBuffer: true, // WAJIB: Agar AR bisa ikut difoto
        antialias: false 
    });
    renderer.setPixelRatio(0.8); 
    renderer.setSize(video.videoWidth, video.videoHeight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.8);
    scene.add(ambientLight);
}

// --- 2. INISIALISASI FACE TRACKING (AI) ---
async function initFaceMesh() {
    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    detector = await faceLandmarksDetection.createDetector(model, {
        runtime: 'tfjs',
        refineLandmarks: false,
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh'
    });
}

// --- 3. UPDATE POSISI FILTER PADA WAJAH ---
async function updateFaceTracking() {
    if (!detector || !video || !filterMesh || isCapturing) return;
    
    const faces = await detector.estimateFaces(video, { flipHorizontal: false });

    if (faces.length > 0) {
        const face = faces[0];
        const nose = face.keypoints[1]; 
        
        const x = (nose.x / video.videoWidth) * 2 - 1;
        const y = -(nose.y / video.videoHeight) * 2 + 1;
        
        // Posisi dan Skala (Skala 4 agar pas menutupi wajah)
        filterMesh.position.set(x * 3.5, y * 2.5, -5); 
        filterMesh.visible = true;

        // Rotasi Berdasarkan Mata
        const leftEye = face.keypoints[33];
        const rightEye = face.keypoints[263];
        filterMesh.rotation.z = Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x);
    } else {
        filterMesh.visible = false;
    }
}

// --- 4. START APP ---
async function init() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { width: { ideal: 1280 }, height: { ideal: 720 } } 
        });
        video.srcObject = stream;
        video.onloadedmetadata = async () => {
            cameraCanvas.width = arCanvas.width = video.videoWidth;
            cameraCanvas.height = arCanvas.height = video.videoHeight;
            initThreeJS();
            await initFaceMesh();
            renderLoop();
        };
    } catch (err) { console.error("Kamera Error:", err); }
}

let lastTracking = 0;
function renderLoop(now) {
    // Render Kamera (Mirror)
    ctx2D.save();
    ctx2D.translate(cameraCanvas.width, 0); 
    ctx2D.scale(-1, 1);
    ctx2D.drawImage(video, 0, 0);
    ctx2D.restore();

    // Optimasi: Tracking setiap 40ms (~25 FPS) agar ringan
    if (now - lastTracking > 40) {
        updateFaceTracking();
        lastTracking = now;
    }

    if (renderer && scene && camera3D) renderer.render(scene, camera3D);
    requestAnimationFrame(renderLoop);
}

// --- 5. FILTER SELECTOR ---
window.loadARFilters = (path) => {
    const loader = new THREE.GLTFLoader();
    loader.load(path, (gltf) => {
        if (filterMesh) scene.remove(filterMesh); 
        filterMesh = gltf.scene;
        filterMesh.scale.set(4, 4, 4); // Diperbesar sesuai kebutuhan wajah
        scene.add(filterMesh);
    });
};

window.updateARSelector = () => {
    const el = document.getElementById("arSelector"); 
    if (!el) return;
    el.innerHTML = "";
    for (let i = 1; i <= TOTAL_FILTERS; i++) {
        const img = document.createElement("img");
        img.src = `${PATH_PREVIEW}filter${i}.png`;
        img.className = "asset-thumb";
        img.onclick = () => {
            window.loadARFilters(`${PATH_3D}filter${i}.glb`);
            document.querySelectorAll('#arSelector .asset-thumb').forEach(b => b.classList.remove('selected'));
            img.classList.add('selected');
        };
        el.appendChild(img);
    }
};

// --- 6. CAPTURE & SNAPSHOT ---
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
            clearInterval(timer); 
            timerEl.style.display = 'none';
            takeSnapshot();
            if (capturedPhotos.length < config[currentLayout].target) runCountdown();
            else { isCapturing = false; openEditor(); }
        }
        count--;
    }, 1000);
}

function takeSnapshot() {
    const temp = document.createElement("canvas");
    temp.width = cameraCanvas.width; 
    temp.height = cameraCanvas.height;
    const tCtx = temp.getContext("2d");
    tCtx.drawImage(cameraCanvas, 0, 0); // Foto orang
    tCtx.drawImage(arCanvas, 0, 0);      // Foto filter
    capturedPhotos.push(temp.toDataURL('image/png'));
}

// --- 7. EDITOR & DOWNLOAD ---
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
        el.appendChild(img);
    }
}

async function updatePreview() {
    const canvas = document.getElementById("previewCanvas");
    const ctx = canvas.getContext("2d");
    const conf = config[currentLayout];
    canvas.width = conf.canvasW; canvas.height = conf.canvasH;

    const loadImg = (src) => new Promise(res => { 
        const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; 
    });

    const bg = await loadImg(selectedBg);
    if (bg) ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);

    for (let i = 0; i < capturedPhotos.length; i++) {
        const p = await loadImg(capturedPhotos[i]);
        if (!p) continue;
        let x = (canvas.width - conf.photoW) / 2;
        let y = conf.startY + (i * conf.gap);
        ctx.drawImage(p, x, y, conf.photoW, conf.photoH);
    }
    const st = await loadImg(selectedSticker);
    if (st) ctx.drawImage(st, 0, 0, canvas.width, canvas.height);
}

window.downloadFinal = () => {
    const canvas = document.getElementById("previewCanvas");
    const btn = document.querySelector(".download-all-btn");
    const link = document.createElement('a');
    link.download = `Poseid_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    
    btn.innerText = "BERHASIL!";
    setTimeout(() => btn.innerText = "SIMPAN FOTO", 2000);
};

window.setLayout = (l, btn) => {
    currentLayout = l;
    document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
};

document.addEventListener("DOMContentLoaded", () => {
    init();
    setTimeout(window.updateARSelector, 500);
});

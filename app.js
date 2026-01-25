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

// --- OPTIMASI: Inisialisasi Engine 3D Ringan ---
function initThreeJS() {
    scene = new THREE.Scene();
    // FOV diperkecil agar objek lebih mudah terlihat
    camera3D = new THREE.PerspectiveCamera(50, video.videoWidth / video.videoHeight, 0.1, 1000);
    
    renderer = new THREE.WebGLRenderer({ 
        canvas: arCanvas, 
        alpha: true, 
        preserveDrawingBuffer: true,
        antialias: false // Dimatikan agar lebih ringan di HP/PC kentang
    });
    renderer.setPixelRatio(0.8); // Kualitas diturunkan sedikit agar FPS naik
    renderer.setSize(video.videoWidth, video.videoHeight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
    scene.add(ambientLight);
}

// --- OPTIMASI: Load FaceMesh Lebih Cepat ---
async function initFaceMesh() {
    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    detector = await faceLandmarksDetection.createDetector(model, {
        runtime: 'tfjs',
        refineLandmarks: false, // Dimatikan agar lebih ringan
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh'
    });
}

// --- LOGIKA POSISI 3D (DIBENERIN) ---
async function updateFaceTracking() {
    if (!detector || !video || !filterMesh || isCapturing) return;
    
    const faces = await detector.estimateFaces(video, { flipHorizontal: false });

    if (faces.length > 0) {
        const face = faces[0];
        const nose = face.keypoints[1]; // Titik pusat hidung
        
        // Konversi koordinat (0 ke 1)
        const x = (nose.x / video.videoWidth) * 2 - 1;
        const y = -(nose.y / video.videoHeight) * 2 + 1;
        
        // PENTING: Skala dan posisi Z disesuaikan agar muncul di depan mata
        filterMesh.position.set(x * 3.5, y * 2.5, -5); 
        filterMesh.visible = true;
    } else {
        filterMesh.visible = false;
    }
}

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
    } catch (err) { console.error(err); }
}

let lastFrameTime = 0;
function renderLoop(now) {
    // Jalankan render kamera 2D
    ctx2D.save();
    ctx2D.translate(cameraCanvas.width, 0); 
    ctx2D.scale(-1, 1);
    ctx2D.drawImage(video, 0, 0);
    ctx2D.restore();

    // OPTIMASI: Batasi tracking hanya setiap 30ms (sekitar 30fps) agar tidak ngelag
    if (now - lastFrameTime > 30) {
        updateFaceTracking();
        lastFrameTime = now;
    }

    if (renderer && scene && camera3D) renderer.render(scene, camera3D);
    requestAnimationFrame(renderLoop);
}

// --- FUNGSI LAINNYA TETAP SAMA ---
window.loadARFilters = (path) => {
    const loader = new THREE.GLTFLoader();
    loader.load(path, (gltf) => {
        if (filterMesh) scene.remove(filterMesh); 
        filterMesh = gltf.scene;
        // Jaga-jaga jika model aslinya terlalu kecil, kita besarkan di sini
        filterMesh.scale.set(3, 3, 3); 
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
        img.onerror = () => img.style.display = 'none';
        el.appendChild(img);
    }
};

window.setLayout = (l, btn) => {
    currentLayout = l;
    document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
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
    tCtx.drawImage(cameraCanvas, 0, 0);
    tCtx.drawImage(arCanvas, 0, 0);
    capturedPhotos.push(temp.toDataURL('image/png'));
}

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
        img.src = `assets/${folder}/layout${currentLayout}/${prefix}${i}.png`; 
        img.className = "asset-thumb";
        img.onclick = () => {
            if (prefix === 'bg') selectedBg = img.src; else selectedSticker = img.src;
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
    const link = document.createElement('a');
    link.download = 'poseid.png';
    link.href = canvas.toDataURL();
    link.click();
};

document.addEventListener("DOMContentLoaded", () => {
    init();
    setTimeout(window.updateARSelector, 500);
});

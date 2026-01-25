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

// --- 1. SETUP ENGINE 3D ---
function initThreeJS() {
    scene = new THREE.Scene();
    camera3D = new THREE.PerspectiveCamera(75, video.videoWidth / video.videoHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ canvas: arCanvas, alpha: true, preserveDrawingBuffer: true }); // Penting: preserveDrawingBuffer agar bisa di-capture
    renderer.setSize(video.videoWidth, video.videoHeight);

    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);
}

// --- 2. SETUP FACE TRACKING ---
async function initFaceMesh() {
    const model = faceLandmarksDetection.SupportedModels.MediaPipeFaceMesh;
    detector = await faceLandmarksDetection.createDetector(model, {
        runtime: 'tfjs',
        solutionPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh'
    });
}

// --- 3. TRACKING LOGIC ---
async function updateFaceTracking() {
    if (!detector || !video || !filterMesh) return;
    const faces = await detector.estimateFaces(video);

    if (faces.length > 0) {
        const face = faces[0];
        const nose = face.keypoints[1];
        
        // Posisi filter mengikuti hidung
        const x = (nose.x / video.videoWidth) * 2 - 1;
        const y = -(nose.y / video.videoHeight) * 2 + 1;
        
        filterMesh.position.set(x * 4, y * 3, -5); 
        filterMesh.visible = true;
    } else {
        filterMesh.visible = false;
    }
}

// --- 4. CORE CAMERA & RENDER ---
async function init() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 } });
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

function renderLoop() {
    ctx2D.save();
    ctx2D.translate(cameraCanvas.width, 0); 
    ctx2D.scale(-1, 1);
    ctx2D.drawImage(video, 0, 0);
    ctx2D.restore();

    if (detector) updateFaceTracking();
    if (renderer && scene && camera3D) renderer.render(scene, camera3D);
    
    requestAnimationFrame(renderLoop);
}

// --- 5. SNAPSHOT LOGIC (INI YANG MEMBUAT AR IKUT KE-CAPTURE) ---
function takeSnapshot() {
    const temp = document.createElement("canvas");
    temp.width = cameraCanvas.width; 
    temp.height = cameraCanvas.height;
    const tCtx = temp.getContext("2d");

    // 1. Gambar orangnya dulu
    tCtx.drawImage(cameraCanvas, 0, 0);
    // 2. Gambar filternya di atas orangnya
    tCtx.drawImage(arCanvas, 0, 0);

    capturedPhotos.push(temp.toDataURL('image/png'));
}

// --- 6. FITUR LAMA (Layout, Editor, Selector) ---
window.loadARFilters = (path) => {
    const loader = new THREE.GLTFLoader();
    loader.load(path, (gltf) => {
        if (filterMesh) scene.remove(filterMesh); 
        filterMesh = gltf.scene;
        filterMesh.scale.set(2, 2, 2); 
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
            document.querySelectorAll('.asset-thumb').forEach(b => b.classList.remove('selected'));
            img.classList.add('selected');
        };
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
        // Jika layout horizontal/grid, sesuaikan x & y (logika config Anda)
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

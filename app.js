let faceDetectionModel;
let video;
let canvas;
let ctx;
let faceData = new Map();
let isCameraRunning = false;
let lastRecognitionTime = 0;
const RECOGNITION_INTERVAL = 1000; // 1 second between recognitions

// DOM Elements
const startBtn = document.getElementById('startBtn');
const registerBtn = document.getElementById('registerBtn');
const recognizeBtn = document.getElementById('recognizeBtn');
const statusDiv = document.getElementById('status');
const faceCountSpan = document.getElementById('faceCount');
const recognitionStatusDiv = document.getElementById('recognitionStatus');
const registeredFacesList = document.getElementById('registeredFacesList');

// Initialize the application
async function init() {
    try {
        statusDiv.textContent = 'Loading TensorFlow.js model...';
        
        // Load the face detection model
        faceDetectionModel = await blazeface.load();
        
        // Setup video stream
        video = document.getElementById('video');
        canvas = document.getElementById('canvas');
        ctx = canvas.getContext('2d');

        // Add event listeners
        startBtn.addEventListener('click', startCamera);
        registerBtn.addEventListener('click', registerFace);
        recognizeBtn.addEventListener('click', recognizeFace);

        statusDiv.textContent = 'Model loaded successfully. Click "Start Camera" to begin.';
    } catch (error) {
        console.error('Initialization error:', error);
        statusDiv.textContent = `Error initializing: ${error.message}`;
    }
}

// Start the camera
async function startCamera() {
    if (isCameraRunning) {
        stopCamera();
        return;
    }

    try {
        statusDiv.textContent = 'Requesting camera access...';
        
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('getUserMedia is not supported in this browser');
        }

        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: "user"
            }
        });

        video.srcObject = stream;
        
        await new Promise((resolve) => {
            video.onloadedmetadata = () => {
                video.play();
                resolve();
            };
        });

        isCameraRunning = true;
        startBtn.textContent = 'Stop Camera';
        registerBtn.disabled = false;
        recognizeBtn.disabled = false;
        statusDiv.textContent = 'Camera started successfully. You can now register or recognize faces.';

        // Start face detection loop
        detectFaces();

    } catch (error) {
        console.error('Camera error:', error);
        let errorMessage = 'Error accessing camera: ';
        
        if (error.name === 'NotAllowedError') {
            errorMessage += 'Camera access was denied. Please allow camera access and try again.';
        } else if (error.name === 'NotFoundError') {
            errorMessage += 'No camera found. Please connect a camera and try again.';
        } else if (error.name === 'NotReadableError') {
            errorMessage += 'Camera is already in use by another application.';
        } else {
            errorMessage += error.message;
        }
        
        statusDiv.textContent = errorMessage;
    }
}

// Stop the camera
function stopCamera() {
    if (video.srcObject) {
        const tracks = video.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        video.srcObject = null;
    }
    isCameraRunning = false;
    startBtn.textContent = 'Start Camera';
    registerBtn.disabled = true;
    recognizeBtn.disabled = true;
    statusDiv.textContent = 'Camera stopped.';
    faceCountSpan.textContent = '0';
    recognitionStatusDiv.textContent = '';
}

// Detect faces in the video stream
async function detectFaces() {
    if (!isCameraRunning) return;

    try {
        const predictions = await faceDetectionModel.estimateFaces(video);
        
        // Clear canvas
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Update face count
        faceCountSpan.textContent = predictions.length;
        
        if (predictions.length > 0) {
            // Draw face bounding boxes and landmarks
            for (const face of predictions) {
                const start = face.topLeft;
                const end = face.bottomRight;
                const size = [end[0] - start[0], end[1] - start[1]];
                
                // Draw bounding box
                ctx.strokeStyle = '#00FF00';
                ctx.lineWidth = 2;
                ctx.strokeRect(start[0], start[1], size[0], size[1]);
                
                // Draw face landmarks
                ctx.fillStyle = '#00FF00';
                face.landmarks.forEach(landmark => {
                    ctx.beginPath();
                    ctx.arc(landmark[0], landmark[1], 2, 0, 2 * Math.PI);
                    ctx.fill();
                });
            }

            // Auto-recognition every second
            const now = Date.now();
            if (now - lastRecognitionTime >= RECOGNITION_INTERVAL) {
                lastRecognitionTime = now;
                autoRecognizeFaces(predictions);
            }
        } else {
            recognitionStatusDiv.textContent = 'No faces detected';
        }
    } catch (error) {
        console.error('Face detection error:', error);
    }

    if (isCameraRunning) {
        requestAnimationFrame(detectFaces);
    }
}

// Auto-recognize faces
async function autoRecognizeFaces(predictions) {
    try {
        for (const face of predictions) {
            const descriptor = extractFaceDescriptor(face);
            
            // Find best match
            let bestMatch = null;
            let minDistance = Infinity;

            for (const [name, storedDescriptor] of faceData.entries()) {
                const distance = calculateDistance(descriptor, storedDescriptor);
                if (distance < minDistance) {
                    minDistance = distance;
                    bestMatch = name;
                }
            }

            if (bestMatch && minDistance < 0.6) {
                recognitionStatusDiv.textContent = `Recognized: ${bestMatch}`;
            } else {
                recognitionStatusDiv.textContent = 'Unknown face';
            }
        }
    } catch (error) {
        console.error('Auto-recognition error:', error);
    }
}

// Extract face descriptor from face landmarks
function extractFaceDescriptor(face) {
    // Normalize landmarks to be relative to face position
    const start = face.topLeft;
    const end = face.bottomRight;
    const width = end[0] - start[0];
    const height = end[1] - start[1];
    
    return face.landmarks.map(landmark => [
        (landmark[0] - start[0]) / width,
        (landmark[1] - start[1]) / height
    ]).flat();
}

// Register a new face
async function registerFace() {
    try {
        const name = prompt('Enter name for the face:');
        if (!name) return;

        const predictions = await faceDetectionModel.estimateFaces(video);
        if (predictions.length === 0) {
            statusDiv.textContent = 'No face detected. Please try again.';
            return;
        }

        const face = predictions[0];
        const descriptor = extractFaceDescriptor(face);
        
        faceData.set(name, descriptor);
        updateRegisteredFacesList();
        statusDiv.textContent = `Face registered successfully for ${name}`;
    } catch (error) {
        console.error('Registration error:', error);
        statusDiv.textContent = `Error registering face: ${error.message}`;
    }
}

// Update the list of registered faces
function updateRegisteredFacesList() {
    registeredFacesList.innerHTML = '';
    for (const name of faceData.keys()) {
        const li = document.createElement('li');
        li.textContent = name;
        registeredFacesList.appendChild(li);
    }
}

// Recognize a face
async function recognizeFace() {
    try {
        const predictions = await faceDetectionModel.estimateFaces(video);
        if (predictions.length === 0) {
            statusDiv.textContent = 'No face detected. Please try again.';
            return;
        }

        const face = predictions[0];
        const descriptor = extractFaceDescriptor(face);
        
        let bestMatch = null;
        let minDistance = Infinity;

        for (const [name, storedDescriptor] of faceData.entries()) {
            const distance = calculateDistance(descriptor, storedDescriptor);
            if (distance < minDistance) {
                minDistance = distance;
                bestMatch = name;
            }
        }

        if (bestMatch && minDistance < 0.6) {
            statusDiv.textContent = `Recognized as: ${bestMatch} (confidence: ${(1 - minDistance).toFixed(2)})`;
        } else {
            statusDiv.textContent = 'Face not recognized. Please register first.';
        }
    } catch (error) {
        console.error('Recognition error:', error);
        statusDiv.textContent = `Error recognizing face: ${error.message}`;
    }
}

// Calculate distance between two face descriptors
function calculateDistance(descriptor1, descriptor2) {
    let sum = 0;
    for (let i = 0; i < descriptor1.length; i++) {
        const diff = descriptor1[i] - descriptor2[i];
        sum += diff * diff;
    }
    return Math.sqrt(sum);
}

// Initialize the application when the page loads
window.addEventListener('load', init); 
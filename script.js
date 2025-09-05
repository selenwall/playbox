// Game state
let gameState = {
    mode: 'photo', // 'photo', 'items', 'guessing'
    detectedItems: [],
    photoLocation: null,
    currentLocation: null,
    score: 0,
    model: null
};

// DOM elements
const camera = document.getElementById('camera');
const canvas = document.getElementById('canvas');
const captureBtn = document.getElementById('captureBtn');
const itemsList = document.getElementById('itemsList');
const guessingItemsList = document.getElementById('guessingItemsList');
const distanceDisplay = document.getElementById('distanceDisplay');
const scoreDisplay = document.getElementById('scoreDisplay');
const locationStatus = document.getElementById('locationStatus');
const detectionLoading = document.getElementById('detectionLoading');

// Initialize the game
async function initGame() {
    try {
        showStatus('Loading AI model...', 'loading');
        gameState.model = await cocoSsd.load();
        showStatus('Model loaded! Ready to take photos.', 'success');
        
        // Request camera access
        await initCamera();
    } catch (error) {
        console.error('Error initializing game:', error);
        showStatus('Error loading game. Please refresh the page.', 'error');
    }
}

// Initialize camera
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 640 },
                height: { ideal: 480 }
            } 
        });
        camera.srcObject = stream;
        captureBtn.disabled = false;
    } catch (error) {
        console.error('Error accessing camera:', error);
        showStatus('Camera access denied. Please allow camera access and refresh.', 'error');
    }
}

// Capture photo and detect objects
captureBtn.addEventListener('click', async function() {
    if (!gameState.model) {
        showStatus('Model not loaded yet. Please wait.', 'error');
        return;
    }

    try {
        captureBtn.disabled = true;
        showStatus('Capturing photo...', 'loading');
        
        // Capture photo
        const context = canvas.getContext('2d');
        canvas.width = camera.videoWidth;
        canvas.height = camera.videoHeight;
        context.drawImage(camera, 0, 0);
        
        // Get current location
        const position = await getCurrentPosition();
        gameState.photoLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
        };
        
        // Detect objects
        detectionLoading.style.display = 'block';
        const predictions = await gameState.model.detect(canvas);
        
        // Filter and process detected items
        gameState.detectedItems = predictions
            .filter(prediction => prediction.score > 0.5)
            .map(prediction => prediction.class)
            .filter((item, index, array) => array.indexOf(item) === index); // Remove duplicates
        
        detectionLoading.style.display = 'none';
        
        if (gameState.detectedItems.length === 0) {
            showStatus('No items detected. Try taking another photo.', 'error');
            captureBtn.disabled = false;
            return;
        }
        
        // Show items screen
        showItemsScreen();
        
    } catch (error) {
        console.error('Error capturing photo:', error);
        showStatus('Error capturing photo. Please try again.', 'error');
        captureBtn.disabled = false;
        detectionLoading.style.display = 'none';
    }
});

// Show items screen
function showItemsScreen() {
    document.getElementById('photoScreen').classList.remove('active');
    document.getElementById('itemsScreen').classList.add('active');
    
    // Display detected items
    itemsList.innerHTML = '';
    gameState.detectedItems.forEach(item => {
        const itemTag = document.createElement('div');
        itemTag.className = 'item-tag';
        itemTag.textContent = item;
        itemsList.appendChild(itemTag);
    });
}

// Start guessing mode
function startGuessing() {
    document.getElementById('itemsScreen').classList.remove('active');
    document.getElementById('guessingScreen').classList.add('active');
    
    // Display items for guessing
    guessingItemsList.innerHTML = '';
    gameState.detectedItems.forEach(item => {
        const itemTag = document.createElement('div');
        itemTag.className = 'item-tag';
        itemTag.textContent = item;
        guessingItemsList.appendChild(itemTag);
    });
    
    // Start location tracking
    startLocationTracking();
}

// Start location tracking for guessing
function startLocationTracking() {
    if (!navigator.geolocation) {
        showStatus('Geolocation not supported by this browser.', 'error');
        return;
    }

    const watchId = navigator.geolocation.watchPosition(
        function(position) {
            gameState.currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude
            };
            updateDistance();
        },
        function(error) {
            console.error('Geolocation error:', error);
            showStatus('Location access denied. Please enable location services.', 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 1000
        }
    );
}

// Update distance and check for win condition
function updateDistance() {
    if (!gameState.photoLocation || !gameState.currentLocation) return;

    const distance = calculateDistance(
        gameState.photoLocation.latitude,
        gameState.photoLocation.longitude,
        gameState.currentLocation.latitude,
        gameState.currentLocation.longitude
    );

    distanceDisplay.textContent = `Distance: ${distance.toFixed(1)}m`;
    scoreDisplay.textContent = `Score: ${gameState.score}`;

    if (distance <= 10) {
        if (gameState.score === 0) {
            gameState.score = 1;
            locationStatus.textContent = '🎉 Congratulations! You found the location!';
            locationStatus.className = 'status success';
        }
    } else {
        locationStatus.textContent = 'Move around to find the location!';
        locationStatus.className = 'status';
    }
}

// Calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Get current position with promise
function getCurrentPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        });
    });
}

// Go back to photo taking
function goBackToPhoto() {
    document.getElementById('guessingScreen').classList.remove('active');
    document.getElementById('photoScreen').classList.add('active');
    
    // Reset game state
    gameState.mode = 'photo';
    gameState.detectedItems = [];
    gameState.photoLocation = null;
    gameState.currentLocation = null;
    gameState.score = 0;
    
    // Reset UI
    captureBtn.disabled = false;
    locationStatus.textContent = 'Move around to find the location!';
    locationStatus.className = 'status';
}

// Show status message
function showStatus(message, type = '') {
    const status = document.createElement('div');
    status.className = `status ${type}`;
    status.textContent = message;
    document.querySelector('.container').insertBefore(status, document.querySelector('.game-screen.active'));
    
    setTimeout(() => {
        if (status.parentNode) {
            status.parentNode.removeChild(status);
        }
    }, 3000);
}

// Initialize the game when page loads
window.addEventListener('load', initGame);

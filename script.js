// Game state
let gameState = {
    mode: 'photo', // 'photo', 'items', 'guessing'
    detectedItems: [],
    photoLocation: null,
    currentLocation: null,
    score: 0,
    model: null,
    capturedPhotoData: null, // Store the captured photo as data URL
    locationWatchId: null // Store location tracking watch ID
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
        console.log('Camera initialized for photo mode');
    } catch (error) {
        console.error('Error accessing camera:', error);
        showStatus('Camera access denied. Please allow camera access and refresh.', 'error');
    }
}

// Stop camera
function stopCamera() {
    if (camera.srcObject) {
        const tracks = camera.srcObject.getTracks();
        tracks.forEach(track => track.stop());
        camera.srcObject = null;
        console.log('Camera stopped');
    }
}

// Start camera
async function startCamera() {
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
        console.log('Camera started for photo mode');
    } catch (error) {
        console.error('Error starting camera:', error);
        showStatus('Failed to start camera. Please try again.', 'error');
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
        
        // Store the captured photo as data URL
        gameState.capturedPhotoData = canvas.toDataURL('image/jpeg', 0.8);
        
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

// Start guessing mode (Mode 2: Location Searching)
function startGuessing() {
    // Stop camera when entering searching mode
    stopCamera();
    
    document.getElementById('itemsScreen').classList.remove('active');
    document.getElementById('guessingScreen').classList.add('active');
    
    // Update game state
    gameState.mode = 'guessing';
    
    // Display pixelated photo if available
    const pixelatedPhoto = document.getElementById('pixelatedPhoto');
    if (gameState.capturedPhotoData) {
        pixelatedPhoto.src = gameState.capturedPhotoData;
        pixelatedPhoto.style.display = 'block';
    } else {
        pixelatedPhoto.style.display = 'none';
    }
    
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
    
    console.log('Switched to Mode 2: Location Searching');
}

// Start location tracking for guessing
function startLocationTracking() {
    if (!navigator.geolocation) {
        showStatus('Geolocation not supported by this browser.', 'error');
        return;
    }

    gameState.locationWatchId = navigator.geolocation.watchPosition(
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

// Go back to photo taking (Mode 1: Photo Taking)
function goBackToPhoto() {
    // Stop any location tracking
    if (gameState.locationWatchId) {
        navigator.geolocation.clearWatch(gameState.locationWatchId);
        gameState.locationWatchId = null;
    }
    
    document.getElementById('guessingScreen').classList.remove('active');
    document.getElementById('photoScreen').classList.add('active');
    
    // Reset game state
    gameState.mode = 'photo';
    gameState.detectedItems = [];
    gameState.photoLocation = null;
    gameState.currentLocation = null;
    gameState.score = 0;
    gameState.capturedPhotoData = null;
    
    // Restart camera for photo mode
    startCamera();
    
    // Reset UI
    locationStatus.textContent = 'Move around to find the location!';
    locationStatus.className = 'status';
    
    console.log('Switched to Mode 1: Photo Taking');
}

// Generate shareable link with encoded data
function generateShareLink() {
    if (!gameState.detectedItems || gameState.detectedItems.length === 0) {
        showStatus('No items to share! Take a photo first.', 'error');
        return null;
    }
    
    if (!gameState.photoLocation) {
        showStatus('No location data! Take a photo first.', 'error');
        return null;
    }
    
    // Create data object with items and location
    const shareData = {
        items: gameState.detectedItems,
        lat: gameState.photoLocation.latitude,
        lng: gameState.photoLocation.longitude,
        timestamp: Date.now()
    };
    
    // Encode data as base64
    const encodedData = btoa(JSON.stringify(shareData));
    
    // Create shareable URL (use GitHub Pages URL in production)
    const isProduction = window.location.hostname === 'selenwall.github.io';
    const baseUrl = isProduction 
        ? 'https://selenwall.github.io/playbox'
        : window.location.origin + window.location.pathname;
    const shareUrl = `${baseUrl}?challenge=${encodedData}`;
    
    return shareUrl;
}

// Share items using Web Share API with generated link
async function shareItems() {
    console.log('Share items clicked');
    
    const shareUrl = generateShareLink();
    if (!shareUrl) return;
    
    const shareText = `🎯 Location Guessing Game Challenge!\n\nI found these items in a photo: ${gameState.detectedItems.join(', ')}\n\nCan you guess where I took this photo? Click the link to play!`;
    
    console.log('Share URL:', shareUrl);
    console.log('Navigator.share available:', !!navigator.share);
    
    if (navigator.share) {
        try {
            console.log('Attempting native share...');
            await navigator.share({
                title: 'Location Guessing Game Challenge',
                text: shareText,
                url: shareUrl
            });
            console.log('Share successful');
            showStatus('Challenge shared successfully!', 'success');
        } catch (error) {
            console.log('Share cancelled or failed:', error);
            showStatus('Share cancelled, showing link instead...', 'loading');
            setTimeout(() => showShareLink(), 1000);
        }
    } else {
        console.log('Native share not available, showing link');
        showShareLink();
    }
}

// Show share link interface
function showShareLink() {
    const shareUrl = generateShareLink();
    if (!shareUrl) return;
    
    document.getElementById('shareUrl').value = shareUrl;
    document.getElementById('shareLink').style.display = 'block';
}

// Hide share link interface
function hideShareLink() {
    document.getElementById('shareLink').style.display = 'none';
}

// Copy share link to clipboard
async function copyShareLink() {
    const shareUrl = generateShareLink();
    if (!shareUrl) return;
    
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(shareUrl);
            showStatus('Share link copied to clipboard!', 'success');
        } else {
            throw new Error('Clipboard API not available');
        }
    } catch (error) {
        console.error('Clipboard failed, showing link instead:', error);
        showShareLink();
    }
}

// Copy share URL from input
function copyShareUrl() {
    const shareUrlInput = document.getElementById('shareUrl');
    shareUrlInput.select();
    shareUrlInput.setSelectionRange(0, 99999); // For mobile devices
    
    try {
        const successful = document.execCommand('copy');
        if (successful) {
            showStatus('Link copied to clipboard!', 'success');
        } else {
            showStatus('Failed to copy. Please select and copy manually.', 'error');
        }
    } catch (err) {
        showStatus('Failed to copy. Please select and copy manually.', 'error');
    }
}

// Parse challenge data from URL parameters
function parseChallengeData(encodedData) {
    try {
        const decodedData = JSON.parse(atob(encodedData));
        console.log('Parsed challenge data:', decodedData);
        
        if (decodedData.items && decodedData.lat && decodedData.lng) {
            return {
                items: decodedData.items,
                lat: decodedData.lat,
                lng: decodedData.lng,
                timestamp: decodedData.timestamp
            };
        }
    } catch (error) {
        console.error('Failed to parse challenge data:', error);
    }
    return null;
}

// Check for challenge data in URL parameters
function checkForChallengeData() {
    const urlParams = new URLSearchParams(window.location.search);
    const challengeData = urlParams.get('challenge');
    
    if (challengeData) {
        console.log('Found challenge data in URL');
        const parsed = parseChallengeData(challengeData);
        
        if (parsed) {
            // Set up the challenge
            gameState.detectedItems = parsed.items;
            gameState.photoLocation = {
                latitude: parsed.lat,
                longitude: parsed.lng
            };
            
            // For shared challenges, we don't have the original photo
            gameState.capturedPhotoData = null;
            
            showStatus(`Challenge loaded! Find items: ${parsed.items.join(', ')}`, 'success');
            
            // Auto-start guessing mode
            setTimeout(() => {
                startGuessing();
            }, 2000);
        } else {
            showStatus('Invalid challenge data!', 'error');
        }
    }
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

// Test function to verify sharing works
function testSharing() {
    console.log('Testing sharing functionality...');
    console.log('Navigator.share available:', !!navigator.share);
    console.log('Navigator.clipboard available:', !!navigator.clipboard);
    console.log('Current detected items:', gameState.detectedItems);
    
    // Test with dummy data
    const testItems = ['car', 'tree', 'person'];
    const originalItems = gameState.detectedItems;
    gameState.detectedItems = testItems;
    
    console.log('Testing with dummy items:', testItems);
    shareItems();
    
    // Restore original items
    gameState.detectedItems = originalItems;
}

// Initialize the game when page loads
window.addEventListener('load', function() {
    initGame();
    checkForChallengeData();
    
    // Add test function to window for debugging
    window.testSharing = testSharing;
    console.log('Test function available: window.testSharing()');
});

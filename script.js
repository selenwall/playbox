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
        
        // Capture photo at much smaller size for URL sharing
        const context = canvas.getContext('2d');
        
        // Set canvas to small size (max 200x150 for pixelated effect)
        const maxWidth = 200;
        const maxHeight = 150;
        const aspectRatio = camera.videoWidth / camera.videoHeight;
        
        if (aspectRatio > maxWidth / maxHeight) {
            canvas.width = maxWidth;
            canvas.height = maxWidth / aspectRatio;
        } else {
            canvas.height = maxHeight;
            canvas.width = maxHeight * aspectRatio;
        }
        
        context.drawImage(camera, 0, 0, canvas.width, canvas.height);
        
        // Store the captured photo as data URL with very low quality for small size
        const fullDataUrl = canvas.toDataURL('image/jpeg', 0.3);
        // Store the full data URL for now (we'll optimize this later)
        gameState.capturedPhotoData = fullDataUrl;
        
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
    
    // Show mode indicator
    showModeIndicator('guessing');
    
    // Display pixelated photo if available
    const pixelatedPhoto = document.getElementById('pixelatedPhoto');
    const noPhotoMessage = document.getElementById('noPhotoMessage');
    
    if (gameState.capturedPhotoData) {
        console.log('Setting pixelated photo:', gameState.capturedPhotoData.substring(0, 50) + '...');
        // Use the photo data directly (it should already be a proper data URL)
        pixelatedPhoto.src = gameState.capturedPhotoData;
        pixelatedPhoto.style.display = 'block';
        noPhotoMessage.style.display = 'none';
    } else {
        console.log('No captured photo data available');
        pixelatedPhoto.style.display = 'none';
        noPhotoMessage.style.display = 'flex';
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
    
    // Update button text
    updateGiveUpButton();
    
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
            updateGiveUpButton();
        }
    } else {
        locationStatus.textContent = 'Move around to find the location!';
        locationStatus.className = 'status';
        updateGiveUpButton();
    }
}

// Update the give up button text based on game state
function updateGiveUpButton() {
    const giveUpButton = document.querySelector('#guessingScreen .btn.secondary');
    if (giveUpButton) {
        if (gameState.score > 0) {
            giveUpButton.textContent = '🏆 Take New Photo';
        } else {
            giveUpButton.textContent = '🏃‍♂️ Give Up & Take New Photo';
        }
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
    
    // Show mode indicator
    showModeIndicator('photo');
    
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
    
    // Create data object with items, location, and photo
    const shareData = {
        items: gameState.detectedItems,
        lat: Math.round(gameState.photoLocation.latitude * 1000000) / 1000000, // Round to 6 decimal places
        lng: Math.round(gameState.photoLocation.longitude * 1000000) / 1000000, // Round to 6 decimal places
        photo: gameState.capturedPhotoData, // Include the photo data
        t: Math.floor(Date.now() / 1000) // Shorter timestamp (seconds instead of milliseconds)
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
                photo: decodedData.photo || null, // Include photo data if available
                timestamp: decodedData.t || decodedData.timestamp || Date.now() // Handle both formats
            };
        } else {
            console.error('Invalid challenge data structure:', decodedData);
            console.error('Missing required fields - items:', !!decodedData.items, 'lat:', !!decodedData.lat, 'lng:', !!decodedData.lng);
        }
    } catch (error) {
        console.error('Failed to parse challenge data:', error);
        console.error('Raw encoded data:', encodedData.substring(0, 100) + '...');
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
            
            // Set photo data if available
            gameState.capturedPhotoData = parsed.photo || null;
            
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

// Show mode indicator
function showModeIndicator(mode) {
    // Hide all mode indicators
    document.querySelectorAll('.mode-indicator').forEach(indicator => {
        indicator.classList.remove('active');
    });
    
    // Show the active mode indicator
    const activeIndicator = document.querySelector(`.mode-${mode}`);
    if (activeIndicator) {
        activeIndicator.classList.add('active');
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
    
    // Show initial mode indicator
    showModeIndicator('photo');
    
    // Add test function to window for debugging
    window.testSharing = testSharing;
    console.log('Test function available: window.testSharing()');
});

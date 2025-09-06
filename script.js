// Game state
let gameState = {
    mode: 'photo', // 'photo', 'items', 'guessing'
    detectedItems: [],
    photoLocation: null,
    currentLocation: null,
    score: 0,
    model: null,
    capturedPhotoData: null, // Store the captured photo as data URL
    sharePhotoData: null, // Store a small version for sharing
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
        showStatus('Laddar AI-modell...', 'loading');
        gameState.model = await cocoSsd.load();
        showStatus('Modell laddad! Redo att ta foton.', 'success');
        
        // Only initialize camera if we're not in guessing mode
        if (gameState.mode !== 'guessing') {
            await initCamera();
        }
    } catch (error) {
        console.error('Error initializing game:', error);
        showStatus('Fel vid laddning av spelet. Vänligen ladda om sidan.', 'error');
    }
}

// Initialize camera
async function initCamera() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: 'environment',
                width: { ideal: 1920, max: 3840 },
                height: { ideal: 1080, max: 2160 }
            } 
        });
        camera.srcObject = stream;
        captureBtn.disabled = true; // Disabled until GPS is accurate enough
        console.log('Camera initialized for photo mode');
        
        // Start monitoring GPS accuracy
        startGPSMonitoring();
    } catch (error) {
        console.error('Error accessing camera:', error);
        showStatus('Kameraåtkomst nekad. Vänligen tillåt kameraåtkomst och ladda om.', 'error');
    }
}

// Start GPS monitoring for photo mode
function startGPSMonitoring() {
    if (!navigator.geolocation) {
        updateGPSStatus('GPS stöds inte', 'error');
        return;
    }
    
    navigator.geolocation.watchPosition(
        function(position) {
            const accuracy = position.coords.accuracy;
            const accuracyDisplay = document.getElementById('gpsAccuracy');
            const statusText = document.getElementById('gpsStatusText');
            
            if (accuracyDisplay) {
                accuracyDisplay.textContent = `GPS-noggrannhet: ±${Math.round(accuracy)}m`;
            }
            
            if (accuracy <= 7) {
                // GPS is accurate enough
                captureBtn.disabled = false;
                if (statusText) {
                    statusText.textContent = '✅ GPS-noggrannhet OK - Du kan ta foto!';
                    statusText.style.color = '#4CAF50';
                }
                if (accuracyDisplay) {
                    accuracyDisplay.style.color = '#4CAF50';
                }
            } else {
                // GPS not accurate enough
                captureBtn.disabled = true;
                if (statusText) {
                    statusText.textContent = `❌ GPS-noggrannhet för dålig. Behöver <7m (nu: ±${Math.round(accuracy)}m)`;
                    statusText.style.color = '#f44336';
                }
                if (accuracyDisplay) {
                    accuracyDisplay.style.color = '#f44336';
                }
            }
        },
        function(error) {
            updateGPSStatus('GPS-fel: ' + error.message, 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 1000
        }
    );
}

// Update GPS status display
function updateGPSStatus(message, type) {
    const statusText = document.getElementById('gpsStatusText');
    if (statusText) {
        statusText.textContent = message;
        statusText.style.color = type === 'error' ? '#f44336' : '#4CAF50';
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
                width: { ideal: 1920, max: 3840 },
                height: { ideal: 1080, max: 2160 }
            } 
        });
        camera.srcObject = stream;
        captureBtn.disabled = false;
        console.log('Camera started for photo mode');
    } catch (error) {
        console.error('Error starting camera:', error);
        showStatus('Misslyckades att starta kameran. Vänligen försök igen.', 'error');
    }
}

// Capture photo and detect objects
captureBtn.addEventListener('click', async function() {
    if (!gameState.model) {
        showStatus('Modellen är inte laddad än. Vänligen vänta.', 'error');
        return;
    }

    try {
        captureBtn.disabled = true;
        showStatus('Tar foto...', 'loading');
        
        // Capture photo at much smaller size for URL sharing
        const context = canvas.getContext('2d');
        
        // Set canvas to high resolution for better quality
        // Target size: 1024px wide, maintain aspect ratio
        const targetWidth = 1024;
        const aspectRatio = camera.videoWidth / camera.videoHeight;
        const targetHeight = Math.round(targetWidth / aspectRatio);
        
        canvas.width = targetWidth;
        canvas.height = targetHeight;
        
        context.drawImage(camera, 0, 0, canvas.width, canvas.height);
        
        // Store the captured photo as data URL with high quality
        // Quality 0.7 provides good balance for 1024px wide images
        const fullDataUrl = canvas.toDataURL('image/jpeg', 0.7);
        gameState.capturedPhotoData = fullDataUrl;
        
        // Create a much smaller version for sharing (to avoid URL length limits)
        const smallCanvas = document.createElement('canvas');
        const smallContext = smallCanvas.getContext('2d');
        
        // Create a very small image for sharing (64x64 pixels)
        const shareSize = 64;
        smallCanvas.width = shareSize;
        smallCanvas.height = shareSize;
        
        // Draw the image scaled down and pixelated
        smallContext.imageSmoothingEnabled = false;
        smallContext.drawImage(canvas, 0, 0, shareSize, shareSize);
        
        // Store the small version for sharing
        gameState.sharePhotoData = smallCanvas.toDataURL('image/jpeg', 0.5);
        
        // Get current location with accuracy check
        const position = await getCurrentPosition();
        
        // Check GPS accuracy before allowing photo capture
        if (position.coords.accuracy > 7) {
            showStatus(`GPS-noggrannhet för dålig: ±${Math.round(position.coords.accuracy)}m. Behöver <7m för att ta foto.`, 'error');
            captureBtn.disabled = false;
            detectionLoading.style.display = 'none';
            return;
        }
        
        gameState.photoLocation = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy
        };
        
        console.log(`Photo location accuracy: ±${Math.round(position.coords.accuracy)}m`);
        
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
            showStatus('Inga objekt upptäckta. Försök ta ett nytt foto.', 'error');
            captureBtn.disabled = false;
            return;
        }
        
        // Show items screen
        showItemsScreen();
        
    } catch (error) {
        console.error('Error capturing photo:', error);
        showStatus('Fel vid fototagning. Vänligen försök igen.', 'error');
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
    
    // Hide all other screens and show guessing screen
    document.getElementById('photoScreen').classList.remove('active');
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
        showStatus('Geolokalisering stöds inte av denna webbläsare.', 'error');
        return;
    }

    // First, try to get a high-accuracy position
    navigator.geolocation.getCurrentPosition(
        function(position) {
            gameState.currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy
            };
            
            console.log(`Initial GPS Accuracy: ${position.coords.accuracy}m`);
            updateDistance();
            
            // Then start watching for updates
            startLocationWatching();
        },
        function(error) {
            console.error('Initial geolocation error:', error);
            showStatus('Platsåtkomst nekad. Vänligen aktivera platsjänster.', 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 0
        }
    );
}

// Start watching position changes
function startLocationWatching() {
    gameState.locationWatchId = navigator.geolocation.watchPosition(
        function(position) {
            gameState.currentLocation = {
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                accuracy: position.coords.accuracy
            };
            
            // Log GPS accuracy for debugging
            console.log(`GPS Accuracy: ${position.coords.accuracy}m`);
            
            updateDistance();
        },
        function(error) {
            console.error('Geolocation error:', error);
            showStatus('Platsåtkomst nekad. Vänligen aktivera platsjänster.', 'error');
        },
        {
            enableHighAccuracy: true,
            timeout: 30000,
            maximumAge: 5000 // Allow some caching for better performance
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

    distanceDisplay.textContent = `Avstånd: ${distance.toFixed(1)}m`;
    scoreDisplay.textContent = `Poäng: ${gameState.score}`;
    
    // Show GPS accuracy if available
    if (gameState.currentLocation && gameState.currentLocation.accuracy) {
        const accuracyDisplay = document.getElementById('accuracyDisplay');
        if (accuracyDisplay) {
            accuracyDisplay.textContent = `GPS noggrannhet: ±${Math.round(gameState.currentLocation.accuracy)}m`;
        }
    }

    if (distance <= 25) {
        if (gameState.score === 0) {
            gameState.score = 1;
            locationStatus.textContent = '🎉 Grattis! Du hittade platsen!';
            locationStatus.className = 'status success';
            updateGiveUpButton();
        }
    } else {
        locationStatus.textContent = 'Rör dig runt för att hitta platsen!';
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
            timeout: 30000,
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
        showStatus('Inga objekt att dela! Ta ett foto först.', 'error');
        return null;
    }
    
    if (!gameState.photoLocation) {
        showStatus('Inga platsdata! Ta ett foto först.', 'error');
        return null;
    }
    
    // Create data object with items, location, and photo
    const shareData = {
        items: gameState.detectedItems,
        lat: Math.round(gameState.photoLocation.latitude * 1000000) / 1000000, // Round to 6 decimal places
        lng: Math.round(gameState.photoLocation.longitude * 1000000) / 1000000, // Round to 6 decimal places
        photo: gameState.sharePhotoData, // Use the small version for sharing
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
    
    const shareText = `🎯 Var?! - Platsgissningsutmaning!\n\nJag hittade dessa objekt i ett foto: ${gameState.detectedItems.join(', ')}\n\nKan du gissa var jag tog detta foto? Klicka på länken för att spela!`;
    
    console.log('Share URL:', shareUrl);
    console.log('Navigator.share available:', !!navigator.share);
    
    if (navigator.share) {
        try {
            console.log('Attempting native share...');
            await navigator.share({
                title: 'Var?! - Platsgissningsutmaning',
                text: shareText,
                url: shareUrl
            });
            console.log('Share successful');
            showStatus('Utmaning delad framgångsrikt!', 'success');
        } catch (error) {
            console.log('Share cancelled or failed:', error);
            showStatus('Delning avbruten, visar länk istället...', 'loading');
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
            showStatus('Delningslänk kopierad till urklipp!', 'success');
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
            showStatus('Länk kopierad till urklipp!', 'success');
        } else {
            showStatus('Misslyckades att kopiera. Vänligen markera och kopiera manuellt.', 'error');
        }
    } catch (err) {
        showStatus('Misslyckades att kopiera. Vänligen markera och kopiera manuellt.', 'error');
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
            
            // Try to handle old format with different field names
            if (decodedData.detectedItems && decodedData.photoLocation) {
                console.log('Attempting to parse old format data...');
                return {
                    items: decodedData.detectedItems,
                    lat: decodedData.photoLocation.latitude,
                    lng: decodedData.photoLocation.longitude,
                    photo: decodedData.capturedPhotoData || null,
                    timestamp: Date.now()
                };
            }
        }
    } catch (error) {
        console.error('Failed to parse challenge data:', error);
        console.error('Raw encoded data:', encodedData.substring(0, 100) + '...');
        
        // Try to decode as plain text (fallback)
        try {
            const plainText = atob(encodedData);
            console.log('Decoded as plain text:', plainText.substring(0, 100) + '...');
        } catch (e) {
            console.error('Not valid base64 data either');
        }
    }
    return null;
}

// Check for challenge data in URL parameters
function checkForChallengeData() {
    const urlParams = new URLSearchParams(window.location.search);
    const challengeData = urlParams.get('challenge');
    
    if (challengeData) {
        console.log('Found challenge data in URL');
        console.log('Challenge data length:', challengeData.length);
        console.log('First 100 chars:', challengeData.substring(0, 100));
        
        const parsed = parseChallengeData(challengeData);
        
        if (parsed) {
            console.log('Successfully parsed challenge data:', parsed);
            // Set up the challenge
            gameState.detectedItems = parsed.items;
            gameState.photoLocation = {
                latitude: parsed.lat,
                longitude: parsed.lng
            };
            
            // Set photo data if available
            gameState.capturedPhotoData = parsed.photo || null;
            
            // Set mode to guessing to prevent camera initialization
            gameState.mode = 'guessing';
            
            showStatus(`Utmaning laddad! Hitta objekt: ${parsed.items.join(', ')}`, 'success');
            
            // Auto-start guessing mode
            setTimeout(() => {
                startGuessing();
            }, 2000);
        } else {
            console.error('Failed to parse challenge data');
            showStatus('Ogiltiga utmaningsdata - kontrollera konsolen för detaljer', 'error');
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
    // Check for challenge data first to determine the mode
    checkForChallengeData();
    
    // Initialize the game (camera will only load if not in guessing mode)
    initGame();
    
    // Show appropriate mode indicator
    showModeIndicator(gameState.mode);
    
    // Add test function to window for debugging
    window.testSharing = testSharing;
    console.log('Test function available: window.testSharing()');
});

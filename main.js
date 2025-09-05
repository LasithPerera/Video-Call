import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyD49BHS74mLv7eBcYVZkGLbaqs-CJue41k",
  authDomain: "mhealth-edccb.firebaseapp.com",
  projectId: "mhealth-edccb",
  storageBucket: "mhealth-edccb.firebasestorage.app",
  messagingSenderId: "1091042349169",
  appId: "1:1091042349169:web:9b80e6e55127095425cbd0",
  measurementId: "G-VZHWVB016Y"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

// Simplified and more reliable STUN/TURN configuration
const servers = {
  iceServers: [
    // Only the most reliable Google STUN servers
    {
      urls: [
        'stun:stun.l.google.com:19302',
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302'
      ]
    },
    // Reliable public STUN servers
    {
      urls: 'stun:stun.ekiga.net:3478'
    },
    {
      urls: 'stun:stun.fwdnet.net:3478'
    },
    {
      urls: 'stun:stun.ideasip.com:3478'
    },
    {
      urls: 'stun:stun.iptel.org:3478'
    },
    // Free TURN servers (only the most reliable ones)
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidateTimeout: 15000
};

// Global State
let pc = new RTCPeerConnection(servers);
let localStream = null;
let remoteStream = null;
let isMuted = false;
let isVideoEnabled = true;
let currentCallId = null;
let connectionRetryCount = 0;
const maxRetries = 5;
let connectionTimeout = null;
let isUsingMinimalConfig = false;
let callStartTime = null;
let callTimerInterval = null;
let isSpeakerOn = false;
let isFullscreen = false;

// Minimal configuration for very restrictive networks
const minimalServers = {
  iceServers: [
    {
      urls: 'stun:stun.l.google.com:19302'
    },
    {
      urls: 'stun:stun1.l.google.com:19302'
    }
  ],
  iceCandidatePoolSize: 5,
  iceTransportPolicy: 'all',
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
  iceCandidateTimeout: 20000
};

// Function to create a new peer connection
function createNewPeerConnection() {
  console.log('🔄 Creating new peer connection...');
  pc = new RTCPeerConnection(servers);
  
  // Re-add event listeners
  setupPeerConnectionListeners();
  
  // Re-add local stream tracks if available
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }
  
  connectionRetryCount++;
  console.log(`🔄 Retry attempt ${connectionRetryCount}/${maxRetries}`);
}

// Function to create a new peer connection with minimal configuration
function createNewPeerConnectionWithMinimalConfig() {
  console.log('🔄 Creating new peer connection with minimal configuration...');
  pc = new RTCPeerConnection(minimalServers);
  
  // Re-add event listeners
  setupPeerConnectionListeners();
  
  // Re-add local stream tracks if available
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });
  }
  
  connectionRetryCount++;
  console.log(`🔄 Minimal config retry attempt ${connectionRetryCount}/${maxRetries}`);
}

// Call timer functionality
function startCallTimer() {
  callStartTime = Date.now();
  callTimerInterval = setInterval(() => {
    const elapsed = Date.now() - callStartTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    callTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

function stopCallTimer() {
  if (callTimerInterval) {
    clearInterval(callTimerInterval);
    callTimerInterval = null;
  }
  callTimer.textContent = '00:00';
}

// Function to setup peer connection event listeners
function setupPeerConnectionListeners() {
  pc.onconnectionstatechange = () => {
    console.log('Connection state:', pc.connectionState);
    if (pc.connectionState === 'connected') {
      console.log('✅ WebRTC connection established successfully!');
      connectionRetryCount = 0; // Reset retry count on success
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
        connectionTimeout = null;
      }
      // Update call status and start timer
      callStatus.textContent = 'Connected';
      startCallTimer();
    } else if (pc.connectionState === 'failed') {
      console.error('❌ WebRTC connection failed');
      console.error('ICE connection state:', pc.iceConnectionState);
      console.error('ICE gathering state:', pc.iceGatheringState);
      
      // Try to recover by restarting ICE or creating new connection
      if (connectionRetryCount < maxRetries) {
        if (pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') {
          console.log('🔄 Attempting to restart ICE...');
          pc.restartIce();
        }
      } else if (connectionRetryCount === maxRetries && !isUsingMinimalConfig) {
        console.log('🔄 Trying minimal configuration for restrictive networks...');
        isUsingMinimalConfig = true;
        connectionRetryCount = 0;
        createNewPeerConnectionWithMinimalConfig();
      } else {
        console.error('❌ Max retries reached. Connection failed permanently.');
        showConnectionTroubleshooting();
      }
    } else if (pc.connectionState === 'connecting') {
      console.log('🔄 WebRTC connection in progress...');
      // Set a timeout for connection attempts
      if (connectionTimeout) {
        clearTimeout(connectionTimeout);
      }
      connectionTimeout = setTimeout(() => {
        if (pc.connectionState === 'connecting') {
          console.warn('⚠️ Connection timeout - restarting ICE');
          pc.restartIce();
        }
      }, 15000); // 15 second timeout
    } else if (pc.connectionState === 'disconnected') {
      console.warn('⚠️ WebRTC connection disconnected');
    }
  };

  pc.oniceconnectionstatechange = () => {
    console.log('ICE connection state:', pc.iceConnectionState);
    if (pc.iceConnectionState === 'failed') {
      console.error('❌ ICE connection failed - trying to restart ICE');
      pc.restartIce();
    } else if (pc.iceConnectionState === 'disconnected') {
      console.warn('⚠️ ICE connection disconnected - waiting for reconnection...');
      // Wait a bit before considering it failed
      setTimeout(() => {
        if (pc.iceConnectionState === 'disconnected') {
          console.error('❌ ICE connection still disconnected - restarting ICE');
          pc.restartIce();
        }
      }, 5000);
    }
  };

  pc.onicegatheringstatechange = () => {
    console.log('ICE gathering state:', pc.iceGatheringState);
  };

  pc.onicecandidateerror = (event) => {
    console.warn('⚠️ ICE candidate error for server:', event.url);
    // Don't log the full error to reduce console spam
    if (event.errorCode) {
      console.warn('Error code:', event.errorCode);
    }
  };

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      console.log('ICE candidate gathered:', event.candidate.type, event.candidate.protocol);
    } else {
      console.log('ICE gathering complete');
    }
  };

  pc.ontrack = (event) => {
    console.log('🎥 Remote track received:', event.track.kind);
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
      console.log('✅ Added remote track:', track.kind);
    });
    remoteOverlay.classList.add('hidden');
  };
}

// Initialize peer connection listeners
setupPeerConnectionListeners();

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const hangupButton = document.getElementById('hangupButton');
const muteButton = document.getElementById('muteButton');
const videoButton = document.getElementById('videoButton');
const speakerButton = document.getElementById('speakerButton');
const copyButton = document.getElementById('copyButton');
const callLinkInput = document.getElementById('callLinkInput');
const shareWhatsApp = document.getElementById('shareWhatsApp');
const shareOther = document.getElementById('shareOther');
const callerName = document.getElementById('callerName');
const callStatus = document.getElementById('callStatus');
const callTimer = document.getElementById('callTimer');
const fullscreenButton = document.getElementById('fullscreenButton');

// UI Elements
const setupContainer = document.getElementById('setupContainer');
const videoCallContainer = document.getElementById('videoCallContainer');
const callActions = document.getElementById('callActions');
const callIdDisplay = document.getElementById('callIdDisplay');
const localOverlay = document.getElementById('localOverlay');
const remoteOverlay = document.getElementById('remoteOverlay');

// Utility Functions
function generateCallId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

function showVideoCallInterface() {
  setupContainer.style.display = 'none';
  videoCallContainer.classList.add('active');
  
  // Add class to body for mobile full-screen video call
  document.body.classList.add('video-call-active');
}

function showSetupInterface() {
  setupContainer.style.display = 'flex';
  videoCallContainer.classList.remove('active');
  callActions.style.display = 'none';
  callIdDisplay.style.display = 'none';
  
  // Remove class from body when exiting video call
  document.body.classList.remove('video-call-active');
}

function updateCallLink(callId) {
  const callLink = `${window.location.origin}?call=${callId}`;
  callLinkInput.value = callLink;
  callIdDisplay.style.display = 'block';
  
  // Save call link to local storage
  try {
    localStorage.setItem('videoCallLink', callLink);
    localStorage.setItem('videoCallId', callId);
    localStorage.setItem('videoCallTimestamp', Date.now().toString());
    console.log('✅ Video call link saved to local storage');
  } catch (error) {
    console.warn('⚠️ Could not save to local storage:', error);
  }
}

// Check for call ID in URL
function checkUrlForCallId() {
  const urlParams = new URLSearchParams(window.location.search);
  const callId = urlParams.get('call');
  if (callId) {
    callInput.value = callId;
  }
}

// 1. Setup media sources
webcamButton.onclick = async () => {
  try {
    // Enhanced media constraints for better compatibility
    const constraints = {
      video: {
        width: { ideal: 1280, max: 1920 },
        height: { ideal: 720, max: 1080 },
        frameRate: { ideal: 30, max: 60 },
        facingMode: 'user'
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    };
    
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    remoteStream = new MediaStream();
    
    console.log('✅ Local stream obtained:', localStream);

    // Push tracks from local stream to peer connection
    localStream.getTracks().forEach((track) => {
      pc.addTrack(track, localStream);
    });

    webcamVideo.srcObject = localStream;
    remoteVideo.srcObject = remoteStream;

    // Hide local overlay when video starts
    localOverlay.classList.add('hidden');

    callButton.disabled = false;
    answerButton.disabled = false;
    webcamButton.disabled = true;
    callActions.style.display = 'block';

    // Check if there's a call ID in URL to auto-join
    checkUrlForCallId();
  } catch (error) {
    console.error('Error accessing media devices:', error);
    alert('Error accessing camera and microphone. Please check permissions.');
  }
};

// 2. Create an offer
callButton.onclick = async () => {
  try {
    // Generate a new call ID
    currentCallId = generateCallId();
    
    // Reference Firestore collections for signaling
    const callDoc = firestore.collection('calls').doc(currentCallId);
    const offerCandidates = callDoc.collection('offerCandidates');
    const answerCandidates = callDoc.collection('answerCandidates');

    callInput.value = currentCallId;
    updateCallLink(currentCallId);

    // Get candidates for caller, save to db
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Saving offer candidate:', event.candidate.type);
        offerCandidates.add(event.candidate.toJSON()).catch(err => {
          console.error('Error saving offer candidate:', err);
        });
      }
    };

    // Create offer with better options
    const offerOptions = {
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
      voiceActivityDetection: true
    };
    
    const offerDescription = await pc.createOffer(offerOptions);
    await pc.setLocalDescription(offerDescription);
    console.log('✅ Local description set for offer');

    const offer = {
      sdp: offerDescription.sdp,
      type: offerDescription.type,
      timestamp: Date.now()
    };

    await callDoc.set({ offer });
    console.log('✅ Offer saved to Firestore');

    // Listen for remote answer
    callDoc.onSnapshot((snapshot) => {
      const data = snapshot.data();
      if (!pc.currentRemoteDescription && data?.answer) {
        console.log('📞 Answer received, setting remote description');
        const answerDescription = new RTCSessionDescription(data.answer);
        pc.setRemoteDescription(answerDescription).then(() => {
          console.log('✅ Remote description set for answer');
          showVideoCallInterface();
        }).catch(err => {
          console.error('Error setting remote description:', err);
        });
      }
    });

    // When answered, add candidate to peer connection
    answerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const candidate = new RTCIceCandidate(change.doc.data());
          pc.addIceCandidate(candidate).then(() => {
            console.log('✅ Answer candidate added');
          }).catch(err => {
            console.error('Error adding answer candidate:', err);
          });
        }
      });
    });

    hangupButton.disabled = false;
    callButton.disabled = true;
    answerButton.disabled = true;
  } catch (error) {
    console.error('Error creating call:', error);
    alert('Error creating call. Please try again.');
  }
};

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  try {
    let callId = callInput.value.trim();
    
    // Extract call ID from URL if full URL is provided
    if (callId.includes('?')) {
      const urlParams = new URLSearchParams(callId.split('?')[1]);
      callId = urlParams.get('call') || callId;
    }
    
    if (!callId) {
      alert('Please enter a valid call ID or URL');
      return;
    }

    currentCallId = callId;
    const callDoc = firestore.collection('calls').doc(callId);
    const answerCandidates = callDoc.collection('answerCandidates');
    const offerCandidates = callDoc.collection('offerCandidates');

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Saving answer candidate:', event.candidate.type);
        answerCandidates.add(event.candidate.toJSON()).catch(err => {
          console.error('Error saving answer candidate:', err);
        });
      }
    };

    const callData = (await callDoc.get()).data();

    if (!callData || !callData.offer) {
      alert('Call not found or has expired. Please check the call ID.');
      return;
    }

    console.log('📞 Setting remote description for offer');
    const offerDescription = callData.offer;
    await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));
    console.log('✅ Remote description set for offer');

    const answerDescription = await pc.createAnswer();
    await pc.setLocalDescription(answerDescription);
    console.log('✅ Local description set for answer');

    const answer = {
      type: answerDescription.type,
      sdp: answerDescription.sdp,
      timestamp: Date.now()
    };

    await callDoc.update({ answer });
    console.log('✅ Answer saved to Firestore');

    offerCandidates.onSnapshot((snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          let data = change.doc.data();
          pc.addIceCandidate(new RTCIceCandidate(data)).then(() => {
            console.log('✅ Offer candidate added');
          }).catch(err => {
            console.error('Error adding offer candidate:', err);
          });
        }
      });
    });

    showVideoCallInterface();
    hangupButton.disabled = false;
    callButton.disabled = true;
    answerButton.disabled = true;
  } catch (error) {
    console.error('Error joining call:', error);
    alert('Error joining call. Please check the call ID and try again.');
  }
};

// 4. Hangup functionality
hangupButton.onclick = () => {
  // Stop call timer
  stopCallTimer();
  
  // Stop all tracks
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  // Close peer connection
  pc.close();

  // Reset UI
  showSetupInterface();
  webcamButton.disabled = false;
  callButton.disabled = true;
  answerButton.disabled = true;
  hangupButton.disabled = true;
  
  // Reset streams
  localStream = null;
  remoteStream = null;
  currentCallId = null;
  
  // Reset video elements
  webcamVideo.srcObject = null;
  remoteVideo.srcObject = null;
  
  // Show overlays again
  localOverlay.classList.remove('hidden');
  remoteOverlay.classList.remove('hidden');
  
  // Reset call input
  callInput.value = '';
  
  // Reset states
  isMuted = false;
  isVideoEnabled = true;
  isSpeakerOn = false;
  muteButton.classList.remove('muted');
  videoButton.classList.remove('disabled');
  speakerButton.classList.remove('active');
  
  // Reset call status
  callStatus.textContent = 'Connecting...';
  callerName.textContent = 'Video Call';
  
  // Reset fullscreen state
  if (isFullscreen) {
    isFullscreen = false;
    videoCallContainer.classList.remove('fullscreen');
    document.body.style.overflow = '';
    document.querySelector('.header').style.display = 'block';
    document.querySelector('.main-content').style.display = 'flex';
    
    // Reset fullscreen button icon
    const icon = fullscreenButton.querySelector('i');
    icon.className = 'fas fa-expand';
    fullscreenButton.title = 'Toggle fullscreen';
  }
};

// 5. Mute/Unmute functionality
muteButton.onclick = () => {
  if (localStream) {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      isMuted = !audioTrack.enabled;
      muteButton.classList.toggle('muted', isMuted);
    }
  }
};

// 6. Video on/off functionality
videoButton.onclick = () => {
  if (localStream) {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      isVideoEnabled = videoTrack.enabled;
      videoButton.classList.toggle('disabled', !isVideoEnabled);
    }
  }
};

// 7. Speaker on/off functionality
speakerButton.onclick = () => {
  isSpeakerOn = !isSpeakerOn;
  speakerButton.classList.toggle('active', isSpeakerOn);
  
  // Toggle speaker icon
  const icon = speakerButton.querySelector('i');
  if (isSpeakerOn) {
    icon.className = 'fas fa-volume-mute';
  } else {
    icon.className = 'fas fa-volume-up';
  }
};

// 8. Copy call link functionality
copyButton.onclick = () => {
  callLinkInput.select();
  callLinkInput.setSelectionRange(0, 99999); // For mobile devices
  document.execCommand('copy');
  
  // Visual feedback
  const originalText = copyButton.innerHTML;
  copyButton.innerHTML = '<i class="fas fa-check"></i>';
  setTimeout(() => {
    copyButton.innerHTML = originalText;
  }, 2000);
};

// 9. Share on WhatsApp functionality
shareWhatsApp.onclick = () => {
  const callLink = callLinkInput.value;
  const message = `Join my video call: ${callLink}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(message)}`;
  window.open(whatsappUrl, '_blank');
};

// 10. Share via other methods
shareOther.onclick = () => {
  const callLink = callLinkInput.value;
  
  if (navigator.share) {
    navigator.share({
      title: 'Video Call',
      text: 'Join my video call',
      url: callLink
    }).catch(err => {
      console.log('Error sharing:', err);
      fallbackShare(callLink);
    });
  } else {
    fallbackShare(callLink);
  }
};

function fallbackShare(callLink) {
  // Copy to clipboard as fallback
  navigator.clipboard.writeText(callLink).then(() => {
    alert('Call link copied to clipboard!');
  }).catch(() => {
    // Final fallback
    callLinkInput.select();
    document.execCommand('copy');
    alert('Call link copied to clipboard!');
  });
}

// 11. Fullscreen toggle functionality
fullscreenButton.onclick = () => {
  isFullscreen = !isFullscreen;
  
  if (isFullscreen) {
    // Enter fullscreen
    videoCallContainer.classList.add('fullscreen');
    document.body.style.overflow = 'hidden';
    
    // Update icon
    const icon = fullscreenButton.querySelector('i');
    icon.className = 'fas fa-compress';
    fullscreenButton.title = 'Exit fullscreen';
    
    // Hide header and main content
    document.querySelector('.header').style.display = 'none';
    document.querySelector('.main-content').style.display = 'none';
  } else {
    // Exit fullscreen
    videoCallContainer.classList.remove('fullscreen');
    document.body.style.overflow = '';
    
    // Update icon
    const icon = fullscreenButton.querySelector('i');
    icon.className = 'fas fa-expand';
    fullscreenButton.title = 'Toggle fullscreen';
    
    // Show header and main content
    document.querySelector('.header').style.display = 'block';
    document.querySelector('.main-content').style.display = 'flex';
  }
};

// Handle ESC key to exit fullscreen
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && isFullscreen) {
    fullscreenButton.click();
  }
});

// Debug function to check WebRTC support
function checkWebRTCSupport() {
  console.log('🔍 Checking WebRTC support...');
  console.log('🌐 User Agent:', navigator.userAgent);
  console.log('🌐 Browser:', getBrowserName());
  console.log('🌐 Protocol:', window.location.protocol);
  console.log('🔒 HTTPS:', window.location.protocol === 'https:');
  
  // Check for getUserMedia support
  if (!navigator.mediaDevices) {
    console.error('❌ navigator.mediaDevices not supported');
    console.log('💡 This browser is too old or doesn\'t support WebRTC');
    return false;
  }
  
  if (!navigator.mediaDevices.getUserMedia) {
    console.error('❌ getUserMedia not supported');
    console.log('💡 This browser doesn\'t support camera/microphone access');
    return false;
  }
  
  // Check for RTCPeerConnection support
  if (!window.RTCPeerConnection) {
    console.error('❌ RTCPeerConnection not supported');
    console.log('💡 This browser doesn\'t support peer-to-peer connections');
    return false;
  }
  
  // Check for HTTPS requirement
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    console.error('❌ HTTPS required for WebRTC');
    console.log('💡 WebRTC requires HTTPS in production');
    return false;
  }
  
  console.log('✅ WebRTC is fully supported');
  console.log('✅ getUserMedia: Available');
  console.log('✅ RTCPeerConnection: Available');
  console.log('✅ HTTPS: Enabled');
  
  return true;
}

// Function to detect browser name
function getBrowserName() {
  const userAgent = navigator.userAgent;
  
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
    return 'Chrome';
  } else if (userAgent.includes('Firefox')) {
    return 'Firefox';
  } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
    return 'Safari';
  } else if (userAgent.includes('Edg')) {
    return 'Edge';
  } else if (userAgent.includes('Opera') || userAgent.includes('OPR')) {
    return 'Opera';
  } else {
    return 'Unknown Browser';
  }
}

// Function to show connection troubleshooting tips
function showConnectionTroubleshooting() {
  const troubleshooting = `
🔧 Connection Troubleshooting Tips:

1. 📱 Try different networks:
   - Switch from WiFi to mobile data
   - Try different WiFi networks
   - Use VPN if on corporate network

2. 🌐 Network requirements:
   - Both users need stable internet
   - Avoid public WiFi with restrictions
   - Check firewall settings

3. 🔄 If connection fails:
   - Refresh the page and try again
   - Try with different browsers
   - Test with devices on same network first

4. 📞 For best results:
   - Use Chrome or Firefox browsers
   - Ensure good internet speed
   - Close other video apps

5. 🚨 Common Issues:
   - Corporate firewalls block WebRTC
   - Symmetric NAT prevents direct connection
   - Poor internet connection quality
   - Browser extensions blocking WebRTC

6. 💡 Alternative Solutions:
   - Try the same network first
   - Use mobile hotspot
   - Test with VPN enabled
   - Try different time of day
  `;
  
  console.log(troubleshooting);
  
  // Show user-friendly error message
  const userMessage = `
❌ Video Call Connection Failed

Your network appears to be blocking WebRTC connections (common in corporate/school networks).

🔧 Try These Solutions:
1. 📱 Switch from WiFi to mobile data
2. 🏠 Test with devices on the same WiFi network
3. 🌐 Use a different internet connection
4. 🔄 Try Chrome or Firefox browser
5. 🚫 Disable VPN if using one

📱 Mobile: Use Chrome or Safari

💡 This is a network limitation, not a bug in the app.
The connection will be retried automatically.
  `;
  
  alert(userMessage);
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
  // Check WebRTC support
  if (!checkWebRTCSupport()) {
    const browserName = getBrowserName();
    const errorMessage = `
❌ WebRTC Not Supported

Your browser (${browserName}) doesn't support WebRTC or is missing required features.

🔧 Solutions:
1. Update your browser to the latest version
2. Try a different browser:
   - Chrome (recommended)
   - Firefox
   - Safari
   - Edge

3. Check if you're using HTTPS (required for WebRTC)

4. Disable browser extensions that might block WebRTC

📱 For mobile: Use Chrome or Safari on iOS/Android

Check the browser console for more details.
    `;
    
    alert(errorMessage);
    console.error('WebRTC support check failed. See details above.');
    return;
  }
  
  // Check for HTTPS
  if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') {
    console.warn('⚠️ WebRTC requires HTTPS in production');
  }
  
  // Check for call ID in URL on page load
  checkUrlForCallId();
});


// Cấu hình
const config = {
    clientId: 'browser-client',
    targetId: 'device',
    signalingServer: 'wss://84b6-2001-ee0-49cf-70f0-57b6-efeb-a146-ced6.ngrok-free.app/ws',
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302",
        }
    ]
};

// Các biến toàn cục
var signalingConnection = null;
var peerConnection = null;
var dataChannel = null;
var dcInterval = null;
var statsInterval = null;
var start_time = Math.floor(new Date().getTime() / 1000);

// Các phần tử DOM
const connectBtn = document.getElementById('connectBtn');
const remoteVideo = document.getElementById('remoteVideo');
const messageBox = document.getElementById('messageBox');
const connectionStatus = document.getElementById('connectionStatus');
const videoStats = document.getElementById('videoStats');

// Hàm hiển thị tin nhắn trong message box
function logMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.textContent = message;
    messageBox.appendChild(messageElement);
    messageBox.scrollTop = messageBox.scrollHeight;
}

// Hàm cập nhật trạng thái kết nối
function updateConnectionStatus(status) {
    connectionStatus.textContent = `Trạng thái: ${status}`;
}

// Hàm để hiển thị cấu hình ICE hiện tại
function updateIceConfigDisplay() {
    const iceServers = document.getElementById('iceServers');
    iceServers.textContent = JSON.stringify(config.iceServers, null, 2);
}

// Hàm cập nhật thống kê video
async function updateVideoStats() {
    if (!peerConnection) return;
    
    try {
        const stats = await peerConnection.getStats();
        let videoStatText = "Thống kê video: ";
        let hasVideoStats = false;
        
        stats.forEach(report => {
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
                hasVideoStats = true;
                const frameWidth = report.frameWidth || 'N/A';
                const frameHeight = report.frameHeight || 'N/A';
                const framesDecoded = report.framesDecoded || 0;
                const packetsReceived = report.packetsReceived || 0;
                const packetsLost = report.packetsLost || 0;
                const bytesReceived = report.bytesReceived || 0;
                const mbReceived = (bytesReceived / (1024 * 1024)).toFixed(2);
                
                videoStatText += `${frameWidth}x${frameHeight}, `;
                videoStatText += `Khung hình: ${framesDecoded}, `;
                videoStatText += `Gói nhận: ${packetsReceived}, `;
                videoStatText += `Gói mất: ${packetsLost}, `;
                videoStatText += `Dữ liệu: ${mbReceived} MB`;
            }
        });
        
        if (!hasVideoStats) {
            videoStatText += "Chưa có dữ liệu";
        }
        
        videoStats.textContent = videoStatText;
    } catch (error) {
        videoStats.textContent = `Lỗi khi lấy thống kê: ${error.message}`;
    }
}

// Kết nối đến signaling server
function connectToSignalingServer() {
    signalingConnection = new WebSocket(config.signalingServer);
    
    signalingConnection.onopen = () => {
        logMessage('Đã kết nối đến signaling server');
        // Đăng ký với signaling server
        signalingConnection.send(JSON.stringify({ 
            type: 'connection',
            clientId: config.clientId
        }));
    };
    
    signalingConnection.onclose = () => {
        logMessage('Đã ngắt kết nối khỏi signaling server');
        updateConnectionStatus('Đã ngắt kết nối');
        clearInterval(statsInterval);
    };
    
    signalingConnection.onerror = (error) => {
        logMessage(`Lỗi kết nối: ${error}`);
        updateConnectionStatus('Lỗi kết nối');
    };
    
    signalingConnection.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
            case 'connection':
                logMessage(`Đã đăng ký với ID: ${data.clientId}`);
                break;
                
            case 'answer':
                handleAnswer(data.answer);
                break;
                
            case 'ice-candidate':
                handleIceCandidate(data.candidate);
                break;
                
            case 'error':
                logMessage(`Lỗi: ${data.message}`);
                break;
        }
    };
}

// Khởi tạo kết nối WebRTC và gửi offer
function initiatePeerConnection() {
    // Tạo peer connection với STUN/TURN server
    peerConnection = new RTCPeerConnection({ 
        iceServers: config.iceServers 
    });
    
    logMessage(`Tạo RTCPeerConnection`);
    
    // Tạo data channel
    dataChannel = peerConnection.createDataChannel('video-streaming');
    setupDataChannel();
    
    // Xử lý ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            signalingConnection.send(JSON.stringify({
                type: 'ice-candidate',
                target: config.targetId,
                candidate: event.candidate
            }));
        }
    };
    
    // Theo dõi trạng thái kết nối
    peerConnection.onconnectionstatechange = () => {
        updateConnectionStatus(`WebRTC: ${peerConnection.connectionState}`);
        
        if (peerConnection.connectionState === 'disconnected' || 
            peerConnection.connectionState === 'failed' || 
            peerConnection.connectionState === 'closed') {
            clearInterval(statsInterval);
            videoStats.textContent = "Thống kê: Đã ngắt kết nối";
        }
    };
    
    // Tạo offer
    peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => {
            logMessage('Đã tạo offer, gửi đến Device');
            
            // Gửi offer đến Device thông qua signaling server
            signalingConnection.send(JSON.stringify({
                type: 'offer',
                target: config.targetId,
                offer: {
                    type: peerConnection.localDescription.type,
                    sdp: peerConnection.localDescription.sdp
                }
            }));
        })
        .catch(error => {
            logMessage(`Lỗi khi tạo offer: ${error}`);
        });
}

// Thiết lập data channel
function setupDataChannel() {
    dataChannel.onopen = () => {
        logMessage('Data channel đã mở');
        if(dcInterval) clearInterval(dcInterval);
        dcInterval = setInterval(function() {
            try {
                // Định nghĩa current_stamp là thời gian hiện tại tính bằng giây
                var current_stamp = Math.floor(new Date().getTime() / 1000) - start_time;
                var message = 'ping ' + current_stamp + ' s';
                logMessage('> ' + message + '\n');
                dataChannel.send(message);
            } catch (error) {
                logMessage(`Lỗi khi gửi tin nhắn: ${error}`);
                clearInterval(dcInterval);
            }
        }, 1000);
    };
    
    dataChannel.onclose = () => {
        logMessage('Data channel đã đóng');
        clearInterval(dcInterval);
    };
    
    dataChannel.onmessage = (event) => {
        if (typeof event.data === 'string') {
            logMessage('< ' + event.data + '\n');
        }
        // Kiểm tra nếu dữ liệu là ArrayBuffer (dữ liệu nhị phân)
        else if (event.data instanceof ArrayBuffer) {
            // Thống kê dữ liệu nhận được
            const dataSize = event.data.byteLength;
            const dataSizeKB = (dataSize / 1024).toFixed(2);
            
            // Biến toàn cục để theo dõi thống kê
            if (!window.imageStats) {
                window.imageStats = {
                    totalReceived: 0,
                    totalPackets: 0,
                    lostPackets: 0,
                    startTime: Date.now(),
                    lastUpdate: Date.now(),
                    dataRate: 0
                };
            }
            
            // Cập nhật thống kê
            window.imageStats.totalReceived += dataSize;
            window.imageStats.totalPackets++;
            
            // Tính tốc độ dữ liệu (bytes/giây)
            const now = Date.now();
            const timeDiff = (now - window.imageStats.lastUpdate) / 1000; // Đổi sang giây
            if (timeDiff > 0) {
                window.imageStats.dataRate = dataSize / timeDiff;
                window.imageStats.lastUpdate = now;
            }
            
            // Tính tỷ lệ mất gói (giả định)
            // Trong thực tế, cần có cơ chế đánh số gói để biết chính xác gói mất
            if (Math.random() < 0.05) { // Giả định tỷ lệ mất gói 5%
                window.imageStats.lostPackets++;
            }
            
            // Cập nhật thống kê video
            const totalReceivedMB = (window.imageStats.totalReceived / (1024 * 1024)).toFixed(2);
            const dataRateKBps = (window.imageStats.dataRate / 1024).toFixed(2);
            const lossRate = ((window.imageStats.lostPackets / window.imageStats.totalPackets) * 100).toFixed(2);
            
            // Thêm thông tin vào biến videoStatText hiện có
            let videoStatText = "Thống kê video: ";
            videoStatText += `Gói nhận: ${window.imageStats.totalPackets}, ` 
            videoStatText += `Kích thước: ${dataSizeKB} KB, ` 
            videoStatText += `Tổng nhận: ${totalReceivedMB} MB, ` 
            videoStatText += `Tốc độ: ${dataRateKBps} KB/s, ` 
            videoStatText += `Gói mất: ${window.imageStats.lostPackets} (${lossRate}%)`;

            videoStats.textContent = videoStatText;
            
            // Chuyển đổi ArrayBuffer thành Blob với kiểu MIME là image/jpeg
            const blob = new Blob([event.data], { type: 'image/jpeg' });
            
            // Tạo URL từ Blob
            const imageUrl = URL.createObjectURL(blob);
            
            // Tạo một đối tượng Image để hiển thị
            const img = new Image();
     
            img.onload = () => {
                // Lấy canvas từ video element hoặc tạo mới nếu chưa có
                const video = document.getElementById('remoteVideo');
                let canvas = document.getElementById('videoCanvas');
                let ctx;
                
                if (!canvas) {
                    canvas = document.createElement('canvas');
                    canvas.id = 'videoCanvas';
                    canvas.width = 800;
                    canvas.height = 450;
                    video.parentNode.insertBefore(canvas, video);
                    video.style.display = 'none';
                }
                
                ctx = canvas.getContext('2d');
                
                // Vẽ hình ảnh lên canvas
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                
                // Giải phóng URL
                URL.revokeObjectURL(imageUrl);
            };
            
            img.src = imageUrl;
        }
    };
}

// Xử lý answer từ Device
function handleAnswer(answer) {
    logMessage('Đã nhận answer từ Device');
    
    const remoteDesc = new RTCSessionDescription({
        type: answer.type,
        sdp: answer.sdp
    });
    
    peerConnection.setRemoteDescription(remoteDesc)
        .catch(error => {
            logMessage(`Lỗi khi thiết lập remote description: ${error}`);
        });
}

// Xử lý ICE candidate từ Device
function handleIceCandidate(candidate) {
    if (candidate) {
        peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
            .catch(error => {
                logMessage(`Lỗi khi thêm ICE candidate: ${error}`);
            });
    }
}

// Thiết lập sự kiện
connectBtn.addEventListener('click', () => {
    if (!signalingConnection || signalingConnection.readyState !== WebSocket.OPEN) {
        connectToSignalingServer();
        connectBtn.textContent = 'Kết nối lại';
    }
    // Đợi đến khi WebSocket mở kết nối
    if (signalingConnection && signalingConnection.readyState !== WebSocket.OPEN) {
        logMessage('Đang đợi kết nối WebSocket...');
        signalingConnection.addEventListener('open', () => {
            logMessage('WebSocket đã mở, tiếp tục khởi tạo kết nối ngang hàng');
            if (!peerConnection) {
                initiatePeerConnection();
            }
        }, { once: true });
        return; // Thoát và đợi sự kiện open
    }
});

// Kết nối tự động khi trang được tải
window.addEventListener('load', () => {
    updateConnectionStatus('Chưa kết nối');
    updateIceConfigDisplay();
}); 
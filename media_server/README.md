

# Tài liệu Media Server sử dụng WebRTC Client

## Giới thiệu

Media Server là một hệ thống cho phép truyền video qua WebRTC (Web Real-Time Communication) sử dụng giao thức P2P (Peer-to-Peer). Hệ thống này cho phép truyền video từ camera đến trình duyệt web hoặc ứng dụng khác thông qua kết nối WebRTC.

Tài liệu này mô tả cách sử dụng thành phần WebRTC Client trong Media Server.

## Yêu cầu hệ thống

- C++11 trở lên
- libdatachannel (thư viện WebRTC)
- nlohmann/json (thư viện xử lý JSON)
- OpenCV (xử lý hình ảnh)

## Cấu trúc WebRTC Client

WebRTC Client bao gồm hai file chính:
- `webrtc_client.h`: File header định nghĩa lớp WebRTCClient
- `webrtc_client.cpp`: File cài đặt các phương thức của lớp WebRTCClient

### Lớp WebRTCClient

Lớp `WebRTCClient` cung cấp các chức năng:
- Kết nối đến signaling server qua WebSocket
- Thiết lập kết nối P2P thông qua ICE (Interactive Connectivity Establishment)
- Tạo và quản lý DataChannel để truyền dữ liệu
- Mã hóa và gửi frame video

## Cấu hình WebRTC Client

WebRTC Client cần một file cấu hình JSON với định dạng sau:

```json
{
  "serverUrl": "ws://your-signaling-server.com",
  "peerId": "unique-client-id",
  "iceServers": [
    {
      "host": "stun.l.google.com",
      "port": 19302
    },
    {
      "host": "turn.example.com",
      "port": 3478,
      "username": "username",
      "credential": "password"
    }
  ]
}
```

Trong đó:
- `serverUrl`: URL của signaling server
- `peerId`: ID duy nhất của client
- `iceServers`: Danh sách các STUN/TURN server để thiết lập kết nối P2P

## Hướng dẫn sử dụng WebRTC Client

### 1. Khởi tạo WebRTC Client

```cpp
// Đọc cấu hình từ file JSON
std::ifstream config_file("config.json");
json config_json = json::parse(config_file);

// Tạo cấu hình WebRTC
rtc::Configuration pc_config;
for (auto& server : config_json["iceServers"]) {
    std::string host = server["host"].get<std::string>();
    unsigned int port = server["port"].get<unsigned int>();
    
    if (server.find("username") == server.end() || server.find("credential") == server.end()) {
        pc_config.iceServers.emplace_back(rtc::IceServer(host, port));
    } else {
        std::string username = server["username"].get<std::string>();
        std::string credential = server["credential"].get<std::string>();
        pc_config.iceServers.emplace_back(rtc::IceServer(host, port, username, credential));
    }
}

// Cấu hình WebSocket
rtc::WebSocketConfiguration wb_config;
wb_config.disableTlsVerification = true;

// Lấy thông tin client ID và server URL
std::string clientId = config_json["peerId"].get<std::string>();
std::string serverUrl = config_json["serverUrl"].get<std::string>();

// Khởi tạo WebRTC client
WebRTCClient client(serverUrl, wb_config, pc_config, clientId);
```

### 2. Gửi frame video

```cpp
// Giả sử bạn đã có một frame hình ảnh từ camera
cv::Mat frame;

// Gửi frame qua WebRTC
client.sendVideoFrame(frame);
```

## Giải thích chi tiết các thành phần

### 1. Khởi tạo WebSocket

WebRTC Client sử dụng WebSocket để kết nối với signaling server. Quá trình này được thực hiện trong phương thức `createWebSocket`:

```cpp
void WebRTCClient::createWebSocket(const std::string& serverUrl) {
    // Khởi tạo WebSocket
    ws = std::make_shared<rtc::WebSocket>(wb_config);

    // Thiết lập các callback
    ws->onOpen([&wsPromise]() {
        std::cout << "WebSocket connected, signaling ready" << std::endl;
        wsPromise.set_value();
    });

    // Xử lý các tin nhắn từ signaling server
    ws->onMessage([this](auto data) {
        // Xử lý các tin nhắn offer, ice-candidate, v.v.
    });

    // Kết nối WebSocket
    ws->open(serverUrl);
}
```

### 2. Thiết lập PeerConnection

PeerConnection được tạo khi nhận được offer từ peer khác:

```cpp
shared_ptr<rtc::PeerConnection> WebRTCClient::createPeerConnection(const rtc::Configuration &config, weak_ptr<rtc::WebSocket> wws, std::string id) {
    auto pc = std::make_shared<rtc::PeerConnection>(config);

    // Thiết lập các callback
    pc->onStateChange([](rtc::PeerConnection::State state) { 
        std::cout << "State: " << state << std::endl; 
    });

    pc->onLocalDescription([wws, id](rtc::Description description) {
        // Gửi answer về signaling server
    });

    pc->onLocalCandidate([wws, id](rtc::Candidate candidate) {
        // Gửi ice-candidate về signaling server
    });

    pc->onDataChannel([this](shared_ptr<rtc::DataChannel> dc) {
        // Xử lý DataChannel
    });

    return pc;
}
```

### 3. Gửi video frame

Phương thức `sendVideoFrame` mã hóa frame thành JPEG và gửi qua DataChannel:

```cpp
void WebRTCClient::sendVideoFrame(const cv::Mat& frame) {
    if (dataChannel && dataChannel->isOpen()) {
        // Mã hóa frame thành JPEG
        std::vector<uchar> jpegData = encodeToJpeg(frame);
        
        // Chuyển đổi thành binary message
        std::vector<std::byte> byteData(jpegData.size());
        for (size_t i = 0; i < jpegData.size(); ++i) {
            byteData[i] = static_cast<std::byte>(jpegData[i]);
        }
        rtc::binary message(byteData.begin(), byteData.end());
        
        // Gửi qua DataChannel
        dataChannel->send(message);
    }
}
```

## Ví dụ hoàn chỉnh

Dưới đây là một ví dụ hoàn chỉnh về cách sử dụng WebRTC Client để gửi video:

```cpp
#include "webrtc_client.h"
#include <iostream>
#include <fstream>
#include <opencv2/opencv.hpp>

int main(int argc, char* argv[]) {
    // Khởi tạo logger
    rtc::InitLogger(rtc::LogLevel::Info);
    
    // Đọc cấu hình từ file
    std::string config_path = "config.json";
    if (argc > 1) {
        config_path = argv[1];
    }
    
    std::ifstream config_file(config_path);
    if (!config_file.is_open()) {
        std::cerr << "Không thể mở file " << config_path << std::endl;
        return -1;
    }
    
    json config_json = json::parse(config_file);
    
    // Tạo cấu hình WebRTC
    rtc::Configuration pc_config;
    for (auto& server : config_json["iceServers"]) {
        std::string host = server["host"].get<std::string>();
        unsigned int port = server["port"].get<unsigned int>();
        
        if (server.find("username") == server.end() || server.find("credential") == server.end()) {
            pc_config.iceServers.emplace_back(rtc::IceServer(host, port));
        } else {
            std::string username = server["username"].get<std::string>();
            std::string credential = server["credential"].get<std::string>();
            pc_config.iceServers.emplace_back(rtc::IceServer(host, port, username, credential));
        }
    }
    
    rtc::WebSocketConfiguration wb_config;
    wb_config.disableTlsVerification = true;

    std::string clientId = config_json["peerId"].get<std::string>();
    std::string serverUrl = config_json["serverUrl"].get<std::string>();
    
    // Tạo WebRTC client
    WebRTCClient client(serverUrl, wb_config, pc_config, clientId);

    // Mở camera
    cv::VideoCapture cap(0);
    if (!cap.isOpened()) {
        std::cerr << "Không thể mở camera" << std::endl;
        return -1;
    }
    
    cv::Mat frame;
    while (true) {
        // Đọc frame từ camera
        cap >> frame;
        if (frame.empty()) {
            std::cerr << "Frame trống" << std::endl;
            break;
        }
        
        // Gửi frame qua WebRTC
        client.sendVideoFrame(frame);
        
        // Hiển thị frame (tùy chọn)
        cv::imshow("Frame", frame);
        if (cv::waitKey(1) == 27) // ESC
            break;
    }
    
    return 0;
}
```

## Luồng hoạt động của WebRTC Client

1. **Kết nối với Signaling Server**:
   - WebRTC Client kết nối đến signaling server qua WebSocket
   - Gửi thông báo kết nối với ID của client

2. **Xử lý Offer**:
   - Khi nhận được offer từ peer khác, client tạo PeerConnection
   - Thiết lập remote description từ offer
   - Tạo và gửi answer về signaling server

3. **Trao đổi ICE Candidates**:
   - Client nhận và xử lý ICE candidates từ peer khác
   - Gửi local ICE candidates đến peer khác qua signaling server

4. **Thiết lập DataChannel**:
   - Khi DataChannel được mở, client có thể gửi và nhận dữ liệu
   - Client sử dụng DataChannel để gửi frame video đã mã hóa

5. **Gửi Video**:
   - Client nhận frame từ camera
   - Mã hóa frame thành JPEG
   - Gửi dữ liệu qua DataChannel

## Xử lý lỗi và tình huống đặc biệt

WebRTC Client có các cơ chế xử lý lỗi:

1. **Mất kết nối WebSocket**:
   - WebSocket có callback `onClosed` và `onError` để xử lý khi kết nối bị đóng hoặc lỗi

2. **Lỗi ICE Connection**:
   - PeerConnection có callback `onIceStateChange` để theo dõi trạng thái kết nối ICE
   - Xử lý các trạng thái như Failed, Disconnected, Closed

3. **Lỗi gửi dữ liệu**:
   - Phương thức `sendVideoFrame` kiểm tra DataChannel có mở không trước khi gửi
   - Bắt exception khi gửi dữ liệu thất bại

## Kết luận

WebRTC Client trong Media Server cung cấp một cách đơn giản để truyền video qua WebRTC. Bằng cách sử dụng các thư viện như libdatachannel và OpenCV, bạn có thể dễ dàng tạo một ứng dụng truyền video thời gian thực.

## Tài liệu tham khảo

- [libdatachannel Documentation](https://github.com/paullouisageneau/libdatachannel)
- [WebRTC API](https://webrtc.org/getting-started/overview)
- [OpenCV Documentation](https://docs.opencv.org/)

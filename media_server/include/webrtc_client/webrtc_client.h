#ifndef WEBRTC_CLIENT_H
#define WEBRTC_CLIENT_H

#include <rtc/rtc.hpp>
#include <rtc/websocket.hpp>  // Sử dụng WebSocket từ libdatachannel
#include <nlohmann/json.hpp>
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <string>
#include <chrono>
#include <opencv2/opencv.hpp>
#include <vector>



using json = nlohmann::json;
using std::shared_ptr;
using std::weak_ptr;
template <class T> weak_ptr<T> make_weak_ptr(shared_ptr<T> ptr) { return ptr; }

class WebRTCClient {
public:
    /**
     * Khởi tạo WebRTC client
     * @param serverUrl URL của signaling server
     * @param wb_config Cấu hình WebSocket
     * @param pc_config Cấu hình PeerConnection
     * @param id ID của client
     */
    WebRTCClient(const std::string& serverUrl, const rtc::WebSocketConfiguration& wb_config, 
                const rtc::Configuration& pc_config, const std::string& id);
    ~WebRTCClient();
    
    void sendVideoFrame(const cv::Mat& frame);

private:
    std::string clientId;
    std::shared_ptr<rtc::WebSocket> ws;
    const rtc::WebSocketConfiguration wb_config;
    const rtc::Configuration pc_config;
    std::shared_ptr<rtc::PeerConnection> pc = nullptr;
    std::shared_ptr<rtc::DataChannel> dataChannel = nullptr;
    void createWebSocket(const std::string& serverUrl);
    // void createVideoChannel();
    std::vector<uchar> encodeToJpeg(const cv::Mat& frame, int quality = 90);
    shared_ptr<rtc::PeerConnection> createPeerConnection(const rtc::Configuration &config, 
            weak_ptr<rtc::WebSocket> wws, std::string id);
};

#endif // WEBRTC_CLIENT_H 
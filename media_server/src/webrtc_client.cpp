#include "webrtc_client/webrtc_client.h"
#include <iostream>
#include <thread>
#include <mutex>
#include <condition_variable>
#include <string>
#include <random>
#include <chrono>
#include <opencv2/opencv.hpp>

WebRTCClient::WebRTCClient(const std::string& serverUrl, const rtc::WebSocketConfiguration& wb_config, const rtc::Configuration& pc_config, const std::string& id)
    : clientId(id), wb_config(wb_config), pc_config(pc_config)
{
    createWebSocket(serverUrl);
} 

WebRTCClient::~WebRTCClient() {
    std::cout << "Cleaning up..." << std::endl;
    ws->close();
}

void WebRTCClient::createWebSocket(const std::string& serverUrl) {
    // Khởi tạo WebSocket
    ws = std::make_shared<rtc::WebSocket>(wb_config);

	std::promise<void> wsPromise;
	auto wsFuture = wsPromise.get_future();

	ws->onOpen([&wsPromise]() {
		std::cout << "WebSocket connected, signaling ready" << std::endl;
		wsPromise.set_value();
	});

	ws->onError([&wsPromise](std::string s) {
		std::cout << "WebSocket error" << std::endl;
		wsPromise.set_exception(std::make_exception_ptr(std::runtime_error(s)));
	});

	ws->onClosed([]() { std::cout << "WebSocket closed" << std::endl; });
	ws->onMessage([this](auto data) {
		// data holds either std::string or rtc::binary
		if (!std::holds_alternative<std::string>(data))
			return;

		json message = json::parse(std::get<std::string>(data));
		auto id = message["from"].get<std::string>();
		auto type = message["type"].get<std::string>();

            

		if (type == "offer") {
            std::cout << "Received offer" << std::endl;
            auto sdp = message["offer"]["sdp"].get<std::string>();
            auto type = message["offer"]["type"].get<std::string>();
            if (pc) {
                pc->close();
                pc = nullptr;
            }
            pc = createPeerConnection(pc_config, make_weak_ptr(ws), id);
            pc->setRemoteDescription(rtc::Description(sdp, type));
            
		} else if (type == "ice-candidate") {
            auto candidate = message["candidate"];
            if (candidate.find("candidate") != candidate.end() && pc != nullptr 
                    && pc->state() != rtc::PeerConnection::State::Closed) {
                auto str_cand = candidate["candidate"].get<std::string>();
                auto mid = candidate["sdpMid"].get<std::string>();
                std::cout << "Add ice-candidate" << std::endl;
                rtc::Candidate cand(str_cand, mid);
                pc->addRemoteCandidate(cand);
            }
		}
	});

    // Kết nối WebSocket
    ws->open(serverUrl);
    
    std::cout << "Waiting for signaling to be connected..." << std::endl;
	wsFuture.get();

    json message = {{"type", "connection"}, {"clientId", clientId}};
    ws->send(message.dump());
    std::cout << "Sent connection message" << std::endl;
}

shared_ptr<rtc::PeerConnection> WebRTCClient::createPeerConnection(const rtc::Configuration &config, weak_ptr<rtc::WebSocket> wws, std::string id) {
	auto pc = std::make_shared<rtc::PeerConnection>(config);

	pc->onStateChange(
	    [](rtc::PeerConnection::State state) { std::cout << "State: " << state << std::endl; });

    pc->onGatheringStateChange([](rtc::PeerConnection::GatheringState state) {
        std::cout << "Gathering state: " << state << std::endl;
    });
    pc->onLocalDescription([wws, id](rtc::Description description) {
        json message = {
            {"target", id}, 
            {"type", "answer"}, 
            {"answer", {
                {"type", description.typeString()},
                {"sdp", std::string(description)}
            }}
        };
		if (auto ws = wws.lock())
			ws->send(message.dump());
        std::cout << "Sent answer" << std::endl;
	});

    pc->onLocalCandidate([wws, id](rtc::Candidate candidate) {
		json message = {{"target", id},
		                {"type", "ice-candidate"},
                        {"candidate", {
                            {"candidate", std::string(candidate)},
                            {"sdpMid", candidate.mid()}
                        }}};
        std::cout << "Sent ice-candidate" << std::endl;
		if (auto ws = wws.lock()) {
            std::cout << "Sent ice-candidate" << std::endl;
			ws->send(message.dump());
        }
	});

    pc->onIceStateChange([](rtc::PeerConnection::IceState state) {
        std::cout << "ICE state: " << state << std::endl;
        
        switch (state) {
            case rtc::PeerConnection::IceState::Failed:
                std::cout << "ICE connection failed - check STUN/TURN server and firewall" << std::endl;
                break;
            case rtc::PeerConnection::IceState::Disconnected:
                std::cout << "ICE connection disconnected - possibly due to network instability" << std::endl;
                break;
            case rtc::PeerConnection::IceState::Closed:
                std::cout << "ICE connection closed" << std::endl;
                break;
            case rtc::PeerConnection::IceState::Completed:
                std::cout << "ICE connection completed successfully" << std::endl;
                break;
            default:
                break;
        }
    });


	pc->onDataChannel([this](shared_ptr<rtc::DataChannel> dc) {
        dataChannel = dc;
		dc->onMessage([dc](auto data) {
			// data holds either std::string or rtc::binary
			if (std::holds_alternative<std::string>(data) && 
                std::get<std::string>(data).find("ping") != std::string::npos) {
				dc->send("pong" + std::get<std::string>(data).substr(4));
			}
		});
        dc->onOpen([dc]() {
            std::cout << "DataChannel opened" << std::endl;
        });
        dc->onClosed([dc]() {
            std::cout << "DataChannel closed" << std::endl;
        });
	});
	return pc;
};

void WebRTCClient::sendVideoFrame(const cv::Mat& frame) {
    if (dataChannel && dataChannel->isOpen()) {
        // Encode và gửi frame
        std::vector<uchar> jpegData = encodeToJpeg(frame);
        
        // Tạo binary message
        std::vector<std::byte> byteData(jpegData.size());
        for (size_t i = 0; i < jpegData.size(); ++i) {
            byteData[i] = static_cast<std::byte>(jpegData[i]);
        }
        rtc::binary message(byteData.begin(), byteData.end());
        
        // Gửi qua DataChannel
        try {
            dataChannel->send(message);
        } catch (const std::runtime_error& e) {
            std::cerr << "Error sending data: " << e.what() << std::endl;
            // Handle when DataChannel is closed
            if (std::string(e.what()).find("DataChannel is closed") != std::string::npos) {
                std::cerr << "DataChannel is closed, need to reestablish connection" << std::endl;
            }
        }
    }
}


std::vector<uchar> WebRTCClient::encodeToJpeg(const cv::Mat& frame, int quality) {
    std::vector<uchar> buffer;
    cv::imencode(".jpg", frame, buffer, {cv::IMWRITE_JPEG_QUALITY, quality});
    return buffer;
}

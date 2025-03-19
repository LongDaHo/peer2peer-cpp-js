

# Hướng dẫn chạy chương trình Peer-to-Peer WebRTC

Dự án này bao gồm hai thành phần chính cần được chạy riêng biệt để thiết lập kết nối peer-to-peer qua WebRTC:

## 1. Chạy Signaling Server

Signaling Server đóng vai trò trung gian để các peer có thể tìm thấy nhau và trao đổi thông tin kết nối.

```bash
# Di chuyển vào thư mục signaling_server
cd signaling_server

# Cài đặt dependencies (nếu chưa cài)
pip install aiohttp

# Chạy server
python signaling_server.py
```

Signaling Server sẽ chạy trên cổng 7860. Bạn sẽ thấy thông báo:
```
======== Running on http://0.0.0.0:7860 ========
```

## 2. Chạy Media Server

Media Server xử lý việc truyền video từ nguồn (camera) đến người xem qua WebRTC.

```bash
# Di chuyển vào thư mục media_server
cd media_server

# Cài đặt dependencies (nếu chưa cài)
# Đối với Ubuntu/Debian:
git clone https://github.com/paullouisageneau/libdatachannel.git -b v0.22.5
git init --recursive submodules
mkdir build && cd build
cmake -DCMAKE_BUILD_TYPE=Release -DUSE_GNUTLS=0 -DUSE_NICE=0 ..
make -j$(nproc)
sudo make install
cd ../..

sudo apt-get install -y libopencv-dev nlohmann-json-dev

# Biên dịch
mkdir build && cd build
cmake ..
make

# Chạy với file cấu hình
./webrtc_client ../config.json
```

Đảm bảo file `config.json` đã được cấu hình đúng với thông tin:
- URL của Signaling Server
- ID của client
- Thông tin STUN/TURN server

## Kiểm tra kết nối

1. Mở file `signaling_server/index.html` trong trình duyệt web
2. Nhấn nút "Kết nối với Device"
3. Nếu mọi thứ được cấu hình đúng, bạn sẽ thấy video từ camera hiển thị trên trang web

## Xử lý sự cố

- Nếu không thể kết nối, kiểm tra log của cả Signaling Server và Media Server
- Đảm bảo các port cần thiết (7860) không bị chặn bởi firewall
- Kiểm tra cấu hình STUN/TURN server nếu các peer ở sau NAT

## Lưu ý

- Cả hai thành phần (Signaling Server và Media Server) cần được chạy đồng thời
- Nếu triển khai trên mạng công cộng, hãy cân nhắc sử dụng HTTPS cho Signaling Server và cấu hình TURN server

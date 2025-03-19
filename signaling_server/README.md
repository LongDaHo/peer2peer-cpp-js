



# Tài liệu Signaling Server cho WebRTC

## Giới thiệu

Signaling Server là một thành phần quan trọng trong hệ thống WebRTC, đóng vai trò trung gian để thiết lập kết nối giữa các thiết bị. Server này cho phép các thiết bị trao đổi thông tin cần thiết để thiết lập kết nối P2P (Peer-to-Peer) như SDP (Session Description Protocol) và ICE candidates.

Tài liệu này mô tả cách cài đặt, cấu hình và sử dụng Signaling Server cùng với ứng dụng web client để xem video từ thiết bị qua WebRTC.

## Cấu trúc hệ thống

Hệ thống bao gồm ba thành phần chính:

1. **Signaling Server**: Server trung gian để trao đổi thông tin giữa các thiết bị
2. **Browser Client**: Ứng dụng web chạy trên trình duyệt để hiển thị video
3. **Device Client**: Thiết bị gửi video (sử dụng WebRTC Client từ Media Server)

## Cài đặt Signaling Server

### Yêu cầu

- Python 3.7 trở lên
- aiohttp

### Cài đặt thư viện

```bash
pip install aiohttp
```


### Chạy Signaling Server

```bash
python signaling_server.py
```


Server sẽ chạy trên cổng 7860 và lắng nghe kết nối WebSocket tại đường dẫn `/ws`.

## Cấu trúc mã nguồn Signaling Server

Signaling Server được viết bằng Python sử dụng thư viện aiohttp để xử lý kết nối WebSocket. Dưới đây là các thành phần chính:

### 1. Quản lý kết nối

```python
# Lưu trữ kết nối của các client
connected_clients = {}
```


Server sử dụng một dictionary để lưu trữ các kết nối WebSocket của client, với key là ID của client.

### 2. Xử lý kết nối WebSocket

```python
async def handle_connection(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    client_id = None
    try:
        # Xử lý tin nhắn
        async for msg in ws:
            if msg.type == web.WSMsgType.TEXT:
                data = json.loads(msg.data)
                msg_type = data["type"]
                # Xử lý các loại tin nhắn
                # ...
        return ws
    except Exception as e:
        print(f"Connection closed for client {client_id}")
        raise e
    finally:
        # Xóa client khỏi danh sách khi ngắt kết nối
        if client_id and client_id in connected_clients:
            del connected_clients[client_id]
            print(f"Client {client_id} disconnected. Total clients: {len(connected_clients)}")
```


Hàm này xử lý các kết nối WebSocket đến từ client. Nó lắng nghe các tin nhắn và xử lý chúng dựa trên loại tin nhắn.

### 3. Xử lý các loại tin nhắn

#### a. Tin nhắn kết nối

```python
if msg_type == "connection":
    client_id = data["clientId"]
    print(f"Received connection from client {client_id}")
    if not client_id:
        await ws.send_json({
            "type": "error", 
            "message": "Client ID is required"
        })
        return
    connected_clients[client_id] = ws
    print(f"Client {client_id} connected. Total clients: {len(connected_clients)}")
    
    # Thông báo cho client rằng đã kết nối thành công
    await ws.send_json({
        "type": "connection", 
        "status": "connected", 
        "clientId": client_id
    })
```


Khi client kết nối, nó gửi một tin nhắn với loại "connection" và ID của nó. Server lưu trữ kết nối và gửi lại xác nhận.

#### b. Tin nhắn offer

```python
elif msg_type == "offer":
    target_id = data["target"]
    print(f"Received offer from client {client_id} to client {target_id}")
    # Chuyển tiếp offer đến client đích
    if target_id and target_id in connected_clients:
        await connected_clients[target_id].send_json({
            "type": "offer",
            "offer": data["offer"],
            "from": client_id
        })
    else:
        await ws.send_json({
            "type": "error", 
            "message": f"Target client {target_id} not found"
        })
```


Khi client gửi offer, server chuyển tiếp nó đến client đích dựa trên target_id.

#### c. Tin nhắn answer

```python
elif msg_type == "answer":
    target_id = data["target"]
    print(f"Received answer from client {client_id} to client {target_id}")
    # Chuyển tiếp answer đến client đích
    if target_id and target_id in connected_clients:
        await connected_clients[target_id].send_json({
            "type": "answer",
            "answer": data["answer"],
            "from": client_id
        })
```


Tương tự, khi client gửi answer, server chuyển tiếp nó đến client đích.

#### d. Tin nhắn ICE candidate

```python
elif msg_type == "ice-candidate":
    target_id = data["target"]
    print(f"Received ICE candidate from client {client_id} to client {target_id}")
    # Chuyển tiếp ICE candidate đến client đích
    if target_id and target_id in connected_clients:
        await connected_clients[target_id].send_json({
            "type": "ice-candidate",
            "candidate": data["candidate"],
            "from": client_id
        })
```


Khi client gửi ICE candidate, server chuyển tiếp nó đến client đích.

### 4. Khởi động server

```python
if __name__ == "__main__":
    app = web.Application()
    app.router.add_get('/ws', handle_connection)

    web.run_app(app, host='0.0.0.0', port=7860)
```


Server được khởi động trên cổng 7860 và lắng nghe kết nối WebSocket tại đường dẫn `/ws`.

## Cấu hình và sử dụng Browser Client

Browser Client là một ứng dụng web đơn giản cho phép người dùng kết nối với thiết bị và xem video từ thiết bị qua WebRTC.

### Mở ứng dụng web

1. Mở file `index.html` trong thư mục `signaling_server` bằng trình duyệt web (Chrome, Firefox, Edge, v.v.).
2. Giao diện ứng dụng sẽ hiển thị với các thành phần:
   - Nút "Kết nối với Device"
   - Khung hiển thị video
   - Khung hiển thị thống kê
   - Khung hiển thị nhật ký kết nối
   - Khung hiển thị cấu hình STUN/TURN

### Cấu hình Browser Client

Trước khi sử dụng, bạn cần cấu hình Browser Client trong file `browser_client.js`:

1. Mở file `browser_client.js` bằng trình soạn thảo văn bản.
2. Tìm phần cấu hình ở đầu file:

```javascript
// Cấu hình
const config = {
    clientId: 'browser-client',
    targetId: 'device',
    signalingServer: 'ws://0.0.0.0:7860/ws',
    iceServers: [
        {
            urls: "stun:stun.l.google.com:19302",
        }
    ]
};
```


3. Cập nhật các thông số:
   - `clientId`: ID của client trình duyệt (mặc định là 'browser-client')
   - `targetId`: ID của thiết bị gửi video (mặc định là 'device')
   - `signalingServer`: URL của Signaling Server. Nếu bạn chạy Signaling Server trên máy cục bộ, hãy sử dụng `ws://localhost:7860/ws`. Nếu bạn sử dụng ngrok hoặc dịch vụ tương tự để public server, hãy cập nhật URL tương ứng.
   - `iceServers`: Danh sách các STUN/TURN server. Mặc định sử dụng STUN server của Google.

### Sử dụng Browser Client

1. Sau khi cấu hình, tải lại trang web.
2. Nhấn nút "Kết nối với Device" để kết nối với Signaling Server và thiết lập kết nối WebRTC.
3. Nếu thiết bị đã kết nối với Signaling Server và có cùng `targetId`, kết nối P2P sẽ được thiết lập và video sẽ hiển thị trên trang web.
4. Bạn có thể theo dõi quá trình kết nối và thống kê video trong các khung tương ứng.

## Luồng hoạt động

1. **Kết nối với Signaling Server**:
   - Browser Client và Device Client kết nối đến Signaling Server qua WebSocket.
   - Mỗi client gửi tin nhắn kết nối với ID của mình.

2. **Thiết lập kết nối WebRTC**:
   - Browser Client tạo offer và gửi đến Device Client thông qua Signaling Server.
   - Device Client nhận offer, tạo answer và gửi lại cho Browser Client.
   - Cả hai bên trao đổi ICE candidates để tìm đường kết nối tốt nhất.

3. **Truyền video**:
   - Sau khi kết nối P2P được thiết lập, Device Client gửi video trực tiếp đến Browser Client qua DataChannel.
   - Browser Client nhận dữ liệu video, chuyển đổi thành hình ảnh và hiển thị trên trang web.

## Xử lý lỗi và tình huống đặc biệt

### 1. Mất kết nối với Signaling Server

Nếu kết nối với Signaling Server bị mất, bạn có thể nhấn nút "Kết nối lại" để thiết lập lại kết nối.

### 2. Thiết bị không kết nối

Nếu thiết bị không kết nối với Signaling Server hoặc có ID khác với `targetId` trong cấu hình, kết nối P2P sẽ không được thiết lập. Hãy kiểm tra:
- Thiết bị đã kết nối với Signaling Server chưa
- ID của thiết bị có khớp với `targetId` trong cấu hình không

### 3. Lỗi ICE Connection

Nếu kết nối ICE không thể thiết lập (ví dụ: do tường lửa), bạn có thể cần cấu hình TURN server. Thêm TURN server vào cấu hình `iceServers`:

```javascript
iceServers: [
    {
        urls: "stun:stun.l.google.com:19302",
    },
    {
        urls: "turn:your-turn-server.com:3478",
        username: "username",
        credential: "password"
    }
]
```


## Triển khai trên Internet

Để triển khai Signaling Server trên Internet, bạn có thể:

1. **Sử dụng ngrok** (cho mục đích phát triển):
   ```bash
   ngrok http 7860
   ```
   Sau đó cập nhật `signalingServer` trong cấu hình Browser Client với URL ngrok.

2. **Triển khai trên VPS hoặc dịch vụ đám mây**:
   - Cài đặt Python và các thư viện cần thiết
   - Chạy Signaling Server
   - Cấu hình tường lửa để mở cổng 7860
   - Cập nhật `signalingServer` trong cấu hình Browser Client với URL của server

## Kết luận

Signaling Server là một thành phần quan trọng trong hệ thống WebRTC, giúp thiết lập kết nối P2P giữa các thiết bị. Với tài liệu này, bạn có thể cài đặt, cấu hình và sử dụng Signaling Server cùng với Browser Client để xem video từ thiết bị qua WebRTC.

## Tài liệu tham khảo

- [WebRTC API](https://webrtc.org/getting-started/overview)
- [aiohttp Documentation](https://docs.aiohttp.org/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API)

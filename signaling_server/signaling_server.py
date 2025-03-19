from aiohttp import web
import json

# Lưu trữ kết nối của các client
connected_clients = {}

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
        return ws
    except Exception as e:
        print(f"Connection closed for client {client_id}")
        raise e
    finally:
        # Xóa client khỏi danh sách khi ngắt kết nối
        if client_id and client_id in connected_clients:
            del connected_clients[client_id]
            print(f"Client {client_id} disconnected. Total clients: {len(connected_clients)}")

if __name__ == "__main__":
    app = web.Application()
    app.router.add_get('/ws', handle_connection)

    web.run_app(app, host='0.0.0.0', port=7860)
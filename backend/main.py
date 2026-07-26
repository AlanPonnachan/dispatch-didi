# backend/main.py
import os
import json
import uuid
import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from livekit import api
from dotenv import load_dotenv
from db import SessionLocal, ExceptionRecord

load_dotenv()

app = FastAPI(title="Dispatch Didi API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()

@app.get("/api/token")
async def get_token(order_id: str = "ORD1042", language: str = "hi-IN"):
    token = api.AccessToken(
        os.getenv("LIVEKIT_API_KEY", "devkey"),
        os.getenv("LIVEKIT_API_SECRET", "secret")
    )
    token.with_identity(f"worker_{order_id}")
    token.with_name("Delivery Worker")
    
    unique_room_name = f"dispatch-{uuid.uuid4().hex[:8]}"
    
    token.with_grants(api.VideoGrants(
        room_join=True,
        room=unique_room_name,
        can_publish=True,
        can_subscribe=True,
        can_publish_data=True,
    ))
    
    metadata = json.dumps({"order_id": order_id, "language": language})
    token.with_metadata(metadata)
    
    return {"token": token.to_jwt()}

@app.websocket("/ws/dashboard")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/exceptions")
async def get_exceptions():
    db = SessionLocal()
    records = db.query(ExceptionRecord).order_by(ExceptionRecord.created_at.desc()).limit(50).all()
    db.close()
    return [{
        "id": r.id,
        "order_id": r.order_id,
        "reason": r.reason,
        "status": r.status,
        "action_taken": r.action_taken,
        "created_at": r.created_at.isoformat()
    } for r in records]

@app.post("/api/clear-db")
async def clear_db():
    db = SessionLocal()
    db.query(ExceptionRecord).delete()
    db.commit()
    db.close()
    await trigger_update()
    return {"success": True}

#Allow human ops to resolve escalated issues from the React UI
@app.post("/api/resolve/{record_id}")
async def resolve_exception(record_id: int):
    db = SessionLocal()
    record = db.query(ExceptionRecord).filter(ExceptionRecord.id == record_id).first()
    if record:
        record.status = "resolved_by_human"
        record.action_taken = "Human Ops Intervention"
        db.commit()
    db.close()
    await trigger_update()
    return {"success": True}

@app.post("/api/trigger-update")
async def trigger_update(event_type: str = "db_update", payload: dict = None):
    # If no payload is provided, default to sending the whole DB (for db_update)
    if payload is None:
        payload = await get_exceptions()
    
    await manager.broadcast({"type": event_type, "data": payload})
    return {"success": True}
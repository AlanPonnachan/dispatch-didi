import os
import json
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

# Real-world WebSocket Manager for Ops Dashboard
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
            await connection.send_json(message)

manager = ConnectionManager()

@app.get("/api/token")
async def get_token(order_id: str = "ORD1042"):
    """
    Generates a secure LiveKit token for the frontend to connect to the audio room.
    This is where CONTEXT INJECTION happens. We attach the order_id to the participant.
    """
    token = api.AccessToken(
        os.getenv("LIVEKIT_API_KEY", "devkey"),
        os.getenv("LIVEKIT_API_SECRET", "secret")
    )
    token.with_identity(f"worker_{order_id}")
    token.with_name("Delivery Worker")
    token.with_grants(api.VideoGrants(
        room_join=True,
        room="dispatch-room",
    ))
    # Injecting the context so the AI knows who is calling!
    token.with_metadata(order_id)
    
    return {"token": token.to_jwt()}

@app.websocket("/ws/dashboard")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for the React Dashboard to listen for DB updates"""
    await manager.connect(websocket)
    try:
        while True:
            # Keep connection alive, wait for incoming empty messages
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.post("/api/trigger-update")
async def trigger_update():
    """
    The Agent (agent.py) will call this locally when it logs a resolution, 
    telling the FastAPI server to fetch the latest DB rows and push to React.
    """
    db = SessionLocal()
    records = db.query(ExceptionRecord).order_by(ExceptionRecord.created_at.desc()).limit(10).all()
    db.close()
    
    payload = [{
        "id": r.id,
        "order_id": r.order_id,
        "reason": r.reason,
        "status": r.status,
        "action_taken": r.action_taken,
        "created_at": r.created_at.isoformat()
    } for r in records]
    
    await manager.broadcast({"type": "db_update", "data": payload})
    return {"success": True}
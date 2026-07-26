# backend/agent.py
import os
import urllib.request
import asyncio
# FIX: Removed TurnHandlingOptions from imports
from livekit.agents import JobContext, WorkerOptions, cli, function_tool, RunContext
from livekit.agents.voice import Agent, AgentSession
from livekit.plugins import sarvam
from dotenv import load_dotenv
from db import SessionLocal, ExceptionRecord

load_dotenv()

def trigger_dashboard_update():
    """Tells the FastAPI server to push new DB rows to React via WebSocket"""
    try:
        req = urllib.request.Request("http://localhost:8000/api/trigger-update", method="POST")
        urllib.request.urlopen(req)
    except Exception as e:
        print(f"Dashboard update failed: {e}")

# --- Voice Agent Definition with Built-in Tools ---
class DispatchAgent(Agent):
    def __init__(self, order_id: str, instructions: str, **kwargs):
        super().__init__(
            instructions=instructions,
            **kwargs
        )
        self.order_id = order_id
        
    # FIX: Make the agent speak first so the worker knows it's connected
    async def on_enter(self):
        print(f"👋 Agent greeting worker for order {self.order_id}")
        self.session.generate_reply()

    @function_tool(description="Send an SMS to the customer about a delay, wrong address, or vehicle breakdown.")
    async def send_sms(self, ctx: RunContext, message: str):
        print(f"\n✅ [TOOL: SMS] to customer of {self.order_id}: {message}")
        return "SMS sent successfully."

    @function_tool(description="Escalate the Exception to a human ops manager when you are unsure or the worker is angry.")
    async def escalate_to_human(self, ctx: RunContext, reason: str):
        print(f"\n🚨 [TOOL: ESCALATE] {self.order_id} - {reason}")
        db = SessionLocal()
        rec = ExceptionRecord(
            order_id=self.order_id, 
            reason=reason, 
            status="escalated", 
            action_taken="Sent to Ops Dashboard"
        )
        db.add(rec)
        db.commit()
        db.close()
        trigger_dashboard_update()
        return "Escalated to ops team."

    @function_tool(description="Log that you have successfully Autonomous Resolved the exception (e.g., you already sent an SMS and informed the worker).")
    async def log_autonomous_resolution(self, ctx: RunContext, resolution_details: str):
        print(f"\n✅ [TOOL: RESOLVED] {self.order_id} - {resolution_details}")
        db = SessionLocal()
        rec = ExceptionRecord(
            order_id=self.order_id, 
            reason=resolution_details, 
            status="resolved_autonomously", 
            action_taken="Autonomous API Chaining"
        )
        db.add(rec)
        db.commit()
        db.close()
        trigger_dashboard_update()
        return "Logged resolution successfully."

async def entrypoint(ctx: JobContext):
    # 1. Connect to the room 
    await ctx.connect()
    print("\n🎧 Agent connected to room. Looking for worker...")

    # 2. BOMB-PROOF WAIT: Manually check for the React participant
    participant = None
    for _ in range(50):  # Check for up to 5 seconds
        if ctx.room.remote_participants:
            participant = list(ctx.room.remote_participants.values())[0]
            break
        await asyncio.sleep(0.1)

    order_id = "ORD1042" # Fallback
    if participant:
        if participant.metadata:
            order_id = participant.metadata
        print(f"👤 Worker joined! Identity: {participant.identity}, Order: {order_id}\n")
    else:
        print("⚠️ Worker not found in time. Starting agent anyway so it doesn't freeze!\n")

    # 3. Initialize Agent with Context
    system_prompt = (
        f"You are Dispatch Didi, an autonomous voice ops-copilot for last-mile delivery. "
        f"You are speaking to a delivery worker handling Order {order_id}. "
        f"They will report an Exception (like wrong address or vehicle breakdown) in Hindi, English, or Kannada. "
        f"Use your tools to either log_autonomous_resolution (and send_sms if needed), OR escalate_to_human if unsure. "
        f"Keep spoken responses extremely brief and professional. Confirm to the worker what you just did."
    )

    agent = DispatchAgent(
        order_id=order_id,
        instructions=system_prompt,
        stt=sarvam.STT(
            language="unknown", 
            model="saaras:v3",
            mode="transcribe",
            flush_signal=True 
        ),
        llm=sarvam.LLM(model="sarvam-105b"),
        tts=sarvam.TTS(
            target_language_code="hi-IN",
            model="bulbul:v3",
            speaker="priya" 
        )
    )

    # FIX: Pass turn_detection directly to AgentSession, removing TurnHandlingOptions
    session = AgentSession(
        turn_detection="stt",
        min_endpointing_delay=0.07 
    )
    
    # 4. Start the session!
    await session.start(agent=agent, room=ctx.room)
    print("✅ Dispatch Didi is awake and listening!")

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
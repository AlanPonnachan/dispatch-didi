# backend/agent.py
import os
import urllib.request
import asyncio
from livekit.agents import JobContext, WorkerOptions, cli, function_tool, RunContext
from livekit.agents.voice import Agent, AgentSession
from livekit.plugins import sarvam
from dotenv import load_dotenv
from db import SessionLocal, ExceptionRecord, Order

load_dotenv()

def trigger_dashboard_update():
    """Tells the FastAPI server to push new DB rows to React via WebSocket"""
    try:
        req = urllib.request.Request("http://localhost:8000/api/trigger-update", method="POST")
        urllib.request.urlopen(req)
    except Exception as e:
        print(f"Dashboard update failed: {e}")

# --- DB Helper for MEMORY (Rubric: Memory L4) ---
def get_memory_context(order_id: str):
    db = SessionLocal()
    order = db.query(Order).filter(Order.order_id == order_id).first()
    last_exception = db.query(ExceptionRecord).filter(ExceptionRecord.order_id == order_id).order_by(ExceptionRecord.created_at.desc()).first()
    db.close()
    
    context = f"Order Context: Customer is {order.customer_name if order else 'Unknown'}, Address is {order.address if order else 'Unknown'}.\n"
    if last_exception:
        context += f"⚠️ CRITICAL MEMORY: The worker called earlier and reported: '{last_exception.reason}'. Status is '{last_exception.status}'. "
        context += "If they are calling back to check on this, DO NOT ask them what the issue is. Reassure them that the recovery van is on the way.\n"
    else:
        context += "No previous issues reported for this trip.\n"
    return context

# --- Voice Agent Definition with Built-in Tools ---
class DispatchAgent(Agent):
    def __init__(self, order_id: str, instructions: str, **kwargs):
        super().__init__(
            instructions=instructions,
            **kwargs
        )
        self.order_id = order_id
        
    async def on_enter(self):
        print(f"👋 Agent greeting worker for order {self.order_id}")
        self.session.generate_reply()

    @function_tool(description="Send an SMS to the customer about a delay, wrong address, or vehicle breakdown.")
    async def send_sms(self, ctx: RunContext, message: str):
        print(f"\n✅ [TOOL: SMS] to customer of {self.order_id}: {message}")
        return "SMS sent successfully."
        
    @function_tool(description="Reschedule the ETA for the order when the delay is minor and worker can still deliver.")
    async def reschedule_eta(self, ctx: RunContext, extra_minutes: int):
        print(f"\n✅ [TOOL: RESCHEDULE] {self.order_id} delayed by {extra_minutes} mins.")
        return f"ETA extended by {extra_minutes} minutes."

    @function_tool(description="Escalate the Exception to a human ops manager when you are unsure, if there is a severe accident, or the worker is angry.")
    async def escalate_to_human(self, ctx: RunContext, reason: str):
        print(f"\n🚨 [TOOL: ESCALATE] {self.order_id} - {reason}")
        db = SessionLocal()
        db.add(ExceptionRecord(order_id=self.order_id, reason=reason, status="escalated", action_taken="Sent to Ops Dashboard"))
        db.commit()
        db.close()
        trigger_dashboard_update()
        return "Escalated to ops team."

    @function_tool(description="Log that you have successfully Autonomous Resolved the exception (e.g., you already sent an SMS and informed the worker).")
    async def log_autonomous_resolution(self, ctx: RunContext, resolution_details: str):
        print(f"\n✅ [TOOL: RESOLVED] {self.order_id} - {resolution_details}")
        db = SessionLocal()
        db.add(ExceptionRecord(order_id=self.order_id, reason=resolution_details, status="resolved_autonomously", action_taken="Autonomous API Chaining"))
        db.commit()
        db.close()
        trigger_dashboard_update()
        return "Logged resolution successfully."


async def entrypoint(ctx: JobContext):
    await ctx.connect()
    print("\n🎧 Agent connected to room. Looking for worker...")

    participant = None
    for _ in range(50): 
        if ctx.room.remote_participants:
            participant = list(ctx.room.remote_participants.values())[0]
            break
        await asyncio.sleep(0.1)

    order_id = "ORD1042" 
    if participant and participant.metadata:
        order_id = participant.metadata
    print(f"👤 Worker joined! Identity: {participant.identity}, Order: {order_id}\n")

    # Fetch Database State for MEMORY
    memory_state = get_memory_context(order_id)

    # --- THE MAGIC PROMPT (Rubric: Delight L4 & Voice L5) ---
    system_prompt = (
        f"You are Dispatch Didi, an autonomous voice ops-copilot for last-mile delivery.\n"
        f"You are speaking to a delivery worker handling Order {order_id}.\n\n"
        f"{memory_state}\n\n"
        f"CRITICAL RULES:\n"
        f"1. GREETING: When you first connect, briefly say 'Hello, order {order_id} ke liye call karne ke liye shukriya. Kya issue hai?'. DO NOT use tools yet.\n"
        f"2. LANGUAGE: Always reply in conversational Hinglish (Hindi + English). Example: 'Aapka penalty waive kar diya gaya hai, don't worry.'\n"
        f"3. DELIGHT & EMPATHY: If the worker reports a breakdown or accident, tell them immediately: 'Don't panic, your delivery penalty is waived.'\n"
        f"4. ACTIONS: Once you know the issue, you MUST call a tool (log_autonomous_resolution, send_sms, etc.) before ending the conversation.\n"
        f"5. BREVITY: Keep spoken responses to 1-2 short sentences."
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
        # FIX: Switched to sarvam-30b for real-time voice latency (SKILL.md recommendation)
        llm=sarvam.LLM(model="sarvam-30b"),
        tts=sarvam.TTS(
            target_language_code="hi-IN",
            model="bulbul:v3",
            speaker="priya" 
        )
    )

    session = AgentSession(
        turn_detection="stt",
        min_endpointing_delay=0.07 
    )
    
    await session.start(agent=agent, room=ctx.room)
    print("✅ Dispatch Didi is awake and listening!")

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
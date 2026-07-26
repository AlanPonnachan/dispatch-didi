# backend/agent.py
import os
import json
import urllib.request
import asyncio
from livekit.agents import JobContext, WorkerOptions, cli, function_tool, RunContext
from livekit.agents.voice import Agent, AgentSession
from livekit.plugins import sarvam
from dotenv import load_dotenv
from db import SessionLocal, ExceptionRecord, Order

load_dotenv()

def trigger_dashboard_update():
    try:
        req = urllib.request.Request("http://localhost:8000/api/trigger-update", method="POST")
        urllib.request.urlopen(req)
    except Exception as e:
        pass

def get_memory_context(order_id: str):
    db = SessionLocal()
    order = db.query(Order).filter(Order.order_id == order_id).first()
    last_exception = db.query(ExceptionRecord).filter(ExceptionRecord.order_id == order_id).order_by(ExceptionRecord.created_at.desc()).first()
    db.close()
    
    context = f"Order Context: Customer is {order.customer_name if order else 'Unknown'}, Address is {order.address if order else 'Unknown'}.\n"
    if last_exception:
        context += f"⚠️ CRITICAL MEMORY: Worker previously reported: '{last_exception.reason}'. Status is '{last_exception.status}'.\n"
        context += f"IF THEY ARE CALLING ABOUT THIS AGAIN: Do not use any tools. Just politely tell them 'Ops team is already looking into your {last_exception.status} issue, please wait' and end your turn.\n"
    return context

class DispatchAgent(Agent):
    def __init__(self, order_id: str, instructions: str, **kwargs):
        super().__init__(instructions=instructions, **kwargs)
        self.order_id = order_id
        self.has_resolved = False # Lock to prevent duplicate rows
        
    async def on_enter(self):
        self.session.generate_reply()

    @function_tool(description="Send an SMS to the customer about a delay, wrong address, or vehicle breakdown.")
    async def send_sms(self, ctx: RunContext, message: str):
        print(f"\n✅ [TOOL: SMS] {self.order_id}: {message}")
        return "SMS sent."
        
    @function_tool(description="Reschedule ETA when delay is minor.")
    async def reschedule_eta(self, ctx: RunContext, extra_minutes: int):
        print(f"\n✅ [TOOL: RESCHEDULE] {self.order_id} delayed by {extra_minutes} mins.")
        return "ETA extended."

    @function_tool(description="Escalate to human ops manager for severe issues (accidents, uncooperative customers, damaged goods, safety threats).")
    async def escalate_to_human(self, ctx: RunContext, reason: str):
        if self.has_resolved: return "Already logged."
        self.has_resolved = True
        
        db = SessionLocal()
        db.add(ExceptionRecord(order_id=self.order_id, reason=reason, status="escalated", action_taken="Sent to Ops Dashboard"))
        db.commit()
        db.close()
        trigger_dashboard_update()
        return "Escalated to ops team."

    @function_tool(description="Log that you Autonomous Resolved a minor issue (vehicle breakdown where recovery can be sent, minor delays, traffic).")
    async def log_autonomous_resolution(self, ctx: RunContext, resolution_details: str):
        if self.has_resolved: return "Already resolved."
        self.has_resolved = True
        
        db = SessionLocal()
        db.add(ExceptionRecord(order_id=self.order_id, reason=resolution_details, status="resolved_autonomously", action_taken="Autonomous API Chaining"))
        db.commit()
        db.close()
        trigger_dashboard_update()
        return "Logged resolution successfully."


async def entrypoint(ctx: JobContext):
    await ctx.connect()
    
    participant = None
    for _ in range(50): 
        if ctx.room.remote_participants:
            participant = list(ctx.room.remote_participants.values())[0]
            break
        await asyncio.sleep(0.1)

    order_id = "ORD1042"
    language_code = "hi-IN"
    
    if participant and participant.metadata:
        try:
            meta = json.loads(participant.metadata)
            order_id = meta.get("order_id", "ORD1042")
            language_code = meta.get("language", "hi-IN")
        except json.JSONDecodeError:
            order_id = participant.metadata

    lang_map = {
        "hi-IN": "Hindi/Hinglish",
        "en-IN": "English",
        "kn-IN": "Kannada",
        "ml-IN": "Malayalam",
        "ta-IN": "Tamil"
    }
    spoken_lang = lang_map.get(language_code, "Hindi/Hinglish")
    
    print(f"👤 Worker joined! Order: {order_id} | Language: {spoken_lang}\n")

    memory_state = get_memory_context(order_id)

    system_prompt = (
        f"You are Dispatch Didi, an AI ops-copilot for delivery partners.\n"
        f"{memory_state}\n"
        f"CRITICAL RULES:\n"
        f"1. GREETING: On your first turn, say a quick 'Hello' in {spoken_lang} and ask about the issue. DO NOT call a tool yet.\n"
        f"2. EMPOWERED DECISION MAKING: Listen to the worker's issue and use your judgment to pick the right tool:\n"
        f"   - Use `escalate_to_human` for severe or unresolvable issues (e.g., unreachable customers, damaged/spilled goods, accidents, police issues, safety concerns).\n"
        f"   - Use `log_autonomous_resolution` (and `send_sms` if needed) for recoverable issues (e.g., flat tires, minor vehicle issues). Tell them you waived the penalty.\n"
        f"   - Use `reschedule_eta` for simple delays (traffic, weather, minor detours).\n"
        f"3. ACTIONS FIRST: Call the correct tool as soon as you understand the problem.\n"
        f"4. LANGUAGE: Always reply naturally in {spoken_lang}.\n"
        f"5. BREVITY: Keep spoken responses to 1 short sentence."
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
        # FIX: Switched back to 105b for L5-level reasoning and edge-case handling!
        llm=sarvam.LLM(model="sarvam-105b"),
        tts=sarvam.TTS(
            target_language_code=language_code,
            model="bulbul:v3",
            speaker="priya" 
        )
    )

    session = AgentSession(
        turn_detection="stt",
        min_endpointing_delay=0.07 
    )
    
    await session.start(agent=agent, room=ctx.room)

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
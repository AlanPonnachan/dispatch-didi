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
        # FIX: Added .read() to ensure the HTTP request actually completes!
        with urllib.request.urlopen(req) as response:
            response.read()
    except Exception as e:
        print(f"Dashboard update failed: {e}")

# FIX: Return dynamic Greeting Rule so it doesn't ask "what is the issue" on callbacks
def get_memory_context(order_id: str, spoken_lang: str):
    db = SessionLocal()
    last_exception = db.query(ExceptionRecord).filter(ExceptionRecord.order_id == order_id).order_by(ExceptionRecord.created_at.desc()).first()
    db.close()
    
    if not last_exception:
        greeting = f"1. GREETING: On your first turn, say a quick 'Hello' in {spoken_lang} and ask what the issue is."
        return "Context: No previous issues.", greeting
        
    if last_exception.status == "resolved_by_human":
        greeting = f"1. GREETING: On your first turn, say in {spoken_lang}: 'Hello, good news! The Ops team has resolved your issue regarding {last_exception.reason}. You can continue.' DO NOT ask what the issue is. DO NOT use tools."
        return f"⚠️ CRITICAL MEMORY: The worker previously had an issue ('{last_exception.reason}'). The Human Ops team has just RESOLVED it.", greeting
    
    if last_exception.status == "escalated":
        greeting = f"1. GREETING: On your first turn, say in {spoken_lang}: 'Hello, the Ops team is still looking into your issue regarding {last_exception.reason}. Please wait.' DO NOT ask what the issue is. DO NOT use tools."
        return f"⚠️ CRITICAL MEMORY: The worker reported an issue ('{last_exception.reason}') which is currently ESCALATED.", greeting
                
    greeting = f"1. GREETING: On your first turn, say in {spoken_lang}: 'Hello, your issue regarding {last_exception.reason} was already logged and penalty waived. Help is on the way.' DO NOT ask what the issue is. DO NOT use tools."
    return f"⚠️ CRITICAL MEMORY: The worker reported ('{last_exception.reason}') and you already resolved it.", greeting

class DispatchAgent(Agent):
    def __init__(self, order_id: str, instructions: str, **kwargs):
        super().__init__(instructions=instructions, **kwargs)
        self.order_id = order_id
        self.has_resolved = False
        
    async def on_enter(self):
        self.session.generate_reply()

    @function_tool(description="Send an SMS to the customer about a delay.")
    async def send_sms(self, ctx: RunContext, message: str):
        print(f"\n✅ [TOOL: SMS] {self.order_id}: {message}")
        return "SMS sent."
        
    @function_tool(description="Reschedule ETA when delay is minor.")
    async def reschedule_eta(self, ctx: RunContext, extra_minutes: int):
        print(f"\n✅ [TOOL: RESCHEDULE] {self.order_id} delayed by {extra_minutes} mins.")
        return "ETA extended."

    @function_tool(description="Escalate to human ops manager for severe issues (spilled food, unreachable customer, accidents, safety).")
    async def escalate_to_human(self, ctx: RunContext, reason: str):
        if self.has_resolved: return "Already logged."
        self.has_resolved = True
        
        db = SessionLocal()
        db.add(ExceptionRecord(order_id=self.order_id, reason=reason, status="escalated", action_taken="Sent to Ops Dashboard"))
        db.commit()
        db.close()
        trigger_dashboard_update()
        return "Escalated to ops team."

    @function_tool(description="Log that you Autonomous Resolved a minor issue (flat tire, traffic, minor delays).")
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
    
    try:
        participant = await asyncio.wait_for(ctx.wait_for_participant(), timeout=15.0)
    except asyncio.TimeoutError:
        print("⚠️ Worker didn't join in time.")
        participant = None

    order_id = "ORD1042"
    language_code = "hi-IN"
    
    if participant and participant.metadata:
        try:
            meta = json.loads(participant.metadata)
            order_id = meta.get("order_id", "ORD1042")
            language_code = meta.get("language", "hi-IN")
        except json.JSONDecodeError:
            pass

    lang_map = {
        "hi-IN": "Hindi/Hinglish",
        "en-IN": "English",
        "kn-IN": "Kannada",
        "ml-IN": "Malayalam",
        "ta-IN": "Tamil"
    }
    spoken_lang = lang_map.get(language_code, "Hindi/Hinglish")
    
    print(f"👤 Worker joined! Order: {order_id} | Language: {spoken_lang}\n")

    # FIX: Get dynamic memory and greeting rule
    memory_state, greeting_rule = get_memory_context(order_id, spoken_lang)

    system_prompt = (
        f"You are Dispatch Didi, an AI ops-copilot for delivery partners.\n"
        f"{memory_state}\n"
        f"CRITICAL RULES:\n"
        f"{greeting_rule}\n"
        f"2. MULTI-TURN CLARIFICATION: If the worker's issue is vague (e.g., 'I have a problem'), ask a short clarifying question first.\n"
        f"3. EMPOWERED DECISION MAKING: Once the issue is clear, use a tool:\n"
        f"   - `escalate_to_human`: Severe issues (unreachable customers, damaged/spilled goods, accidents, safety).\n"
        f"   - `log_autonomous_resolution`: Recoverable issues (flat tires, minor vehicle issues). Tell them you waived the penalty.\n"
        f"   - `reschedule_eta`: Simple delays (traffic, weather).\n"
        f"4. ACTIONS FIRST: Call the correct tool as soon as you understand the problem.\n"
        f"5. LANGUAGE: Always reply naturally in {spoken_lang}.\n"
        f"6. BREVITY: Keep spoken responses to 1 short sentence."
    )

    agent = DispatchAgent(
        order_id=order_id,
        instructions=system_prompt,
        stt=sarvam.STT(language="unknown", model="saaras:v3", mode="transcribe", flush_signal=True),
        llm=sarvam.LLM(model="sarvam-105b"),
        tts=sarvam.TTS(target_language_code=language_code, model="bulbul:v3", speaker="priya")
    )

    session = AgentSession(turn_detection="stt", min_endpointing_delay=0.07)
    await session.start(agent=agent, room=ctx.room)

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
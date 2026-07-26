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

def trigger_dashboard_update(event_type="db_update", payload=None):
    try:
        url = f"http://localhost:8000/api/trigger-update?event_type={event_type}"
        req = urllib.request.Request(url, method="POST")
        req.add_header('Content-Type', 'application/json')
        # Send payload if it exists, otherwise empty JSON
        data = json.dumps(payload).encode('utf-8') if payload else b'{}'
        with urllib.request.urlopen(req, data=data) as response:
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

    # It guarantees she greets you exactly once when ready!
    async def on_enter(self):
        self.session.generate_reply()

    @function_tool(description="Send an SMS to the customer about a delay.")
    async def send_sms(self, ctx: RunContext, message: str):
        print(f"\n✅ [TOOL: SMS] {self.order_id}: {message}")
        # Run HTTP request in a background thread so it doesn't freeze Didi's voice!
        asyncio.create_task(asyncio.to_thread(trigger_dashboard_update, "customer_sms", {"order": self.order_id, "msg": message}))
        return "SMS sent."
        
    @function_tool(description="Reschedule ETA when delay is minor.")
    async def reschedule_eta(self, ctx: RunContext, extra_minutes: int):
        print(f"\n✅ [TOOL: RESCHEDULE] {self.order_id} delayed by {extra_minutes} mins.")
        
        db = SessionLocal()
        existing_record = db.query(ExceptionRecord).filter(
            ExceptionRecord.order_id == self.order_id,
            ExceptionRecord.status == "resolved_autonomously"
        ).order_by(ExceptionRecord.created_at.desc()).first()
        
        if existing_record:
            existing_record.reason = f"RESOLVED: Traffic/minor delay of {extra_minutes} mins."
            existing_record.action_taken = f"Extended ETA by {extra_minutes}m"
        else:
            # INSERT a new row
            db.add(ExceptionRecord(
                order_id=self.order_id, 
                reason=f"RESOLVED: Traffic/minor delay of {extra_minutes} mins.", 
                status="resolved_autonomously", 
                action_taken=f"Extended ETA by {extra_minutes}m"
            ))
            
        db.commit()
        db.close()
        
        asyncio.create_task(asyncio.to_thread(trigger_dashboard_update, "eta_update", {"order": self.order_id, "mins": extra_minutes}))
        asyncio.create_task(asyncio.to_thread(trigger_dashboard_update, "db_update", None))
        return f"ETA successfully extended by {extra_minutes} minutes."

    @function_tool(description="Escalate to human ops manager for severe issues (spilled food, unreachable customer, accidents).")
    async def escalate_to_human(self, ctx: RunContext, reason: str):
        print(f"\n✅ [TOOL: ESCALATE] {self.order_id}: {reason}")
        db = SessionLocal()
        
        # Look for existing record for this order
        existing_record = db.query(ExceptionRecord).filter(
            ExceptionRecord.order_id == self.order_id
        ).order_by(ExceptionRecord.created_at.desc()).first()
        
        if existing_record:
            existing_record.status = "escalated"
            existing_record.reason = f"CRITICAL: {reason}"
            existing_record.action_taken = "Sent to Ops Dashboard"
        else:
            db.add(ExceptionRecord(order_id=self.order_id, reason=f"CRITICAL: {reason}", status="escalated", action_taken="Sent to Ops Dashboard"))
            
        db.commit()
        db.close()
        
        asyncio.create_task(asyncio.to_thread(trigger_dashboard_update, "db_update", None))
        return "Escalated to ops team."

    @function_tool(description="Log that an issue is resolved autonomously, OR De-escalate if the partner fixed the issue themselves.")
    async def log_autonomous_resolution(self, ctx: RunContext, resolution_details: str):
        print(f"\n✅ [TOOL: AUTONOMOUS/DE-ESCALATE] {self.order_id}: {resolution_details}")
        db = SessionLocal()
        
        # Look for existing record (even if it was previously escalated)
        existing_record = db.query(ExceptionRecord).filter(
            ExceptionRecord.order_id == self.order_id
        ).order_by(ExceptionRecord.created_at.desc()).first()
        
        if existing_record:
            # OVERRIDE the escalation! The AI changed its mind.
            existing_record.status = "resolved_autonomously"
            existing_record.reason = f"RESOLVED: {resolution_details}"
            existing_record.action_taken = "AI De-escalated (Partner Fixed)"
        else:
            db.add(ExceptionRecord(order_id=self.order_id, reason=f"RESOLVED: {resolution_details}", status="resolved_autonomously", action_taken="AI Waived Penalty"))
            
        db.commit()
        db.close()
        
        asyncio.create_task(asyncio.to_thread(trigger_dashboard_update, "db_update", None))
        return "Logged resolution or De-escalation successfully."

async def entrypoint(ctx: JobContext):
    await ctx.connect()
    
    try:
        participant = await asyncio.wait_for(ctx.wait_for_participant(), timeout=15.0)
    except asyncio.TimeoutError:
        print("⚠️ Delivery Partner didn't join in time.")
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
    
    print(f"👤 Delivery Partner joined! Order: {order_id} | Language: {spoken_lang}\n")

    memory_state, greeting_rule = get_memory_context(order_id, spoken_lang)

    system_prompt = (
        f"You are Dispatch Didi, an empowered AI ops-copilot for Quick Commerce Delivery Partners.\n"
        f"{memory_state}\n"
        f"CRITICAL RULES:\n"
        f"{greeting_rule}\n"
        f"2. EMOTIONAL INTELLIGENCE (L5 Voice): If the partner sounds frantic, panicked, or angry, speak slowly and calmly. Immediately reassure them that their penalty is waived before asking for details.\n"
        f"3. BUSINESS ROUTING: Apply these rules to choose ONE tool (DO NOT expose rule names, and ALWAYS capture the exact minutes/numbers the partner says):\n"
        f"   - Traffic, minor delays -> Use `reschedule_eta`.\n"
        f"   - Flat tire, vehicle fault -> Use `log_autonomous_resolution`.\n"
        f"   - Customer fault, accident, spill -> Use `escalate_to_human`.\n"
        f"   - DE-ESCALATION: If you already escalated, but the partner says 'Wait, it is fixed' (e.g. customer arrived), use `log_autonomous_resolution` to de-escalate the ticket.\n"
        f"4. ACTIONS FIRST: Do not say 'I am logging this.' Just call the tool and then speak the confirmation.\n"
        f"5. LANGUAGE: Always reply naturally in {spoken_lang}. If they mix English and Hindi, match their style naturally.\n"
        f"6. BREVITY: Deliver your response in 1 or 2 concise sentences."
    )

    agent = DispatchAgent(
        order_id=order_id,
        instructions=system_prompt,
        # L5 Voice: flush_signal=True ensures we handle noisy environments well
        stt=sarvam.STT(language="unknown", model="saaras:v3", mode="transcribe", flush_signal=True),
        llm=sarvam.LLM(model="sarvam-105b"),
        tts=sarvam.TTS(target_language_code=language_code, model="bulbul:v3", speaker="priya")
    )

    # L5 Voice: min_endpointing_delay tuned up slightly to 0.5s
    session = AgentSession(turn_detection="stt", min_endpointing_delay=0.5)
    await session.start(agent=agent, room=ctx.room)
    

if __name__ == "__main__":
    cli.run_app(WorkerOptions(entrypoint_fnc=entrypoint))
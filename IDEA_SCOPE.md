***

# IDEA_SCOPE.md — Dispatch Didi

## 1. Core Definition
*   **User:** Zepto/Swiggy Gig Delivery Worker under time pressure.
*   **Repeated Job:** Verbally report a mid-route exception in Hinglish, have it autonomously logged, mitigated via tools, and receive immediate verbal clearance to continue.
*   **Sarvam Parameter:** Voice Experience (Intent under rambling, code-switching, emotional adaptation).
*   **Exact Sponsor APIs:** 
    *   LiveKit WebRTC (Audio transport)
    *   `saaras:v3` (STT, unknown language detection, flush_signal=True)
    *   `sarvam-105b` (LLM, function_tool execution)
    *   `bulbul:v3` (TTS, target_language_code="hi-IN", speaker="priya")

## 2. Explicit Non-Goals (Do Not Build)
*   **No real SMS or Telephony:** Twilio/Exotel is a time trap. We log SMS payloads to the terminal/UI. WebRTC replaces standard telephony.
*   **No complex Databases:** SQLite only. No Postgres, no Dockerized databases.
*   **No Auth/Login:** Worker identity is mocked via a simple dropdown in the React app that injects context.
*   **No Multi-Agent routing:** A single, strictly prompted 105B model handles the entire task to reduce latency and failure points.

## 3. Milestones & Rubric Mapping

### Milestone 1: The Ugly Golden Path (Hour 1)
*Goal: De-risk the hardest dependency (Voice pipeline) and complete one hardcoded job.*
*   **Tasks:** 
    *   Lock LiveKit `agent.py` to accept connection without crashing (already done).
    *   Connect Sarvam STT, LLM, and TTS with a basic prompt.
    *   Create one tool: `resolve_exception(reason)`.
*   **Acceptance Test:** Click "Call" in React UI, speak in Hinglish, hear Priya reply, and see `[TOOL: RESOLVED]` print in the Python backend terminal.
*   **Fallback if behind:** Skip React entirely; use a CLI script to send a `.wav` file to Sarvam APIs.
*   **Rubric Impact:** JTBD reaches L3 (Basic completion).

### Milestone 2: Context Injection & The Dashboard (Hour 2–3)
*Goal: Prove systemic impact and visual proof of work.*
*   **Tasks:** 
    *   FastAPI backend with SQLite (`orders` and `exceptions` tables).
    *   LiveKit token generation injecting `order_id` as metadata.
    *   WebSocket broadcast triggered by agent tool calls.
    *   React Dashboard listening to WebSockets to update red/green counters.
*   **Acceptance Test:** Click "Call" as Order 1042. Agent says "Hi, I see you are on Order 1042". Speak issue. Dashboard adds a row and ticks a counter *while* the agent is talking.
*   **Rubric Impact:** Creativity L4 (Context Injection mechanic verified), Impact L3 (Visible operational value).

### Milestone 3: The Memory & Delight Layer (Hour 4–5)
*Goal: Maximize the Memory and Delight scores.*
*   **Tasks:** 
    *   Update FastAPI to fetch the *last exception status* for the injected `order_id`.
    *   Inject this history into the LLM system prompt.
    *   Prompt Engineer the Delight moment: "Waive the penalty and reassure the worker if they sound panicked."
*   **Acceptance Test (The Callback):** 
    1. Call and report flat tire. Agent resolves. Hang up.
    2. Call back immediately. Agent says: *"Hi again, is the recovery van there yet? Don't worry, your penalty is waived."*
*   **Rubric Impact:** Memory L4 (Cross-session state persisted and governed), Delight L4 (Forward movement and anxiety removal).

### Milestone 4: The 4 Cases & Voice Hardening (Hour 6–7)
*Goal: Maximize JTBD and Sarvam Voice Experience.*
*   **Tasks:** 
    *   Expand tools to exact 4: `send_sms`, `reschedule_eta`, `flag_ops_escalation`, `log_resolution`.
    *   Define the 4 Test Cases: 1. Vehicle Breakdown, 2. Wrong Address, 3. Unreachable Customer, 4. Spilled Food (Escalation).
    *   Refine STT/Prompt to perfectly handle Hindi-English code-switching and barge-ins.
*   **Acceptance Test:** Run all 4 test cases consecutively without restarting the server. All must route to the correct tool.
*   **Rubric Impact:** JTBD L5 (90%+ success across repeated cases), Voice Experience L5 (Code-switching, intent under rambling).

### Milestone 5: Code Freeze & Demo Rehearsal (Hour 8)
*Goal: Protect the build. No new code.*
*   **Tasks:** 
    *   Reset SQLite database to a clean state.
    *   Run the script completely end-to-end twice.
    *   Prepare backup video recording of the demo just in case the WiFi dies on stage.

***

## 4. Time-Boxed Demo Script (3 Minutes) & Evidence Map

**0:00 - The Setup (Impact L3)**
> *"Intugine and CallSphere do exception management for freight, taking hours. But in 10-minute quick commerce, you don't have hours. If a Swiggy driver's bike breaks down, they panic, and ops loses track. Meet Dispatch Didi: autonomous, sub-second exception resolution over WebRTC."*

**0:30 - The Context & Voice Test (Creativity L4, Voice L5)**
> *(Click Call on React App)*
> **Agent:** "Hi, I see you're delivering Order 1042 to Ramesh. What's the issue?" *(Context Injection)*
> **You (Speaking frantically in Hinglish):** "Arre yaar, mera gaadi puncture ho gaya hai, main aage nahi ja sakta, bahut late ho gaya!"

**1:00 - The Delight & Resolution (Delight L4, JTBD L5)**
> **Agent (Priya voice):** "I understand, don't panic. I have waived your delivery penalty and assigned a recovery partner. I am sending an SMS to Ramesh about the delay. You can end your trip safely."
> *(Judges see the dashboard counters immediately update and the SMS tool fire).*

**1:45 - The Memory Test (Memory L4)**
> *(Disconnect, then click Call again)*
> **Agent:** "Hi again, checking in on Order 1042. Has the recovery van reached you yet?"
> *(Judges see state was persisted and retrieved across calls without IVR).*

**2:15 - The Close**
> *"Everything runs on Sarvam: Saaras for Hinglish STT, Sarvam-105B for strict tool calling, and Bulbul Priya for empathetic TTS. This isn't a chatbot; it's a fully integrated Ops Copilot."*

***

## 5. Parking Lot (Do Not Touch Unless Finished Early)
*   Adding WhatsApp/Twilio APIs.
*   Adding User Auth/Login.
*   Changing CSS/Tailwind animations.
*   Adding more than 4 exception cases.

***

import React, { useState, useEffect } from 'react';
import { LiveKitRoom, useVoiceAssistant, BarVisualizer, RoomAudioRenderer, VoiceAssistantControlBar } from '@livekit/components-react';
import '@livekit/components-styles';
import { Phone, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

export default function App() {
  const [token, setToken] = useState("");
  const [orderId, setOrderId] = useState("ORD1042");
  const [connected, setConnected] = useState(false);
  const [dashboardLogs, setDashboardLogs] = useState([]);

  // WebSocket for Ops Dashboard Updates
  useEffect(() => {
    const ws = new WebSocket("ws://localhost:8000/ws/dashboard");
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === "db_update") {
        setDashboardLogs(msg.data);
      }
    };
    return () => ws.close();
  }, []);

  const startCall = async () => {
    // Fetch token from our FastAPI backend
    const res = await fetch(`http://localhost:8000/api/token?order_id=${orderId}`);
    const data = await res.json();
    setToken(data.token);
    setConnected(true);
  };

  return (
    <div className="flex h-screen w-full bg-slate-50">
      
      {/* LEFT SIDE: Worker App Simulator (Mobile Phone Shape) */}
      <div className="w-1/3 p-8 flex flex-col items-center justify-center border-r border-slate-200 bg-white">
        <div className="w-[320px] h-[650px] border-8 border-slate-900 rounded-[3rem] p-6 flex flex-col relative shadow-2xl overflow-hidden">
          
          <div className="text-center mb-8 mt-4">
            <h2 className="text-xl font-bold text-slate-800">Partner App</h2>
            <p className="text-sm text-slate-500">Active Delivery</p>
          </div>

          {!connected ? (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="bg-blue-50 p-4 rounded-xl mb-8 w-full text-center">
                <p className="font-semibold text-blue-900">Deliver to Ramesh</p>
                <select 
                  className="mt-2 text-sm bg-white border border-blue-200 rounded p-1"
                  value={orderId}
                  onChange={(e) => setOrderId(e.target.value)}
                >
                  <option value="ORD1042">Order 1042</option>
                  <option value="ORD1043">Order 1043</option>
                </select>
              </div>
              
              <button 
                onClick={startCall}
                className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-6 shadow-lg transition-transform hover:scale-105"
              >
                <Phone size={32} />
              </button>
              <p className="mt-4 text-sm font-medium text-slate-600">Call Dispatch Didi</p>
            </div>
          ) : (
            <LiveKitRoom
              token={token}
              serverUrl="ws://localhost:7880"
              connect={true}
              onDisconnected={() => setConnected(false)}
              className="flex-1 flex flex-col"
            >
              <RoomAudioRenderer />
              <ActiveCallView />
            </LiveKitRoom>
          )}
        </div>
      </div>

      {/* RIGHT SIDE: Ops Dashboard */}
      <div className="w-2/3 p-8 bg-slate-50 overflow-y-auto">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">Dispatch Control Tower</h1>
        <p className="text-slate-500 mb-8">Live exception monitoring across the fleet.</p>

        <div className="grid grid-cols-2 gap-6 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Autonomously Resolved</p>
              <p className="text-4xl font-bold text-emerald-600 mt-2">
                {dashboardLogs.filter(l => l.status === 'resolved_autonomously').length}
              </p>
            </div>
            <CheckCircle2 size={48} className="text-emerald-100" />
          </div>
          
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-slate-500">Escalated to Humans</p>
              <p className="text-4xl font-bold text-rose-600 mt-2">
                {dashboardLogs.filter(l => l.status === 'escalated').length}
              </p>
            </div>
            <AlertTriangle size={48} className="text-rose-100" />
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="p-4 text-sm font-semibold text-slate-600">Time</th>
                <th className="p-4 text-sm font-semibold text-slate-600">Order</th>
                <th className="p-4 text-sm font-semibold text-slate-600">Exception</th>
                <th className="p-4 text-sm font-semibold text-slate-600">Action Taken</th>
                <th className="p-4 text-sm font-semibold text-slate-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {dashboardLogs.map((log: any, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="p-4 text-sm text-slate-500">{new Date(log.created_at).toLocaleTimeString()}</td>
                  <td className="p-4 text-sm font-medium text-slate-900">{log.order_id}</td>
                  <td className="p-4 text-sm text-slate-600">{log.reason}</td>
                  <td className="p-4 text-sm text-slate-600">{log.action_taken}</td>
                  <td className="p-4">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      log.status === 'resolved_autonomously' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {log.status === 'resolved_autonomously' ? 'Resolved' : 'Escalated'}
                    </span>
                  </td>
                </tr>
              ))}
              {dashboardLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-slate-400">
                    No exceptions logged yet. Start a call to test.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Sub-component for the Active Call visualizer
function ActiveCallView() {
  const { state, audioTrack } = useVoiceAssistant();
  
  return (
    <div className="flex-1 flex flex-col items-center justify-center pt-10">
      <div className="h-32 flex items-center justify-center">
        {audioTrack ? (
          <BarVisualizer state={state} barCount={5} trackRef={audioTrack} className="w-full h-16" />
        ) : (
          <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center animate-pulse">
            <Clock className="text-slate-400" />
          </div>
        )}
      </div>
      
      <p className="mt-8 font-medium text-slate-700">
        {state === 'connecting' ? 'Connecting...' : 
         state === 'listening' ? 'Didi is listening...' : 
         state === 'speaking' ? 'Didi is speaking...' : 'Connected'}
      </p>

      <div className="mt-auto pb-4 w-full">
         <VoiceAssistantControlBar controls={{ leave: true, mic: true }} />
      </div>
    </div>
  );
}
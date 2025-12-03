import React, { useEffect, useRef, useState } from "react";
import CryptoJS from "crypto-js";
import { useAuth } from "../../contexts/AuthContext";
import { Phone, PhoneOff, Mic, MicOff, User } from 'lucide-react';

export default function CallUI({
  otherUserId: propOtherUserId,
  otherUserName = "Remote User",
  otherUserPhoto = null, // Expects URL or null
  incomingCallData = null,
  enableSignalEncryption = true,
  onClose = () => {},
}) {
  const { currentUser } = useAuth();
  const localUid = currentUser?.uid;

  // Refs
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const iceCandidatesQueue = useRef([]); 
  const otherUserIdRef = useRef(incomingCallData ? incomingCallData.from : propOtherUserId);

  // State
  const [status, setStatus] = useState(incomingCallData ? "ringing" : "calling");
  const [isMuted, setIsMuted] = useState(false);
  const [duration, setDuration] = useState(0);
  const [imgError, setImgError] = useState(false); 

  // Timer
  useEffect(() => {
    let timer;
    if (status === 'in-call') {
      timer = setInterval(() => setDuration(prev => prev + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [status]);

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const rtcConfig = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }] };

  // --- Encryption ---
  const getSharedSecret = (uid1, uid2) => CryptoJS.SHA256([uid1, uid2].sort().join("")).toString();
  
  const encodePayload = (payload) => {
    if (!enableSignalEncryption) return { payload, encrypted: false };
    const secret = getSharedSecret(localUid, otherUserIdRef.current);
    const plaintext = JSON.stringify(payload);
    const ciphertext = CryptoJS.AES.encrypt(plaintext, secret).toString();
    return { payload: ciphertext, encrypted: true };
  };

  const sendSignal = (type, payload) => {
    const socket = window.__SIGNAL_SOCKET__;
    if (!socket || !socket.connected) return;
    const { payload: finalPayload, encrypted } = encodePayload(payload);
    socket.emit("signal", {
      type, from: localUid, to: otherUserIdRef.current, payload: finalPayload, encrypted, ts: Date.now()
    });
  };

  // --- WebRTC Setup ---
  const createPeerConnection = () => {
    if (pcRef.current) return pcRef.current;
    const pc = new RTCPeerConnection(rtcConfig);

    pc.onicecandidate = (event) => {
      if (event.candidate) sendSignal("ice", { candidate: event.candidate });
    };

    pc.ontrack = (event) => {
      console.log("🔊 Audio Stream Received");
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = event.streams[0];
        remoteAudioRef.current.play().catch(e => console.error("Autoplay blocked", e));
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setStatus("in-call");
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) endCall("connection-lost");
    };

    pcRef.current = pc;
    return pc;
  };

  const getLocalMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      alert("Microphone access denied.");
      endCall("local-error");
    }
  };

  const processIceQueue = async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    while (iceCandidatesQueue.current.length > 0) {
      const candidate = iceCandidatesQueue.current.shift();
      try { await pc.addIceCandidate(new RTCIceCandidate(candidate)); } catch (e) {}
    }
  };

  // --- Call Actions ---
  const startCall = async () => {
    if (!otherUserIdRef.current) return;
    setStatus("calling");
    try {
      const pc = createPeerConnection();
      const stream = await getLocalMedia();
      if (!stream) return;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal("offer", { sdp: offer.sdp, type: offer.type });
    } catch (e) { setStatus("error"); }
  };

  const answerCall = async () => {
    if (!incomingCallData) return;
    setStatus("connecting");
    try {
      const pc = createPeerConnection();
      const stream = await getLocalMedia();
      if (!stream) return;
      stream.getTracks().forEach(t => pc.addTrack(t, stream));
      
      const remoteDesc = new RTCSessionDescription(incomingCallData.payload);
      await pc.setRemoteDescription(remoteDesc);
      await processIceQueue();

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      sendSignal("answer", { sdp: answer.sdp, type: answer.type });
      setStatus("in-call");
    } catch (e) { setStatus("error"); }
  };

  const endCall = (reason = "local-hangup") => {
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (reason === "local-hangup" && otherUserIdRef.current) sendSignal("hangup", { reason });
    setStatus("ended");
    setTimeout(onClose, 1000);
  };

  // --- Signal Listener ---
  useEffect(() => {
    const handleGlobalSignal = async (e) => {
      const { envelope, payload } = e.detail;
      if (envelope.from !== otherUserIdRef.current) return;

      const pc = pcRef.current;
      if (envelope.type === "hangup") { 
         if(status !== 'ended') endCall("remote-hangup"); 
         return; 
      }
      if (envelope.type === "answer" && pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(payload));
          await processIceQueue();
        } catch(err) {}
        return;
      } 
      if (envelope.type === "ice") {
        if (pc && pc.remoteDescription) {
           try { await pc.addIceCandidate(new RTCIceCandidate(payload.candidate)); } catch (err) {}
        } else {
           iceCandidatesQueue.current.push(payload.candidate);
        }
      }
    };

    window.addEventListener("signal:message", handleGlobalSignal);
    if (!incomingCallData && status === "calling") startCall();

    return () => window.removeEventListener("signal:message", handleGlobalSignal);
  }, []);

  return (
    // BACKDROP BLURRED OVERLAY
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      
      {/* COMPACT GLASS CARD */}
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden transform scale-100 border border-white/10">
        
        {/* PREMIUM HEADER GRADIENT */}
        <div className="h-28 bg-gradient-to-r from-blue-600 to-purple-600 relative">
           <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2">
              <div className="relative">
                 {/* PROFILE PICTURE WITH GLOW */}
                 <div className="w-28 h-28 rounded-full border-4 border-white dark:border-gray-800 bg-gray-700 overflow-hidden flex items-center justify-center shadow-lg">
                    {otherUserPhoto && !imgError ? (
                       <img 
                         src={otherUserPhoto} 
                         className="w-full h-full object-cover" 
                         alt="User"
                         onError={() => setImgError(true)} 
                       />
                    ) : (
                       <User size={48} className="text-gray-300" />
                    )}
                 </div>
                 
                 {/* PULSING ANIMATION (Ringing/Calling) */}
                 {(status === 'ringing' || status === 'calling') && (
                    <>
                      <span className="absolute inset-0 rounded-full border-2 border-white/50 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]"></span>
                      <span className="absolute inset-0 rounded-full border-2 border-white/30 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite_0.5s]"></span>
                    </>
                 )}
                 {/* Connected Indicator */}
                 {status === 'in-call' && (
                    <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full"></div>
                 )}
              </div>
           </div>
        </div>

        {/* CALL INFO */}
        <div className="pt-14 pb-8 px-6 text-center">
           <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-1 tracking-tight">{otherUserName}</h3>
           <p className="text-sm font-semibold text-blue-500 mb-8 uppercase tracking-wider">
              {status === 'ringing' ? 'Incoming Call...' : 
               status === 'calling' ? 'Calling...' : 
               status === 'in-call' ? formatTime(duration) : 
               status === 'connecting' ? 'Connecting...' : 'Call Ended'}
           </p>

           {/* ACTION BUTTONS */}
           <div className="flex justify-center items-center gap-8">
              {status === 'ringing' ? (
                 <>
                    {/* Answer */}
                    <button onClick={answerCall} className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white shadow-xl shadow-green-500/30 transition-all hover:scale-110 active:scale-95">
                       <Phone size={28} fill="currentColor" />
                    </button>
                    {/* Decline */}
                    <button onClick={() => endCall("declined")} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-xl shadow-red-500/30 transition-all hover:scale-110 active:scale-95">
                       <PhoneOff size={28} />
                    </button>
                 </>
              ) : (
                 <>
                    {/* Mute (Only in-call) */}
                    {status === 'in-call' && (
                       <button onClick={() => {
                          if(localStreamRef.current) {
                             localStreamRef.current.getAudioTracks()[0].enabled = !isMuted;
                             setIsMuted(!isMuted);
                          }
                       }} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 ${isMuted ? 'bg-white text-gray-900 hover:bg-gray-100' : 'bg-gray-700/50 text-white hover:bg-gray-700'}`}>
                          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                       </button>
                    )}
                    
                    {/* End Call */}
                    {status !== 'ended' && (
                       <button onClick={() => endCall("local-hangup")} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-xl shadow-red-500/30 transition-all hover:scale-110 active:scale-95">
                          <PhoneOff size={28} />
                       </button>
                    )}
                 </>
              )}
           </div>
           
           <p className="mt-6 text-xs text-gray-400 font-medium">End-to-End Encrypted</p>
        </div>
      </div>
    </div>
  );
}
import React, { useEffect, useRef, useState } from "react";
import CryptoJS from "crypto-js";
import { useAuth } from "../../contexts/AuthContext";
import { Phone, PhoneOff, Mic, MicOff, User, Video, VideoOff } from 'lucide-react';

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
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const iceCandidatesQueue = useRef([]); 
  const otherUserIdRef = useRef(incomingCallData ? incomingCallData.from : propOtherUserId);

  // State
  const [status, setStatus] = useState(incomingCallData ? "ringing" : "calling");
  const statusRef = useRef(status);
  const onCloseRef = useRef(onClose);

  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false); // NEW: Track remote video state
  const [duration, setDuration] = useState(0);
  const [imgError, setImgError] = useState(false); 
  
  // Track remote stream in ref so we can re-attach it when UI mounts
  const remoteStreamRefVal = useRef(null); 

  // Timer
  useEffect(() => {
    let timer;
    if (status === 'in-call') {
      timer = setInterval(() => setDuration(prev => prev + 1), 1000);
    }
    return () => clearInterval(timer);
  }, [status]);

  // --- ADDED: Close Button for Ended Call State ---
  const handleClose = () => {
      if (onCloseRef.current) onCloseRef.current();
  };

  // --- RINGTONE GENERATOR ---
  const playIncomingRing = () => {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      const ctx = new AudioContext();
      
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();
      
      // Standard US Ring frequency (approx)
      osc1.frequency.value = 440;
      osc2.frequency.value = 480;
      
      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);
      
      const now = ctx.currentTime;
      
      // Create a loop of ringing: 2s ON, 4s OFF
      // We schedule 5 cycles (30 seconds) which is plenty for a ring
      for (let i = 0; i < 10; i++) {
        const start = now + i * 6;
        const end = start + 2;
        
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.1, start + 0.1); // Attack
        gain.gain.setValueAtTime(0.1, end); 
        gain.gain.linearRampToValueAtTime(0, end + 0.1);   // Release
      }
      
      osc1.start();
      osc2.start();
      
      return { stop: () => { try{ osc1.stop(); osc2.stop(); ctx.close(); }catch(e){} } };
    } catch(e) { return null; }
  };

  useEffect(() => {
     let ringtoneHandler = null;
     
     // Only ring if WE are the callee (incoming call)
     if (status === 'ringing') {
         // 1. Play Ringtone
         ringtoneHandler = playIncomingRing();
         
         // 2. Speak "Incoming Call"
         if ('speechSynthesis' in window) {
             // Cancel any previous speech
             window.speechSynthesis.cancel();
             const utterance = new SpeechSynthesisUtterance(`Incoming call from ${otherUserName}`);
             // utterance.rate = 0.9;
             window.speechSynthesis.speak(utterance);
         }
     }
     
     return () => {
         if (ringtoneHandler) ringtoneHandler.stop();
         if ('speechSynthesis' in window) window.speechSynthesis.cancel();
     };
  }, [status, otherUserName]);

  // Handle Glare (Simultaneous calls) & Renegotiation
  useEffect(() => {
    if (incomingCallData) {
       // 1. RENEGOTIATION (Already in call)
       if (status === 'in-call') {
           const handleRenegotiation = async () => {
              const pc = pcRef.current;
              if (pc && incomingCallData.envelope.type === 'offer') {
                 console.log("🔄 Handling renegotiation offer...");
                 try {
                   await pc.setRemoteDescription(new RTCSessionDescription(incomingCallData.payload));
                   const answer = await pc.createAnswer();
                   await pc.setLocalDescription(answer);
                   sendSignal("answer", { sdp: answer.sdp, type: answer.type });
                 } catch (err) {
                   console.error("Renegotiation failed", err);
                 }
              }
           };
           handleRenegotiation();
           return;
       }

       // 2. INITIAL CALL GLARE HANDLING
       if (status === 'calling') {
         const myUid = localUid;
         const otherUid = incomingCallData.from;

         // Simple tie-breaker: Lower UID yields and accepts the incoming call.
         // Higher UID ignores the incoming call and continues as the Caller.
         if (myUid < otherUid) {
            console.log("Glare detected: yielding to incoming call (I am callee)");
            // Close the outgoing attempt
            if (pcRef.current) {
              pcRef.current.close();
              pcRef.current = null;
            }
            iceCandidatesQueue.current = [];
            
            setStatus('ringing');
            otherUserIdRef.current = incomingCallData.from;
         } else {
            console.log("Glare detected: persisting as caller (I am caller)");
            // We ignore the incoming call data and wait for them to answer OUR offer.
         }
      }
    }
  }, [incomingCallData, status, localUid]);

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
      console.log("🔊/📹 Stream Received");
      const stream = event.streams[0];
      
      // Audio
      if (remoteAudioRef.current) {
        remoteAudioRef.current.srcObject = stream;
        remoteAudioRef.current.play().catch(e => console.error("Audio Autoplay blocked", e));
      }
      
      // Video
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
         setHasRemoteVideo(true);
         remoteStreamRefVal.current = stream; // Save for useEffect

         // Monitor track mute/unmute to update UI
         videoTracks[0].onmute = () => setHasRemoteVideo(false);
         videoTracks[0].onunmute = () => setHasRemoteVideo(true);
         videoTracks[0].onended = () => setHasRemoteVideo(false);

         if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
            remoteVideoRef.current.play().catch(e => console.error("Video Autoplay blocked", e));
         }
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
      // Always start with audio
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      localStreamRef.current = stream;
      return stream;
    } catch (err) {
      alert("Microphone access denied.");
      endCall("local-error");
    }
  };

  // Sync Local Video when enabled
  useEffect(() => {
    if (isVideoEnabled && localVideoRef.current && localStreamRef.current) {
        const videoTrack = localStreamRef.current.getVideoTracks()[0];
        if (videoTrack) {
            const newStream = new MediaStream([videoTrack]);
            localVideoRef.current.srcObject = newStream;
            localVideoRef.current.play().catch(e => console.log("Local video play error", e));
        }
    }
  }, [isVideoEnabled]);

  // Sync Remote Video when state changes (Fix for "grey screen" if ref wasn't ready)
  useEffect(() => {
    if (hasRemoteVideo && remoteVideoRef.current && remoteStreamRefVal.current) {
        remoteVideoRef.current.srcObject = remoteStreamRefVal.current;
        remoteVideoRef.current.play().catch(e => console.log("Remote video play error", e));
    }
  }, [hasRemoteVideo]);

  const toggleVideo = async () => {
    if (isVideoEnabled) {
       // Turn off
       const videoTrack = localStreamRef.current?.getVideoTracks()[0];
       if (videoTrack) {
         videoTrack.stop();
         localStreamRef.current.removeTrack(videoTrack);
         const sender = pcRef.current.getSenders().find(s => s.track && s.track.kind === 'video');
         if (sender) pcRef.current.removeTrack(sender);
       }
       setIsVideoEnabled(false);
       
       // Negotiate removal
       try {
         const offer = await pcRef.current.createOffer();
         await pcRef.current.setLocalDescription(offer);
         sendSignal("offer", { sdp: offer.sdp, type: offer.type });
       } catch (e) { console.error("Renegotiation error (video off)", e); }
       
    } else {
       // Turn on
       try {
         const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
         const videoTrack = videoStream.getVideoTracks()[0];
         
         if (!localStreamRef.current) localStreamRef.current = new MediaStream();
         localStreamRef.current.addTrack(videoTrack);
         
         if (pcRef.current) {
            pcRef.current.addTrack(videoTrack, localStreamRef.current);
            // Negotiate addition
            const offer = await pcRef.current.createOffer();
            await pcRef.current.setLocalDescription(offer);
            sendSignal("offer", { sdp: offer.sdp, type: offer.type });
         }
         
         setIsVideoEnabled(true);
         // Effect will handle attaching stream to video ref
         
       } catch(e) {
         console.error("Failed to enable video", e);
         alert("Could not access camera.");
       }
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
    console.log("Ending call, reason:", reason);
    if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (reason === "local-hangup" && otherUserIdRef.current) sendSignal("hangup", { reason });
    setStatus("ended");
    setIsVideoEnabled(false);
    
    // Force cleanup after delay
    setTimeout(() => {
      if (onCloseRef.current) onCloseRef.current();
      window.location.reload(); // Temporary fix: hard refresh to clear WebRTC state ghosts
    }, 1500);
  };

  // --- Signal Listener ---
  useEffect(() => {
    const handleGlobalSignal = async (e) => {
      const { envelope, payload } = e.detail;
      // Use refs for current values
      if (envelope.from !== otherUserIdRef.current) return;

      const pc = pcRef.current;
      if (envelope.type === "hangup") { 
         console.log("Received hangup signal");
         if(statusRef.current !== 'ended') endCall("remote-hangup"); 
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
    // Only start call if we are the initiator and haven't been preempted by incoming data
    if (!incomingCallData && status === "calling") startCall();

    return () => window.removeEventListener("signal:message", handleGlobalSignal);
  }, []);

  return (
    // BACKDROP BLURRED OVERLAY
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <audio ref={remoteAudioRef} autoPlay playsInline />
      
      {/* MAIN CARD (Adaptive Size) */}
      <div className={`w-full bg-white dark:bg-gray-800 rounded-3xl shadow-2xl overflow-hidden transform transition-all duration-500 border border-white/10 flex flex-col ${isVideoEnabled || hasRemoteVideo ? 'max-w-4xl h-[80vh]' : 'max-w-sm'}`}>
        
        {/* VIDEO AREA (If enabled) */}
        {(isVideoEnabled || hasRemoteVideo) && (
           <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden group">
              {/* Remote Video */}
              {hasRemoteVideo ? (
                 <video ref={remoteVideoRef} className="w-full h-full object-contain" autoPlay playsInline />
              ) : (
                 // Show Avatar if remote video is off but local video is on
                 <div className="flex flex-col items-center justify-center opacity-50">
                    <div className="w-32 h-32 rounded-full border-4 border-gray-700 bg-gray-800 overflow-hidden flex items-center justify-center mb-4">
                        {otherUserPhoto && !imgError ? (
                           <img src={otherUserPhoto} className="w-full h-full object-cover" alt="User" onError={() => setImgError(true)} />
                        ) : ( <User size={64} className="text-gray-500" /> )}
                    </div>
                    <p className="text-white font-semibold text-lg">{otherUserName}</p>
                    <p className="text-gray-400 text-sm">Camera Off</p>
                 </div>
              )}
              
              {/* Local Video (PiP) */}
              {isVideoEnabled && (
                  <div className="absolute bottom-4 right-4 w-32 h-48 bg-gray-900 rounded-xl overflow-hidden border-2 border-white/20 shadow-xl z-10">
                     <video ref={localVideoRef} className="w-full h-full object-cover transform scale-x-[-1]" autoPlay playsInline muted />
                  </div>
              )}
           </div>
        )}

        {/* HEADER GRADIENT (Only if no video active or overlaying) */}
        {!(isVideoEnabled || hasRemoteVideo) && (
        <div className="h-28 bg-gradient-to-r from-blue-600 to-purple-600 relative shrink-0">
           <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2">
              <div className="relative">
                 {/* PROFILE PICTURE */}
                 <div className="w-28 h-28 rounded-full border-4 border-white dark:border-gray-800 bg-gray-700 overflow-hidden flex items-center justify-center shadow-lg">
                    {otherUserPhoto && !imgError ? (
                       <img src={otherUserPhoto} className="w-full h-full object-cover" alt="User" onError={() => setImgError(true)} />
                    ) : ( <User size={48} className="text-gray-300" /> )}
                 </div>
                 
                 {/* ANIMATIONS */}
                 {(status === 'ringing' || status === 'calling') && (
                    <>
                      <span className="absolute inset-0 rounded-full border-2 border-white/50 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite]"></span>
                      <span className="absolute inset-0 rounded-full border-2 border-white/30 animate-[ping_1.5s_cubic-bezier(0,0,0.2,1)_infinite_0.5s]"></span>
                    </>
                 )}
                 {status === 'in-call' && <div className="absolute bottom-1 right-1 w-5 h-5 bg-green-500 border-2 border-white dark:border-gray-800 rounded-full"></div>}
              </div>
           </div>
        </div>
        )}

        {/* CALL INFO & CONTROLS */}
        <div className={`px-6 text-center flex flex-col ${isVideoEnabled || hasRemoteVideo ? 'pb-6 pt-4 bg-gray-900' : 'pt-14 pb-8'}`}>
           
           {/* Text Info */}
           <div className="mb-6">
              <h3 className={`text-2xl font-bold tracking-tight ${isVideoEnabled || hasRemoteVideo ? 'text-white' : 'text-gray-900 dark:text-white'}`}>{otherUserName}</h3>
              <p className="text-sm font-semibold text-blue-500 uppercase tracking-wider">
                 {status === 'ringing' ? 'Incoming Call...' : 
                  status === 'calling' ? 'Calling...' : 
                  status === 'in-call' ? formatTime(duration) : 
                  status === 'connecting' ? 'Connecting...' : 'Call Ended'}
              </p>
           </div>

           {/* ACTION BUTTONS */}
           <div className="flex justify-center items-center gap-6">
              {status === 'ringing' ? (
                 <>
                    <button onClick={answerCall} className="w-16 h-16 rounded-full bg-green-500 hover:bg-green-600 flex items-center justify-center text-white shadow-xl transition-all hover:scale-110"><Phone size={28} fill="currentColor" /></button>
                    <button onClick={() => endCall("declined")} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-xl transition-all hover:scale-110"><PhoneOff size={28} /></button>
                 </>
              ) : status === 'ended' ? (
                 <button onClick={handleClose} className="px-8 py-3 bg-gray-200 dark:bg-gray-700 rounded-full font-bold text-gray-700 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors">
                    Close
                 </button>
              ) : (
                 <>
                    {/* Mute */}
                    {status === 'in-call' && (
                       <button onClick={() => {
                          if(localStreamRef.current) {
                             const audioTrack = localStreamRef.current.getAudioTracks()[0];
                             if(audioTrack) {
                                 // If currently muted (isMuted=true), we want to ENABLE it (true).
                                 // If currently unmuted (isMuted=false), we want to DISABLE it (false).
                                 audioTrack.enabled = isMuted; 
                                 setIsMuted(!isMuted);
                             }
                          }
                       }} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 ${isMuted ? 'bg-white text-gray-900' : 'bg-gray-700/50 text-white hover:bg-gray-700'}`}>
                          {isMuted ? <MicOff size={24} /> : <Mic size={24} />}
                       </button>
                    )}

                    {/* Video Toggle (NEW) */}
                    {status === 'in-call' && (
                        <button onClick={toggleVideo} className={`w-14 h-14 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 ${isVideoEnabled ? 'bg-white text-gray-900' : 'bg-gray-700/50 text-white hover:bg-gray-700'}`}>
                           {isVideoEnabled ? <Video size={24} /> : <VideoOff size={24} />}
                        </button>
                    )}
                    
                    {/* End Call */}
                    {status !== 'ended' && (
                       <button onClick={() => endCall("local-hangup")} className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center text-white shadow-xl transition-all hover:scale-110 active:scale-95">
                          <PhoneOff size={28} />
                       </button>
                    )}
                 </>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
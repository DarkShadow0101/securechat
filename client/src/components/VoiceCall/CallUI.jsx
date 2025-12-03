// client/src/components/VoiceCall/CallUI.jsx
import React, { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import CryptoJS from "crypto-js";
import { useAuth } from "../../contexts/AuthContext";

/**
 * Props:
 * - otherUserId (string) required: UID you're calling / expecting calls from
 * - otherUserName (string) optional
 * - signalingUrl (string) optional
 * - enableSignalEncryption (bool) optional (default true)
 * - onClose (fn) optional
 */
export default function CallUI({
  otherUserId,
  otherUserName = "Remote",
  signalingUrl,
  enableSignalEncryption = true,
  onClose = () => {},
}) {
  const { currentUser } = useAuth();
  const localUid = currentUser?.uid;
  const SIGNAL_URL = signalingUrl || process.env.REACT_APP_SIGNAL_URL || "http://localhost:5000";

  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const pendingOfferRef = useRef(null); // store incoming offer until user accepts
  const remoteAudioRef = useRef(null);

  const [status, setStatus] = useState("idle"); // idle | calling | ringing | in-call | ended | error
  const [isMuted, setIsMuted] = useState(false);
  const [connected, setConnected] = useState(false);
  const [remoteStream, setRemoteStream] = useState(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  // --- encryption helpers (symmetric) ---
  const getSharedSecret = (a = "", b = "") => {
    const A = (a || "").trim();
    const B = (b || "").trim();
    return CryptoJS.SHA256([A, B].sort().join("")).toString();
  };

  const encodePayload = (payload) => {
    if (!enableSignalEncryption) return { payload, encrypted: false };
    try {
      const secret = getSharedSecret(localUid || "", otherUserId || "");
      const plaintext = JSON.stringify(payload || {});
      const ciphertext = CryptoJS.AES.encrypt(plaintext, secret).toString();
      return { payload: ciphertext, encrypted: true };
    } catch (e) {
      console.error("signal encrypt failed", e);
      return { payload, encrypted: false };
    }
  };

  // decode using sender and localUid so it works even if otherUserId isn't set yet
  const decodePayload = (payload, encrypted, senderUid) => {
    if (!encrypted) return payload;
    try {
      const secret = getSharedSecret(senderUid || "", localUid || "");
      const bytes = CryptoJS.AES.decrypt(payload, secret);
      const txt = bytes.toString(CryptoJS.enc.Utf8);
      return JSON.parse(txt);
    } catch (e) {
      console.error("signal decrypt failed", e);
      return null;
    }
  };

  // --- signaling envelope send helper ---
  const sendSignal = (type, payload) => {
    if (!socketRef.current || !socketRef.current.connected) {
      console.warn("socket not connected, cannot send signal", type);
      return;
    }
    const encoded = encodePayload(payload);
    const envelope = {
      type,
      from: localUid,
      to: otherUserId,
      payload: encoded.payload,
      encrypted: encoded.encrypted,
      ts: Date.now(),
    };
    socketRef.current.emit("signal", envelope);
    console.debug("[signal SEND]", type, "to", otherUserId);
  };

  // --- WebRTC helpers ---
  const rtcConfig = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      // add TURN servers if you need NAT relay
    ],
  };

  const createPeerConnection = () => {
    const pc = new RTCPeerConnection(rtcConfig);
    pcRef.current = pc;

    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        // send ICE to the other side
        if (!otherUserId) {
          console.warn("no otherUserId to send ICE to");
          return;
        }
        sendSignal("ice", { candidate: ev.candidate });
      }
    };

    pc.ontrack = (ev) => {
      const [s] = ev.streams;
      console.debug("pc.ontrack - remote stream", s);
      remoteStreamRef.current = s || null;
      setRemoteStream(s || null);

      // try autoplay; if blocked we'll set a flag so UI can ask user to play
      setTimeout(() => {
        try {
          if (remoteAudioRef.current && remoteAudioRef.current.srcObject !== s) {
            remoteAudioRef.current.srcObject = s;
            const p = remoteAudioRef.current.play?.();
            if (p && typeof p.then === "function") {
              p.catch((err) => {
                console.debug("autoplay blocked", err);
                setAutoplayBlocked(true);
              });
            } else {
              setAutoplayBlocked(false);
            }
          }
        } catch (e) {
          setAutoplayBlocked(true);
        }
      }, 100);
    };

    pc.onconnectionstatechange = () => {
      console.debug("pc.connectionState", pc.connectionState);
      if (pc.connectionState === "connected") {
        setStatus("in-call");
      }
      if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
        setStatus("ended");
        cleanupCall();
      }
    };

    return pc;
  };

  const cleanupCall = () => {
    try { pcRef.current?.close(); } catch (e) {}
    pcRef.current = null;
    try { localStreamRef.current?.getTracks().forEach((t) => t.stop()); } catch (e) {}
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setRemoteStream(null);
    setIsMuted(false);
    setAutoplayBlocked(false);
    pendingOfferRef.current = null;
  };

  const getLocalMedia = async () => {
    // user gesture required to call this (Start/Answer)
    try {
      if (localStreamRef.current) {
        try { localStreamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
        localStreamRef.current = null;
      }
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      localStreamRef.current = s;
      return s;
    } catch (err) {
      console.error("getLocalMedia failed", err);
      throw err;
    }
  };

  // Caller: create offer and send
  const startCall = async () => {
    if (!localUid || !otherUserId) {
      console.warn("missing ids to start call");
      return;
    }
    setStatus("calling");
    try {
      const pc = createPeerConnection();
      const localStream = await getLocalMedia();
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // send offer with sdp
      sendSignal("offer", { sdp: offer.sdp, type: offer.type });
      console.debug("offer sent");
    } catch (err) {
      console.error("startCall error", err);
      setStatus("error");
    }
  };

  // Callee: handle incoming offer and send answer (called when user presses Answer)
  const handleIncomingOffer = async (payload, fromUid) => {
    try {
      setStatus("ringing");
      const { sdp } = payload || {};
      const pc = createPeerConnection();
      const localStream = await getLocalMedia(); // must be user gesture (Answer button)
      localStream.getTracks().forEach((t) => pc.addTrack(t, localStream));
      await pc.setRemoteDescription({ type: "offer", sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      // Send answer back to caller
      // IMPORTANT: when we send, otherUserId must be the caller's uid — temporarily override if needed
      const prevOther = otherUserId;
      // if otherUserId doesn't match caller, the server will forward if "to" matches; but here we encode using otherUserId prop.
      sendSignal("answer", { sdp: answer.sdp, type: answer.type });
      console.debug("answer sent");
      setStatus("in-call");
    } catch (err) {
      console.error("handleIncomingOffer error", err);
      setStatus("error");
    }
  };

  const handleIncomingAnswer = async (payload) => {
    try {
      const { sdp } = payload || {};
      if (!pcRef.current) {
        console.warn("no pc to set remote answer");
        return;
      }
      await pcRef.current.setRemoteDescription({ type: "answer", sdp });
      setStatus("in-call");
    } catch (err) {
      console.error("handleIncomingAnswer error", err);
    }
  };

  const handleIncomingIce = async (payload) => {
    try {
      const { candidate } = payload || {};
      if (!candidate) return;
      if (!pcRef.current) {
        console.warn("no pc when ICE arrived; creating pc");
        createPeerConnection();
      }
      await pcRef.current.addIceCandidate(candidate).catch((e) => {
        console.warn("addIceCandidate warning", e);
      });
    } catch (err) {
      console.error("handleIncomingIce error", err);
    }
  };

  const endCall = (reason = "local-hangup") => {
    try {
      sendSignal("hangup", { reason });
    } catch (e) {}
    cleanupCall();
    setStatus("ended");
    onClose?.();
  };

  const declineCall = (fromUid) => {
    try {
      // tell caller we declined
      if (socketRef.current && socketRef.current.connected) {
        const enc = encodePayload({ reason: "declined" });
        socketRef.current.emit("signal", {
          type: "hangup",
          from: localUid,
          to: fromUid || otherUserId,
          payload: enc.payload,
          encrypted: enc.encrypted,
          ts: Date.now(),
        });
      }
    } catch (e) {}
    pendingOfferRef.current = null;
    setStatus("idle");
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const newMuted = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => (t.enabled = !newMuted));
    setIsMuted(newMuted);
  };

  // --- socket setup & signal handling ---
  useEffect(() => {
    if (!localUid) {
      console.warn("CallUI: currentUser not ready");
      return;
    }

    const socket = io(SIGNAL_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.debug("socket connected", socket.id);
      setConnected(true);
      socket.emit("register", { uid: localUid });
    });

    socket.on("disconnect", () => {
      console.debug("socket disconnected");
      setConnected(false);
    });

    socket.on("connect_error", (err) => {
      console.error("socket connect_error", err);
    });

    socket.on("signal", (envelope) => {
      try {
        if (!envelope) return;
        // if the server forwarded a signal that isn't for us, ignore
        if (envelope.to && envelope.to !== localUid) return;

        console.debug("[signal RECV]", envelope.type, "from", envelope.from);

        // decode payload using the actual sender so encryption works no matter which peer
        const payload = decodePayload(envelope.payload, envelope.encrypted, envelope.from);

        switch (envelope.type) {
          case "offer":
            // store pending offer and set state to ringing so user can Accept/Decline
            pendingOfferRef.current = { payload, from: envelope.from };
            setStatus("ringing");
            break;
          case "answer":
            if (envelope.from === otherUserId) handleIncomingAnswer(payload);
            break;
          case "ice":
            // only process ICE from the peer who is calling/being called
            if (envelope.from) handleIncomingIce(payload);
            break;
          case "hangup":
            // remote ended or declined
            cleanupCall();
            setStatus("ended");
            break;
          default:
            console.warn("unknown signal type", envelope.type);
        }
      } catch (err) {
        console.error("socket signal handler error", err);
      }
    });

    return () => {
      try { socket.disconnect(); } catch (e) {}
      socketRef.current = null;
      cleanupCall();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localUid, SIGNAL_URL]);

  // Answer the stored pending offer (user gesture)
  const answerPendingOffer = async () => {
    try {
      const pending = pendingOfferRef.current;
      if (!pending) {
        console.warn("No pending offer to answer");
        return;
      }
      await handleIncomingOffer(pending.payload, pending.from);
      // clear pending after answering
      pendingOfferRef.current = null;
    } catch (err) {
      console.error("answerPendingOffer error", err);
    }
  };

  // Wire remote audio element -> remoteStream
  useEffect(() => {
    if (remoteAudioRef.current && remoteStream) {
      try {
        remoteAudioRef.current.srcObject = remoteStream;
        const p = remoteAudioRef.current.play?.();
        if (p && typeof p.then === "function") {
          p.catch(() => setAutoplayBlocked(true));
        } else {
          setAutoplayBlocked(false);
        }
      } catch (e) {
        setAutoplayBlocked(true);
      }
    }
  }, [remoteStream]);

  // UI: play button if autoplay blocked
  const handlePlayRemote = () => {
    try {
      if (remoteAudioRef.current) {
        remoteAudioRef.current.play().then(() => setAutoplayBlocked(false)).catch(() => setAutoplayBlocked(true));
      }
    } catch (e) {
      console.error(e);
    }
  };

  // minimal UI
  return (
    <div className="w-[360px] max-w-full rounded-xl shadow-lg p-4 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100">
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-sm font-semibold">Voice Call</div>
          <div className="text-xs text-gray-500">{otherUserName} ({otherUserId})</div>
        </div>
        <div className="text-xs">
          <div className={`px-2 py-1 rounded ${status === "in-call" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
            {status}
          </div>
        </div>
      </div>

      <div className="mb-3">
        <audio ref={remoteAudioRef} autoPlay playsInline />
        <div className="text-xs text-gray-500">
          Remote audio will appear here when call connects. {autoplayBlocked && "Autoplay is blocked — press Play or accept the call to enable audio."}
        </div>
      </div>

      {/* show incoming caller info + Accept / Decline when ringing */}
      {status === "ringing" && pendingOfferRef.current && (
        <div className="mb-3 p-3 rounded-md bg-yellow-50 dark:bg-yellow-900/20 text-sm">
          <div className="font-medium">Incoming call from {pendingOfferRef.current.from}</div>
          <div className="mt-2 flex gap-2">
            <button
              onClick={async () => {
                // Answer (user gesture) -> will call getUserMedia inside handleIncomingOffer
                await answerPendingOffer();
              }}
              className="px-3 py-2 bg-green-600 text-white rounded-md"
            >
              Answer
            </button>
            <button
              onClick={() => {
                declineCall(pendingOfferRef.current.from);
              }}
              className="px-3 py-2 bg-red-500 text-white rounded-md"
            >
              Decline
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between space-x-2">
        <button
          onClick={async () => {
            if (status === "idle" || status === "ended") {
              await startCall();
            } else if (status === "calling") {
              // do nothing — waiting for answer
            } else if (status === "in-call") {
              toggleMute();
            } else if (status === "ringing") {
              // if ringing and user clicks main button, treat it as Answer
              await answerPendingOffer();
            }
          }}
          className="flex-1 px-3 py-2 rounded-md bg-primary text-white hover:opacity-90"
        >
          {status === "idle" || status === "ended" ? "Start Call" : (status === "ringing" ? "Answer" : (status === "in-call" ? (isMuted ? "Unmute" : "Mute") : "Calling..."))}
        </button>

        <button
          onClick={() => {
            endCall("user-closed");
          }}
          className="px-3 py-2 rounded-md bg-red-500 text-white hover:opacity-90"
        >
          Hangup
        </button>
      </div>

      {autoplayBlocked && (
        <div className="mt-3 flex items-center gap-2">
          <button onClick={handlePlayRemote} className="px-3 py-1 text-sm bg-gray-200 rounded">Play remote audio</button>
          <span className="text-xs text-gray-500">If you accepted the call and can't hear audio, press Play.</span>
        </div>
      )}

      <div className="mt-3 text-xs text-gray-500">
        Socket: {connected ? <span className="text-green-600">connected</span> : <span className="text-red-600">disconnected</span>}
      </div>
    </div>
  );
}

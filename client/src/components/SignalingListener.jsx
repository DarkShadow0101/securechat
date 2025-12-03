import React, { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import CryptoJS from "crypto-js";
import { useAuth } from "../contexts/AuthContext";

const PING_INTERVAL_MS = 10000; // Frequent ping to keep Render awake

export default function SignalingListener({
  signalingUrl,
  enableSignalEncryption = true,
  onIncomingCall = () => {},
  autoRegister = true,
}) {
  const { currentUser } = useAuth();
  const socketRef = useRef(null);
  const pingRef = useRef(null);

  // Normalize URL
  const SIGNAL_URL = (signalingUrl || "https://signaling-server-ig4a.onrender.com").replace(/\/$/, "");

  // --- Encryption Helpers ---
  const getSharedSecret = (uid1, uid2) => {
    const a = (uid1 || "").trim();
    const b = (uid2 || "").trim();
    return CryptoJS.SHA256([a, b].sort().join("")).toString();
  };

  const decodePayload = (payload, encrypted, localUid, fromUid) => {
    if (!encrypted) {
      try { return typeof payload === "string" ? JSON.parse(payload) : payload; }
      catch { return payload; }
    }
    try {
      const secret = getSharedSecret(localUid, fromUid);
      const bytes = CryptoJS.AES.decrypt(payload, secret);
      const txt = bytes.toString(CryptoJS.enc.Utf8);
      return JSON.parse(txt);
    } catch (e) {
      console.error("SignalingListener: Decrypt failed", e);
      return null;
    }
  };

  useEffect(() => {
    if (!currentUser?.uid) return;

    // 1. Initialize Global Socket (Singleton)
    if (!window.__SIGNAL_SOCKET__ || !window.__SIGNAL_SOCKET__.connected) {
      console.log("🔌 Initializing Global Socket...");
      const socket = io(SIGNAL_URL, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        timeout: 20000,
      });
      window.__SIGNAL_SOCKET__ = socket;
    }

    socketRef.current = window.__SIGNAL_SOCKET__;
    const socket = socketRef.current;

    // 2. Event Handlers
    const handleConnect = () => {
      console.log("✅ Signaling Connected:", socket.id);
      if (autoRegister) {
        socket.emit("join-call", currentUser.uid);
      }
      // Start Heartbeat
      if (pingRef.current) clearInterval(pingRef.current);
      pingRef.current = setInterval(() => {
        if (socket.connected) socket.emit("ping-check");
      }, PING_INTERVAL_MS);
      
      window.dispatchEvent(new CustomEvent("signal:connected", { detail: { id: socket.id } }));
    };

    const handleSignal = (envelope) => {
      if (!envelope) return;
      if (envelope.to && envelope.to !== currentUser.uid) return; // Not for us

      const payload = decodePayload(envelope.payload, envelope.encrypted, currentUser.uid, envelope.from);
      console.debug(`📩 Signal [${envelope.type}] from ${envelope.from}`);

      if (envelope.type === "offer") {
        // CRITICAL: Trigger incoming call UI via Dashboard
        onIncomingCall(envelope.from, payload, envelope);
      } else {
        // Broadcast answer/ice to CallUI
        window.dispatchEvent(new CustomEvent("signal:message", { detail: { envelope, payload } }));
      }
    };

    const handleDisconnect = (reason) => {
      console.warn("⚠️ Signaling Disconnected:", reason);
      if (reason === "io server disconnect") socket.connect();
    };

    // 3. Attach Listeners
    socket.on("connect", handleConnect);
    socket.on("signal", handleSignal);
    socket.on("disconnect", handleDisconnect);

    // Immediate check
    if (socket.connected) handleConnect();

    // Cleanup listeners (but keep socket alive)
    return () => {
      socket.off("connect", handleConnect);
      socket.off("signal", handleSignal);
      socket.off("disconnect", handleDisconnect);
      if (pingRef.current) clearInterval(pingRef.current);
    };
  }, [currentUser?.uid, SIGNAL_URL, autoRegister, onIncomingCall]);

  return null;
}
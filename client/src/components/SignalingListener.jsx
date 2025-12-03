// client/src/components/SignalingListener.jsx
import React, { useEffect, useRef } from "react";
import { io } from "socket.io-client";
import CryptoJS from "crypto-js";
import { useAuth } from "../contexts/AuthContext";

export default function SignalingListener({
  signalingUrl,
  enableSignalEncryption = true,
  onIncomingCall = () => {},
  autoRegister = true,
}) {
  const { currentUser } = useAuth();
  const socketRef = useRef(null);

  const SIGNAL_URL = signalingUrl || process.env.REACT_APP_SIGNAL_URL || "http://localhost:5000";

  // same shared secret derivation as CallUI
  const getSharedSecret = (uid1 = "", uid2 = "") => {
    const a = (uid1 || "").trim();
    const b = (uid2 || "").trim();
    const combined = [a, b].sort().join("");
    return CryptoJS.SHA256(combined).toString();
  };

  const decodePayload = (payload, encrypted, localUid, fromUid) => {
    if (!encrypted) return payload;
    try {
      const secret = getSharedSecret(localUid, fromUid);
      const bytes = CryptoJS.AES.decrypt(payload, secret);
      const txt = bytes.toString(CryptoJS.enc.Utf8);
      return JSON.parse(txt);
    } catch (e) {
      console.error("SignalingListener: failed to decrypt payload", e);
      return null;
    }
  };

  useEffect(() => {
    if (!currentUser?.uid) {
      // user not ready yet
      return;
    }

    const socket = io(SIGNAL_URL, { transports: ["websocket"] });
    socketRef.current = socket;

    socket.on("connect", () => {
      console.debug("SignalingListener connected", socket.id);
      if (autoRegister) {
        socket.emit("register", { uid: currentUser.uid });
        console.debug("SignalingListener: registered uid", currentUser.uid);
      }
    });

    socket.on("disconnect", () => {
      console.debug("SignalingListener disconnected");
    });

    socket.on("signal", (envelope) => {
      try {
        if (!envelope) return;
        // ignore signals not destined for this uid (server usually forwards correctly)
        if (envelope.to && envelope.to !== currentUser.uid) return;

        console.debug("[SignalingListener] signal recv:", envelope.type, "from", envelope.from);

        const payload = decodePayload(envelope.payload, envelope.encrypted, currentUser.uid, envelope.from);

        // If it's an offer, call onIncomingCall so the app can open UI
        if (envelope.type === "offer") {
          try {
            // offer payload should contain sdp and type
            onIncomingCall(envelope.from, payload, envelope);
            // try to show browser notification (optional)
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              new Notification("Incoming call", {
                body: `Call from ${envelope.from}`,
              });
            } else if (typeof Notification !== "undefined" && Notification.permission !== "denied") {
              Notification.requestPermission().then((perm) => {
                if (perm === "granted") {
                  new Notification("Incoming call", { body: `Call from ${envelope.from}` });
                }
              });
            }
          } catch (err) {
            console.error("SignalingListener onIncomingCall handler error:", err);
          }
        }
      } catch (err) {
        console.error("SignalingListener signal handler error:", err);
      }
    });

    socket.on("connect_error", (err) => {
      console.error("SignalingListener connect_error", err);
    });

    return () => {
      try {
        socket.disconnect();
      } catch (e) {}
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.uid, SIGNAL_URL]);

  return null;
}


import { useEffect, useRef, useState } from "react";
import io from "socket.io-client";
import SimplePeer from "simple-peer";

export default function useCall(localStream, onRemoteStream) {
  const socketRef = useRef(null);
  const peerRef = useRef(null);
  const [myId, setMyId] = useState("");

  useEffect(() => {
    socketRef.current = io("http://localhost:5000");
    const socket = socketRef.current;

    socket.on("connect", () => {
      setMyId(socket.id);
      console.log("Connected with ID:", socket.id);
    });

    // --------------------------------
    //       WHEN YOU ARE CALLEE
    // --------------------------------
    socket.on("incoming-call", ({ from, signal }) => {
      console.log("Incoming call from:", from);

      peerRef.current = new SimplePeer({
        initiator: false,
        trickle: false,
        stream: localStream
      });

      // Send answer back
      peerRef.current.on("signal", (answerSignal) => {
        socket.emit("answer-call", {
          targetId: from,
          signal: answerSignal
        });
      });

      // Remote stream
      peerRef.current.on("stream", (remote) => {
        console.log("Remote stream received (callee)");
        onRemoteStream(remote);
      });

      peerRef.current.signal(signal);
    });

    // --------------------------------
    //      WHEN YOU ARE CALLER
    // --------------------------------
    socket.on("call-answered", ({ from, signal }) => {
      console.log("Call answered by:", from);
      peerRef.current?.signal(signal);
    });

    // Extra ICE exchange
    socket.on("signal", ({ data }) => {
      peerRef.current?.signal(data);
    });

    return () => {
      socket.disconnect();
      peerRef.current?.destroy();
    };
  }, [localStream, onRemoteStream]);

  // --------------------------------
  //            CALL USER
  // --------------------------------
  function call(targetId) {
    const socket = socketRef.current;

    peerRef.current = new SimplePeer({
      initiator: true,
      trickle: false,
      stream: localStream
    });

    // Send offer
    peerRef.current.on("signal", (offerSignal) => {
      socket.emit("call-user", {
        targetId,
        signal: offerSignal
      });
    });

    peerRef.current.on("stream", (remote) => {
      console.log("Remote stream received (caller)");
      onRemoteStream(remote);
    });
  }

  return { call, myId };
}

import CryptoJS from 'crypto-js';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CallUI from '../components/VoiceCall/CallUI';
import SignalingListener from '../components/SignalingListener';

import {
  LogOut, User, MessageSquare, Paperclip, Send, File, Download, X, Sun, Moon, Check, CheckCheck, Mic, Square, Camera, Search, ArrowLeft, Clock, PhoneCall, Save, Database, Image as ImageIcon, Share, Trash2, Palette
} from 'lucide-react';

import { storage, db } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  collection, addDoc, onSnapshot, query, orderBy, getDocs, doc, writeBatch, updateDoc, getDoc, setDoc, Timestamp
} from 'firebase/firestore';
import { updateProfile } from "firebase/auth";

// --- THEME CONFIGURATION ---
const themeColors = {
  purple: {
    primary: '#7c3aed',
    light: 'linear-gradient(135deg, #7c3aed 0%, #4f46e5 100%)',
    dark: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
  },
  blue: {
    primary: '#2563eb',
    light: 'linear-gradient(135deg, #2563eb 0%, #0ea5e9 100%)',
    dark: 'linear-gradient(135deg, #3b82f6 0%, #0284c7 100%)',
  },
  green: {
    primary: '#059669',
    light: 'linear-gradient(135deg, #059669 0%, #10b981 100%)',
    dark: 'linear-gradient(135deg, #10b981 0%, #34d399 100%)',
  },
};

const disappearingMessageDurations = {
  off: { label: 'Off', duration: 0 },
  '24h': { label: '24 Hours', duration: 24 * 60 * 60 * 1000 },
  '7d': { label: '7 Days', duration: 7 * 24 * 60 * 60 * 1000 },
};

// --- ENCRYPTION HELPERS ---
const getSecretKey = (chatRoomId) => CryptoJS.SHA256(chatRoomId).toString();
const encryptMessage = (text, chatRoomId) => CryptoJS.AES.encrypt(text, getSecretKey(chatRoomId)).toString();
const decryptMessage = (encryptedText, chatRoomId) => {
  try {
    if (!encryptedText) return "";
    const bytes = CryptoJS.AES.decrypt(encryptedText, getSecretKey(chatRoomId));
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    return originalText || "[Decryption Error]";
  } catch (error) {
    return "[Encrypted Message]";
  }
};

const Dashboard = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  
  // UI States
  const [notification, setNotification] = useState(null);
  const [darkMode, setDarkMode] = useState(true); 
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isDisappearingModalOpen, setIsDisappearingModalOpen] = useState(false);
  
  // Data States
  const [users, setUsers] = useState([]);
  const [selectedChatUser, setSelectedChatUser] = useState(null);
  const [messages, setMessages] = useState([]);
  
  // Chat States
  const [loadingChat, setLoadingChat] = useState(false);
  const [newMessage, setNewMessage] = useState("");
  const [isRecipientTyping, setIsRecipientTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  
  // File/Media States
  const [fileToSend, setFileToSend] = useState(null);
  const [filePreview, setFilePreview] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [viewingMessage, setViewingMessage] = useState(null);
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowForward, setAllowForward] = useState(true);

  // Profile & Config States
  const [userPreferences, setUserPreferences] = useState({});
  const [currentChatConfig, setCurrentChatConfig] = useState(null);
  const [wallpaper, setWallpaper] = useState('');
  const [wallpaperFile, setWallpaperFile] = useState(null);
  const [wallpaperPreview, setWallpaperPreview] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [profilePicFile, setProfilePicFile] = useState(null);
  const [profilePicPreview, setProfilePicPreview] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [selectedBackupFrequency, setSelectedBackupFrequency] = useState('off');
  const [theme, setTheme] = useState('purple'); // Default theme

  // Search & Forwarding
  const [searchQuery, setSearchQuery] = useState('');
  const [messageToForward, setMessageToForward] = useState(null);
  const [isForwarding, setIsForwarding] = useState(false);

  // Call UI States
  const [showCallUI, setShowCallUI] = useState(false);
  const [incomingCallData, setIncomingCallData] = useState(null);

  // Refs
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const profilePicInputRef = useRef(null);
  const wallpaperInputRef = useRef(null);
  const textareaRef = useRef(null);
  const audioChunksRef = useRef([]);

  // --- LOGOUT ---
  const handleLogout = async () => {
    try { await logout(); navigate('/login'); } 
    catch (error) { console.error('Logout failed', error); }
  };

  // --- SCROLLING ---
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, isRecipientTyping]);

  // --- AUTO RESIZE TEXTAREA ---
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [newMessage]);

  // --- THEME APPLIER ---
  useEffect(() => {
    const root = document.documentElement;
    const selectedTheme = themeColors[theme];

    root.style.setProperty('--theme-color', selectedTheme.primary);
    root.style.setProperty('--bubble-me-light', selectedTheme.light);
    root.style.setProperty('--bubble-me-dark', selectedTheme.dark);

    if (darkMode) {
      root.style.setProperty('--bg-sidebar', '#111827');
      root.style.setProperty('--bg-chat', '#0b0c10');
      root.style.setProperty('--text-primary', '#f3f4f6');
      root.style.setProperty('--bubble-other', '#1f2937');
    } else {
      root.style.setProperty('--bg-sidebar', '#ffffff');
      root.style.setProperty('--bg-chat', '#f9fafb');
      root.style.setProperty('--text-primary', '#1f2937');
      root.style.setProperty('--bubble-other', '#ffffff');
    }
  }, [theme, darkMode]);

  // --- INCOMING CALL HANDLER ---
  const handleIncomingCall = useCallback(async (callerUid, payload, envelope) => {
    let found = users.find(u => u.uid === callerUid);
    if (!found) {
      try {
        const userDoc = await getDoc(doc(db, 'users', callerUid));
        found = userDoc.exists() ? { uid: callerUid, ...userDoc.data() } : { uid: callerUid, displayName: "Unknown" };
      } catch (e) { found = { uid: callerUid, displayName: "Caller" }; }
    }
    setSelectedChatUser(found);
    setIncomingCallData({ from: callerUid, payload, envelope });
    setShowCallUI(true);
  }, [users]);

  // --- ROBUST UPLOAD HELPER ---
  const uploadFileToFirebase = async (file, path) => {
    const storageRef = ref(storage, path);
    const uploadTask = uploadBytes(storageRef, file);
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Upload timed out.")), 60000));
    try {
      const snapshot = await Promise.race([uploadTask, timeout]);
      return await getDownloadURL(snapshot.ref);
    } catch (error) {
      console.error("Upload Error:", error);
      throw error; 
    }
  };

  // --- SEND MESSAGE ---
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChatUser) return;
    const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
    const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
    try {
      const encryptedText = encryptMessage(newMessage, chatRoomId);
      const messageData = {
        type: 'text', text: encryptedText, senderId: currentUser.uid, timestamp: new Date().toISOString(),
        read: false, delivered: false,
      };
      if (currentChatConfig?.disappearingMessages?.duration > 0) {
        messageData.disappearAt = Timestamp.fromDate(new Date(Date.now() + currentChatConfig.disappearingMessages.duration));
      }
      if (replyingTo) {
        messageData.replyTo = {
          messageId: replyingTo.id, senderName: replyingTo.senderId === currentUser.uid ? 'You' : selectedChatUser.displayName,
          fileType: replyingTo.fileType || null, text: replyingTo.text || null
        };
      }
      await addDoc(messagesRef, messageData);
      setNewMessage("");
      setReplyingTo(null);
      setUsers(prev => {
        const idx = prev.findIndex(u => u.uid === selectedChatUser.uid);
        if (idx === -1) return prev;
        const u = prev[idx];
        return [u, ...prev.slice(0, idx), ...prev.slice(idx + 1)];
      });
    } catch (error) {
      setNotification({ type: 'error', message: 'Message failed to send.' });
    }
  };

  // --- CONFIRM & UPLOAD FILE ---
  const handleConfirmSendFile = async () => {
    const file = fileToSend;
    if (!file || !selectedChatUser) return;
    setFileToSend(null);
    setNotification({ type: 'info', message: `Uploading ${file.name}...` });
    try {
      const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
      const fileName = `${Date.now()}_${file.name}`;
      const path = `uploads/chat/${chatRoomId}/${fileName}`;
      const downloadURL = await uploadFileToFirebase(file, path);
      const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
      const encryptedFileName = encryptMessage(file.name, chatRoomId);
      const messageData = {
        type: 'file', fileName: encryptedFileName, fileSize: file.size, fileType: file.type, fileUrl: downloadURL,
        senderId: currentUser.uid, timestamp: new Date().toISOString(),
        read: false, delivered: false,
        allowDownload: allowDownload, allowForward: allowForward,
      };
      if (currentChatConfig?.disappearingMessages?.duration > 0) {
        messageData.disappearAt = Timestamp.fromDate(new Date(Date.now() + currentChatConfig.disappearingMessages.duration));
      }
      await addDoc(messagesRef, messageData);
      setNotification({ type: 'success', message: `File sent successfully!` });
    } catch (error) {
      setNotification({ type: 'error', message: `Upload Failed: ${error.message}` });
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type.startsWith('image/')) setFilePreview(URL.createObjectURL(file));
    else setFilePreview('');
    setFileToSend(file);
    setAllowDownload(true); setAllowForward(true);
    e.target.value = null;
  };

  // --- VOICE RECORDING ---
  const handleStartRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        stream.getTracks().forEach(t => t.stop());
        await handleSendAudioMessage(audioBlob);
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      setNotification({ type: 'error', message: 'Microphone access denied.' });
    }
  };
  const handleStopRecording = () => { if (mediaRecorder?.state === 'recording') mediaRecorder.stop(); setIsRecording(false); };

  const handleSendAudioMessage = async (audioBlob) => {
    setNotification({ type: 'info', message: `Uploading voice message...` });
    try {
      const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
      const fileName = `${Date.now()}_voice.webm`;
      const path = `uploads/chat/${chatRoomId}/${fileName}`;
      const downloadURL = await uploadFileToFirebase(audioBlob, path);
      const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
      const messageData = {
        type: 'audio', fileUrl: downloadURL, senderId: currentUser.uid, timestamp: new Date().toISOString(),
        read: false, delivered: false,
      };
      if (currentChatConfig?.disappearingMessages?.duration > 0) {
        messageData.disappearAt = Timestamp.fromDate(new Date(Date.now() + currentChatConfig.disappearingMessages.duration));
      }
      await addDoc(messagesRef, messageData);
      setNotification({ type: 'success', message: `Voice message sent!` });
    } catch (e) {
      setNotification({ type: 'error', message: `Voice Upload Failed: ${e.message}` });
    }
  };

  // --- PROFILE UPDATE ---
  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setIsUpdatingProfile(true);
    setNotification({ type: 'info', message: 'Saving changes...' });
    try {
      let photoURL = currentUser.photoURL;
      let newWallpaperURL = wallpaper; 
      if (profilePicFile) photoURL = await uploadFileToFirebase(profilePicFile, `profile-pictures/${currentUser.uid}`);
      if (wallpaperFile) newWallpaperURL = await uploadFileToFirebase(wallpaperFile, `wallpapers/${currentUser.uid}`);
      
      if (newDisplayName || photoURL !== currentUser.photoURL) {
         await updateProfile(currentUser, { displayName: newDisplayName || currentUser.displayName, photoURL });
      }
      await updateDoc(doc(db, 'users', currentUser.uid), {
        displayName: newDisplayName || currentUser.displayName,
        photoURL,
        preferences: { wallpaper: newWallpaperURL, backupFrequency: selectedBackupFrequency, theme }
      });
      setWallpaper(newWallpaperURL);
      setUserPreferences({ wallpaper: newWallpaperURL, backupFrequency: selectedBackupFrequency, theme });
      setNotification({ type: 'success', message: 'Settings Saved!' });
      setIsProfileModalOpen(false);
    } catch (e) {
      console.error(e);
      setNotification({ type: 'error', message: `Save failed: ${e.message}` });
    } finally { setIsUpdatingProfile(false); }
  };

  // --- ACTIONS ---
  const handleForwardMessage = async (targetUser) => {
    if (!messageToForward || !targetUser) return;
    const targetChatRoomId = [currentUser.uid, targetUser.uid].sort().join('_');
    const messagesRef = collection(db, 'chats', targetChatRoomId, 'messages');
    try {
      const forwardedMessage = {
        ...messageToForward, senderId: currentUser.uid, timestamp: new Date().toISOString(),
        read: false, delivered: false, edited: false, deleted: false, forwarded: true,
      };
      delete forwardedMessage.id;
      const originalChatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
      if (forwardedMessage.type === 'text') {
        const decrypted = decryptMessage(forwardedMessage.text, originalChatRoomId);
        forwardedMessage.text = encryptMessage(decrypted, targetChatRoomId);
      }
      if (forwardedMessage.type === 'file' && forwardedMessage.fileName) {
        const decrypted = decryptMessage(forwardedMessage.fileName, originalChatRoomId);
        forwardedMessage.fileName = encryptMessage(decrypted, targetChatRoomId);
      }
      await addDoc(messagesRef, forwardedMessage);
      setNotification({ type: 'success', message: `Forwarded to ${targetUser.displayName}!` });
      setIsForwarding(false);
      setMessageToForward(null);
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to forward message.' });
    }
  };

  const handleDeleteMessage = async (messageId) => {
    if (!window.confirm('Delete message?')) return;
    try {
      const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
      const deletedText = encryptMessage("This message was deleted.", chatRoomId);
      await updateDoc(doc(db, 'chats', chatRoomId, 'messages', messageId), { text: deletedText, type: 'text', deleted: true });
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to delete.' });
    }
  };

  // --- BACKUP ---
  const handleExportChat = () => {
    if(!messages.length) { setNotification({ type: 'error', message: 'No messages to export.' }); return; }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(messages, null, 2));
    const anchor = document.createElement('a');
    anchor.href = dataStr;
    anchor.download = `chat_backup.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setNotification({ type: 'success', message: 'Chat exported!' });
  };

  // --- DATA LOADING ---
  useEffect(() => {
    if (!currentUser) return;
    const fetchInitial = async () => {
      const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data.preferences) {
           setUserPreferences(data.preferences);
           setWallpaper(data.preferences.wallpaper || '');
           setTheme(data.preferences.theme || 'purple');
        }
      }
      const usersSnap = await getDocs(collection(db, 'users'));
      const userList = usersSnap.docs.map(d => ({ ...d.data(), id: d.id })).filter(u => u.uid !== currentUser.uid);
      setUsers(userList);
    };
    fetchInitial();
  }, [currentUser]);

  useEffect(() => {
    if (!selectedChatUser) return;
    setLoadingChat(true);
    const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
    const q = query(collection(db, 'chats', chatRoomId, 'messages'), orderBy('timestamp'));
    
    const unsub = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      const now = new Date();
      // Filter expired messages
      const filteredMsgs = msgs.filter(msg => {
         if (msg.disappearAt) {
            const exp = msg.disappearAt.toDate ? msg.disappearAt.toDate() : new Date(msg.disappearAt);
            return exp > now;
         }
         return true;
      });
      setMessages(filteredMsgs);
      setLoadingChat(false);
      
      const batch = writeBatch(db);
      let updates = false;
      snapshot.docs.forEach(d => {
         const m = d.data();
         if(m.senderId === selectedChatUser.uid && !m.read) {
            batch.update(d.ref, { read: true, readAt: new Date().toISOString() });
            updates = true;
         }
      });
      if(updates) batch.commit();
    });
    return () => unsub();
  }, [selectedChatUser, currentUser]);

  useEffect(() => {
    if (!selectedChatUser) return;
    const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
    const unsub = onSnapshot(doc(db, 'chats', chatRoomId), (snap) => {
       if(snap.exists()) {
          const data = snap.data();
          setCurrentChatConfig(data);
          setIsRecipientTyping(data.typingStatus?.[selectedChatUser.uid] || false);
       } else { setCurrentChatConfig(null); }
    });
    return () => unsub();
  }, [selectedChatUser, currentUser]);

  const toggleDarkMode = () => setDarkMode(!darkMode);
  
  const filteredUsers = users.filter(user => 
    (user.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!currentUser) return <div className="h-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;

  // --- RENDER ---
  return (
    <div className={`flex flex-col h-screen transition-colors duration-300 bg-[var(--bg-chat)] text-[var(--text-primary)]`}>
      
      {/* HEADER */}
      <header className={`shadow-sm border-b z-10 ${darkMode ? 'border-gray-800' : 'border-gray-200'} bg-[var(--bg-sidebar)]`}>
        <div className="px-4 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-3">
             <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white" style={{ backgroundColor: `var(--theme-color)` }}><MessageSquare /></div>
             <h1 className="text-xl font-bold">SecureChat</h1>
          </div>
          <div className="flex items-center space-x-3">
             <button onClick={toggleDarkMode} className="p-2.5 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-700 transition-colors text-gray-500">
               {darkMode ? <Sun size={20} /> : <Moon size={20} />}
             </button>
             <button onClick={handleLogout} className="flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium">
                <LogOut size={16} /> <span>Logout</span>
             </button>
          </div>
        </div>
      </header>

      <SignalingListener signalingUrl={process.env.REACT_APP_SIGNAL_URL || "https://signaling-server-ig4a.onrender.com"} enableSignalEncryption={true} onIncomingCall={handleIncomingCall} />

      <AnimatePresence>
        {notification && (
          <motion.div initial={{ y: -50, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -50, opacity: 0 }} 
            className={`fixed top-24 right-4 z-50 px-6 py-4 rounded-xl shadow-2xl text-white font-medium flex items-center gap-3 ${notification.type === 'error' ? 'bg-red-500' : notification.type === 'info' ? 'bg-blue-500' : 'bg-emerald-500'}`}>
            {notification.message}
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-1 overflow-hidden">
        {/* SIDEBAR */}
        <div className={`w-full md:w-80 flex flex-col border-r ${darkMode ? 'border-gray-800' : 'border-gray-200'} bg-[var(--bg-sidebar)] ${selectedChatUser ? 'hidden md:flex' : 'flex'}`}>
           <div className="p-4 flex flex-col h-full">
              <h2 className="text-xs font-bold uppercase tracking-wider mb-4 text-gray-500">Direct Messages</h2>
              
              <div className="relative mb-4">
                 <Search className="absolute left-3 top-3 text-gray-400" size={18} />
                 <input type="text" placeholder="Search users..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                   className={`w-full pl-10 pr-4 py-2.5 rounded-lg border outline-none focus:ring-2 transition-all ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200'}`} 
                   style={{ borderColor: `var(--theme-color)` }} />
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-1">
                 {filteredUsers.map(user => (
                    <div key={user.uid} onClick={() => setSelectedChatUser(user)}
                      className={`flex items-center p-3 rounded-lg cursor-pointer transition-all ${selectedChatUser?.uid === user.uid ? 'text-white' : 'hover:bg-gray-100 dark:hover:bg-gray-800'}`}
                      style={{ backgroundColor: selectedChatUser?.uid === user.uid ? `var(--theme-color)` : '' }}>
                       <div className="w-10 h-10 rounded-full bg-gray-300 flex items-center justify-center overflow-hidden border border-gray-400">
                          {user.photoURL ? <img src={user.photoURL} className="w-full h-full object-cover" /> : <User size={20} className="text-gray-600" />}
                       </div>
                       <div className="ml-3 flex-1 overflow-hidden">
                          <p className="font-medium truncate">{user.displayName || "User"}</p>
                       </div>
                    </div>
                 ))}
              </div>

              <div className="mt-4 pt-4 border-t border-gray-800 dark:border-gray-700">
                 <div onClick={() => { 
                    setNewDisplayName(currentUser.displayName || ''); 
                    setWallpaperPreview(userPreferences.wallpaper || '');
                    setIsProfileModalOpen(true); 
                 }} className="flex items-center cursor-pointer p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                    <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden">
                       {currentUser.photoURL ? <img src={currentUser.photoURL} className="w-full h-full object-cover" /> : <User className="text-gray-400" />}
                    </div>
                    <div className="ml-3">
                       <p className="font-bold text-sm">My Profile</p>
                       <p className="text-xs text-gray-500">Settings</p>
                    </div>
                 </div>
              </div>
           </div>
        </div>

        {/* CHAT AREA */}
        <div className={`flex-1 flex flex-col relative ${selectedChatUser ? 'flex' : 'hidden md:flex'} bg-[var(--bg-chat)]`}>
           {!selectedChatUser ? (
              <div className="flex-1 flex items-center justify-center flex-col text-gray-500">
                 <p className="text-xl font-medium">Select a user to start messaging</p>
              </div>
           ) : (
              <>
                {/* Chat Header */}
                <div className={`p-4 border-b flex justify-between items-center z-10 ${darkMode ? 'border-gray-800' : 'border-gray-200'} bg-[var(--bg-sidebar)]`}>
                   <div className="flex items-center">
                      <button onClick={() => setSelectedChatUser(null)} className="md:hidden mr-3 p-2 rounded-full hover:bg-gray-800"><ArrowLeft /></button>
                      <h2 className="font-bold text-lg">{selectedChatUser.displayName}</h2>
                      {selectedChatUser.isOnline && <span className="ml-2 w-2 h-2 bg-green-500 rounded-full"></span>}
                   </div>
                   <div className="flex items-center gap-3">
                     <button onClick={() => setShowCallUI(true)} className="p-2 rounded-full hover:bg-gray-800 text-gray-400 hover:text-white transition-colors" title="Call">
                        <PhoneCall size={20} />
                     </button>
                     <button onClick={() => setIsDisappearingModalOpen(true)} 
                        className={`relative p-2 rounded-full transition-colors ${currentChatConfig?.disappearingMessages?.duration > 0 ? 'bg-purple-100' : 'text-gray-500 hover:bg-gray-800'}`} 
                        style={{ color: currentChatConfig?.disappearingMessages?.duration > 0 ? `var(--theme-color)` : '' }} title="Disappearing Messages">
                        <Clock size={20} />
                        {currentChatConfig?.disappearingMessages?.duration > 0 && <span className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ backgroundColor: `var(--theme-color)` }}></span>}
                     </button>
                   </div>
                </div>

                {/* Messages List */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 relative" 
                     style={{ 
                        backgroundImage: wallpaper ? `url(${wallpaper})` : 'none', 
                        backgroundSize: 'cover', 
                        backgroundPosition: 'center',
                     }}>
                   {wallpaper && <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-none sticky top-0 h-full w-full"></div>}

                   <div className="relative z-0 flex flex-col justify-end min-h-full pb-4">
                     {loadingChat ? (
                        <div className="flex justify-center p-4"><p className="text-gray-500">Loading messages...</p></div>
                     ) : (
                        messages.map((msg, idx) => {
                           const isMe = msg.senderId === currentUser.uid;
                           const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
                           const text = msg.type === 'text' ? decryptMessage(msg.text, chatRoomId) : '';
                           
                           return (
                              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} key={msg.id} 
                                 className={`flex w-full group mb-2 ${isMe ? 'justify-end' : 'justify-start'}`}>
                                 
                                 <div className={`flex items-end gap-2 max-w-[85%] ${isMe ? 'flex-row-reverse' : 'flex-row'}`}>
                                    
                                    {/* Message Bubble */}
                                    <div className={`p-3.5 shadow-sm relative rounded-2xl border ${isMe ? 'rounded-tr-sm text-white' : 'rounded-tl-sm bg-[var(--bubble-other)]'}`}
                                         style={{ 
                                            background: isMe ? (darkMode ? 'var(--bubble-me-dark)' : 'var(--bubble-me-light)') : undefined,
                                            borderColor: `var(--theme-color)`
                                         }}>
                                       
                                       {msg.replyTo && (
                                          <div className={`text-xs mb-2 p-2 rounded-lg border-l-4 ${isMe ? 'bg-black/20 border-white/50' : 'bg-gray-700/50'}`} style={{ borderColor: isMe ? '' : `var(--theme-color)` }}>
                                             <span className="font-bold opacity-90">{msg.replyTo.senderName}</span>
                                             <p className="truncate opacity-80">{msg.replyTo.fileType ? 'Attachment' : 'Message'}</p>
                                          </div>
                                       )}

                                       {msg.type === 'text' && <p className="text-[15px] leading-relaxed break-words">{text}</p>}
                                       
                                       {msg.type === 'file' && msg.fileType?.startsWith('image/') && (
                                          <img src={msg.fileUrl} onClick={() => setViewingMessage(msg)} className="rounded-xl max-h-72 w-full object-cover cursor-pointer hover:opacity-95 transition-opacity" />
                                       )}
                                       
                                       {msg.type === 'file' && !msg.fileType?.startsWith('image/') && (
                                          <div className={`flex items-center gap-3 p-3 rounded-xl ${isMe ? 'bg-black/20' : 'bg-gray-700/50'}`}>
                                             <File size={24} />
                                             <div className="overflow-hidden flex-1">
                                                <p className="truncate text-sm font-medium">{decryptMessage(msg.fileName, chatRoomId)}</p>
                                                {msg.allowDownload !== false && (
                                                   <button onClick={() => window.open(msg.fileUrl, '_blank')} className="text-xs underline opacity-80 hover:opacity-100 mt-0.5">Download</button>
                                                )}
                                             </div>
                                          </div>
                                       )}

                                       {msg.type === 'audio' && (
                                          <audio src={msg.fileUrl} controls className="h-8 w-60 mt-1 mb-1" />
                                       )}

                                       <div className={`text-[10px] mt-1.5 flex justify-end items-center space-x-1 ${isMe ? 'text-purple-100' : 'text-gray-500'}`}>
                                          <span>{new Date(msg.timestamp).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                          {isMe && (msg.read ? <CheckCheck size={14} /> : <Check size={14} />)}
                                       </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 mb-1">
                                       {(msg.allowForward !== false) && (
                                          <button onClick={() => { setMessageToForward(msg); setIsForwarding(true); }} className="p-1.5 rounded-full bg-gray-700/50 hover:bg-gray-600 text-gray-300 hover:text-white transition-colors" title="Forward">
                                             <Share size={14} />
                                          </button>
                                       )}
                                       {isMe && (
                                          <button onClick={() => handleDeleteMessage(msg.id)} className="p-1.5 rounded-full bg-gray-700/50 hover:bg-red-900/50 text-gray-400 hover:text-red-400 transition-colors" title="Delete">
                                             <Trash2 size={14} />
                                          </button>
                                       )}
                                    </div>

                                 </div>
                              </motion.div>
                           )
                        })
                     )}
                     <div ref={messagesEndRef} />
                   </div>
                </div>

                {/* Input Area */}
                <div className={`p-4 border-t ${darkMode ? 'border-gray-800' : 'border-gray-200'} bg-[var(--bg-sidebar)]`}>
                   {replyingTo && (
                      <div className="flex justify-between items-center text-sm p-3 bg-gray-800/50 rounded-xl mb-3 border-l-4" style={{ borderColor: `var(--theme-color)` }}>
                         <div>
                            <span className="font-bold text-xs" style={{ color: `var(--theme-color)` }}>Replying to {replyingTo.senderName}</span>
                            <p className="text-xs opacity-70 truncate max-w-xs text-gray-300">Message...</p>
                         </div>
                         <button onClick={() => setReplyingTo(null)} className="p-1 rounded-full hover:bg-gray-700"><X size={14} className="text-gray-400"/></button>
                      </div>
                   )}
                   
                   <form onSubmit={handleSendMessage} className="flex items-end gap-3">
                      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                      <button type="button" onClick={() => fileInputRef.current.click()} className="p-3 rounded-full hover:bg-gray-800 text-gray-400 transition-colors" style={{ color: `var(--theme-color)` }}>
                         <Paperclip size={22} />
                      </button>
                      
                      <div className={`flex-1 rounded-2xl border flex items-center transition-all focus-within:ring-2 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-100 border-gray-200'}`} style={{ borderColor: `var(--theme-color)` }}>
                         <textarea ref={textareaRef} value={newMessage} onChange={e => setNewMessage(e.target.value)}
                            onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }}
                            placeholder={isRecording ? "Recording audio..." : "Type a message..."}
                            className={`flex-1 bg-transparent border-none focus:ring-0 p-3 max-h-32 resize-none ${darkMode ? 'text-white placeholder-gray-500' : 'text-gray-900'}`}
                            rows={1}
                            disabled={isRecording}
                         />
                      </div>

                      {newMessage.trim() ? (
                         <button type="submit" className="p-3 text-white rounded-xl shadow-lg transition-all transform hover:scale-105" style={{ backgroundColor: `var(--theme-color)` }}>
                            <Send size={22} />
                         </button>
                      ) : (
                         <button type="button" onClick={isRecording ? handleStopRecording : handleStartRecording} 
                            className={`p-3 rounded-xl text-white shadow-lg transition-all transform hover:scale-105 ${isRecording ? 'bg-red-500 animate-pulse' : ''}`}
                            style={{ backgroundColor: isRecording ? '' : `var(--theme-color)` }}>
                            {isRecording ? <Square size={22} /> : <Mic size={22} />}
                         </button>
                      )}
                   </form>
                </div>
              </>
           )}
        </div>
      </div>

      {/* --- SETTINGS MODAL --- */}
      <AnimatePresence>
         {isProfileModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
               <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} 
                  className={`w-full max-w-md p-6 rounded-2xl shadow-2xl border ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
                  <div className="flex justify-between items-center mb-6 border-b pb-4 dark:border-gray-800">
                     <h2 className="text-xl font-bold">Settings</h2>
                     <button onClick={() => setIsProfileModalOpen(false)} className="p-2 rounded-full hover:bg-gray-800 dark:hover:bg-gray-700"><X /></button>
                  </div>

                  <form onSubmit={handleProfileUpdate} className="space-y-6">
                     <div className="flex justify-center">
                        <div onClick={() => profilePicInputRef.current.click()} className="relative w-24 h-24 rounded-full bg-gray-800 cursor-pointer overflow-hidden group border-2" style={{ borderColor: `var(--theme-color)` }}>
                           {profilePicPreview ? <img src={profilePicPreview} className="w-full h-full object-cover" /> : 
                            (currentUser.photoURL ? <img src={currentUser.photoURL} className="w-full h-full object-cover" /> : <User className="w-10 h-10 m-auto mt-7 text-gray-500" />)}
                           <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Camera className="text-white w-8 h-8" /></div>
                        </div>
                        <input type="file" ref={profilePicInputRef} className="hidden" accept="image/*" onChange={e => { if(e.target.files[0]) { setProfilePicFile(e.target.files[0]); setProfilePicPreview(URL.createObjectURL(e.target.files[0])); } }} />
                     </div>

                     <div>
                        <label className="text-xs font-bold uppercase tracking-wider opacity-60 ml-1 text-gray-500">Display Name</label>
                        <input type="text" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} 
                           className={`w-full mt-1 p-3 rounded-lg border outline-none focus:ring-2 transition-all ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}
                           style={{ borderColor: `var(--theme-color)` }} />
                     </div>

                     <div>
                        <label className="text-xs font-bold uppercase tracking-wider opacity-60 ml-1 flex items-center gap-1 text-gray-500"><Palette size={12}/> Color Theme</label>
                        <div className="flex gap-3 mt-2">
                           {Object.keys(themeColors).map((colorKey) => (
                              <button key={colorKey} type="button" onClick={() => setTheme(colorKey)}
                                 className={`w-8 h-8 rounded-full border-2 transition-all ${theme === colorKey ? 'border-white scale-110' : 'border-transparent'}`}
                                 style={{ backgroundColor: themeColors[colorKey].primary }} 
                              />
                           ))}
                        </div>
                     </div>

                     <div>
                        <label className="text-xs font-bold uppercase tracking-wider opacity-60 ml-1 text-gray-500">Chat Wallpaper</label>
                        <div className="flex gap-3 mt-2">
                           <input type="file" ref={wallpaperInputRef} className="hidden" accept="image/*" onChange={e => { if(e.target.files[0]) { setWallpaperFile(e.target.files[0]); setWallpaperPreview(URL.createObjectURL(e.target.files[0])); } }} />
                           <button type="button" onClick={() => wallpaperInputRef.current.click()} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 dark:border-gray-700 dark:text-gray-300 transition-colors">Select Image</button>
                           {(wallpaperPreview || wallpaper) && <button type="button" onClick={() => { setWallpaperFile(null); setWallpaperPreview(''); setWallpaper(''); }} className="px-4 py-2 text-sm border border-red-500/50 text-red-500 rounded-lg hover:bg-red-500/10">Remove</button>}
                        </div>
                        {(wallpaperPreview || wallpaper) && <img src={wallpaperPreview || wallpaper} className="mt-3 h-24 w-full object-cover rounded-lg border border-gray-700" />}
                     </div>

                     <div>
                        <label className="text-xs font-bold uppercase tracking-wider opacity-60 ml-1 flex items-center gap-1 text-gray-500"><Database size={12}/> Backup Frequency</label>
                        <select value={selectedBackupFrequency} onChange={e => setSelectedBackupFrequency(e.target.value)}
                           className={`w-full mt-1 p-3 rounded-lg border outline-none ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}
                           style={{ borderColor: `var(--theme-color)` }}>
                           <option value="off">Off</option>
                           <option value="daily">Daily</option>
                           <option value="weekly">Weekly</option>
                        </select>
                        
                        <button type="button" onClick={handleExportChat} className="mt-3 w-full flex items-center justify-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors border border-transparent dark:border-gray-700">
                           <Save size={16} /> Export Chat to JSON
                        </button>
                     </div>

                     <div className="pt-4">
                        <button type="submit" disabled={isUpdatingProfile} className="w-full py-3.5 text-white rounded-xl font-bold shadow-lg transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2" style={{ backgroundColor: `var(--theme-color)` }}>
                           <Save size={18} /> {isUpdatingProfile ? 'Saving...' : 'Save Changes'}
                        </button>
                     </div>
                  </form>
               </motion.div>
            </div>
         )}
      </AnimatePresence>

      {/* DISAPPEARING MESSAGES MODAL */}
      <AnimatePresence>
        {isDisappearingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
               className={`w-full max-w-sm p-6 rounded-2xl shadow-2xl border ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
               <div className="text-center mb-6">
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ backgroundColor: `var(--theme-color)`, opacity: 0.1 }}>
                     <Clock size={28} style={{ color: `var(--theme-color)`, opacity: 10 }} />
                  </div>
                  <h3 className="font-bold text-xl">Disappearing Messages</h3>
                  <p className="text-sm opacity-60 mt-1 text-gray-400">Select how long messages stay visible</p>
               </div>
               
               <div className="space-y-2">
                  {Object.entries(disappearingMessageDurations).map(([key, val]) => (
                     <button key={key} onClick={async () => {
                        const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
                        await setDoc(doc(db, 'chats', chatRoomId), { disappearingMessages: { duration: val.duration } }, { merge: true });
                        setIsDisappearingModalOpen(false);
                     }} className={`w-full text-left p-4 rounded-xl border transition-all ${currentChatConfig?.disappearingMessages?.duration === val.duration ? 'text-white' : 'border-transparent hover:bg-gray-800 dark:text-gray-300'}`}
                        style={{ backgroundColor: currentChatConfig?.disappearingMessages?.duration === val.duration ? `var(--theme-color)` : '', borderColor: currentChatConfig?.disappearingMessages?.duration === val.duration ? `var(--theme-color)` : '' }}>
                        <div className="flex justify-between items-center">
                           <span className="font-medium">{val.label}</span>
                           {currentChatConfig?.disappearingMessages?.duration === val.duration && <Check size={18} />}
                        </div>
                     </button>
                  ))}
               </div>
               <button onClick={() => setIsDisappearingModalOpen(false)} className="mt-6 w-full py-3 border border-gray-700 rounded-xl font-medium text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">Cancel</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SEND FILE CONFIRMATION (WITH CHECKBOXES) */}
      <AnimatePresence>
         {fileToSend && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
               <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} 
                  className={`w-full max-w-sm p-6 rounded-2xl shadow-2xl border ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
                  <h3 className="font-bold text-xl mb-4">Send Attachment?</h3>
                  
                  <div className="bg-gray-800 rounded-xl p-4 mb-6 border border-gray-700">
                     {filePreview ? <img src={filePreview} className="max-h-48 mx-auto rounded-lg shadow-sm" /> : <div className="flex justify-center py-8"><File size={48} className="opacity-50 text-white" /></div>}
                     <p className="text-sm truncate text-center mt-3 font-medium opacity-80 text-gray-300">{fileToSend.name}</p>
                     
                     {/* RESTORED PERMISSION CHECKBOXES */}
                     <div className="mt-4 space-y-2 border-t border-gray-700 pt-3">
                        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-white">
                           <input type="checkbox" checked={allowDownload} onChange={e => setAllowDownload(e.target.checked)} className="rounded bg-gray-700 border-gray-600 focus:ring-2" style={{ color: `var(--theme-color)`, borderColor: `var(--theme-color)` }} />
                           Allow Download
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-400 cursor-pointer hover:text-white">
                           <input type="checkbox" checked={allowForward} onChange={e => setAllowForward(e.target.checked)} className="rounded bg-gray-700 border-gray-600 focus:ring-2" style={{ color: `var(--theme-color)`, borderColor: `var(--theme-color)` }} />
                           Allow Forward
                        </label>
                     </div>
                  </div>

                  <div className="flex gap-3">
                     <button onClick={() => setFileToSend(null)} className="flex-1 py-3 border border-gray-700 rounded-xl font-medium text-gray-400 hover:text-white hover:bg-gray-800">Cancel</button>
                     <button onClick={handleConfirmSendFile} className="flex-1 py-3 text-white rounded-xl font-bold shadow-lg transition-all transform hover:scale-105" style={{ backgroundColor: `var(--theme-color)` }}>Send</button>
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>

      {/* FORWARDING MODAL */}
      <AnimatePresence>
         {isForwarding && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
               <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} 
                  className={`w-full max-w-sm p-6 rounded-2xl shadow-2xl border ${darkMode ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
                  <div className="flex justify-between items-center mb-4">
                     <h3 className="font-bold text-lg">Forward to...</h3>
                     <button onClick={() => setIsForwarding(false)}><X className="text-gray-500" /></button>
                  </div>
                  <div className="max-h-60 overflow-y-auto space-y-2">
                     {users.map(u => (
                        <button key={u.uid} onClick={() => handleForwardMessage(u)} 
                           className="w-full flex items-center p-3 hover:bg-gray-800 rounded-xl transition-colors text-left">
                           <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center overflow-hidden mr-3">
                              {u.photoURL ? <img src={u.photoURL} className="w-full h-full object-cover"/> : <User className="text-gray-400"/>}
                           </div>
                           <span className="text-gray-200 font-medium">{u.displayName}</span>
                        </button>
                     ))}
                  </div>
               </motion.div>
            </div>
         )}
      </AnimatePresence>

      {/* CALL UI OVERLAY */}
      <AnimatePresence>
        {showCallUI && selectedChatUser && (
          <div className="fixed top-24 right-4 z-50 w-full max-w-xs sm:max-w-sm">
            <CallUI
              otherUserId={selectedChatUser.uid}
              otherUserName={selectedChatUser.displayName}
              incomingCallData={incomingCallData} 
              onClose={() => { setShowCallUI(false); setIncomingCallData(null); }}
            />
          </div>
        )}
      </AnimatePresence>
      
    </div>
  );
};

export default Dashboard;
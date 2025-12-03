// client/src/pages/Dashboard.js
import CryptoJS from 'crypto-js';
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CallUI from '../components/VoiceCall/CallUI';
import SignalingListener from '../components/SignalingListener';

import {
  LogOut, User, MessageSquare, Paperclip, Send, File, Download, X, Sun, Moon, Trash2, Check, CheckCheck, Pencil, Mic, Square, Camera, Search, Share, ArrowLeft, Info, Clock, CornerUpLeft, Database, PhoneCall
} from 'lucide-react';

import { storage, db } from '../firebase';
import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
import {
  collection, addDoc, onSnapshot, query, orderBy, getDocs, where, doc, writeBatch, updateDoc, getDoc, limit, setDoc
} from 'firebase/firestore';
import { updateProfile } from "firebase/auth";

const themes = {
  blue: { name: 'Blue', color: 'bg-blue-500', config: { '--color-primary-DEFAULT': '59 130 246', '--color-primary-light': '219 234 254', '--color-primary-dark': '29 78 216', '--color-background-alt': '239 246 255' } },
  green: { name: 'Green', color: 'bg-green-500', config: { '--color-primary-DEFAULT': '34 197 94', '--color-primary-light': '220 252 231', '--color-primary-dark': '22 101 52', '--color-background-alt': '240 253 244' } },
  purple: { name: 'Purple', color: 'bg-purple-500', config: { '--color-primary-DEFAULT': '168 85 247', '--color-primary-light': '243 232 255', '--color-primary-dark': '107 33 168', '--color-background-alt': '250 245 255' } },
};

const disappearingMessageDurations = {
  off: { label: 'Off', duration: 0 },
  '24h': { label: '24 hours', duration: 24 * 60 * 60 * 1000 },
  '7d': { label: '7 days', duration: 7 * 24 * 60 * 60 * 1000 },
  '30d': { label: '30 days', duration: 30 * 24 * 60 * 60 * 1000 },
};

const getSecretKey = (chatRoomId) => {
  return CryptoJS.SHA256(chatRoomId).toString();
};
const encryptMessage = (text, chatRoomId) => {
  const secretKey = getSecretKey(chatRoomId);
  return CryptoJS.AES.encrypt(text, secretKey).toString();
};
const decryptMessage = (encryptedText, chatRoomId) => {
  try {
    if (!encryptedText) return "";
    const secretKey = getSecretKey(chatRoomId);
    const bytes = CryptoJS.AES.decrypt(encryptedText, secretKey);
    const originalText = bytes.toString(CryptoJS.enc.Utf8);
    if (!originalText) { return "[Decryption Error]"; }
    return originalText;
  } catch (error) {
    console.error("Decryption failed:", error);
    return "[Message could not be decrypted]";
  }
};

const Dashboard = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const [notification, setNotification] = useState(null);
  const [darkMode, setDarkMode] = useState(false);
  const [users, setUsers] = useState([]);
  const [selectedChatUser, setSelectedChatUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [loadingChat, setLoadingChat] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const profilePicInputRef = useRef(null);
  const wallpaperInputRef = useRef(null);
  const textareaRef = useRef(null);
  const [editingMessageId, setEditingMessageId] = useState(null);
  const [editingMessageContent, setEditingMessageContent] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const audioChunksRef = useRef([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState('');
  const [profilePicFile, setProfilePicFile] = useState(null);
  const [profilePicPreview, setProfilePicPreview] = useState('');
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false);
  const [theme, setTheme] = useState('blue');
  const [wallpaper, setWallpaper] = useState('');
  const [selectedTheme, setSelectedTheme] = useState('blue');
  const [wallpaperFile, setWallpaperFile] = useState(null);
  const [wallpaperPreview, setWallpaperPreview] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [messageToForward, setMessageToForward] = useState(null);
  const [isForwarding, setIsForwarding] = useState(false);
  const [messageInfo, setMessageInfo] = useState(null);
  const [viewingMessage, setViewingMessage] = useState(null);
  const [fileToSend, setFileToSend] = useState(null);
  const [allowDownload, setAllowDownload] = useState(true);
  const [allowForward, setAllowForward] = useState(true);
  const [filePreview, setFilePreview] = useState('');
  const [replyingTo, setReplyingTo] = useState(null);
  const [activeMessageMenu, setActiveMessageMenu] = useState(null);
  const [isRecipientTyping, setIsRecipientTyping] = useState(false);
  const typingTimeoutRef = useRef(null);
  const [isDisappearingModalOpen, setIsDisappearingModalOpen] = useState(false);
  const [currentChatConfig, setCurrentChatConfig] = useState(null);
  const [userPreferences, setUserPreferences] = useState({});
  const [selectedBackupFrequency, setSelectedBackupFrequency] = useState('off');
  const [showCallUI, setShowCallUI] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Failed to log out:', error);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isRecipientTyping]);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [newMessage]);

  const bringUserToTop = (userId) => {
    setUsers(prevUsers => {
      const userIndex = prevUsers.findIndex(u => u.uid === userId);
      if (userIndex === -1) return prevUsers;
      const user = prevUsers[userIndex];
      const updatedUsers = [user, ...prevUsers.slice(0, userIndex), ...prevUsers.slice(userIndex + 1)];
      return updatedUsers;
    });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChatUser) return;
    const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
    const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
    try {
      const encryptedText = encryptMessage(newMessage, chatRoomId);

      const messageData = {
        type: 'text', text: encryptedText, senderId: currentUser.uid, timestamp: new Date().toISOString(),
        read: false, delivered: false, edited: false, deleted: false, readAt: null, deliveredAt: null,
      };

      if (currentChatConfig?.disappearingMessages?.duration > 0) {
        const duration = currentChatConfig.disappearingMessages.duration;
        messageData.disappearAt = new Date(Date.now() + duration);
      }

      if (replyingTo) {
        messageData.replyTo = {
          messageId: replyingTo.id, senderId: replyingTo.senderId, text: replyingTo.text || null,
          fileType: replyingTo.fileType || null, fileName: replyingTo.fileName || null,
          senderName: replyingTo.senderId === currentUser.uid ? currentUser.displayName : selectedChatUser.displayName,
        };
      }

      await addDoc(messagesRef, messageData);
      setNewMessage("");
      setReplyingTo(null);
      bringUserToTop(selectedChatUser.uid);
    } catch (error) {
      console.error("Error sending message:", error);
      setNotification({ type: 'error', message: 'Failed to send message.' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setAllowDownload(true);
    setAllowForward(true);
    if (file.type.startsWith('image/')) {
      setFilePreview(URL.createObjectURL(file));
    } else {
      setFilePreview('');
    }
    setFileToSend(file);
    e.target.value = null;
  };

  // Use resumable upload for reliability & better error info
  const handleConfirmSendFile = async () => {
    const file = fileToSend;
    if (!file || !selectedChatUser) {
      setNotification({ type: 'error', message: 'No file or no chat selected.' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      setNotification({ type: 'error', message: 'File size must be less than 50MB' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }
    setFileToSend(null);
    setNotification({ type: 'info', message: `Uploading "${file.name}"...` });
    try {
      const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
      const timestamp = Date.now();
      const fileName = `${timestamp}_${file.name}`;
      const storageRefPath = `uploads/chat/${chatRoomId}/${fileName}`;
      const storageRefObj = ref(storage, storageRefPath);

      const metadata = { contentType: file.type || 'application/octet-stream' };
      const uploadTask = uploadBytesResumable(storageRefObj, file, metadata);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.debug(`File upload ${progress.toFixed(1)}%`);
        },
        (error) => {
          console.error('Upload error', error.code, error.message, error);
          setNotification({ type: 'error', message: `File upload failed: ${error.code || 'unknown'}` });
          setTimeout(() => setNotification(null), 4000);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
            const encryptedFileName = encryptMessage(file.name, chatRoomId);

            const messageData = {
              type: 'file', fileName: encryptedFileName, fileSize: file.size, fileType: file.type, fileUrl: downloadURL,
              senderId: currentUser.uid, timestamp: new Date().toISOString(),
              read: false, delivered: false, edited: false, deleted: false, readAt: null, deliveredAt: null,
              allowDownload: allowDownload, allowForward: allowForward,
            };

            if (currentChatConfig?.disappearingMessages?.duration > 0) {
              const duration = currentChatConfig.disappearingMessages.duration;
              messageData.disappearAt = new Date(Date.now() + duration);
            }

            if (replyingTo) {
              messageData.replyTo = {
                messageId: replyingTo.id, senderId: replyingTo.senderId, text: replyingTo.text || null,
                fileType: replyingTo.fileType || null, fileName: replyingTo.fileName || null,
                senderName: replyingTo.senderId === currentUser.uid ? currentUser.displayName : selectedChatUser.displayName,
              };
            }

            await addDoc(messagesRef, messageData);
            setReplyingTo(null);
            setNotification({ type: 'success', message: `File "${file.name}" sent successfully!` });
            bringUserToTop(selectedChatUser.uid);
          } catch (err) {
            console.error('Finalizing file message failed', err);
            setNotification({ type: 'error', message: 'File upload failed during finalization.' });
            setTimeout(() => setNotification(null), 3000);
          }
        }
      );

    } catch (error) {
      console.error('File upload failed (outer):', error);
      setNotification({ type: 'error', message: 'File upload failed: ' + (error?.message || error) });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const startEditing = (message) => {
    setActiveMessageMenu(null);
    const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
    const decryptedText = decryptMessage(message.text, chatRoomId);
    setEditingMessageId(message.id);
    setEditingMessageContent(decryptedText);
  };
  const cancelEditing = () => { setEditingMessageId(null); setEditingMessageContent(""); };

  const handleEditMessage = async (messageId) => {
    if (!editingMessageContent.trim()) return;
    try {
      const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
      const encryptedText = encryptMessage(editingMessageContent, chatRoomId);
      const messageRef = doc(db, 'chats', chatRoomId, 'messages', messageId);
      await updateDoc(messageRef, { text: encryptedText, edited: true });
      cancelEditing();
    } catch (error) {
      console.error('Error editing message:', error);
      setNotification({ type: 'error', message: 'Failed to edit message.' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleDeleteMessage = async (messageId) => {
    setActiveMessageMenu(null);
    if (!window.confirm('Are you sure you want to delete this message?')) return;
    try {
      const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
      const messageRef = doc(db, 'chats', chatRoomId, 'messages', messageId);
      const deletedText = encryptMessage("This message was deleted.", chatRoomId);
      await updateDoc(messageRef, { text: deletedText, type: 'text', deleted: true });
      setNotification({ type: 'success', message: 'Message deleted successfully.' });
    } catch (error) {
      console.error('Error deleting message:', error);
      setNotification({ type: 'error', message: 'Failed to delete message.' });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };
   const selectChatUser = (user) => { setSelectedChatUser(user); setLoadingChat(true); setMessages([]); cancelEditing(); };
setShowCallUI(false);
  const formatFileSize = (bytes) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));s
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const handleStartRecording = async () => {
    if (!selectedChatUser) {
      setNotification({ type: 'error', message: 'Please select a user to send a voice message.' });
      setTimeout(() => setNotification(null), 3000); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      setMediaRecorder(recorder);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size > 0) audioChunksRef.current.push(event.data); };
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        audioChunksRef.current = [];
        stream.getTracks().forEach(track => track.stop());
        await handleSendAudioMessage(audioBlob);
      };
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      setNotification({ type: 'error', message: 'Microphone access was denied.' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleStopRecording = () => { if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop(); setIsRecording(false); };

  // Resumable audio upload as well
  const handleSendAudioMessage = async (audioBlob) => {
    setNotification({ type: 'info', message: `Uploading voice message...` });
    try {
      const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
      const timestamp = Date.now();
      const fileName = `${timestamp}_voice-message.webm`;
      const storageRefPath = `uploads/chat/${chatRoomId}/${fileName}`;
      const storageRefObj = ref(storage, storageRefPath);

      const metadata = { contentType: 'audio/webm' };
      const uploadTask = uploadBytesResumable(storageRefObj, audioBlob, metadata);

      uploadTask.on('state_changed',
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.debug(`Audio upload ${progress.toFixed(1)}%`);
        },
        (error) => {
          console.error('Audio upload failed:', error.code, error.message, error);
          setNotification({ type: 'error', message: 'Voice message upload failed: ' + (error.code || 'unknown') });
          setTimeout(() => setNotification(null), 3000);
        },
        async () => {
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
            const messageData = {
              type: 'audio', fileUrl: downloadURL, senderId: currentUser.uid, timestamp: new Date().toISOString(),
              read: false, delivered: false, edited: false, deleted: false, readAt: null, deliveredAt: null,
            };

            if (currentChatConfig?.disappearingMessages?.duration > 0) {
              const duration = currentChatConfig.disappearingMessages.duration;
              messageData.disappearAt = new Date(Date.now() + duration);
            }

            await addDoc(messagesRef, messageData);
            setNotification({ type: 'success', message: `Voice message sent!` });
            bringUserToTop(selectedChatUser.uid);
          } catch (err) {
            console.error('Audio finalize failed', err);
            setNotification({ type: 'error', message: 'Voice message upload failed during finalization.' });
            setTimeout(() => setNotification(null), 3000);
          }
        }
      );

    } catch (error) {
      console.error('Voice message upload failed (outer):', error);
      setNotification({ type: 'error', message: 'Voice message upload failed: ' + (error?.message || error) });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const handleSetDisappearingTimer = async (duration) => {
    if (!selectedChatUser) return;
    const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
    const chatRoomRef = doc(db, 'chats', chatRoomId);
    const messagesRef = collection(db, 'chats', chatRoomId, 'messages');

    try {
      await setDoc(chatRoomRef, {
        disappearingMessages: {
          duration: duration,
          setBy: currentUser.uid,
          setAt: new Date().toISOString()
        }
      }, { merge: true });

      const durationEntry = Object.values(disappearingMessageDurations).find(d => d.duration === duration);
      const durationText = durationEntry ? durationEntry.label.toLowerCase() : '';

      const systemMessageText = duration > 0
        ? `${currentUser.displayName || 'You'} turned on disappearing messages. New messages will disappear from this chat after ${durationText}.`
        : `${currentUser.displayName || 'You'} turned off disappearing messages.`;

      await addDoc(messagesRef, {
        type: 'system',
        text: systemMessageText,
        timestamp: new Date().toISOString(),
      });

      setIsDisappearingModalOpen(false);
    } catch (error) {
      console.error("Error setting disappearing messages timer:", error);
      setNotification({ type: 'error', message: 'Failed to update settings.' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const openProfileModal = () => {
    setNewDisplayName(currentUser.displayName || '');
    setProfilePicFile(null);
    setProfilePicPreview(currentUser.photoURL || '');
    setSelectedTheme(userPreferences.theme || 'blue');
    setWallpaperFile(null);
    setWallpaperPreview(userPreferences.wallpaper || '');
    setSelectedBackupFrequency(userPreferences.backupFrequency || 'off');
    setIsProfileModalOpen(true);
  };

  const handleProfilePicChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setProfilePicFile(file);
      setProfilePicPreview(URL.createObjectURL(file));
    }
  };

  const handleWallpaperChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setWallpaperFile(file);
      setWallpaperPreview(URL.createObjectURL(file));
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    if (!newDisplayName.trim()) {
      setNotification({ type: 'error', message: 'Display name cannot be empty.' });
      setTimeout(() => setNotification(null), 3000); return;
    }
    setIsUpdatingProfile(true);
    let photoURL = currentUser.photoURL;
    let newWallpaperURL = wallpaper;
    try {
      if (profilePicFile) {
        const picStorageRef = ref(storage, `profile-pictures/${currentUser.uid}`);
        await uploadBytes(picStorageRef, profilePicFile, { contentType: profilePicFile.type });
        photoURL = await getDownloadURL(picStorageRef);
      }
      if (wallpaperFile) {
        const wallpaperStorageRef = ref(storage, `wallpapers/${currentUser.uid}`);
        await uploadBytes(wallpaperStorageRef, wallpaperFile, { contentType: wallpaperFile.type });
        newWallpaperURL = await getDownloadURL(wallpaperStorageRef);
      } else if (wallpaperPreview === '') {
        newWallpaperURL = '';
      }
      const authUpdateData = {};
      if (newDisplayName !== currentUser.displayName) authUpdateData.displayName = newDisplayName;
      if (photoURL !== currentUser.photoURL) authUpdateData.photoURL = photoURL;
      if (Object.keys(authUpdateData).length > 0) await updateProfile(currentUser, authUpdateData);

      const userDocRef = doc(db, 'users', currentUser.uid);
      const updatedPreferences = {
        theme: selectedTheme,
        wallpaper: newWallpaperURL,
        backupFrequency: selectedBackupFrequency,
      };

      await updateDoc(userDocRef, {
        displayName: newDisplayName,
        photoURL: photoURL,
        preferences: updatedPreferences
      });

      setTheme(selectedTheme);
      setWallpaper(newWallpaperURL);
      setUserPreferences(updatedPreferences);

      setNotification({ type: 'success', message: 'Profile updated successfully!' });
      setIsProfileModalOpen(false);
    } catch (error) {
      console.error("Error updating profile:", error);
      setNotification({ type: 'error', message: 'Failed to update profile.' });
    } finally {
      setIsUpdatingProfile(false);
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const openForwardModal = (message) => {
    setMessageToForward(message);
    setIsForwarding(true);
  };

  const closeForwardModal = () => {
    setMessageToForward(null);
    setIsForwarding(false);
  };

  const handleForwardMessage = async (targetUser) => {
    if (!messageToForward || !targetUser) return;
    const targetChatRoomId = [currentUser.uid, targetUser.uid].sort().join('_');
    const messagesRef = collection(db, 'chats', targetChatRoomId, 'messages');
    try {
      const forwardedMessage = {
        ...messageToForward, senderId: currentUser.uid, timestamp: new Date().toISOString(),
        read: false, delivered: false, edited: false, deleted: false, forwarded: true,
        readAt: null, deliveredAt: null,
      };
      delete forwardedMessage.id;
      const originalChatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
      if (forwardedMessage.type === 'text') {
        const decryptedOriginalText = decryptMessage(forwardedMessage.text, originalChatRoomId);
        forwardedMessage.text = encryptMessage(decryptedOriginalText, targetChatRoomId);
      }
      if (forwardedMessage.type === 'file' && forwardedMessage.fileName) {
        const decryptedOriginalFileName = decryptMessage(forwardedMessage.fileName, originalChatRoomId);
        forwardedMessage.fileName = encryptMessage(decryptedOriginalFileName, targetChatRoomId);
      }
      await addDoc(messagesRef, forwardedMessage);
      setNotification({ type: 'success', message: `Message forwarded to ${targetUser.displayName || targetUser.email}!` });
      closeForwardModal();
      bringUserToTop(targetUser.uid);
    } catch (error) {
      console.error("Error forwarding message:", error);
      setNotification({ type: 'error', message: 'Failed to forward message.' });
    } finally {
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const toggleDarkMode = () => {
    setDarkMode(!darkMode);
    document.documentElement.classList.toggle('dark', !darkMode);
  };

  useEffect(() => {
    const themeConfig = themes[theme].config;
    for (const key in themeConfig) {
      document.documentElement.style.setProperty(key, themeConfig[key]);
    }
  }, [theme]);

  useEffect(() => {
    if (!currentUser) return;
    const fetchInitialData = async () => {
      try {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          if (data.preferences) {
            setUserPreferences(data.preferences);
            setTheme(data.preferences.theme || 'blue');
            setWallpaper(data.preferences.wallpaper || '');
          }
        }
        const usersRef = collection(db, 'users');
        const querySnapshot = await getDocs(usersRef);
        const userList = querySnapshot.docs
          .map(doc => ({ ...doc.data(), id: doc.id }))
          .filter(user => user.uid !== currentUser.uid);
        const usersWithLastMessage = await Promise.all(
          userList.map(async (user) => {
            const chatRoomId = [currentUser.uid, user.uid].sort().join('_');
            const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
            const q = query(messagesRef, orderBy('timestamp', 'desc'), limit(1));
            const lastMessageSnapshot = await getDocs(q);
            let lastMessageTimestamp = 0;
            if (!lastMessageSnapshot.empty) {
              lastMessageTimestamp = new Date(lastMessageSnapshot.docs[0].data().timestamp).getTime();
            }
            return { ...user, lastMessageTimestamp };
          })
        );
        usersWithLastMessage.sort((a, b) => b.lastMessageTimestamp - a.lastMessageTimestamp);
        setUsers(usersWithLastMessage);
      } catch (error) {
        console.error("Error fetching initial data:", error);
        setNotification({ type: 'error', message: 'Failed to load user data.' });
        setTimeout(() => setNotification(null), 3000);
      }
    };
    fetchInitialData();
  }, [currentUser]);

  useEffect(() => {
    if (!selectedChatUser || !currentUser) return;
    const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
    const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
    const q = query(messagesRef, orderBy('timestamp'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMessages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(fetchedMessages);
      setLoadingChat(false);
      const batch = writeBatch(db);
      let batchHasWrites = false;
      const now = new Date().toISOString();
      snapshot.docs.forEach((doc) => {
        const msg = doc.data();
        if (msg.senderId === selectedChatUser.uid && !msg.read) {
          const updateData = { read: true, readAt: now };
          if (!msg.delivered) {
            updateData.delivered = true;
            updateData.deliveredAt = now;
          }
          batch.update(doc.ref, updateData);
          batchHasWrites = true;
        }
      });
      if (batchHasWrites) {
        batch.commit().catch(err => console.error("Error updating message statuses:", err));
      }
    });
    return () => unsubscribe();
  }, [selectedChatUser, currentUser]);

  useEffect(() => {
    if (!currentUser || users.length === 0) return;
    const unsubscribers = users.map(user => {
      const chatRoomId = [currentUser.uid, user.uid].sort().join('_');
      const messagesRef = collection(db, 'chats', chatRoomId, 'messages');
      const q = query(messagesRef, where('senderId', '==', user.uid), where('read', '==', false));
      return onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          bringUserToTop(user.uid);
        }
        setUnreadCounts(prevCounts => ({ ...prevCounts, [user.uid]: snapshot.size }));
        if (snapshot.size > 0 && selectedChatUser?.uid !== user.uid) {
          const batch = writeBatch(db);
          let hasUpdates = false;
          const now = new Date().toISOString();
          snapshot.docs.forEach(doc => {
            if (!doc.data().delivered) {
              batch.update(doc.ref, { delivered: true, deliveredAt: now });
              hasUpdates = true;
            }
          });
          if (hasUpdates) {
            batch.commit().catch(err => console.error("Error setting delivered status:", err));
          }
        }
      });
    });
    return () => unsubscribers.forEach(unsub => unsub());
  }, [users, currentUser, selectedChatUser]);

  useEffect(() => {
    const updateTypingStatus = async (isTyping) => {
      if (!selectedChatUser) return;
      try {
        const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
        const chatRoomRef = doc(db, 'chats', chatRoomId);
        await setDoc(chatRoomRef, {
          typingStatus: { [currentUser.uid]: isTyping }
        }, { merge: true });
      } catch (error) {
        console.error("Could not update typing status:", error);
      }
    };

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    if (newMessage.trim()) {
      updateTypingStatus(true);
      typingTimeoutRef.current = setTimeout(() => {
        updateTypingStatus(false);
      }, 2000);
    } else {
      updateTypingStatus(false);
    }

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      updateTypingStatus(false);
    };
  }, [newMessage, selectedChatUser, currentUser]);

  useEffect(() => {
    if (!selectedChatUser || !currentUser) {
      setCurrentChatConfig(null);
      setIsRecipientTyping(false);
      return;
    };

    const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
    const chatRoomRef = doc(db, 'chats', chatRoomId);

    const unsubscribe = onSnapshot(chatRoomRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentChatConfig(data);
        const recipientIsTyping = data.typingStatus?.[selectedChatUser.uid] || false;
        setIsRecipientTyping(recipientIsTyping);
      } else {
        setCurrentChatConfig(null);
        setIsRecipientTyping(false);
      }
    });

    return () => {
      unsubscribe();
      setCurrentChatConfig(null);
      setIsRecipientTyping(false);
    };
  }, [selectedChatUser, currentUser]);

  if (!currentUser) { return (<div className="flex items-center justify-center min-h-screen bg-gray-900"><p className="text-lg text-gray-300">Loading Dashboard...</p></div>); }
<SignalingListener
  signalingUrl={process.env.REACT_APP_SIGNAL_URL || "http://localhost:5000"}
  enableSignalEncryption={true}
  onIncomingCall={(callerUid, payload) => {
    const found = users.find(u => u.uid === callerUid);

    // Set chat user so we know who is calling
    if (found) {
      setSelectedChatUser(found);
    } else {
      setSelectedChatUser({ uid: callerUid, displayName: callerUid });
    }

    // Display incoming call UI
    setShowCallUI(true);

    // Notification
    setNotification({
      type: 'info',
      message: `Incoming call from ${found?.displayName || callerUid}`
    });

    setTimeout(() => setNotification(null), 3500);
  }}
/>
  const modalVariants = {
    hidden: { scale: 0.9, opacity: 0 },
    visible: { scale: 1, opacity: 1, transition: { duration: 0.3, ease: 'easeOut' } },
    exit: { scale: 0.9, opacity: 0, transition: { duration: 0.2, ease: 'easeIn' } },
  };

  const filteredUsers = users.filter(user =>
    (user.displayName?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
    (user.email?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  // --- RENDER ---
  return (
    <div className={`flex flex-col h-screen transition-colors duration-300 ${darkMode ? 'bg-gray-900 text-gray-200' : 'bg-background-alt text-gray-800'}`}>
      <motion.header className={`shadow-sm border-b transition-colors duration-300 flex-shrink-0 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="max-w-full mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-3">
            <motion.div className="flex items-center space-x-3">
              <div className={`w-10 h-10 bg-primary rounded-lg flex items-center justify-center`}><MessageSquare className="w-6 h-6 text-white" /></div>
              <h1 className={`text-2xl font-bold transition-colors duration-300 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Chat App</h1>
            </motion.div>

            <div className="flex items-center space-x-2 sm:space-x-4">
              <motion.button onClick={toggleDarkMode} className={`p-2 rounded-lg transition-colors ${darkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'}`} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>
                {darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
              </motion.button>

              {/* single call button in header (Phone icon) */}
              <motion.button
               onClick={() => {
  if (!selectedChatUser) {
    setNotification({ type: 'info', message: 'Select a user to start a call.' });
    setTimeout(() => setNotification(null), 3000);
    return;
  }

  // Open CallUI and start ringing state
  setShowCallUI(true);

  setNotification({
    type: 'info',
    message: `Calling ${selectedChatUser.displayName || selectedChatUser.email}`
  });
  setTimeout(() => setNotification(null), 2500);
}}
                className="p-2 rounded-lg transition-colors border hover:bg-gray-100"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Start Call"
              >
                <PhoneCall className="w-5 h-5" />
              </motion.button>

              <motion.button onClick={handleLogout} className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
                <LogOut className="w-4 h-4" /><span>Logout</span>
              </motion.button>
            </div>
          </div>
        </div>
      </motion.header>

      {notification && (<motion.div initial={{ opacity: 0, y: -50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -50 }} className={`fixed top-20 right-4 z-50 px-6 py-3 rounded-lg shadow-lg ${notification.type === 'success' ? 'bg-green-500 text-white' : notification.type === 'info' ? 'bg-blue-500 text-white' : 'bg-red-500 text-white'}`}><div className="flex items-center space-x-2"><span>{notification.type === 'success' ? '✅' : notification.type === 'info' ? 'ℹ️' : '❌'}</span><span>{notification.message}</span></div></motion.div>)}

      <div className="flex flex-1 overflow-hidden">
        <div className={`w-full md:w-72 flex-shrink-0 flex flex-col border-r transition-all duration-300 ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} ${selectedChatUser ? 'hidden md:flex' : 'flex'}`}>
          <div className="p-4 flex-grow overflow-y-auto flex flex-col">
            <h3 className={`font-bold mb-4 px-3 text-lg ${darkMode ? 'text-white' : 'text-gray-900'}`}>Direct Messages</h3>
            <div className="relative mb-4 px-1">
              <Search className={`absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`} />
              <input type="text" placeholder="Search users..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className={`w-full pl-10 pr-4 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-100 border-gray-200'}`} />
            </div>
            <ul className="space-y-1 flex-grow overflow-y-auto custom-scrollbar">
              {filteredUsers.length > 0 ? filteredUsers.map(user => {
                const unreadCount = unreadCounts[user.uid] || 0;
                return (
                  <li key={user.uid}>
                    <motion.button onClick={() => selectChatUser(user)} className={`w-full text-left p-2 rounded-lg flex items-center justify-between space-x-3 transition-colors ${selectedChatUser?.uid === user.uid ? 'bg-primary text-white' : (darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-100')}`} whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                      <div className="flex items-center space-x-3 overflow-hidden">
                        <div className="w-8 h-8 rounded-full flex-shrink-0 relative">
                          {user.photoURL ? (<img src={user.photoURL} alt={user.displayName} className="w-full h-full rounded-full object-cover" />) : (<div className={`w-full h-full rounded-full flex items-center justify-center ${selectedChatUser?.uid === user.uid ? 'bg-white text-primary' : (darkMode ? 'bg-gray-600' : 'bg-gray-200')}`}><User className="w-4 h-4" /></div>)}
                        </div>
                        <span className={`flex-1 truncate font-medium ${selectedChatUser?.uid === user.uid ? 'text-white' : ''}`}>{user.displayName || user.email}</span>
                      </div>
                      {unreadCount > 0 && (<span className="bg-red-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center flex-shrink-0">{unreadCount}</span>)}
                    </motion.button>
                  </li>
                );
              }) : <p className={`text-sm px-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{users.length > 0 ? "No users match your search." : "No other users found."}</p>}
            </ul>
          </div>
          <div className={`p-3 flex-shrink-0 border-t ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <motion.button onClick={openProfileModal} className={`w-full text-left p-2 rounded-lg flex items-center space-x-3 transition-colors ${darkMode ? 'hover:bg-gray-700/50' : 'hover:bg-gray-200'}`}>
              <div className="w-10 h-10 rounded-full flex-shrink-0 relative">{currentUser.photoURL ? (<img src={currentUser.photoURL} alt="Your profile" className="w-full h-full rounded-full object-cover" />) : (<div className={`w-full h-full rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-600' : 'bg-gray-300'}`}><User className="w-5 h-5" /></div>)}</div>
              <div className="flex-1 overflow-hidden">
                <p className="font-bold truncate text-sm">{currentUser.displayName || currentUser.email.split('@')[0]}</p>
                <p className={`text-xs truncate ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Online</p>
              </div>
            </motion.button>
          </div>
        </div>

        <div className={`flex-1 flex flex-col ${darkMode ? 'bg-gray-700' : 'bg-background-alt'} ${selectedChatUser ? 'flex' : 'hidden md:flex'}`}>
          {!selectedChatUser ? (
            <div className="flex flex-col items-center justify-center h-full"><MessageSquare className={`w-16 h-16 mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-300'}`} /><h3 className={`text-lg font-medium mb-2 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Select a user to start chatting</h3><p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>Your messages will appear here.</p></div>
          ) : (
            <>
              <div className={`flex items-center justify-between text-xl font-bold p-4 border-b ${darkMode ? 'bg-gray-800 border-gray-700' : 'bg-transparent border-gray-200/80'}`}>
                <div className="flex items-center">
                  <button onClick={() => setSelectedChatUser(null)} className={`md:hidden p-2 -ml-2 mr-2 rounded-full ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}><ArrowLeft size={20} /></button>
                  <h3>Chat with {selectedChatUser.displayName || selectedChatUser.email.split('@')[0]}</h3>
                </div>
                <div className="flex items-center">
                  <motion.button onClick={() => setIsDisappearingModalOpen(true)} className={`p-2 rounded-full relative ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.95 }} title="Disappearing Messages">
                    <Clock size={20} />
                    {currentChatConfig?.disappearingMessages?.duration > 0 && (
                      <span className="absolute top-0 right-0 block h-2 w-2 rounded-full bg-primary ring-2 ring-white dark:ring-gray-800" />
                    )}
                  </motion.button>
                </div>
              </div>

              <div className={`chat-messages-container flex-1 overflow-y-auto p-4 space-y-4 bg-cover bg-center relative`} style={{ backgroundImage: wallpaper ? `url(${wallpaper})` : 'none' }}>
                <div className="relative z-10 space-y-4">
                  {loadingChat
                    ? <div />
                    : messages.map((msg) => {
                      if (msg.type === 'system') {
                        return (
                          <div key={msg.id} className="text-center my-2">
                            <span className={`text-xs px-3 py-1.5 rounded-full ${darkMode ? 'bg-gray-900 text-gray-300' : 'bg-blue-100 text-blue-800'}`}>
                              {msg.text}
                            </span>
                          </div>
                        );
                      }
                      const chatRoomId = [currentUser.uid, selectedChatUser.uid].sort().join('_');
                      const decryptedText = msg.type === 'text' ? decryptMessage(msg.text, chatRoomId) : '';
                      const decryptedFileName = msg.type === 'file' && msg.fileName ? decryptMessage(msg.fileName, chatRoomId) : '';

                      return (
                        <div key={msg.id} id={msg.id} className={`flex ${msg.senderId === currentUser.uid ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-xs sm:max-w-sm md:max-w-lg relative group`}>
                            {editingMessageId === msg.id ? (
                              <div className="flex items-center space-x-2 w-full"><input type="text" value={editingMessageContent} onChange={(e) => setEditingMessageContent(e.target.value)} className={`flex-1 px-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-2 focus:ring-primary-dark ${darkMode ? 'bg-gray-600 border-gray-500' : 'bg-white border-gray-300'}`} onKeyDown={(e) => e.key === 'Enter' && handleEditMessage(msg.id)} /><motion.button onClick={() => handleEditMessage(msg.id)} whileTap={{ scale: 0.9 }} className="p-2 rounded-full bg-green-500 hover:bg-green-600 text-white"><Check className="w-4 h-4" /></motion.button><motion.button onClick={cancelEditing} whileTap={{ scale: 0.9 }} className="p-2 rounded-full bg-red-500 hover:bg-red-600 text-white"><X className="w-4 h-4" /></motion.button></div>
                            ) : (
                              <div className={`relative rounded-xl transition-colors shadow-sm ${msg.senderId === currentUser.uid ? 'bg-primary text-white' : darkMode ? 'bg-gray-900/80 text-gray-200' : 'bg-white text-gray-800'}`}>
                                {msg.replyTo && (
                                  <div className="p-2 text-sm opacity-80 border-l-4 border-white/50 ml-2 mr-2 mt-2 rounded bg-black/10 cursor-pointer" onClick={(e) => { e.stopPropagation(); document.getElementById(msg.replyTo.messageId)?.scrollIntoView({ behavior: 'smooth' })}}>
                                    <p className="font-bold text-xs">{msg.replyTo.senderName}</p>
                                    <p className="truncate text-xs">
                                      {msg.replyTo.fileType?.startsWith('image/') ? '📷 Photo' : msg.replyTo.fileType ? '📎 Attachment' : decryptMessage(msg.replyTo.text, chatRoomId)}
                                    </p>
                                  </div>
                                )}

                                <div className={`${msg.type === 'text' || msg.deleted ? 'p-3' : 'p-1.5 md:p-2'}`}>
                                  {msg.forwarded && <p className="text-xs opacity-70 mb-1 flex items-center gap-1"><Share size={12} /> Forwarded message</p>}
                                  {msg.type === 'text' ? (
                                    <p className={`text-sm break-words ${msg.deleted ? 'italic opacity-70' : ''}`}>{decryptedText}</p>
                                  ) : (
                                    <div>
                                      {msg.fileType?.startsWith('image/') ? (
                                        <img src={msg.fileUrl} alt={decryptedFileName} className="max-w-64 max-h-48 rounded-md object-cover cursor-pointer" onClick={(e) => { e.stopPropagation(); setViewingMessage(msg) }} onLoad={scrollToBottom} />
                                      ) : msg.fileType?.startsWith('video/') ? (
                                        <video src={msg.fileUrl} controls className="w-64 rounded-md" />
                                      ) : msg.type === 'audio' ? (
                                        <audio src={msg.fileUrl} controls className="w-64 h-12" />
                                      ) : (
                                        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer" className={`flex items-center space-x-3 p-3 rounded-lg ${msg.senderId === currentUser.uid ? 'bg-primary-dark' : (darkMode ? 'bg-gray-700' : 'bg-gray-300')}`}><File className="w-8 h-8 flex-shrink-0" /><div className="flex-1 overflow-hidden"><p className="font-semibold text-sm truncate">{decryptedFileName}</p><p className="text-xs opacity-80">{formatFileSize(msg.fileSize)}</p></div><Download className="w-5 h-5 opacity-70" /></a>
                                      )}
                                    </div>
                                  )}
                                </div>

                                {!msg.deleted && editingMessageId !== msg.id && (
                                  <div className={`absolute bottom-0 right-0 mb-1 mr-1 hidden group-hover:flex items-center space-x-1 p-1 rounded-full transition-opacity ${msg.senderId === currentUser.uid ? 'bg-primary-dark/50' : (darkMode ? 'bg-gray-700/50' : 'bg-gray-200/50')} backdrop-blur-sm z-20`}>
                                    <motion.button onClick={() => setReplyingTo(msg)} whileTap={{ scale: 0.9 }} className="p-1.5 rounded-full hover:bg-white/20" title="Reply"><CornerUpLeft className="w-4 h-4" /></motion.button>
                                    <motion.button onClick={() => setMessageInfo(msg)} whileTap={{ scale: 0.9 }} className="p-1.5 rounded-full hover:bg-white/20" title="Info"><Info className="w-4 h-4" /></motion.button>
                                    {(msg.allowForward ?? true) && (
                                      <motion.button onClick={() => openForwardModal(msg)} whileTap={{ scale: 0.9 }} className="p-1.5 rounded-full hover:bg-white/20" title="Forward"><Share className="w-4 h-4" /></motion.button>
                                    )}
                                    {msg.senderId === currentUser.uid && msg.type === 'text' && <motion.button onClick={() => startEditing(msg)} whileTap={{ scale: 0.9 }} className="p-1.5 rounded-full hover:bg-white/20" title="Edit"><Pencil className="w-4 h-4" /></motion.button>}
                                    {msg.senderId === currentUser.uid && <motion.button onClick={() => handleDeleteMessage(msg.id)} whileTap={{ scale: 0.9 }} className="p-1.5 rounded-full hover:bg-white/20" title="Delete"><Trash2 className="w-4 h-4" /></motion.button>}
                                  </div>
                                )}

                                <div className={`flex items-center mt-1 text-xs px-3 pb-1.5 ${msg.senderId === currentUser.uid ? 'justify-end' : 'justify-start'}`}>
                                  <span className={`${msg.senderId === currentUser.uid ? (darkMode ? 'text-blue-200' : 'text-gray-200') : darkMode ? 'text-gray-400' : 'text-gray-500'}`}>{msg.edited && !msg.deleted && <span className="mr-1">(edited)</span>}{msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                                  {msg.senderId === currentUser.uid && !msg.deleted && (
                                    <span className="ml-1.5">
                                      {msg.read ? <CheckCheck className="w-4 h-4 text-sky-400" />
                                        : msg.delivered ? <CheckCheck className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                                          : <Check className="w-4 h-4 text-gray-400 dark:text-gray-500" />}
                                    </span>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })
                  }
                  <div ref={messagesEndRef} />
                </div>
              </div>

              <div className="mt-auto">
                {replyingTo && (
                  <div className={`p-2 mx-2 sm:mx-4 border-t-2 border-primary ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm font-bold text-primary">Replying to {replyingTo.senderId === currentUser.uid ? 'yourself' : selectedChatUser.displayName}</p>
                        <p className={`text-xs truncate max-w-xs sm:max-w-md ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {replyingTo.fileType?.startsWith('image/') ? '📷 Photo' : replyingTo.fileType ? '📎 Attachment' : decryptMessage(replyingTo.text, [currentUser.uid, selectedChatUser.uid].sort().join('_'))}
                        </p>
                      </div>
                      <button onClick={() => setReplyingTo(null)} className="p-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-600"><X size={16}/></button>
                    </div>
                  </div>
                )}

                <AnimatePresence>
                  {isRecipientTyping && (
                    <motion.div
                      className="px-4 pt-1 text-sm text-gray-500 dark:text-gray-400"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="flex items-center space-x-2">
                        <div className="flex space-x-1">
                          <motion.span animate={{ y: [0, -2, 0] }} transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut" }} className="w-1.5 h-1.5 bg-gray-500 rounded-full"></motion.span>
                          <motion.span animate={{ y: [0, -2, 0] }} transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: 0.1 }} className="w-1.5 h-1.5 bg-gray-500 rounded-full"></motion.span>
                          <motion.span animate={{ y: [0, -2, 0] }} transition={{ duration: 0.9, repeat: Infinity, ease: "easeInOut", delay: 0.2 }} className="w-1.5 h-1.5 bg-gray-500 rounded-full"></motion.span>
                        </div>
                        <span>typing...</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <form onSubmit={handleSendMessage} className={`p-2 sm:p-4 flex items-start space-x-2 ${darkMode ? 'bg-gray-800' : 'bg-transparent'}`}>
                  <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
                  <motion.button type="button" onClick={() => fileInputRef.current?.click()} className={`p-3 rounded-xl transition-colors ${darkMode ? 'bg-gray-600 text-gray-300 hover:bg-gray-500' : 'bg-white hover:bg-gray-100'}`}><Paperclip className="w-5 h-5" /></motion.button>
                  <textarea ref={textareaRef} rows={1} value={newMessage} onChange={(e) => setNewMessage(e.target.value)}
                    onKeyDown={(e) => {
                      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
                      if (e.key === 'Enter' && !e.shiftKey && !isTouchDevice) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                    placeholder={isRecording ? "Recording..." : "Type a message..."}
                    disabled={isRecording}
                    className={`flex-1 px-4 py-2 rounded-xl border transition-colors focus:outline-none focus:ring-2 focus:ring-primary resize-none overflow-y-auto max-h-40 custom-scrollbar ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-300'}`}
                  />

                  {/* If input empty: show voice-record button; otherwise show send */}
                  {newMessage.trim() === '' ? (
                    isRecording ? (
                      <motion.button type="button" onClick={handleStopRecording} className="p-3 bg-red-600 text-white rounded-xl hover:bg-red-700 transition-colors" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}><Square className="w-5 h-5" /></motion.button>
                    ) : (
                      <motion.button type="button" onClick={handleStartRecording} className="p-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}><Mic className="w-5 h-5" /></motion.button>
                    )
                  ) : (
                    <motion.button type="submit" className="p-3 bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors" whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} disabled={!newMessage.trim()}><Send className="w-5 h-5" /></motion.button>
                  )}
                </form>
              </div>
            </>
          )}
        </div>
      </div>

      <AnimatePresence>
        {isProfileModalOpen && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setIsProfileModalOpen(false)}></div>
            <motion.div className={`relative rounded-2xl shadow-lg p-6 sm:p-8 w-full max-w-md mx-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`} variants={modalVariants} initial="hidden" animate="visible" exit="exit">
              <button onClick={() => setIsProfileModalOpen(false)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
              <form onSubmit={handleProfileUpdate} className="max-h-[80vh] overflow-y-auto custom-scrollbar pr-2">
                <div className="flex flex-col items-center mb-6">
                  <input type="file" accept="image/*" ref={profilePicInputRef} onChange={handleProfilePicChange} className="hidden" />
                  <motion.div onClick={() => profilePicInputRef.current.click()} className="relative w-32 h-32 rounded-full cursor-pointer group" whileHover={{ scale: 1.05 }}>
                    {profilePicPreview ? (<img src={profilePicPreview} alt="Profile preview" className="w-full h-full rounded-full object-cover" />) : (<div className={`w-full h-full rounded-full flex items-center justify-center ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}><User className="w-16 h-16 text-gray-400" /></div>)}
                    <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><Camera className="w-8 h-8 text-white" /></div>
                  </motion.div>
                </div>
                <div className="space-y-4">
                  <div>
                    <label htmlFor="displayName" className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Display Name</label>
                    <input id="displayName" type="text" value={newDisplayName} onChange={(e) => setNewDisplayName(e.target.value)} className={`w-full px-3 py-2 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`} />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Email</label>
                    <p className="text-gray-500 dark:text-gray-400 text-sm">{currentUser?.email}</p>
                  </div>
                </div>
                <hr className={`my-6 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`} />
                <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Appearance</h3>
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Theme Color</label>
                  <div className="flex items-center space-x-3">{Object.keys(themes).map(themeKey => (<button type="button" key={themeKey} onClick={() => setSelectedTheme(themeKey)} className={`w-8 h-8 rounded-full ${themes[themeKey].color} transition-transform duration-200 ${selectedTheme === themeKey ? 'ring-2 ring-offset-2 ring-primary dark:ring-offset-gray-800' : ''}`} title={themes[themeKey].name}></button>))}</div>
                </div>
                <div className="mt-4">
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Global Chat Wallpaper</label>
                  <div className="flex items-center space-x-2">
                    <input type="file" accept="image/*" ref={wallpaperInputRef} onChange={handleWallpaperChange} className="hidden" />
                    <button type="button" onClick={() => wallpaperInputRef.current.click()} className={`px-4 py-2 text-sm rounded-lg border ${darkMode ? 'border-gray-600 hover:bg-gray-700' : 'border-gray-300 hover:bg-gray-100'}`}>Upload</button>
                    <button type="button" onClick={() => { setWallpaperFile(null); setWallpaperPreview(''); }} className={`px-4 py-2 text-sm rounded-lg border ${darkMode ? 'border-red-500/50 text-red-400 hover:bg-red-500/10' : 'border-red-300 text-red-600 hover:bg-red-50'}`}>Remove</button>
                  </div>
                  {wallpaperPreview && <img src={wallpaperPreview} alt="Wallpaper preview" className="mt-4 w-full h-24 object-cover rounded-lg" />}
                </div>

                <hr className={`my-6 ${darkMode ? 'border-gray-700' : 'border-gray-200'}`} />
                <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Backup Settings</h3>
                <div className="space-y-3">
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    Choose how often you want to back up your chat history. This requires a backend setup (e.g., Cloud Functions) to execute.
                  </p>
                  <div className="flex flex-col space-y-2">
                    {['off', 'daily', 'weekly', 'monthly'].map((freq) => (
                      <label key={freq} className="flex items-center p-2 rounded-lg cursor-pointer transition-colors hover:bg-gray-100 dark:hover:bg-gray-700">
                        <input
                          type="radio"
                          name="backup-frequency"
                          className="h-4 w-4 text-primary focus:ring-primary border-gray-300 dark:border-gray-600"
                          checked={selectedBackupFrequency === freq}
                          onChange={() => setSelectedBackupFrequency(freq)}
                        />
                        <span className="ml-3 text-sm font-medium capitalize">{freq}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="mt-8 flex justify-end">
                  <motion.button type="submit" className="px-6 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50" disabled={isUpdatingProfile}>
                    {isUpdatingProfile ? 'Saving...' : 'Save Changes'}
                  </motion.button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Call UI — appears top-right to match header button */}
      <AnimatePresence>
        {showCallUI && selectedChatUser && (
          <motion.div className="fixed top-20 right-6 z-50 max-w-[360px] w-full" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
            <CallUI
              otherUserId={selectedChatUser.uid}
              otherUserName={selectedChatUser.displayName || selectedChatUser.email}
              signalingUrl={process.env.REACT_APP_SIGNAL_URL || "http://localhost:5000"}
              enableSignalEncryption={true}
              onClose={() => {
                console.debug("Call UI closed");
                setShowCallUI(false);
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modals for file confirm / viewing / forwarding / info */}
      <AnimatePresence>
        {fileToSend && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setFileToSend(null)}></div>
            <motion.div className={`relative rounded-2xl shadow-lg p-6 w-full max-w-sm mx-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`} variants={modalVariants} initial="hidden" animate="visible" exit="exit">
              <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Send File</h3>

              {filePreview && <img src={filePreview} alt="File preview" className="mb-4 w-full h-48 object-contain rounded-lg" />}
              <div className="mb-4 p-2 rounded-md bg-gray-100 dark:bg-gray-700 text-sm truncate">
                {fileToSend.name}
              </div>

              <div className="space-y-3 mb-6">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" checked={allowDownload} onChange={(e) => setAllowDownload(e.target.checked)} className="h-4 w-4 rounded text-primary focus:ring-primary" />
                  <span className="text-sm">Allow receiver to download</span>
                </label>
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input type="checkbox" checked={allowForward} onChange={(e) => setAllowForward(e.target.checked)} className="h-4 w-4 rounded text-primary focus:ring-primary" />
                  <span className="text-sm">Allow receiver to forward</span>
                </label>
              </div>

              <div className="flex justify-end space-x-2">
                <button onClick={() => setFileToSend(null)} className="px-4 py-2 text-sm rounded-lg border dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
                <button onClick={handleConfirmSendFile} className="px-4 py-2 text-sm rounded-lg bg-primary text-white hover:bg-primary-dark">Send</button>
              </div>
            </motion.div>
          </motion.div>
        )}

        {viewingMessage && viewingMessage.fileType && viewingMessage.fileType.startsWith('image/') && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setViewingMessage(null)}>
            <motion.img initial={{ scale: 0.5 }} animate={{ scale: 1 }} exit={{ scale: 0.5 }} src={viewingMessage.fileUrl} alt="Full screen view" className="max-w-[90vw] max-h-[90vh] object-contain" onClick={(e) => e.stopPropagation()} />
            <div className="absolute top-4 right-4 flex items-center space-x-2">
              {(viewingMessage.allowDownload ?? true) && (
                <a href={viewingMessage.fileUrl} download className="p-2 rounded-full bg-white/20 hover:bg-white/40" title="Download image">
                  <Download className="w-6 h-6 text-white" />
                </a>
              )}
              <button onClick={() => setViewingMessage(null)} className="p-2 rounded-full bg-white/20 hover:bg-white/40" title="Close"><X className="w-6 h-6 text-white" /></button>
            </div>
          </motion.div>
        )}

        {isForwarding && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={closeForwardModal}></div>
            <motion.div className={`relative rounded-2xl shadow-lg p-6 w-full max-w-sm mx-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`} variants={modalVariants} initial="hidden" animate="visible" exit="exit">
              <button onClick={closeForwardModal} className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
              <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Forward message to...</h3>
              <div className="max-h-80 overflow-y-auto">
                <ul className="space-y-1">
                  {users.length > 0 ? users.map(user => (
                    <li key={user.uid}>
                      <div className="w-full text-left p-2 rounded-lg flex items-center justify-between space-x-3 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700/50">
                        <div className="flex items-center space-x-3 overflow-hidden">
                          <div className="w-8 h-8 rounded-full flex-shrink-0 relative">
                            {user.photoURL ? (<img src={user.photoURL} alt={user.displayName} className="w-full h-full rounded-full object-cover" />) : (<div className={`w-full h-full rounded-full flex items-center justify-center bg-gray-200 dark:bg-gray-600`}><User className="w-4 h-4" /></div>)}
                          </div>
                          <span className="flex-1 truncate font-medium">{user.displayName || user.email}</span>
                        </div>
                        <button onClick={() => handleForwardMessage(user)} className="px-3 py-1 text-sm bg-primary text-white rounded-md hover:bg-primary-dark">Send</button>
                      </div>
                    </li>
                  )) : (<p className={`text-sm px-3 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>No users available to forward.</p>)}
                </ul>
              </div>
            </motion.div>
          </motion.div>
        )}

        {messageInfo && (
          <motion.div className="fixed inset-0 z-50 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0 bg-black/50" onClick={() => setMessageInfo(null)}></div>
            <motion.div className={`relative rounded-2xl shadow-lg p-6 w-full max-w-sm mx-4 ${darkMode ? 'bg-gray-800' : 'bg-white'}`} variants={modalVariants} initial="hidden" animate="visible" exit="exit">
              <button onClick={() => setMessageInfo(null)} className="absolute top-4 right-4 p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700"><X className="w-5 h-5" /></button>
              <h3 className={`text-lg font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Message Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex items-center"><Clock className="w-4 h-4 mr-3 text-gray-400" /><div><p className="font-semibold">Sent</p><p className={`${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{new Date(messageInfo.timestamp).toLocaleString()}</p></div></div>
                <hr className={darkMode ? 'border-gray-700' : 'border-gray-200'} />
                <div className="flex items-center"><Check className="w-4 h-4 mr-3 text-gray-400" /><div><p className="font-semibold">Delivered</p><p className={`${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{messageInfo.deliveredAt ? new Date(messageInfo.deliveredAt).toLocaleString() : 'Not yet'}</p></div></div>
                <hr className={darkMode ? 'border-gray-700' : 'border-gray-200'} />
                <div className="flex items-center"><CheckCheck className={`w-4 h-4 mr-3 ${messageInfo.readAt ? 'text-sky-500' : 'text-gray-400'}`} /><div><p className="font-semibold">Read</p><p className={`${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{messageInfo.readAt ? new Date(messageInfo.readAt).toLocaleString() : 'Not yet'}</p></div></div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <footer className={`text-center text-xs p-2 flex-shrink-0 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`}>
      </footer>
    </div>
  );
};

export default Dashboard;

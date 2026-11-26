// src/pages/chat.jsx
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAppContext, useChat, useGroups } from '../context/AppContext';
import UserAvatar from '../components/UserAvatar';
import Profile from '../components/Profile';
import * as avatarCache from '../lib/avatarCache';
import ScreenshotCrop from '../components/ScreenshotCrop';
import ImageLightbox from '../components/ImageLightbox';
import * as api from '../lib/api';
import {
    Reply, Users, UserPlus, Search, X, Plus, Info, LogOut, Paperclip, Trash2, Send, FileText, Download, Folder, Image, Forward, Star, Copy, CheckCircle, MessageCircle,
    CheckSquare, Pencil, CircleAlert
} from 'lucide-react';
import EmojiPicker from "emoji-picker-react";
import { Smile } from "lucide-react";
import { listen } from "@tauri-apps/api/event";

function resolveFileUrl(content, senderIp, localPort) {
    try {
        const info = JSON.parse(content);
        if (info.fileId) {
            return {
                fileId: info.fileId,
                fileName: info.fileName || 'file',
                type: info.type || 'file',
                senderIp: senderIp,
                port: info.port || localPort,
                preferLocal: true,
            };
        }
    } catch { /* not JSON, treat as plain */ }
    if (content?.startsWith('data:')) {
        return { fileId: null, url: content, fileName: 'file', type: 'image' };
    }
    if (content?.startsWith('http')) {
        return { fileId: null, url: content, fileName: 'file', type: 'image' };
    }
    return null;
}

function normalizeReply(reply) {
    if (!reply) return null;

    if (typeof reply === 'string') {
        try {
            return JSON.parse(reply);
        } catch {
            return null;
        }
    }

    return reply;
}

function getReplySender(reply) {
    return (
        reply?.sender_name ||
        reply?.senderName ||
        reply?.username ||
        reply?.from_name ||
        reply?.name ||
        reply?.sender?.name ||
        reply?.sender?.username ||
        reply?.user?.name ||
        reply?.user?.username ||
        reply?.author?.name ||
        'Unknown User'
    );
}

export default function ChatPage() {
    const { localUser, deviceId, peers, allUsers, unreadCounts, lastMessages, clearUnread, refreshLastMessages, fileServerPort, flushPendingMessages, setActiveChatPeerId, } = useAppContext();
    const chat = useChat();
    const [messageReactions, setMessageReactions] = useState({});
    console.log("[ChatPage] loaded:", import.meta.url, typeof messageReactions);
    const groupsHook = useGroups();
    const [search, setSearch] = useState('');
    const [tab, setTab] = useState('dm'); // 'dm' | 'groups'
    const [showProfile, setShowProfile] = useState(null); // peer for profile view
    const [showNewGroup, setShowNewGroup] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);
    const [selectedMessage, setSelectedMessage] = useState(null);
    const [showForwardDialog, setShowForwardDialog] = useState(false);
    const [showMessageInfo, setShowMessageInfo] = useState(false);
    const [replyingTo, setReplyingTo] = useState(null);
    const [editingMessage, setEditingMessage] = useState(null);
    const [forwardingMessage, setForwardingMessage] = useState(null);
    const [confirmClearChat, setConfirmClearChat] = useState(false);
    const [screenshotData, setScreenshotData] = useState(null);
    const [showSharedMedia, setShowSharedMedia] = useState(false);
    const [sharedMediaList, setSharedMediaList] = useState([]);
    const [sharedMediaTab, setSharedMediaTab] = useState('images'); // 'images' | 'files'
    const [activeGroup, setActiveGroup] = useState(null);
    const [groupMessages, setGroupMessages] = useState([]);
    const [groupMembers, setGroupMembers] = useState([]);
    const [showGroupInfo, setShowGroupInfo] = useState(false);
    const [groupLastMessages, setGroupLastMessages] = useState({}); // groupId -> { content, message_type, created_at, sender_name }

    useEffect(() => {
        let cancelled = false;

        const loadGroupLastMessages = async () => {
            if (!groupsHook.groups?.length) {
                setGroupLastMessages({});
                return;
            }

            try {
                const entries = await Promise.all(
                    groupsHook.groups.map(async (group) => {
                        try {
                            const messages = await api.getGroupMessages(
                                group.id,
                                100
                            );
                            const sortedMessages = [...(messages || [])].sort(
                                (a, b) =>
                                    new Date(a.created_at).getTime() -
                                    new Date(b.created_at).getTime()
                            );

                            setGroupMessages(sortedMessages);

                            if (!Array.isArray(messages) || messages.length === 0) {
                                return [group.id, null];
                            }

                            // Find the newest message using its timestamp.
                            const latestMessage = [...messages].sort(
                                (a, b) =>
                                    new Date(b.created_at).getTime() -
                                    new Date(a.created_at).getTime()
                            )[0];

                            return [group.id, latestMessage];

                        } catch (error) {
                            console.error(
                                `[Pingo] Failed loading messages for group ${group.id}:`,
                                error
                            );

                            return [group.id, null];
                        }
                    })
                );

                if (!cancelled) {
                    setGroupLastMessages(Object.fromEntries(entries));
                }

            } catch (error) {
                console.error(
                    "[Pingo] Failed loading group last messages:",
                    error
                );
            }
        };

        loadGroupLastMessages();

        return () => {
            cancelled = true;
        };
    }, [groupsHook.groups]);

    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const [inputText, setInputText] = useState('');
    const [dragOver, setDragOver] = useState(false);
    const [lightbox, setLightbox] = useState(null); // { url, fileName }
    const [toasts, setToasts] = useState([]); // toast notifications
    const [loadedFileUrls, setLoadedFileUrls] = useState({}); // fileId -> dataUrl cache for direct file reading
    const loadingFilesRef = useRef(new Set()); // Track files currently being loaded to prevent duplicate loads
    const loadedFileIdsRef = useRef(new Set()); // fileIds already loaded — avoids re-running effect on every state update
    const [uploadProgress, setUploadProgress] = useState({}); // uploadId -> { name, progress (0-100), error? }
    const [downloadProgress, setDownloadProgress] = useState({}); // fileId -> { name, progress, stage }
    const [showSearch, setShowSearch] = useState(false);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [showReactionEmojiPicker, setShowReactionEmojiPicker] = useState(false);
    const [forwardTargets, setForwardTargets] = useState([]);
    const [forwarding, setForwarding] = useState(false);
    const [users, setUsers] = useState([]);



    useEffect(() => {
        let cancelled = false;
        let unlisten = null;

        const setupListener = async () => {
            try {
                const unsubscribe = await api.onMessageEdited((data) => {
                    if (cancelled) return;

                    const { message_id, content } = data || {};

                    if (!message_id) return;

                    console.log("[MESSAGE EDITED EVENT]", data);

                    setChats(previousChats =>
                        previousChats.map(chat => ({
                            ...chat,
                            messages: (chat.messages || []).map(message =>
                                message.id === message_id
                                    ? { ...message, content }
                                    : message
                            ),
                        }))
                    );

                    setGroupMessages(previousMessages =>
                        previousMessages.map(message =>
                            message.id === message_id
                                ? { ...message, content }
                                : message
                        )
                    );
                });

                if (cancelled) {
                    unsubscribe?.();
                } else {
                    unlisten = unsubscribe;
                }

            } catch (error) {
                console.error(
                    "[MESSAGE EDIT LISTENER ERROR]",
                    error
                );
            }
        };

        setupListener();

        return () => {
            cancelled = true;
            unlisten?.();
        };
    }, []);


    useEffect(() => {
        const loadUsers = async () => {
            try {
                const allUsers = await api.getAllUsers();
                setUsers(allUsers || []);
                console.log('[Chat] Loaded users:', allUsers);
            } catch (error) {
                console.error('[Chat] Failed to load users:', error);
            }
        };

        loadUsers();
    }, []);

    const [starredMessages, setStarredMessages] = useState(() => {
        try {
            const saved = JSON.parse(
                localStorage.getItem('pmtchat-starred-messages') || '[]'
            );

            return new Set(
                Array.isArray(saved)
                    ? saved
                    : Object.keys(saved || {}).filter(id => saved[id])
            );
        } catch {
            return new Set();
        }
    });

    const [showStarredMessages, setShowStarredMessages] = useState(false);

    const messageLongPressRef = useRef(null);

    const handlePinMessage = async () => {
        if (!contextMenu?.message) return;

        const message = contextMenu.message;

        try {
            await pinMessage(message.id);
        } catch (error) {
            console.error("Failed to pin message:", error);
        }

        setContextMenu(null);
    };

    const handleStarMessage = (message) => {
        if (!message) return;

        setStarredMessages(prev => {
            const next = new Set(
                prev instanceof Set
                    ? prev
                    : Array.isArray(prev)
                        ? prev
                        : []
            );

            if (next.has(message.id)) {
                next.delete(message.id);
            } else {
                next.add(message.id);
            }

            localStorage.setItem(
                'pmtchat-starred-messages',
                JSON.stringify([...next])
            );

            return next;
        });

        setContextMenu(null);
        setShowReactionEmojiPicker(false);
    };

    const handleReaction = async (message, emoji) => {
        if (!message?.id || !emoji) return;

        try {
            const conversationType = activeGroup ? "group" : "dm";
            const conversationId = activeGroup
                ? activeGroup.id
                : chat.activePeer?.device_id;

            console.log("[REACTION] Message:", message.id);
            console.log("[REACTION] Conversation:", conversationType, conversationId);

            const result = await api.toggleMessageReaction({
                messageId: message.id,
                emoji,
                conversationType,
                conversationId,
            });

            console.log("[REACTION] Toggle:", result);

            const rows = await api.getMessageReactions({
                conversationType,
                conversationId,
            });

            console.log("[REACTION] Database response:", rows);

            const grouped = {};

            (rows || []).forEach(row => {
                const messageId = Array.isArray(row) ? row[0] : row.message_id;
                const reactionEmoji = Array.isArray(row) ? row[2] : row.emoji;

                if (!grouped[messageId]) grouped[messageId] = [];

                if (!grouped[messageId].includes(reactionEmoji)) {
                    grouped[messageId].push(reactionEmoji);
                }
            });

            console.log("[REACTION] Grouped:", grouped);

            setMessageReactions(grouped);

        } catch (error) {
            console.error("[REACTION] ERROR:", error);
        }
    };


    useEffect(() => {
        let cancelled = false;
        let unlistenReaction = null;

        const conversationType = activeGroup ? "group" : "dm";
        const conversationId = activeGroup
            ? activeGroup.id
            : chat.activePeer?.device_id;

        if (!conversationId) return;

        const loadReactions = async () => {
            try {
                const rows = await api.getMessageReactions({
                    conversationType,
                    conversationId,
                });

                if (cancelled) return;

                const grouped = {};

                (rows || []).forEach(row => {
                    const messageId = Array.isArray(row)
                        ? row[0]
                        : row.message_id;

                    const emoji = Array.isArray(row)
                        ? row[2]
                        : row.emoji;

                    if (!grouped[messageId]) {
                        grouped[messageId] = [];
                    }

                    if (!grouped[messageId].includes(emoji)) {
                        grouped[messageId].push(emoji);
                    }
                });

                setMessageReactions(grouped);

            } catch (error) {
                console.error("[REACTION] Failed to load:", error);
            }
        };

        const setup = async () => {
            try {
                await loadReactions();

                const unsubscribe = await api.onMessageReactionReceived(
                    async (reaction) => {
                        if (cancelled) return;

                        if (!reaction?.message_id) return;

                        if (
                            reaction.conversation_type !== conversationType ||
                            reaction.conversation_id !== conversationId
                        ) {
                            return;
                        }

                        console.log(
                            "[REACTION] Received:",
                            reaction
                        );

                        // SQLite is the source of truth.
                        // Reload the complete reaction state.
                        await loadReactions();
                    }
                );

                if (cancelled) {
                    unsubscribe?.();
                } else {
                    unlistenReaction = unsubscribe;
                }

            } catch (error) {
                console.error(
                    "[REACTION] Listener setup failed:",
                    error
                );
            }
        };

        setup();

        return () => {
            cancelled = true;
            unlistenReaction?.();
        };

    }, [activeGroup?.id, chat.activePeer?.device_id]);



    const handleMessageInfo = () => {
        if (!contextMenu?.message) return;
        setSelectedMessage(contextMenu.message);
        setShowMessageInfo(true);
        setContextMenu(null);
    };

    const showToast = useCallback((message, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000);
    }, []);

    const peerIpMap = useMemo(() => {
        const map = {};
        (peers || []).forEach(p => {
            map[p.device_id] = p.ip_address;
        });
        return map;
    }, [peers]);

    const resolveUsernameById = useCallback((id) => {
        if (!id) return undefined;
        const fromUsers = (allUsers || []).find(u => u.id === id)?.username;
        if (fromUsers) return fromUsers;
        const fromPeers = (peers || []).find(p => p.device_id === id)?.username;
        if (fromPeers) return fromPeers;
        return undefined;
    }, [peers, allUsers]);

    const loadFileDataUrl = useCallback(async (fileId) => {
        if (loadedFileIdsRef.current.has(fileId)) {
            return loadedFileUrls[fileId] || null;
        }
        try {
            const dataUrl = await api.readFileAsDataUrl(fileId);
            if (dataUrl) {
                loadedFileIdsRef.current.add(fileId);
                setLoadedFileUrls(prev => ({ ...prev, [fileId]: dataUrl }));
            }
            return dataUrl;
        } catch (err) {
            console.warn('[Pingo] Failed to load file directly:', err);
            return null;
        }
    }, [loadedFileUrls]);

    const handleImageError = useCallback(async (msg) => {
        try {
            const info = JSON.parse(msg.content);
            const fileId = info.fileId;
            const port = info.port || fileServerPort || null;

            if (!fileId) {
                console.warn('[Pingo] handleImageError: no fileId in message');
                return;
            }
            if (loadingFilesRef.current.has(fileId)) return;
            if (loadedFileIdsRef.current.has(fileId)) return;

            loadingFilesRef.current.add(fileId);
            let senderIp = peerIpMap[msg.sender_id];
            if (!senderIp) {
                const peerData = peers?.find(p => p.device_id === msg.sender_id);
                senderIp = peerData?.ip_address;
            }
            if (!senderIp) {
                const userData = allUsers?.find(u => u.id === msg.sender_id);
                senderIp = userData?.ip_address;
            }
            try {
                const dataUrl = await api.readFileAsDataUrl(fileId);
                if (dataUrl) {
                    loadedFileIdsRef.current.add(fileId);
                    setLoadedFileUrls(prev => ({ ...prev, [fileId]: dataUrl }));
                    console.log('[Pingo] Loaded file via direct read for', fileId);
                    loadingFilesRef.current.delete(fileId);
                    return;
                }
            } catch (readErr) {
                console.warn('[Pingo] Direct read failed for', fileId, readErr);
            }
            if (!senderIp || !port) {
                console.warn('[Pingo] handleImageError: no sender IP/port available for', msg.sender_id);
                loadingFilesRef.current.delete(fileId);
                return;
            }

            const remoteUrl = `http://${senderIp.split(':')[0]}:${port}/file/${fileId}`;
            const senderName = msg.sender_name || resolveUsernameById(msg.sender_id) || 'Unknown';
            const fileType = msg.message_type || 'file';

            console.log('[Pingo] Auto-downloading file:', info.fileName, 'from', remoteUrl);
            try {
                await api.autoDownloadFile(remoteUrl, senderName, info.fileName || 'file', fileType, msg.id);
                const dataUrl = await api.readFileAsDataUrl(fileId).catch(() => null);
                if (dataUrl) {
                    loadedFileIdsRef.current.add(fileId);
                    setLoadedFileUrls(prev => ({ ...prev, [fileId]: dataUrl }));
                    console.log('[Pingo] File downloaded and loaded directly');
                }
            } catch (dlErr) {
                console.warn('[Pingo] Auto-download failed:', dlErr);
            }

            loadingFilesRef.current.delete(fileId);
        } catch (e) {
            console.error('[Pingo] Image error handler failed:', e);
        }
    }, [peerIpMap, fileServerPort, peers, allUsers, resolveUsernameById]);

    const userList = useMemo(() => {
        const map = new Map();
        (allUsers || []).forEach(u => {
            if (u.id !== deviceId) {
                map.set(u.id, {
                    ...u,
                    device_id: u.device_id || u.id,
                    is_online: false,
                });
            }
        });

        (peers || []).forEach(p => {
            const existing = map.get(p.device_id) || {};
            map.set(p.device_id, {
                ...existing,
                ...p,
                id: p.device_id,
                is_online: true,
                username: p.username || existing.username,
                avatar_path: p.avatar_path || existing.avatar_path,
            });
        });

        let list = Array.from(map.values());
        list.sort((a, b) => {
            if (a.is_online !== b.is_online) return a.is_online ? -1 : 1;
            const aTime = lastMessages[a.device_id || a.id]?.created_at || '';
            const bTime = lastMessages[b.device_id || b.id]?.created_at || '';
            if (aTime !== bTime) return bTime.localeCompare(aTime);
            return (a.username || '').localeCompare(b.username || '');
        });

        if (search) {
            const q = search.toLowerCase();
            list = list.filter(u => u.username?.toLowerCase().includes(q));
        }
        return list;
    }, [allUsers, peers, deviceId, lastMessages, search]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chat.messages, groupMessages]);

    const selectDmPeer = useCallback((user) => {
        setActiveGroup(null);
        setShowGroupInfo(false);
        const peerId = user.device_id || user.id;
        const peerObj = {
            device_id: peerId,
            username: user.username,
            is_online: user.is_online,
            ip_address: user.ip_address || peerIpMap[peerId],
            avatar_path: user.avatar_path || avatarCache.getLocalAvatarUrl(peerId) || undefined,
        };
        chat.selectPeer(peerObj);
        clearUnread(peerId);
        if (setActiveChatPeerId) setActiveChatPeerId(peerId);
    }, [chat.selectPeer, clearUnread, peerIpMap, setActiveChatPeerId]);

    const selectGroup = useCallback(async (group) => {
        chat.selectPeer(null);        // Clear active DM peer tracking when switching to group
        if (setActiveChatPeerId) setActiveChatPeerId(null);
        setActiveGroup(group);
        setShowGroupInfo(false);
        try {
            const msgs = await api.getGroupMessages(group.id, 200);
            const port = fileServerPort || await api.getFileServerPort().catch(() => 0);
            const chronological = (msgs || []).slice().reverse().map(m => {
                try {
                    if (m.message_type === 'image' || m.message_type === 'video' || m.message_type === 'file') {
                        const info = JSON.parse(m.content);
                        if (info && info.fileId) {
                            const p = info.port || port || 0;
                            const localUrl = `http://127.0.0.1:${p}/file/${info.fileId}`;
                            m._localDataUrl = localUrl;
                            m._fileName = info.fileName || 'file';
                            m._fileType = info.type || m.message_type;
                            m._fileId = info.fileId;
                            m._isLocal = true; // Mark as local for UI feedback
                        }
                    }
                } catch { /* ignore non-json */ }
                return m;
            });
            setGroupMessages(chronological);
            const members = await api.getGroupMembers(group.id);
            setGroupMembers(members || []);
        } catch (e) {
            console.error('Failed to load group:', e);
            showToast('Failed to load group messages', 'error');
        }
    }, [chat.selectPeer, setActiveChatPeerId, fileServerPort, showToast]);

    const handleSendDm = useCallback(async () => {
        const text = inputText.trim()

        if (!text || !chat.activePeer) return;

        if (editingMessage) {
            try {
                await api.editMessage(
                    editingMessage.id,
                    inputText.trim()
                );

                chat.setMessages(prev =>
                    prev.map(message =>
                        message.id === editingMessage.id
                            ? { ...message, content: text }
                            : message
                    )
                );

                setEditingMessage(null);
                setInputText('');
                await refreshLastMessages();
                showToast('Message updated', 'success');
                return;
            } catch (e) {
                console.error('Failed to edit message:', e);
                showToast('Could not edit message', 'error');
                return;
            }
        }

        const reply = replyingTo
            ? {
                id: replyingTo.id,
                content: replyingTo.content || replyingTo.text || '',
                sender_id: replyingTo.sender_id,
                sender_name: replyingTo.sender_name || replyingTo.senderName ||
                    replyingTo.username ||
                    users.find(user =>
                        user.id === replyingTo.sender_id
                    )?.username ||
                    (replyingTo.sender_id === localUser?.id || replyingTo.sender_id === localUser?.device_id
                        ? localUser?.username
                        : chat.activePeer?.username || 'Unknown User'),
                message_type: replyingTo.message_type,
            }
            : null;

        setInputText('');

        try {
            await chat.sendText(
                chat.activePeer.device_id,
                text,
                localUser?.username || '',
                reply
            );

            setReplyingTo(null);
            refreshLastMessages();
        } catch (e) {
            console.error('Failed to send DM:', e);
            setInputText(text);
        }
    }, [
        inputText,
        chat.activePeer,
        chat.sendText,
        chat.setMessages,
        localUser,
        users,
        refreshLastMessages,
        replyingTo,
        editingMessage,
        showToast,
    ]);

    const handleSendGroup = useCallback(async () => {
        const text = inputText.trim();

        if (!text || !activeGroup) return;

        if (editingMessage) {
            setGroupMessages(prev => prev.map(message => message.id === editingMessage.id ? { ...message, content: text } : message));
            setEditingMessage(null);
            setInputText('');
            showToast('Message updated', 'success');
            return;
        }

        const reply = replyingTo
            ? {
                id: replyingTo.id,
                content: replyingTo.content || replyingTo.text || '',
                sender_id: replyingTo.sender_id || replyingTo.from_id || replyingTo.user_id,
                sender_name: replyingTo.sender_name || replyingTo.senderName || replyingTo.username || replyingTo.sender_username ||
                    replyingTo.from_name || replyingTo.name || replyingTo.sender?.username || replyingTo.sender?.name || 'Unknown User',
                message_type: replyingTo.message_type || 'text',
            }
            : null;

        setInputText('');

        try {
            const msg = await api.sendGroupMessage(
                activeGroup.id,
                text,
                'text',
                reply
            );

            if (msg) {
                setGroupMessages(prev => [...prev, msg]);

                setGroupLastMessages(prev => ({
                    ...prev,
                    [activeGroup.id]: {
                        content: text,
                        message_type: 'text',
                        created_at: msg.created_at,
                        sender_name: msg.sender_name,
                    },
                }));
            }

            setReplyingTo(null);
        } catch (e) {
            console.error('Failed to send group message:', e);
            setInputText(text);
        }
    }, [inputText, activeGroup, replyingTo, editingMessage, showToast]);

    const groupFileInputRef = useRef(null);
    const handleGroupFileSelect = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file || !activeGroup) return;
        e.target.value = '';

        const MAX_SIZE = 250 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            showToast(`File too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Max 250 MB.`, 'error');
            return;
        }

        const uploadId = `up_${Date.now()}`;
        setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: 5 } }));

        const reader = new FileReader();
        reader.onprogress = (ev) => {
            if (ev.lengthComputable) {
                const pct = Math.max(5, Math.round(ev.loaded / ev.total * 60));
                setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: pct } }));
            }
        };
        reader.onload = async (ev) => {
            const dataUrl = ev.target.result;
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            const msgType = isImage ? 'image' : isVideo ? 'video' : 'file';
            setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: 70 } }));
            try {
                const fileId = `gf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                await api.storeSharedFile(fileId, dataUrl, file.name);
                const port = await api.getFileServerPort();
                const fileInfo = JSON.stringify({ fileId, fileName: file.name, port, type: msgType });
                const msg = await api.sendGroupMessage(activeGroup.id, fileInfo, msgType);
                if (msg) {
                    loadedFileIdsRef.current.add(fileId);
                    setLoadedFileUrls(prev => ({ ...prev, [fileId]: dataUrl }));
                    setGroupMessages(prev => [...prev, {
                        ...msg,
                        _localDataUrl: dataUrl,
                        _fileId: fileId,
                        _fileName: file.name,
                        _fileType: msgType,
                        _isLocal: true
                    }]);
                    setGroupLastMessages(prev => ({
                        ...prev,
                        [activeGroup.id]: {
                            content: `📎 ${file.name}`,
                            message_type: msgType,
                            created_at: msg.created_at,
                            sender_name: msg.sender_name
                        },
                    }));
                }
                setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: 100 } }));
                setTimeout(() => setUploadProgress(prev => { const n = { ...prev }; delete n[uploadId]; return n; }), 1500);
            } catch (err) {
                setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: 0, error: true } }));
                setTimeout(() => setUploadProgress(prev => { const n = { ...prev }; delete n[uploadId]; return n; }), 3000);
                showToast('Failed to send file', 'error');
            }
        };
        reader.onerror = () => {
            setUploadProgress(prev => { const n = { ...prev }; delete n[uploadId]; return n; });
            showToast('Failed to read file', 'error');
        };
        reader.readAsDataURL(file);
    }, [activeGroup, showToast]);

    const handleSend = useCallback(() => {
        if (activeGroup) handleSendGroup();
        else handleSendDm();
    }, [activeGroup, handleSendDm, handleSendGroup]);

    const handleFileSelect = useCallback(async (e) => {
        const file = e.target.files?.[0];
        if (!file || !chat.activePeer) return;
        e.target.value = '';

        const MAX_SIZE = 250 * 1024 * 1024; // 250 MB
        if (file.size > MAX_SIZE) {
            showToast(`File too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Max 250 MB.`, 'error');
            return;
        }

        const uploadId = `up_${Date.now()}`;
        setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: 5 } }));

        const reader = new FileReader();
        reader.onprogress = (ev) => {
            if (ev.lengthComputable) {
                const pct = Math.max(5, Math.round(ev.loaded / ev.total * 60));
                setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: pct } }));
            }
        };
        reader.onload = async (ev) => {
            const dataUrl = ev.target.result;
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            const msgType = isImage ? 'image' : isVideo ? 'video' : 'file';
            const senderIp = getLocalIp();

            setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: 70 } }));
            try {
                await chat.sendFile(
                    chat.activePeer.device_id,
                    dataUrl, file.name, msgType,
                    localUser?.username || '', senderIp,
                );
                setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: 100 } }));
                setTimeout(() => setUploadProgress(prev => { const n = { ...prev }; delete n[uploadId]; return n; }), 1500);
                refreshLastMessages();
            } catch (err) {
                setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: 0, error: true } }));
                setTimeout(() => setUploadProgress(prev => { const n = { ...prev }; delete n[uploadId]; return n; }), 3000);
                showToast(`Failed to send ${file.name}`, 'error');
            }
        };
        reader.onerror = () => {
            setUploadProgress(prev => { const n = { ...prev }; delete n[uploadId]; return n; });
            showToast('Failed to read file', 'error');
        };
        reader.readAsDataURL(file);
    }, [chat.activePeer, chat.sendFile, localUser, refreshLastMessages, showToast]);

    const handleResendPending = useCallback(async () => {
        const peerId = chat.activePeer?.device_id;
        if (!peerId) {
            showToast && showToast('No active peer selected', 'warning');
            console.warn('[Pingo] Resend pending: no active peer');
            return;
        }
        console.log('[Pingo] Resend pending clicked — peerId=', peerId);
        try {
            const pending = await api.getUndeliveredMessagesForPeer(peerId).catch(e => { throw e; });
            console.log('[Pingo] Undelivered messages for', peerId, pending || []);
            showToast && showToast(`Found ${(pending || []).length} pending message(s)`, 'info');
        } catch (err) {
            console.error('[Pingo] getUndeliveredMessagesForPeer failed', err);
            showToast && showToast('Failed to read pending messages', 'error');
        }

        try {
            await flushPendingMessages(peerId);
            console.log('[Pingo] flushPendingMessages completed for', peerId);
            showToast && showToast('Resend attempted', 'success');
            refreshLastMessages().catch(() => { });
            if (chat.activePeer) chat.loadMessages(peerId).catch(() => { });
        } catch (err) {
            console.error('[Pingo] flushPendingMessages error', err);
            showToast && showToast('Resend failed', 'error');
        }
    }, [chat.activePeer, chat.loadMessages, flushPendingMessages, refreshLastMessages, showToast]);

    const handleDrop = useCallback(async (e) => {
        e.preventDefault();
        setDragOver(false);
        if (!chat.activePeer) return;
        const file = e.dataTransfer.files?.[0];
        if (!file) return;

        const MAX_SIZE = 250 * 1024 * 1024;
        if (file.size > MAX_SIZE) {
            showToast(`File too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Max 250 MB.`, 'error');
            return;
        }

        const uploadId = `up_${Date.now()}`;
        setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: 5 } }));

        const reader = new FileReader();
        reader.onprogress = (ev) => {
            if (ev.lengthComputable) {
                const pct = Math.max(5, Math.round(ev.loaded / ev.total * 60));
                setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: pct } }));
            }
        };
        reader.onload = async (ev) => {
            const dataUrl = ev.target.result;
            const isImage = file.type.startsWith('image/');
            const isVideo = file.type.startsWith('video/');
            const msgType = isImage ? 'image' : isVideo ? 'video' : 'file';
            setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: 70 } }));
            try {
                await chat.sendFile(
                    chat.activePeer.device_id,
                    dataUrl, file.name, msgType,
                    localUser?.username || '', getLocalIp(),
                );
                setUploadProgress(prev => ({ ...prev, [uploadId]: { name: file.name, progress: 100 } }));
                setTimeout(() => setUploadProgress(prev => { const n = { ...prev }; delete n[uploadId]; return n; }), 1500);
                refreshLastMessages();
            } catch (err) {
                setUploadProgress(prev => { const n = { ...prev }; delete n[uploadId]; return n; });
                showToast(`Failed to send ${file.name}`, 'error');
            }
        };
        reader.onerror = () => setUploadProgress(prev => { const n = { ...prev }; delete n[uploadId]; return n; });
        reader.readAsDataURL(file);
    }, [chat.activePeer, chat.sendFile, localUser, refreshLastMessages, showToast]);

    const handleScreenshot = useCallback(async () => {
        setScreenshotData({ loading: true, imageDataUrl: null });

        try {
            const imageDataUrl = await api.captureScreenPrimary();
            if (imageDataUrl) {
                setScreenshotData({ loading: false, imageDataUrl });
            } else {
                console.warn('Failed to capture screen');
                setScreenshotData(null);
            }
        } catch (err) {
            console.warn('Screenshot capture failed:', err);
            setScreenshotData(null);
        }
    }, []);

    const handleScreenshotCrop = useCallback(async (croppedDataUrl) => {
        setScreenshotData(null);
        if (!chat.activePeer) return;
        await chat.sendFile(
            chat.activePeer.device_id,
            croppedDataUrl, 'screenshot.png', 'image',
            localUser?.username || '', getLocalIp(),
        );
        refreshLastMessages();
    }, [chat.activePeer, chat.sendFile, localUser, refreshLastMessages]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleMsgContextMenu = (e, message) => {
        e.preventDefault();
        e.stopPropagation();

        const menuWidth = 300;
        const menuHeight = 390;
        const viewportPadding = 10;
        const x = Math.max(viewportPadding, Math.min(e.clientX, window.innerWidth - menuWidth - viewportPadding));
        const y = Math.max(viewportPadding, Math.min(e.clientY, window.innerHeight - menuHeight - viewportPadding));

        setSelectedMessage(message);
        setShowReactionEmojiPicker(false);
        setContextMenu({ x, y, message, });
    };

    const handleMessageTouchStart = (e, message) => {
        if (e.touches?.length !== 1) return;
        const touch = e.touches[0];
        messageLongPressRef.current = window.setTimeout(() => {
            handleMsgContextMenu({
                preventDefault: () => { },
                stopPropagation: () => { },
                clientX: touch.clientX,
                clientY: touch.clientY,
            }, message);
            if (navigator.vibrate) navigator.vibrate(35);
        }, 500);
    };

    const cancelMessageLongPress = () => {
        if (messageLongPressRef.current) {
            window.clearTimeout(messageLongPressRef.current);
            messageLongPressRef.current = null;
        }
    };

    const closeContextMenu = () => {
        setContextMenu(null);
        setShowReactionEmojiPicker(false);
    };

    const handleReplyMessage = (message) => {
        console.log('FULL ORIGINAL MESSAGE:', JSON.stringify(message, null, 2));
        setReplyingTo(message);
        setContextMenu(null);
    };

    const handleForwardMessage = (message) => {
        if (!message) return;

        setForwardingMessage(message);
        setForwardTargets([]);
        setContextMenu(null);
        setShowForwardDialog(true);
    };

    const toggleForwardTarget = (target) => {
        setForwardTargets(prev => {
            const exists = prev.some(
                item => item.id === target.id && item.type === target.type
            );

            return exists
                ? prev.filter(
                    item => !(item.id === target.id && item.type === target.type)
                )
                : [...prev, target];
        });
    };

    const handleConfirmForward = async () => {
        if (!forwardingMessage || forwardTargets.length === 0) {
            showToast('Select at least one recipient', 'error');
            return;
        }

        setForwarding(true);

        try {
            const message = forwardingMessage;

            let content = message.content || message.text || '';
            const type = message.message_type || 'text';

            let fileData = null;
            let fileName = 'file';

            // Prepare attachment if this is an image, video or file.
            if (['image', 'video', 'file'].includes(type)) {
                let info;

                try {
                    info = JSON.parse(content);
                } catch {
                    throw new Error('Invalid attachment information');
                }

                fileName = info.fileName || 'file';

                if (info.fileId) {
                    fileData = await api.readFileAsDataUrl(info.fileId);
                } else if (content.startsWith('data:')) {
                    fileData = content;
                }

                if (!fileData) {
                    throw new Error(`Attachment unavailable: ${fileName}`);
                }
            }

            let successCount = 0;

            for (const target of forwardTargets) {
                try {
                    if (target.type === 'dm') {

                        if (['image', 'video', 'file'].includes(type)) {
                            await chat.sendFile(
                                target.id,
                                fileData,
                                fileName,
                                type,
                                localUser?.username || '',
                                getLocalIp()
                            );
                        } else {
                            await chat.sendText(
                                target.id,
                                content,
                                localUser?.username || '',
                                null
                            );
                        }

                    } else if (target.type === 'group') {

                        if (['image', 'video', 'file'].includes(type)) {
                            const newFileId =
                                `gf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

                            await api.storeSharedFile(
                                newFileId,
                                fileData,
                                fileName
                            );

                            const port = await api.getFileServerPort();

                            const fileInfo = JSON.stringify({
                                fileId: newFileId,
                                fileName,
                                port,
                                type
                            });

                            await api.sendGroupMessage(
                                target.id,
                                fileInfo,
                                type
                            );

                        } else {
                            await api.sendGroupMessage(
                                target.id,
                                content,
                                'text'
                            );
                        }
                    }

                    successCount++;

                } catch (error) {
                    console.error(
                        'Forward failed for:',
                        target,
                        error
                    );
                }
            }

            if (successCount > 0) {
                showToast(
                    `Message forwarded to ${successCount} recipient(s)`,
                    'success'
                );
            }

            if (successCount !== forwardTargets.length) {
                showToast(
                    'Some messages could not be forwarded',
                    'error'
                );
            }

            if (successCount === forwardTargets.length) {
                setShowForwardDialog(false);
                setForwardingMessage(null);
                setForwardTargets([]);
            }

            await refreshLastMessages();

        } catch (error) {
            console.error('Forward message failed:', error);
            showToast(error.message || 'Failed to forward message', 'error');

        } finally {
            setForwarding(false);
        }
    };

    const handleCopyMessage = async (message) => {
        if (!message) return;

        try {
            await navigator.clipboard.writeText(message.content || message.text || "");
            showToast?.("Message copied", "success");
        } catch (error) {
            console.error("Copy failed:", error);
        }

        setContextMenu(null);
    };

    const handleSelectMessage = (message) => {
        if (!message) return;

        setSelectedMessages(prev => {
            const exists = prev.some(item => item.id === message.id);

            return exists
                ? prev.filter(item => item.id !== message.id)
                : [...prev, message];
        });

        setContextMenu(null);
    };

    const handleEditMessage = (message) => {
        if (!message || message.sender_id !== deviceId) return;
        setEditingMessage(message);
        setInputText(message.content || message.text || "");
        setContextMenu(null);
    };


    const handleDeleteMessage = useCallback(async () => {
        if (!contextMenu?.message) return;
        await chat.deleteMsg(contextMenu.message.id);
        setContextMenu(null);
        refreshLastMessages();
    }, [contextMenu, chat.deleteMsg, refreshLastMessages]);

    const handleClearAllChat = useCallback(async () => {
        const peerId = chat.activePeer?.device_id;
        if (!peerId) return;
        await chat.deleteAllMessages(peerId);
        setConfirmClearChat(false);
        refreshLastMessages();
    }, [chat.activePeer, chat.deleteAllMessages, refreshLastMessages]);

    const handleDownload = useCallback(async (url, fileName) => {
        try {
            const result = await api.saveFileWithDialog(url, fileName || 'download');
            if (result) {
                showToast(`Saved: ${fileName || 'file'}`, 'success');
            }
        } catch (e) {
            console.error('[Pingo] Save failed:', e);
            showToast('Save failed', 'error');
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName || 'download';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
        }
    }, [showToast]);

    const handleOpenFileLocation = useCallback(async (msg) => {
        try {
            const info = JSON.parse(msg.content);
            const isMine = msg.sender_id === deviceId;
            const fileType = msg.message_type || 'file';
            const fileName = info.fileName || 'file';
            const fileId = info.fileId;
            let localPath = null;

            if (isMine) {
                if (fileId) {
                    localPath = await api.getSharedFilePath(fileId).catch(() => null);
                }
                if (!localPath) {
                    const senderName = localUser?.username || 'Me';
                    localPath = await api.checkFileDownloaded(senderName, fileName, fileType).catch(() => null);
                }
            } else {
                const senderName = msg.sender_name || resolveUsernameById(msg.sender_id) || 'Unknown';
                localPath = await api.checkFileDownloaded(senderName, fileName, fileType).catch(() => null);
                if (!localPath && fileId) {
                    localPath = await api.getSharedFilePath(fileId).catch(() => null);
                }
            }

            if (localPath) {
                await api.openFileLocation(localPath);
            } else {
                showToast('File not found on this device. It may not have been downloaded yet.', 'error');
            }
        } catch (e) {
            console.warn('[Pingo] Open file location failed:', e);
            showToast('Could not locate file', 'error');
        }
    }, [deviceId, localUser, resolveUsernameById, showToast]);

    useEffect(() => {
        const handleClick = (e) => {
            if (!e.target.closest('[data-message-context-menu]')) {
                setContextMenu(null);
                setShowReactionEmojiPicker(false);
            }
        };

        if (contextMenu) {
            window.addEventListener('mousedown', handleClick);
        }

        return () => {
            window.removeEventListener('mousedown', handleClick);
        };
    }, [contextMenu]);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') closeContextMenu();
        };
        if (contextMenu) window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [contextMenu]);

    useEffect(() => {
        const globalUnsub = api.onGroupMessageReceived(msg => {
            const previewContent = msg.message_type === 'text'
                ? msg.content.substring(0, 40) + (msg.content.length > 40 ? '...' : '')
                : `📎 ${msg.message_type === 'image' ? 'Image' : msg.message_type === 'video' ? 'Video' : 'File'}`;

            setGroupLastMessages(prev => ({
                ...prev,
                [msg.group_id]: {
                    content: previewContent,
                    message_type: msg.message_type,
                    created_at: msg.created_at,
                    sender_name: msg.sender_name,
                },
            }));

            if (activeGroup && msg.group_id === activeGroup.id) {
                setGroupMessages(prev => {
                    if (prev.find(m => m.id === msg.id)) return prev;
                    const newMsg = { ...msg };
                    try {
                        if (msg.message_type === 'image' || msg.message_type === 'video' || msg.message_type === 'file') {
                            const info = JSON.parse(msg.content);
                            if (info && info.fileId) {
                                const senderIp = peerIpMap[msg.sender_id];
                                const p = info.port || fileServerPort || 0;
                                newMsg._fileId = info.fileId;
                                newMsg._fileName = info.fileName || 'file';
                                newMsg._fileType = info.type || msg.message_type;
                                if (msg.sender_id !== deviceId && senderIp && p) {
                                    const remoteUrl = `http://${senderIp.split(':')[0]}:${p}/file/${info.fileId}`;
                                    const senderName = msg.sender_name || 'Unknown';
                                    api.autoDownloadFile(remoteUrl, senderName, info.fileName || 'file', newMsg._fileType, msg.id)
                                        .then(async () => {
                                            try {
                                                const dataUrl = await api.readFileAsDataUrl(info.fileId);
                                                if (dataUrl && typeof window !== 'undefined') {
                                                    window.dispatchEvent(new CustomEvent('pingo:file-downloaded', {
                                                        detail: { fileId: info.fileId, dataUrl }
                                                    }));
                                                }
                                            } catch { /* ignore */ }
                                        })
                                        .catch(() => { /* ignore */ });
                                }
                            }
                        }
                    } catch { /* ignore */ }
                    return [...prev, newMsg];
                });
            }
        });
        return () => { globalUnsub.then?.(fn => fn?.()); };
    }, [activeGroup, peerIpMap, fileServerPort, deviceId]);

    useEffect(() => {
        if (!activeGroup) return;
        const unsubs = [];
        unsubs.push(api.onGroupMemberAdded(async (data) => {
            if (data?.group_id === activeGroup.id) {
                const members = await api.getGroupMembers(activeGroup.id);
                setGroupMembers(members || []);
            }
        }));
        unsubs.push(api.onGroupMemberRemoved(async (data) => {
            if (data?.group_id === activeGroup.id) {
                const members = await api.getGroupMembers(activeGroup.id);
                setGroupMembers(members || []);
            }
        }));
        return () => { unsubs.forEach(async u => { const fn = await u; fn?.(); }); };
    }, [activeGroup]);

    useEffect(() => {
        return () => {
            if (setActiveChatPeerId) setActiveChatPeerId(null);
        };
    }, [setActiveChatPeerId]);


    useEffect(() => {
        if (!showSharedMedia) {
            setSharedMediaList([]);
            return;
        }

        let cancelled = false;

        const loadSharedMedia = async () => {
            try {
                let messages = [];

                // GROUP CHAT
                if (activeGroup?.id) {
                    console.log('[SharedMedia] Loading group:', activeGroup.id);

                    messages = await api.getGroupSharedMedia(activeGroup.id, 500);
                }

                // DIRECT CHAT
                else if (chat.activePeer?.device_id) {
                    console.log(
                        '[SharedMedia] Loading direct chat:',
                        chat.activePeer.device_id
                    );

                    messages = await api.getSharedMedia(
                        chat.activePeer.device_id
                    );
                } else {
                    setSharedMediaList([]);
                    return;
                }

                if (cancelled) return;

                console.log('[SharedMedia] Raw messages:', messages);

                // Handle array or wrapped response
                if (!Array.isArray(messages)) {
                    messages = messages?.messages || [];
                }

                const mediaMessages = messages
                    .map(msg => {
                        const messageType = (
                            msg.message_type ||
                            msg.messageType ||
                            ''
                        ).toLowerCase();

                        if (!['image', 'video', 'file'].includes(messageType)) {
                            return null;
                        }

                        let info = {};

                        try {
                            info = typeof msg.content === 'string'
                                ? JSON.parse(msg.content)
                                : msg.content || {};
                        } catch {
                            info = {};
                        }

                        const fileId =
                            info.fileId ||
                            info.file_id ||
                            msg.file_id ||
                            msg.fileId;

                        const fileName =
                            info.fileName ||
                            info.file_name ||
                            msg.file_name ||
                            'file';

                        const fileType =
                            info.type ||
                            info.fileType ||
                            info.file_type ||
                            messageType;

                        return {
                            ...msg,
                            _fileId: fileId || null,
                            _fileName: fileName,
                            _fileType: fileType,
                            _localDataUrl: '',
                        };
                    })
                    .filter(Boolean);

                if (cancelled) return;

                console.log(
                    '[SharedMedia] Filtered media:',
                    mediaMessages
                );

                setSharedMediaList(mediaMessages);

                // Load locally available attachments
                for (const msg of mediaMessages) {
                    if (cancelled || !msg._fileId) continue;

                    try {
                        const dataUrl = await api.readFileAsDataUrl(
                            msg._fileId
                        );

                        if (dataUrl && !cancelled) {
                            loadedFileIdsRef.current.add(msg._fileId);

                            setLoadedFileUrls(prev => ({
                                ...prev,
                                [msg._fileId]: dataUrl,
                            }));
                        }
                    } catch (error) {
                        console.log(
                            '[SharedMedia] File not available locally:',
                            msg._fileName,
                            error
                        );
                    }
                }

            } catch (error) {
                console.error(
                    '[SharedMedia] Failed to load:',
                    error
                );
            }
        };

        loadSharedMedia();

        return () => {
            cancelled = true;
        };

    }, [
        showSharedMedia,
        activeGroup?.id,
        chat.activePeer?.device_id,
        fileServerPort
    ]);

    useEffect(() => {
        const handleOpenChat = (event) => {
            const { peerId, peerName } = event.detail;
            console.log('[ChatPage] Opening chat from notification - peerId:', peerId, 'peerName:', peerName);

            const peer = allUsers?.find(u => u.id === peerId || u.device_id === peerId);
            if (peer) {
                setTab('dm');
                chat.selectPeer(peer);
                console.log('[ChatPage] Chat opened for peer:', peer.username);
            } else {
                console.warn('[ChatPage] Could not find peer with ID:', peerId);
            }
        };

        if (typeof window !== 'undefined') {
            window.addEventListener('pingo:open-chat', handleOpenChat);
            return () => {
                window.removeEventListener('pingo:open-chat', handleOpenChat);
            };
        }
    }, [allUsers, chat.selectPeer]);

    useEffect(() => {
        if (!chat.messages || chat.messages.length === 0) return;

        let cancelled = false;
        let pendingTimer = null;

        const loadFile = async (msg, info) => {
            const fileId = info.fileId;
            if (!fileId) return;
            if (loadedFileIdsRef.current.has(fileId)) return;
            if (loadingFilesRef.current.has(fileId)) return;

            loadingFilesRef.current.add(fileId);

            try {
                const dataUrl = await api.readFileAsDataUrl(fileId);
                if (dataUrl && !cancelled) {
                    loadedFileIdsRef.current.add(fileId);
                    setLoadedFileUrls(prev => ({ ...prev, [fileId]: dataUrl }));
                    loadingFilesRef.current.delete(fileId);
                    return;
                }
            } catch { /* file not on disk yet */ }

            if (cancelled) {
                loadingFilesRef.current.delete(fileId);
                return;
            }

            const isMine = msg.sender_id === deviceId;
            if (isMine) {
                loadingFilesRef.current.delete(fileId);
                return;
            }

            let senderIp = peerIpMap[msg.sender_id];
            if (!senderIp) senderIp = peers?.find(p => p.device_id === msg.sender_id)?.ip_address;
            if (!senderIp) senderIp = allUsers?.find(u => u.id === msg.sender_id)?.ip_address;

            if (senderIp && info.port) {
                const remoteUrl = `http://${senderIp.split(':')[0]}:${info.port}/file/${fileId}`;
                const senderName = msg.sender_name || 'Unknown';
                const fileType = msg.message_type || 'file';
                try {
                    await api.autoDownloadFile(remoteUrl, senderName, info.fileName || 'file', fileType, msg.id);
                    if (!cancelled) {
                        const dataUrl = await api.readFileAsDataUrl(fileId).catch(() => null);
                        if (dataUrl) {
                            loadedFileIdsRef.current.add(fileId);
                            setLoadedFileUrls(prev => ({ ...prev, [fileId]: dataUrl }));
                        }
                    }
                } catch { /* ignore — UI shows retry button */ }
            }
            loadingFilesRef.current.delete(fileId);
        };

        const filesToLoad = [];
        chat.messages.forEach(msg => {
            if (msg.message_type === 'image' || msg.message_type === 'video' || msg.message_type === 'file') {
                try {
                    const info = JSON.parse(msg.content);
                    if (info.fileId && !loadedFileIdsRef.current.has(info.fileId) && !loadingFilesRef.current.has(info.fileId)) {
                        filesToLoad.push({ msg, info });
                    }
                } catch { /* not JSON */ }
            }
        });

        if (filesToLoad.length > 0) {
            let idx = 0;
            const processNext = () => {
                if (cancelled || idx >= filesToLoad.length) return;
                const { msg, info } = filesToLoad[idx];
                loadFile(msg, info).finally(() => {
                    idx++;
                    if (!cancelled && idx < filesToLoad.length) {
                        pendingTimer = setTimeout(processNext, 150);
                    }
                });
            };
            processNext();
        }

        return () => {
            cancelled = true;
            if (pendingTimer) clearTimeout(pendingTimer);
        };
    }, [chat.messages, deviceId, peerIpMap, peers, allUsers]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        const handler = (e) => {
            const { fileId, dataUrl } = e.detail || {};
            if (fileId && dataUrl) {
                loadedFileIdsRef.current.add(fileId);
                setLoadedFileUrls(prev => {
                    if (prev[fileId]) return prev; // already cached
                    return { ...prev, [fileId]: dataUrl };
                });
            }
        };
        window.addEventListener('pingo:file-downloaded', handler);
        return () => window.removeEventListener('pingo:file-downloaded', handler);
    }, []);

    useEffect(() => {
        const unsub = api.onFileDownloadProgress(data => {
            const { fileId, fileName, stage, progress } = data || {};
            if (!fileId) return;
            if (stage === 'complete' || stage === 'cached' || stage === 'error') {
                setDownloadProgress(prev => {
                    if (!prev[fileId]) return prev;
                    const n = { ...prev };
                    delete n[fileId];
                    return n;
                });
            } else {
                setDownloadProgress(prev => ({ ...prev, [fileId]: { name: fileName, progress, stage } }));
            }
        });
        return () => { unsub.then?.(fn => fn?.()); };
    }, []);

    const activePeer = chat.activePeer;
    const isOnline = activePeer && peerIpMap[activePeer.device_id];

    useEffect(() => {
        if (!activePeer) return;
        const id = activePeer.device_id || activePeer.id;
        const peerFromPeers = peers.find(p => p.device_id === id);
        const userFromAll = allUsers.find(u => u.id === id);
        const resolvedName = (userFromAll && userFromAll.username) || (peerFromPeers && peerFromPeers.username) || activePeer.username || '';
        const resolvedAvatar = (userFromAll && userFromAll.avatar_path) || (peerFromPeers && peerFromPeers.avatar_path) || activePeer.avatar_path;

        if ((resolvedName && resolvedName !== activePeer.username) || (resolvedAvatar && resolvedAvatar !== activePeer.avatar_path)) {
            chat.updatePeerInfo({
                ...activePeer,
                username: resolvedName,
                avatar_path: resolvedAvatar,
            });
        }
    }, [activePeer?.device_id, peers, allUsers, chat.updatePeerInfo]); // Only re-run on actual peer list changes, not activePeer object changes

    useEffect(() => {
        let cancelled = false;

        const loadSavedReactions = async () => {
            const conversationType = activeGroup ? "group" : "dm";
            const conversationId = activeGroup?.id
                || chat.activePeer?.device_id;

            if (!conversationId) {
                setMessageReactions({});
                return;
            }

            try {
                const rows = await api.getMessageReactions({
                    conversationType,
                    conversationId,
                });

                if (cancelled) return;

                const grouped = {};

                (rows || []).forEach((row) => {
                    // Rust returns: [message_id, user_id, emoji, created_at]
                    const messageId = Array.isArray(row)
                        ? row[0]
                        : row.message_id;

                    const emoji = Array.isArray(row)
                        ? row[2]
                        : row.emoji;

                    if (!messageId || !emoji) return;

                    if (!grouped[messageId]) grouped[messageId] = [];

                    if (!grouped[messageId].includes(emoji)) {
                        grouped[messageId].push(emoji);
                    }
                });

                setMessageReactions(grouped);
                console.log("[REACTION] Loaded saved reactions:", grouped);
            } catch (error) {
                console.error("[REACTION] Failed to load saved reactions:", error);
            }
        };

        loadSavedReactions();

        return () => {
            cancelled = true;
        };
    }, [activeGroup?.id, chat.activePeer?.device_id]);

    const displayActivePeerName = useMemo(() => {
        if (!activePeer) return '';
        const id = activePeer.device_id;
        return peers.find(p => p.device_id === id)?.username
            || allUsers.find(u => u.id === id)?.username
            || activePeer.username || 'Unknown';
    }, [activePeer?.device_id, peers, allUsers]);

    const displayActivePeerAvatar = useMemo(() => {
        if (!activePeer) return undefined;
        const id = activePeer.device_id;
        return peers.find(p => p.device_id === id)?.avatar_path
            || allUsers.find(u => u.id === id)?.avatar_path
            || activePeer.avatar_path;
    }, [activePeer?.device_id, peers, allUsers]);

    const originalSender = forwardingMessage?.sender_id
        ? (users || []).find(
            user => user?.id === forwardingMessage.sender_id ||
                user?.device_id === forwardingMessage.sender_id
        )
        : null;

    const originalSenderName =
        originalSender?.name ||
        originalSender?.full_name ||
        originalSender?.username ||
        'Unknown';



    return (
        <div className="flex h-full min-h-0 w-full overflow-hidden bg-white text-slate-800">
            <div className="flex w-[320px] min-w-70 shrink-0 flex-col border-r border-slate-200 bg-white">
                <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-3">
                    <div className="min-w-0"><h2 className="text-lg font-bold tracking-tight text-slate-900"> Chat </h2></div>

                    <div className="flex shrink-0 items-center gap-1">
                        <div className={`flex items-center overflow-hidden rounded-xl border transition-all duration-300 ${showSearch
                            ? 'w-45 border-indigo-200 bg-indigo-50/40 shadow-sm'
                            : 'w-9 border-transparent bg-transparent'
                            }`}>
                            {showSearch && (
                                <input
                                    autoFocus
                                    type="text"
                                    placeholder="Search contacts..."
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="h-9 min-w-0 flex-1 bg-transparent pl-2 text-sm text-slate-800 outline-none
                                    placeholder:text-slate-400"
                                />
                            )}

                            <button
                                onClick={() => {
                                    if (showSearch) {
                                        setShowSearch(false);
                                        setSearch('');
                                    } else {
                                        setShowSearch(true);
                                    }
                                }}
                                title={showSearch ? "Close search" : "Search contacts"}
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors ${showSearch
                                    ? 'text-indigo-600 hover:text-indigo-800'
                                    : 'text-slate-500 hover:bg-slate-100 hover:text-indigo-600'
                                    }`}
                            >
                                {showSearch ? (
                                    <X size={17} strokeWidth={2} />
                                ) : (
                                    <Search size={18} strokeWidth={2} />
                                )}
                            </button>
                        </div>

                        <div className="mx-1 h-6 w-px bg-slate-200" />

                        {/* NEW GROUP */}
                        <button onClick={() => setShowNewGroup(true)}
                            title="Create new group"
                            className="group inline-flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 
                            transition-all duration-200 hover:bg-indigo-50 hover:text-indigo-600 active:scale-95"
                        >
                            <UserPlus size={18} strokeWidth={1.8} className="transition-transform duration-200 group-hover:scale-110" />
                        </button>
                    </div>
                </div>

                {/* TABS */}
                <div className="flex shrink-0 gap-1 border-b border-slate-200 px-3 py-2">
                    <button className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === 'dm'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                        onClick={() => setTab('dm')}
                    >
                        Direct
                    </button>

                    <button className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === 'groups'
                        ? 'bg-indigo-50 text-indigo-700'
                        : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
                        }`}
                        onClick={() => setTab('groups')}
                    >
                        Groups ({groupsHook.groups.length})
                    </button>
                </div>

                {/* CONTACT / GROUP LIST */}
                <div className="min-h-0 flex-1 overflow-y-auto p-2">

                    {tab === 'dm' ? (

                        userList.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center text-sm
                             text-slate-500">
                                <MessageCircle size={30} className="text-slate-300" />
                                <p>No contacts found</p>
                                <p className="text-[11px] text-slate-400"> Peers on your network will appear here </p>
                            </div>
                        ) : (

                            userList.map(u => {
                                const uid = u.device_id || u.id;
                                const lm = lastMessages[uid];
                                const unread = unreadCounts[uid] || 0;
                                const isActive = activePeer?.device_id === uid && !activeGroup;

                                return (
                                    <div key={uid}
                                        className={`mb-1 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 transition-all duration-150 ${isActive
                                            ? 'bg-indigo-50'
                                            : 'hover:bg-slate-50'
                                            }`}
                                        onClick={() => selectDmPeer(u)}
                                    >
                                        <div className="relative shrink-0">
                                            <UserAvatar name={u.username} size={42} avatarUrl={u.avatar_path} />

                                            <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 
                                                 border-white ${u.is_online
                                                    ? 'bg-emerald-500'
                                                    : 'bg-slate-300'
                                                }`}
                                            />
                                        </div>

                                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                                            <span className={`truncate text-sm font-semibold ${isActive
                                                ? 'text-indigo-700'
                                                : 'text-slate-800'
                                                }`}>
                                                {u.username || 'Unknown'}
                                            </span>

                                            <span className="truncate text-xs text-slate-500">
                                                {lm
                                                    ? (
                                                        (lm.message_type === 'text' || !lm.message_type)
                                                            ? lm.content?.slice(0, 40)
                                                            : `📎 ${lm.message_type}`
                                                    )
                                                    : (u.is_online ? 'Online' : 'Offline')
                                                }
                                            </span>
                                        </div>

                                        <div className="flex shrink-0 flex-col items-end gap-1">
                                            {lm?.created_at && (
                                                <span className="text-[10px] text-slate-400">{formatTime(lm.created_at)}</span>
                                            )}

                                            {unread > 0 && (
                                                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-indigo-600 px-1.5 text-[10px] font-bold text-white">
                                                    {unread}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )

                    ) : (

                        groupsHook.groups.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center text-sm text-slate-500">
                                <Users size={32} className="text-slate-300" />

                                <p>No groups yet</p>

                                <button
                                    className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-indigo-700"
                                    onClick={() => setShowNewGroup(true)}
                                >
                                    Create Group
                                </button>
                            </div>
                        ) : (

                            groupsHook.groups.map(g => {
                                const glm = groupLastMessages[g.id];

                                const sender = glm?.sender_name
                                    ? `${glm.sender_name}: `
                                    : '';

                                const messageType = glm?.message_type || 'text';

                                const glmPreview = !glm
                                    ? 'No messages yet'
                                    : messageType === 'text'
                                        ? `${sender}${glm.content || ''}`.slice(0, 45)
                                        : messageType === 'image'
                                            ? `${sender}📷 Photo`
                                            : messageType === 'video'
                                                ? `${sender}🎥 Video`
                                                : messageType === 'file'
                                                    ? `${sender}📎 File`
                                                    : `${sender}${messageType}`;
                                const isActive = activeGroup?.id === g.id;

                                return (
                                    <div
                                        key={g.id}
                                        className={`mb-1 flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 transition-all duration-150 ${isActive
                                            ? 'bg-indigo-50'
                                            : 'hover:bg-slate-50'
                                            }`}
                                        onClick={() => selectGroup(g)}
                                    >
                                        <div
                                            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                                            style={{
                                                background: g.avatar_color || '#059669'
                                            }}
                                        >
                                            <Users size={19} strokeWidth={2} />
                                        </div>

                                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                                            <span
                                                className={`truncate text-sm font-semibold ${isActive
                                                    ? 'text-indigo-700'
                                                    : 'text-slate-800'
                                                    }`}
                                            >
                                                {g.name}
                                            </span>

                                            <span className="truncate text-xs text-slate-500">
                                                {glmPreview}
                                            </span>
                                        </div>

                                        {glm?.created_at && (
                                            <div className="flex shrink-0 flex-col items-end">
                                                <span className="text-[10px] text-slate-400">
                                                    {formatTime(glm.created_at)}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })
                        )
                    )}
                </div>
            </div>

            {!activePeer && !activeGroup ? (

                <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
                    <div className="flex min-h-0 flex-1 items-center justify-center">
                        <div className="flex max-w-sm flex-col items-center gap-0 px-6 text-center">
                            <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-indigo-50 mb-2">
                                <MessageCircle size={38} strokeWidth={1.5} className="text-indigo-400" />
                            </div>
                            <h3 className="text-lg font-semibold text-slate-700"> Select a conversation</h3>
                            <p className="text-sm text-slate-400">Choose a contact or group to start chatting</p>
                        </div>
                    </div>
                </div>

            ) : activeGroup ? (

                <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">

                    {/* GROUP HEADER */}
                    <div className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">

                        <div className="flex min-w-0 cursor-pointer items-center gap-3"
                            onClick={() => setShowGroupInfo(true)}
                        >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white"
                                style={{ background: activeGroup.avatar_color || '#059669' }}
                            >
                                <Users size={18} strokeWidth={2} />
                            </div>

                            <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-800"> {activeGroup.name} </div>
                                <div className="mt-0.5 text-xs text-slate-500"> {groupMembers.length} members </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-1">
                            <button
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600"
                                title="Shared Media"
                                onClick={() => setShowSharedMedia(true)}
                            >
                                <Image size={18} />
                            </button>

                            <button className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 
                            transition hover:bg-slate-100 hover:text-indigo-600"
                                title="Group Info"
                                onClick={() => setShowGroupInfo(!showGroupInfo)}
                            >
                                <Info size={18} strokeWidth={2} />
                            </button>

                            <button className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-500 
                            transition hover:bg-red-50 hover:text-red-600"
                                title="Leave Group"
                                onClick={() => {
                                    groupsHook.leaveGroup(activeGroup.id);
                                    setActiveGroup(null);
                                }}
                            >
                                <LogOut size={18} strokeWidth={2} />
                            </button>
                        </div>
                    </div>

                    {/* GROUP MESSAGES */}
                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 px-5 py-5">

                        {groupMessages.map(msg => {
                            const isMine = msg.sender_id === deviceId;
                            const isMedia =
                                msg.message_type === 'image' ||
                                msg.message_type === 'video' ||
                                msg.message_type === 'file';

                            let fileData = null;

                            if (isMedia) {
                                if (msg._localDataUrl) {
                                    fileData = {
                                        url: msg._localDataUrl,
                                        fileName: msg._fileName || 'file',
                                        type: msg._fileType || msg.message_type,
                                        fileId: msg._fileId
                                    };
                                } else {
                                    const senderIp = isMine
                                        ? '127.0.0.1'
                                        : peerIpMap[msg.sender_id];

                                    fileData = resolveFileUrl(
                                        msg.content,
                                        senderIp,
                                        fileServerPort
                                    );
                                }
                            }

                            let displayUrl = null;

                            if (fileData) {
                                if (fileData.fileId && loadedFileUrls[fileData.fileId]) {
                                    displayUrl = loadedFileUrls[fileData.fileId];
                                } else if (fileData.url) {
                                    displayUrl = fileData.url;
                                }
                            }


                            return (
                                <div
                                    key={msg.id}
                                    className={`group relative flex max-w-[78%] flex-col gap-1.5 ${isMine
                                        ? "self-end items-end"
                                        : "self-start items-start"
                                        }`}
                                    onContextMenu={e => handleMsgContextMenu(e, msg)}
                                    onTouchStart={e => handleMessageTouchStart(e, msg)}
                                    onTouchMove={cancelMessageLongPress}
                                    onTouchEnd={cancelMessageLongPress}
                                >
                                    {/* Sender name */}
                                    {!isMine && (
                                        <span className="
                px-2 text-[11px] font-semibold
                tracking-wide text-[#8495B2]
            ">
                                            {msg.sender_name ||
                                                resolveUsernameById(msg.sender_id) ||
                                                "Unknown"}
                                        </span>
                                    )}

                                    <ChatBubble
                                        isMine={isMine}
                                        time={formatTime(msg.created_at)}
                                    >
                                        {isMedia && fileData ? (
                                            <div className="flex max-w-full flex-col gap-2">

                                                {msg.message_type === "image" ? (
                                                    <img
                                                        src={displayUrl || ""}
                                                        alt={fileData.fileName}
                                                        className="
                                max-h-80 max-w-[min(360px,65vw)]
                                cursor-zoom-in rounded-xl
                                object-contain
                            "
                                                        loading="lazy"
                                                        onClick={() =>
                                                            setLightbox({
                                                                url: displayUrl || "",
                                                                fileName: fileData.fileName,
                                                            })
                                                        }
                                                    />
                                                ) : msg.message_type === "video" ? (
                                                    <video
                                                        src={displayUrl || ""}
                                                        controls
                                                        className="max-w-full rounded-xl"
                                                        preload="metadata"
                                                    />
                                                ) : (
                                                    <div className="
                            flex max-w-70 items-center gap-3
                            rounded-xl border border-[#E5EAF2]
                            bg-white/70 px-3 py-3
                            text-sm text-slate-700
                        ">
                                                        <FileText
                                                            size={20}
                                                            strokeWidth={2}
                                                            className="shrink-0 text-[#7795C2]"
                                                        />
                                                        <span className="break-all">
                                                            {fileData.fileName}
                                                        </span>
                                                    </div>
                                                )}

                                                {displayUrl && (
                                                    <div className="mt-1 flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            className="
                                    inline-flex h-8 w-8 items-center
                                    justify-center rounded-lg
                                    border border-[#E3EAF3]
                                    bg-white/80 text-slate-500
                                    transition-all duration-200
                                    hover:bg-white hover:text-[#648FCB]
                                    hover:shadow-sm
                                "
                                                            onClick={() =>
                                                                handleDownload(
                                                                    displayUrl,
                                                                    fileData.fileName
                                                                )
                                                            }
                                                            title="Save As..."
                                                        >
                                                            <Download size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                {normalizeReply(msg.reply_to) && (() => {
                                                    const reply = normalizeReply(msg.reply_to);

                                                    return (
                                                        <div className={`
                                mb-2 rounded-lg border-l-[3px]
                                px-3 py-2
                                ${isMine
                                                                ? "border-[#85A8D8] bg-white/55"
                                                                : "border-[#A5B4FC] bg-[#F5F6FC]"
                                                            }
                            `}>
                                                            <p className="mb-1 text-xs font-semibold text-[#7186B2]">
                                                                {getReplySender(reply)}
                                                            </p>

                                                            <p className="line-clamp-2 break-words text-xs text-slate-500">
                                                                {reply.content || reply.text || "Message"}
                                                            </p>
                                                        </div>
                                                    );
                                                })()}

                                                <span className="whitespace-pre-wrap break-words">
                                                    {msg.content}
                                                </span>
                                            </>
                                        )}
                                    </ChatBubble>

                                    {/* Starred indicator */}
                                    {starredMessages.has(msg.id) && (
                                        <div
                                            className="
                    absolute -top-1.5 right-2 z-10
                    flex h-5 w-5 items-center justify-center
                    rounded-full border border-[#FDE7B0]
                    bg-white shadow-sm
                "
                                            title="Starred message"
                                        >
                                            <Star
                                                size={11}
                                                className="fill-amber-400 text-amber-500"
                                            />
                                        </div>
                                    )}

                                </div>
                            );

                        })}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* GROUP UPLOAD PROGRESS */}
                    {Object.keys(uploadProgress).length > 0 && (
                        <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-2">
                            {Object.entries(uploadProgress).map(([id, p]) => (
                                <div key={id} className="flex items-center gap-3 text-xs">
                                    <span className="min-w-0 flex-1 truncate text-slate-500"> {p.error ? '✗' : '↑'} {p.name}</span>

                                    {p.error ? (
                                        <span className="text-red-500"> Failed</span>
                                    ) : (
                                        <>
                                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                                                <div className="h-full rounded-full bg-indigo-600 transition-all"
                                                    style={{ width: `${p.progress}%` }}
                                                />
                                            </div>

                                            <span className="min-w-8 text-right text-slate-400"> {p.progress}% </span>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* GROUP COMPOSER */}
                    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">

                        {/* GROUP REPLY PREVIEW */}
                        {replyingTo && (
                            <div className="mb-3 flex items-center justify-between rounded-xl border-l-4 border-indigo-500 bg-indigo-50 px-4 py-3">
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-indigo-600">
                                        Replying to {replyingTo.sender_name || "message"}
                                    </p>

                                    <p className="truncate text-sm text-slate-600"> {replyingTo.content || replyingTo.text}</p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setReplyingTo(null)}
                                    className="ml-3 rounded-lg p-2 text-slate-500 transition hover:bg-indigo-100 hover:text-indigo-600"
                                    title="Cancel reply"
                                >
                                    <X size={17} />
                                </button>
                            </div>
                        )}

                        <div className="flex items-center gap-2">

                            <input ref={groupFileInputRef} type="file" hidden onChange={handleGroupFileSelect} />

                            {/* ATTACH */}
                            <button
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600"
                                title="Attach file"
                                onClick={() => groupFileInputRef.current?.click()}
                            >
                                <Plus size={21} />
                            </button>

                            {/* EMOJI */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowEmojiPicker(prev => !prev)}
                                    className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${showEmojiPicker
                                        ? "bg-indigo-50 text-indigo-600"
                                        : "text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                                        }`}
                                    title="Add emoji"
                                >
                                    <Smile size={21} />
                                </button>

                                {showEmojiPicker && (
                                    <div className="absolute bottom-14 left-0 z-50">
                                        <EmojiPicker
                                            onEmojiClick={emojiData => { setInputText(prev => prev + emojiData.emoji); }}
                                            width={320}
                                            height={400}
                                            searchDisabled={false}
                                            previewConfig={{ showPreview: false }}
                                            lazyLoadEmojis
                                            theme="light"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* INPUT */}
                            <input
                                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                                style={{ fontFamily: 'Inter, "Segoe UI Emoji", "Noto Color Emoji", sans-serif' }}
                                placeholder="Type a message..."
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />

                            {/* SEND */}
                            <button
                                type="button"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                                onClick={handleSend}
                                disabled={!inputText.trim()}
                                title="Send message"
                            >
                                <Send size={18} strokeWidth={2} />
                            </button>
                        </div>
                    </div>

                    {/* GROUP INFO SIDEBAR */}
                    {showGroupInfo && (
                        <div className="absolute inset-y-0 right-0 z-20 flex w-75 max-w-[85%] flex-col border-l border-slate-200 bg-white shadow-xl">

                            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4">
                                <h4 className="text-sm font-semibold text-slate-800"> Group Info</h4>

                                <button
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                                    onClick={() => setShowGroupInfo(false)}
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="min-h-0 flex-1 overflow-y-auto p-4">

                                <h5 className="mb-2 mt-4 text-sm font-semibold text-slate-700">Members ({groupMembers.length})</h5>

                                {groupMembers.map(m => (
                                    <div key={m.user_id}
                                        className="flex items-center gap-2 border-b border-slate-100 py-2 text-sm text-slate-700"
                                    >
                                        <UserAvatar name={m.username} size={30} avatarUrl={m.avatar_path} />

                                        <span>{m.username}</span>

                                        {m.role === 'admin' && (
                                            <span className="ml-auto rounded-full bg-indigo-50 px-2 py-1 text-[10px] font-semibold text-indigo-600">
                                                Admin
                                            </span>
                                        )}

                                        {activeGroup.created_by === deviceId &&
                                            m.user_id !== deviceId && (
                                                <button
                                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-red-500 transition hover:bg-red-50 hover:text-red-600"
                                                    title="Remove"
                                                    onClick={() =>
                                                        groupsHook.removeMember(
                                                            activeGroup.id,
                                                            m.user_id
                                                        )
                                                    }
                                                >
                                                    <X size={15} />
                                                </button>
                                            )
                                        }
                                    </div>
                                ))}

                                {activeGroup.created_by === deviceId && (
                                    <button
                                        className="mt-3 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                                        onClick={() => {
                                            setShowGroupInfo(false);
                                            setShowNewGroup('add-member');
                                        }}
                                    >
                                        <Plus size={14} className="mr-1" />
                                        Add Member
                                    </button>
                                )}

                                <hr className="my-4 border-slate-200" />

                                {activeGroup.created_by === deviceId && (
                                    <button
                                        className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50"
                                        onClick={() => {
                                            groupsHook.deleteGroup(activeGroup.id);
                                            setActiveGroup(null);
                                        }}
                                    >
                                        Delete Group
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* GROUP SHARED MEDIA SIDEBAR */}
                    {showSharedMedia && (() => {
                        const groupSharedMedia = groupMessages
                            .filter(msg => ['image', 'video', 'file'].includes(msg.message_type))
                            .map(msg => {
                                let info = {};

                                try {
                                    info = JSON.parse(msg.content);
                                } catch {
                                    // Ignore invalid file metadata
                                }

                                const fileId = msg._fileId || info.fileId;
                                const fileName = msg._fileName || info.fileName || 'file';
                                const fileType = msg._fileType || info.type || msg.message_type;

                                return {
                                    ...msg,
                                    _fileId: fileId,
                                    _fileName: fileName,
                                    _fileType: fileType,
                                    _localDataUrl:
                                        (fileId && loadedFileUrls[fileId]) ||
                                        msg._localDataUrl ||
                                        '',
                                };
                            });

                        const media = groupSharedMedia.filter(m =>
                            ['image', 'video'].includes(m.message_type) ||
                            m._fileType?.startsWith('image/') ||
                            m._fileType?.startsWith('video/')
                        );

                        const files = groupSharedMedia.filter(m =>
                            m.message_type === 'file'
                        );

                        return (
                            <div className="absolute inset-y-0 right-0 z-30 flex w-80 max-w-[90%] flex-col border-l border-slate-200 bg-white shadow-xl">

                                {/* HEADER */}
                                <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4">
                                    <div>
                                        <h4 className="text-sm font-semibold text-slate-800">
                                            Shared Media
                                        </h4>
                                        <p className="text-[11px] text-slate-400">{groupSharedMedia.length} shared items</p>
                                    </div>

                                    <button
                                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
                                        onClick={() => setShowSharedMedia(false)}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>

                                {/* TABS */}
                                <div className="flex shrink-0 border-b border-slate-200 px-3">

                                    <button
                                        className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-2 py-3 text-xs font-medium transition ${sharedMediaTab === 'images'
                                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                            : 'border-transparent text-slate-500 hover:text-indigo-600'
                                            }`}
                                        onClick={() => setSharedMediaTab('images')}
                                    >
                                        <Image size={14} />
                                        Media ({media.length})
                                    </button>

                                    <button
                                        className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-2 py-3 text-xs font-medium transition ${sharedMediaTab === 'files'
                                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                            : 'border-transparent text-slate-500 hover:text-indigo-600'
                                            }`}
                                        onClick={() => setSharedMediaTab('files')}
                                    >
                                        <FileText size={14} />
                                        Files ({files.length})
                                    </button>
                                </div>

                                {/* CONTENT */}
                                <div className="min-h-0 flex-1 overflow-y-auto p-3">

                                    {sharedMediaTab === 'images' ? (

                                        media.length === 0 ? (
                                            <div className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-slate-400">
                                                <Image size={28} className="text-slate-300" />
                                                No media shared yet
                                            </div>
                                        ) : (

                                            <div className="grid grid-cols-3 gap-2">
                                                {media.map(m => {
                                                    const url = m._localDataUrl;

                                                    return (
                                                        <div
                                                            key={m.id}
                                                            className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-slate-100"
                                                            onClick={() => {
                                                                if (!url) return;

                                                                if (m.message_type === 'video') {
                                                                    setLightbox({
                                                                        url,
                                                                        fileName: m._fileName,
                                                                    });
                                                                } else {
                                                                    setLightbox({
                                                                        url,
                                                                        fileName: m._fileName,
                                                                    });
                                                                }
                                                            }}
                                                        >
                                                            {url ? (
                                                                m.message_type === 'video' ? (
                                                                    <video src={url} className="h-full w-full object-cover" preload="metadata" />
                                                                ) : (
                                                                    <img src={url} alt={m._fileName} className="h-full w-full object-cover"
                                                                        loading="lazy" />
                                                                )
                                                            ) : (
                                                                <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-400">
                                                                    <Image size={22} />
                                                                    <span className="text-[9px]">Not downloaded</span>
                                                                </div>
                                                            )}

                                                            <span className="absolute inset-x-0 bottom-0 bg-black/50 px-1 py-1 text-[9px] text-white">
                                                                {formatTime(m.created_at)}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )

                                    ) : (

                                        files.length === 0 ? (
                                            <div className="flex h-40 flex-col items-center justify-center gap-2 text-xs text-slate-400">
                                                <FileText size={28} className="text-slate-300" />
                                                No files shared yet
                                            </div>
                                        ) : (

                                            <div className="flex flex-col">
                                                {files.map(m => (
                                                    <div key={m.id}
                                                        className="flex items-center gap-3 border-b border-slate-100 px-2 py-3 transition hover:bg-slate-50"
                                                    >
                                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                                                            <FileText size={20} />
                                                        </div>

                                                        <div className="flex min-w-0 flex-1 flex-col gap-1">
                                                            <span className="truncate text-xs font-medium text-slate-700"> {m._fileName}
                                                            </span>

                                                            <span className="text-[10px] text-slate-400">
                                                                {m.sender_name || 'Unknown'} · {formatTime(m.created_at)}
                                                            </span>
                                                        </div>

                                                        {m._localDataUrl && (
                                                            <button
                                                                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600"
                                                                onClick={() =>
                                                                    handleDownload(
                                                                        m._localDataUrl,
                                                                        m._fileName
                                                                    )
                                                                }
                                                                title="Download"
                                                            >
                                                                <Download size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </div>

            ) : (

                <div className={`relative flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50 ${dragOver ? 'ring-2 ring-inset ring-indigo-400 bg-indigo-50' : ''
                    }`}
                    onDragOver={e => {
                        e.preventDefault();
                        setDragOver(true);
                    }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                >

                    {/* DM HEADER */}
                    <div className="z-10 flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-5">

                        <div className="flex min-w-0 cursor-pointer items-center gap-3"
                            onClick={() => setShowProfile(activePeer)}
                        >
                            <UserAvatar name={displayActivePeerName} size={38} avatarUrl={displayActivePeerAvatar} />

                            <div className="min-w-0">
                                <div className="truncate text-sm font-semibold text-slate-800"> {displayActivePeerName}</div>

                                <div className="mt-0.5 text-[11px] text-slate-500">
                                    {isOnline ? (
                                        <span className="text-emerald-600"> ● Online </span>
                                    ) : (
                                        <span>  ● Offline </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-1">

                            <button
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600"
                                title="Shared Media"
                                onClick={() => setShowSharedMedia(true)}
                            >
                                <Image size={18} />
                            </button>

                            <button
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600"
                                title="Attach file"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Paperclip size={18} />
                            </button>

                            <button
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-red-500 transition hover:bg-red-50 hover:text-red-600"
                                title="Clear all chat"
                                onClick={() => setConfirmClearChat(true)}
                            >
                                <Trash2 size={18} />
                            </button>

                            <input ref={fileInputRef} type="file" hidden onChange={handleFileSelect} />
                        </div>
                    </div>

                    {/* DM MESSAGES */}
                    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-slate-50 px-5 py-5">

                        {chat.loading && (
                            <div className="flex items-center justify-center px-4 py-10 text-sm text-slate-400">Loading messages...
                            </div>
                        )}

                        {chat.messages.map(msg => {
                            const isMine = msg.sender_id === deviceId;
                            const senderIp = !isMine
                                ? peerIpMap[msg.sender_id]
                                : '127.0.0.1';

                            const isMedia =
                                msg.message_type === 'image' ||
                                msg.message_type === 'video' ||
                                msg.message_type === 'file';

                            let fileData = null;
                            let fileId = null;

                            if (isMedia) {
                                try {
                                    const info = JSON.parse(msg.content);

                                    fileId = info.fileId;
                                    fileData = {
                                        fileName: info.fileName || msg._fileName || 'file',
                                        type: info.type || msg._fileType || msg.message_type,
                                        fileId: info.fileId,
                                    };
                                } catch {
                                    fileData = resolveFileUrl(
                                        msg.content,
                                        senderIp,
                                        fileServerPort
                                    );
                                }
                            }

                            let displayUrl = null;

                            if (fileData) {
                                if (fileId && loadedFileUrls[fileId]) {
                                    displayUrl = loadedFileUrls[fileId];
                                } else if (
                                    msg._localDataUrl &&
                                    msg._localDataUrl.startsWith('data:')
                                ) {
                                    displayUrl = msg._localDataUrl;
                                }
                            }

                            const isFileLoading = isMedia && fileId && !loadedFileUrls[fileId] && !displayUrl;
                            const imgKey = `${msg.id}-${displayUrl ? 'loaded' : 'pending'}`;


                            return (
                                <div
                                    key={msg.id}
                                    className={`group relative flex max-w-[78%] flex-col gap-1.5 ${isMine
                                        ? "self-end items-end"
                                        : "self-start items-start"
                                        }`}
                                    onContextMenu={e => handleMsgContextMenu(e, msg)}
                                    onTouchStart={e => handleMessageTouchStart(e, msg)}
                                    onTouchMove={cancelMessageLongPress}
                                    onTouchEnd={cancelMessageLongPress}
                                >
                                    <ChatBubble
                                        isMine={isMine}
                                        time={formatTime(msg.created_at)}
                                    >
                                        {isMedia && fileData ? (
                                            <div className="flex max-w-full flex-col gap-2">

                                                {msg.message_type === "image" ? (
                                                    <img
                                                        src={displayUrl || ""}
                                                        alt={fileData.fileName}
                                                        className=" max-h-80 max-w-[min(360px,65vw)] cursor-zoom-in rounded-xl object-contain"
                                                        loading="lazy"
                                                        onClick={() =>
                                                            setLightbox({
                                                                url: displayUrl || "",
                                                                fileName: fileData.fileName,
                                                            })
                                                        }
                                                    />
                                                ) : msg.message_type === "video" ? (
                                                    <video
                                                        src={displayUrl || ""}
                                                        controls
                                                        className="max-w-full rounded-xl"
                                                        preload="metadata"
                                                    />
                                                ) : (
                                                    <div className="flex max-w-70 items-center gap-3 rounded-xl border border-[#E5EAF2] bg-white/70 px-3 py-3
                                                        text-sm text-slate-700 ">
                                                        <FileText
                                                            size={20}
                                                            strokeWidth={2}
                                                            className="shrink-0 text-[#7795C2]"
                                                        />
                                                        <span className="break-all">
                                                            {fileData.fileName}
                                                        </span>
                                                    </div>
                                                )}

                                                {displayUrl && (
                                                    <div className="mt-1 flex items-center gap-1">
                                                        <button
                                                            type="button"
                                                            className=" inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#E3EAF3]
                                                            bg-white/80 text-slate-500 transition-all duration-200 hover:bg-white hover:text-[#648FCB] hover:shadow-sm"
                                                            onClick={() =>
                                                                handleDownload(
                                                                    displayUrl,
                                                                    fileData.fileName
                                                                )
                                                            }
                                                            title="Save As..."
                                                        >
                                                            <Download size={14} />
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                {normalizeReply(msg.reply_to) && (() => {
                                                    const reply = normalizeReply(msg.reply_to);

                                                    return (
                                                        <div className={` mb-2 rounded-lg border-l-[3px] px-3 py-2
                                                            ${isMine
                                                                ? "border-[#85A8D8] bg-white/55"
                                                                : "border-[#A5B4FC] bg-[#F5F6FC]"
                                                            }
                                                        `}>
                                                            <p className="mb-1 text-xs font-semibold text-[#7186B2]">
                                                                {getReplySender(reply)}
                                                            </p>

                                                            <p className="line-clamp-2 break-words text-xs text-slate-500">
                                                                {reply.content || reply.text || "Message"}
                                                            </p>
                                                        </div>
                                                    );
                                                })()}

                                                <span className="whitespace-pre-wrap break-words">
                                                    {msg.content}
                                                </span>
                                            </>
                                        )}
                                    </ChatBubble>

                                    {/* Starred indicator */}
                                    {starredMessages.has(msg.id) && (
                                        <div
                                            className=" absolute -top-1.5 right-2 z-10 flex h-5 w-5 items-center justify-center rounded-full border
                                            border-[#FDE7B0] bg-white shadow-sm"
                                            title="Starred message"
                                        >
                                            <Star size={11} className="fill-amber-400 text-amber-500" />
                                        </div>
                                    )}

                                    {/* Message reactions */}
                                    {(messageReactions[msg.id] || []).length > 0 && (
                                        <div
                                            className={`relative z-20 flex flex-wrap gap-1 px-1 ${isMine ? "justify-end" : "justify-start"
                                                }`}
                                        >
                                            {(messageReactions[msg.id] || []).map(emoji => (
                                                <button
                                                    key={emoji}
                                                    type="button"
                                                    onClick={() => handleReaction(msg, emoji)}
                                                    className="flex h-7 min-w-8 items-center justify-center rounded-full border border-[#E5EAF3] bg-white px-2.5 text-sm shadow-sm"
                                                >
                                                    {emoji}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );

                        })}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* DM UPLOAD PROGRESS */}
                    {Object.keys(uploadProgress).length > 0 && (
                        <div className="flex flex-col gap-2 border-t border-slate-200 bg-white px-4 py-2">

                            {Object.entries(uploadProgress).map(([id, p]) => (
                                <div key={id} className="flex items-center gap-3 text-xs"
                                >
                                    <span className="min-w-0 flex-1 truncate text-slate-500">{p.error ? '✗' : '↑'} {p.name}</span>

                                    {p.error ? (
                                        <span className="text-red-500"> Failed </span>
                                    ) : (
                                        <>
                                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-200">
                                                <div className="h-full rounded-full bg-indigo-600 transition-all"
                                                    style={{ width: `${p.progress}%` }}
                                                />
                                            </div>

                                            <span className="min-w-8 text-right text-slate-400">{p.progress}%</span>
                                        </>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {/* DM COMPOSER */}
                    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3">

                        {/* REPLY PREVIEW */}
                        {replyingTo && (
                            <div className="mb-3 flex items-center justify-between rounded-xl border-l-4 border-indigo-500 bg-indigo-50 px-4 py-3">

                                <div className="min-w-0">
                                    <p className="text-xs font-semibold text-indigo-600">
                                        Replying to {replyingTo.sender_name || "message"}
                                    </p>

                                    <p className="truncate text-sm text-slate-600">{replyingTo.content || replyingTo.text}</p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setReplyingTo(null)}
                                    className="ml-3 rounded-lg p-2 text-slate-500 transition hover:bg-indigo-100 hover:text-indigo-600"
                                    title="Cancel reply"
                                >
                                    <X size={17} />
                                </button>
                            </div>
                        )}

                        {/* INPUT ROW */}
                        <div className="flex items-center gap-2">

                            {/* ATTACH */}
                            <button
                                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600"
                                title="Attach"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Plus size={21} />
                            </button>

                            {/* EMOJI */}
                            <div className="relative">

                                <button
                                    type="button"
                                    onClick={() => setShowEmojiPicker(prev => !prev)}
                                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${showEmojiPicker
                                        ? "bg-indigo-50 text-indigo-600"
                                        : "text-slate-500 hover:bg-slate-100 hover:text-indigo-600"
                                        }`}
                                    title="Add emoji"
                                >
                                    <Smile size={21} />
                                </button>

                                {showEmojiPicker && (
                                    <div className="absolute bottom-14 left-0 z-50">
                                        <EmojiPicker
                                            onEmojiClick={emojiData => { setInputText(prev => prev + emojiData.emoji); }}
                                            width={320}
                                            height={400}
                                            searchDisabled={false}
                                            previewConfig={{ showPreview: false }}
                                            lazyLoadEmojis
                                            theme="light"
                                        />
                                    </div>
                                )}
                            </div>

                            {/* TEXT INPUT */}
                            <input
                                className="h-11 min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                                style={{ fontFamily: 'Inter, "Segoe UI Emoji", "Noto Color Emoji", sans-serif' }}
                                placeholder="Type a message..."
                                value={inputText}
                                onChange={e => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />

                            {/* SEND */}
                            <button
                                type="button"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm transition hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                                onClick={handleSend}
                                disabled={!inputText.trim()}
                                title="Send message"
                            >
                                <Send size={18} strokeWidth={2} />
                            </button>
                        </div>
                    </div>

                    {/* SHARED MEDIA SIDEBAR */}
                    {showSharedMedia && (
                        <div className="absolute inset-y-0 right-0 z-20 flex w-75 max-w-[85%] flex-col border-l border-slate-200 bg-white shadow-xl">

                            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4">
                                <h4 className="text-sm font-semibold text-slate-800">Shared Media</h4>

                                <button
                                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                                    onClick={() => setShowSharedMedia(false)}
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* MEDIA TABS */}
                            <div className="flex shrink-0 border-b border-slate-200 px-3">

                                <button
                                    className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-2 py-3 text-xs font-medium transition ${sharedMediaTab === 'images'
                                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                        : 'border-transparent text-slate-500 hover:text-indigo-600'
                                        }`}
                                    onClick={() => setSharedMediaTab('images')}
                                >
                                    <Image size={14} />
                                    Images
                                </button>

                                <button
                                    className={`flex flex-1 items-center justify-center gap-2 border-b-2 px-2 py-3 text-xs font-medium transition ${sharedMediaTab === 'files'
                                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                                        : 'border-transparent text-slate-500 hover:text-indigo-600'
                                        }`}
                                    onClick={() => setSharedMediaTab('files')}
                                >
                                    <FileText size={14} />
                                    Files
                                </button>
                            </div>

                            {/* MEDIA CONTENT */}
                            <div className="min-h-0 flex-1 overflow-y-auto p-3">

                                {sharedMediaTab === 'images' ? (

                                    (() => {
                                        const images = sharedMediaList.filter(m => {
                                            const type = (m._fileType || '').toLowerCase();

                                            return (
                                                m.message_type === 'image' ||
                                                m.message_type === 'video' ||
                                                type.startsWith('image/') ||
                                                type.startsWith('video/')
                                            );
                                        });

                                        if (images.length === 0) {
                                            return (
                                                <div className="flex h-32 items-center justify-center text-xs text-slate-400">
                                                    No images shared yet
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="grid grid-cols-3 gap-2">
                                                {images.map(m => {
                                                    let url = m._localDataUrl || '';

                                                    if (m._fileId && loadedFileUrls[m._fileId]) {
                                                        url = loadedFileUrls[m._fileId];
                                                    }

                                                    return (
                                                        <div
                                                            key={m.id}
                                                            className="relative aspect-square cursor-pointer overflow-hidden rounded-lg bg-slate-100 transition hover:opacity-80"
                                                            onClick={() =>
                                                                setLightbox({
                                                                    url,
                                                                    fileName: m._fileName || 'image'
                                                                })
                                                            }
                                                        >
                                                            {m.message_type === 'video' ? (
                                                                <video
                                                                    src={url}
                                                                    className="h-full w-full object-cover"
                                                                    preload="metadata"
                                                                />
                                                            ) : (
                                                                <img
                                                                    src={url}
                                                                    alt={m._fileName || 'image'}
                                                                    className="h-full w-full object-cover"
                                                                    loading="lazy"
                                                                />
                                                            )}

                                                            <span className="absolute inset-x-0 bottom-0 bg-black/50 px-1 py-1 text-[9px] text-white">
                                                                {formatTime(m.created_at)}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()

                                ) : (

                                    (() => {
                                        const files = sharedMediaList.filter(
                                            m => m.message_type === 'file'
                                        );

                                        if (files.length === 0) {
                                            return (
                                                <div className="flex h-32 items-center justify-center text-xs text-slate-400">
                                                    No files shared yet
                                                </div>
                                            );
                                        }

                                        return (
                                            <div className="flex flex-col">
                                                {files.map(m => {
                                                    let url = m._localDataUrl || '';

                                                    if (m._fileId && loadedFileUrls[m._fileId]) {
                                                        url = loadedFileUrls[m._fileId];
                                                    }

                                                    const isMine = m.sender_id === deviceId;

                                                    return (
                                                        <div
                                                            key={m.id}
                                                            className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-2 py-3 transition hover:bg-slate-50"
                                                            onClick={() => handleOpenFileLocation(m)}
                                                        >
                                                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600">
                                                                <FileText size={20} />
                                                            </div>

                                                            <div className="flex min-w-0 flex-1 flex-col gap-1">
                                                                <span className="truncate text-xs font-medium text-slate-700">
                                                                    {m._fileName || 'file'}
                                                                </span>

                                                                <span className="text-[10px] text-slate-400">
                                                                    {isMine ? 'Sent' : 'Received'} · {formatTime(m.created_at)}
                                                                </span>
                                                            </div>

                                                            {url && (
                                                                <button
                                                                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-indigo-600"
                                                                    onClick={e => {
                                                                        e.stopPropagation();
                                                                        handleDownload(url, m._fileName || 'file');
                                                                    }}
                                                                    title="Download"
                                                                >
                                                                    <Download size={14} />
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {contextMenu && (
                <>
                    {/* OUTSIDE CLICK */}
                    <div className="fixed inset-0 z-9998" onMouseDown={closeContextMenu} />

                    {/* MENU */}
                    <div
                        data-message-context-menu
                        className="fixed z-9999 w-55 max-w-[calc(100vw-20px)] animate-in fade-in zoom-in-95 duration-150"
                        style={{ top: contextMenu.y, left: contextMenu.x, }}
                        onMouseDown={e => e.stopPropagation()}
                        onContextMenu={e => e.preventDefault()}
                    >
                        {/* REACTIONS */}
                        <div className="relative mb-2 flex items-center justify-between gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">

                            {["👍", "❤️", "😂", "😮", "😢"].map(emoji => (
                                <button key={emoji}
                                    type="button"
                                    title={`React ${emoji}`}
                                    onClick={() => {
                                        handleReaction(contextMenu.message, emoji);
                                        setShowReactionEmojiPicker(false);
                                        setContextMenu(null);
                                    }}
                                    className="flex h-9 w-9 items-center justify-center rounded-xl text-xl transition hover:scale-125 hover:bg-slate-100 active:scale-95"
                                >
                                    {emoji}
                                </button>
                            ))}

                            {/* ADD MORE EMOJIS */}
                            <button
                                type="button"
                                title="More emojis"
                                onClick={() => setShowReactionEmojiPicker(prev => !prev)}
                                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition ${showReactionEmojiPicker
                                    ? "bg-indigo-100 text-indigo-600"
                                    : "text-slate-500 hover:bg-indigo-50 hover:text-indigo-600"
                                    }`}
                            >
                                <Plus size={20} strokeWidth={2} />
                            </button>

                            {/* FULL EMOJI PICKER */}
                            {showReactionEmojiPicker && (
                                <div className="absolute bottom-full right-0 z-10000 mb-3"
                                    onMouseDown={e => e.stopPropagation()}
                                >
                                    <EmojiPicker
                                        onEmojiClick={(emojiData) => {
                                            handleReaction(contextMenu.message, emojiData.emoji);
                                            setShowReactionEmojiPicker(false);
                                            setContextMenu(null);
                                        }}
                                        width={320}
                                        height={400}
                                        searchDisabled={false}
                                        previewConfig={{ showPreview: false }}
                                        lazyLoadEmojis
                                        theme="light"
                                    />
                                </div>
                            )}
                        </div>

                        {/* ACTIONS */}
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-1.5 shadow-2xl">

                            <button
                                type="button"
                                onClick={() => handleReplyMessage(contextMenu.message)}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-600"
                            >
                                <Reply size={17} />
                                Reply
                            </button>

                            <button
                                type="button"
                                onClick={() => handleForwardMessage(contextMenu.message)}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-600"
                            >
                                <Forward size={17} />
                                Forward
                            </button>

                            <button
                                type="button"
                                onClick={() => handleCopyMessage(contextMenu.message)}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-600"
                            >
                                <Copy size={17} />
                                Copy message
                            </button>

                            <div className="my-1 border-t border-slate-100" />

                            <button
                                type="button"
                                onClick={() => handleStarMessage(contextMenu.message)}
                                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-600"
                            >
                                <Star
                                    size={17}
                                    className={starredMessages[contextMenu.message.id]
                                        ? "fill-amber-400 text-amber-500"
                                        : ""}
                                />

                                {starredMessages[contextMenu.message.id]
                                    ? 'Unstar message'
                                    : 'Star message'}
                            </button>

                            {contextMenu.message.sender_id === deviceId && (
                                <>
                                    <div className="my-1 border-t border-slate-100" />

                                    <button
                                        type="button"
                                        onClick={() => handleEditMessage(contextMenu.message)}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 transition hover:bg-indigo-50 hover:text-indigo-600"
                                    >
                                        <Pencil size={17} />
                                        Edit
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => handleDeleteMessage(contextMenu.message)}
                                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-600 transition hover:bg-red-50"
                                    >
                                        <Trash2 size={17} />
                                        Delete
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </>
            )}

            {showForwardDialog && forwardingMessage && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
                    onClick={() => {
                        if (!forwarding) setShowForwardDialog(false);
                    }}
                >
                    <div className="flex max-h-[80vh] w-full max-w-md flex-col  overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* HEADER */}
                        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">

                            <div className="flex items-center gap-3">

                                <div>
                                    <h3 className="text-base font-bold text-slate-800"> Forward message </h3>
                                    <p className="text-xs text-slate-400"> Select recipients </p>
                                </div>
                            </div>

                            <button
                                onClick={() => setShowForwardDialog(false)}
                                disabled={forwarding}
                                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                            >
                                <X size={19} />
                            </button>
                        </div>

                        {/* MESSAGE PREVIEW */}
                        <div className="border-b border-slate-100 bg-slate-50 p-4">

                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-blue-800"> Message preview </p>

                            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                                <div className="flex items-start gap-3">
                                    {/* Message content */}
                                    <div className="min-w-0 flex-1">

                                        {/* Forwarded label */}
                                        <div className="mb-2 flex items-center gap-1.5">
                                            <Forward size={12} className="text-indigo-500" />
                                            <span className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600">
                                                Forwarded message
                                            </span>
                                        </div>

                                        {/* Original message */}
                                        <div className="rounded-lg border-l-[3px] border-indigo-400 bg-white px-3 py-2.5 shadow-sm">

                                            {/* Sender information */}
                                            <div className="mb-2 flex items-center gap-2">

                                                {/* Avatar */}
                                                <div className="flex h-5 w-5 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-100">
                                                    {originalSender?.profile_picture ? (
                                                        <img
                                                            src={originalSender.profile_picture}
                                                            alt={originalSenderName}
                                                            className="h-full w-full object-cover"
                                                        />
                                                    ) : (
                                                        <span className="text-xs font-semibold text-indigo-700">
                                                            {originalSenderName?.charAt(0)?.toUpperCase() || '?'}
                                                        </span>
                                                    )}
                                                </div>

                                                {/* Name and timestamp */}
                                                <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
                                                    <p className="truncate text-xs font-semibold text-slate-800">
                                                        {originalSenderName}
                                                    </p>

                                                    <span className="shrink-0 text-[10px] text-slate-400">
                                                        {forwardingMessage.created_at
                                                            ? new Date(forwardingMessage.created_at).toLocaleString([], {
                                                                day: 'numeric',
                                                                month: 'short',
                                                                hour: '2-digit',
                                                                minute: '2-digit',
                                                            })
                                                            : ''}
                                                    </span>
                                                </div>
                                            </div>

                                            {/* Original message text */}
                                            <p className="line-clamp-3 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-slate-600">
                                                {forwardingMessage.content || forwardingMessage.text || 'No message content'}
                                            </p>

                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* RECIPIENTS */}
                        <div className="min-h-0 flex-1 overflow-y-auto p-4">

                            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-slate-400">
                                Direct messages
                            </p>

                            <div className="space-y-1">
                                {userList.map(user => {
                                    const id = user.device_id || user.id;
                                    const selected = forwardTargets.some(
                                        t => t.id === id && t.type === 'dm'
                                    );

                                    return (
                                        <button
                                            key={id}
                                            onClick={() => toggleForwardTarget({
                                                id,
                                                type: 'dm',
                                                name: user.username
                                            })}
                                            className={`flex w-full items-center gap-2 rounded-xl py-2 px-1 text-left transition
                                                 ${selected
                                                    ? 'bg-indigo-50 ring-1 ring-indigo-200'
                                                    : 'hover:bg-slate-50'
                                                }`}
                                        >
                                            <UserAvatar name={user.username} size={25} avatarUrl={user.avatar_path} />

                                            <span className="flex-1 truncate text-sm font-medium text-slate-700"> {user.username} </span>

                                            <span className={`flex h-3 w-3 items-center justify-center rounded-full border
                                                ${selected
                                                    ? 'border-indigo-600 bg-indigo-600 text-white'
                                                    : 'border-slate-300'
                                                }`}>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>

                            <p className="mb-2 mt-2 text-xs font-medium uppercase tracking-wider text-slate-400">
                                Groups
                            </p>

                            <div className="space-y-1">
                                {groupsHook.groups.map(group => {
                                    const selected = forwardTargets.some(
                                        t => t.id === group.id && t.type === 'group'
                                    );

                                    return (
                                        <button
                                            key={group.id}
                                            onClick={() => toggleForwardTarget({
                                                id: group.id,
                                                type: 'group',
                                                name: group.name
                                            })}
                                            className={`flex w-full items-center gap-2 rounded-xl py-2 px-1 text-left transition
                                                ${selected
                                                    ? 'bg-indigo-50 ring-1 ring-indigo-200'
                                                    : 'hover:bg-slate-50'
                                                }`}
                                        >
                                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-50
                                             text-indigo-600">
                                                <Users size={13} />
                                            </div>

                                            <span className="flex-1 truncate text-sm font-medium text-slate-700">
                                                {group.name}
                                            </span>

                                            <span className={`flex h-3 w-3 items-center justify-center rounded-full border
                                                ${selected
                                                    ? 'border-indigo-600 bg-indigo-600 text-white'
                                                    : 'border-slate-300'
                                                }`}>
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* FOOTER */}
                        <div className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-2">

                            <span className="text-xs text-slate-500">{forwardTargets.length} selected</span>

                            <div className="flex gap-2">
                                <button
                                    onClick={() => setShowForwardDialog(false)}
                                    disabled={forwarding}
                                    className="rounded-xl border border-slate-200 px-4 py-1 text-sm font-medium text-slate-600
                                     hover:bg-slate-50"
                                >
                                    Cancel
                                </button>

                                <button
                                    onClick={handleConfirmForward}
                                    disabled={!forwardTargets.length || forwarding}
                                    className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-1 text-sm font-semibold
                                     text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                    <Forward size={15} />

                                    {forwarding ? 'Forwarding...' : 'Forward'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {confirmClearChat && (
                <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]"
                    onClick={() => setConfirmClearChat(false)}
                >
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-red-50 text-red-500">
                            <Trash2 size={21} />
                        </div>

                        <h4 className="text-base font-semibold text-slate-800"> Clear all messages?</h4>

                        <p className="mt-2 text-sm leading-6 text-slate-500">
                            This will delete all messages with {activePeer?.username}. This cannot be undone.
                        </p>

                        <div className="mt-5 flex justify-end gap-2">

                            <button className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium
                             text-slate-700 transition hover:bg-slate-50"
                                onClick={() => setConfirmClearChat(false)}
                            >
                                Cancel
                            </button>

                            <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition
                            hover:bg-red-700"
                                onClick={handleClearAllChat}
                            >
                                Clear All
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showNewGroup && (
                <NewGroupDialog
                    allUsers={allUsers}
                    deviceId={deviceId}
                    mode={showNewGroup === 'add-member' ? 'add' : 'create'}
                    activeGroup={activeGroup}
                    onClose={() => setShowNewGroup(false)}
                    onCreate={async (name, ids, names) => {
                        await groupsHook.createGroup(name, ids, names);
                        setShowNewGroup(false);
                        setTab('groups');
                    }}
                    onAddMember={async (userId, username) => {
                        if (activeGroup) {
                            await groupsHook.addMember(
                                activeGroup.id,
                                userId,
                                username
                            );

                            const members = await api.getGroupMembers(activeGroup.id);
                            setGroupMembers(members || []);
                        }

                        setShowNewGroup(false);
                    }}
                />
            )}

            {/* PROFILE */}
            {showProfile && (<Profile isOpen={true} onClose={() => setShowProfile(null)} peer={showProfile} />)}

            {/* SCREENSHOT CROP */}
            {screenshotData && (
                <ScreenshotCrop
                    imageDataUrl={screenshotData.imageDataUrl}
                    isLoading={screenshotData.loading}
                    onCrop={handleScreenshotCrop}
                    onCancel={() => setScreenshotData(null)}
                />
            )}

            {/* IMAGE LIGHTBOX */}
            {lightbox && (<ImageLightbox url={lightbox.url} fileName={lightbox.fileName} onClose={() => setLightbox(null)} />)}

            {/* TOASTS */}
            {toasts.length > 0 && (
                <div className="fixed bottom-5 right-5 z-200 flex w-[min(360px,calc(100vw-40px))] flex-col gap-2">

                    {toasts.map(t => (
                        <div
                            key={t.id}
                            className={`flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm text-slate-700 shadow-lg ${t.type === 'success'
                                ? 'border-emerald-200'
                                : t.type === 'error'
                                    ? 'border-red-200'
                                    : 'border-blue-200'
                                }`}
                        >
                            {t.type === 'success' && (<CheckCircle size={16} strokeWidth={2} className="shrink-0 text-emerald-500" />)}
                            {t.type === 'error' && (<CircleAlert size={16} strokeWidth={2} className="shrink-0 text-red-500" />)}
                            {t.type === 'info' && (<Info size={16} strokeWidth={2} className="shrink-0 text-blue-500" />)}
                            <span>{t.message}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function NewGroupDialog({ allUsers, deviceId: myDeviceId = '', mode, activeGroup, onClose, onCreate, onAddMember }) {
    const [groupName, setGroupName] = useState('');
    const [selected, setSelected] = useState(new Set());

    const toggle = (id) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const available = (allUsers || []).filter(u => u.id !== myDeviceId);

    const handleCreate = () => {
        if (!groupName.trim() || selected.size === 0) return;
        const ids = Array.from(selected);
        const names = ids.map(id => available.find(u => u.id === id)?.username || 'User');
        onCreate(groupName.trim(), ids, names);
    };

    const handleAdd = () => {
        const id = Array.from(selected)[0];
        if (!id) return;
        const user = available.find(u => u.id === id);
        if (user) onAddMember(user.id, user.username);
    };

    return (
        <div className="fixed inset-0 z-100 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px]" onClick={onClose}>
            <div className="w-full min-w-85 max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl [&>h4]:text-base [&>h4]:font-semibold [&>h4]:text-slate-800 [&>p]:mt-2 [&>p]:text-sm [&>p]:leading-6 [&>p]:text-slate-500" onClick={e => e.stopPropagation()}>
                <h4>{mode === 'add' ? 'Add Member' : 'New Group'}</h4>
                {mode !== 'add' && (
                    <input placeholder="Group name…"
                        value={groupName}
                        onChange={e => setGroupName(e.target.value)}
                        className="mb-3 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800 outline-none focus:border-indigo-400"
                        autoFocus
                    />
                )}
                <div className="max-h-60 overflow-y-auto">
                    {available.length === 0 && <p className="text-[13px] text-slate-400">No users available</p>}
                    {available.map(u => (
                        <label key={u.id} className="flex cursor-pointer items-center gap-2.5 py-1.5">
                            <input type={mode === 'add' ? 'radio' : 'checkbox'}
                                name="member"
                                checked={selected.has(u.id)}
                                onChange={() => toggle(u.id)}
                            />
                            <UserAvatar name={u.username} size={28} avatarUrl={u.avatar_path} />
                            <span className="text-[13px] text-slate-700">{u.username}</span>
                        </label>
                    ))}
                </div>
                <div className="mt-5 flex justify-end gap-2">
                    <button className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 p-2 rounded-lg" onClick={onClose}>Cancel</button>
                    {mode === 'add' ? (
                        <button className="bg-indigo-600 text-white hover:bg-indigo-700 p-2 rounded-lg" onClick={handleAdd} disabled={selected.size === 0}>Add</button>
                    ) : (
                        <button className="bg-indigo-600 text-white hover:bg-indigo-700 p-2 rounded-lg" onClick={handleCreate} disabled={!groupName.trim() || selected.size === 0}>
                            Create
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}






function ChatBubble({ children, isMine, time, status }) {
    return (
        <div
            className={` relative min-w-0 max-w-full rounded-2xl px-4 py-3 text-[13.5px] leading-relaxed shadow-[0_2px_8px_rgba(30,41,59,0.035)] ring-1 ring-inset
                transition-shadow duration-200 hover:shadow-[0_4px_14px_rgba(30,41,59,0.06)]
                ${isMine
                    ? `
                        rounded-br-md bg-[#DCEBFF] text-[#334155] ring-[#C9DDF8]
                    `
                    : `
                        rounded-bl-md bg-white text-[#334155] ring-[#E9EDF3]
                    `
                }
            `}
        >
            {/* Message content */}
            <div className="whitespace-pre-wrap break-words">
                {children}
            </div>

            {/* Timestamp */}
            {time && (
                <div className="mt-1.5 flex items-center justify-end gap-1.5">
                    <span className="text-[10px] font-medium tracking-wide text-[#94A3B8]">
                        {time}
                    </span>

                    {isMine && status === "read" && (
                        <span className="text-[#648FCB]" title="Read">
                            <svg
                                width="15"
                                height="12"
                                viewBox="0 0 16 12"
                                fill="none"
                            >
                                <path
                                    d="M1 6L4.5 9.5L10 2"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                                <path
                                    d="M6 6L9.5 9.5L15 2"
                                    stroke="currentColor"
                                    strokeWidth="1.5"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                        </span>
                    )}

                    {isMine && status === "delivered" && (
                        <span className="text-[11px] text-[#94A3B8]">✓✓</span>
                    )}

                    {isMine && status === "sent" && (
                        <span className="text-[11px] text-[#94A3B8]">✓</span>
                    )}
                </div>
            )}
        </div>
    );
}





function formatTime(ts) {
    if (!ts) return '';

    try {
        const d = new Date(ts);

        if (isNaN(d.getTime())) return '';

        const now = new Date();

        const time = d.toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        if (d.toDateString() === now.toDateString()) {
            return time;
        }

        const date = d.toLocaleDateString([], {
            day: '2-digit',
            month: 'short',
            year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
        });

        return `${date}, ${time}`;

    } catch {
        return '';
    }
}

function getLocalIp() {
    return null;
}
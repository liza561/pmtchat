// src/pages/meetings.jsx

import React, { useState, useEffect, useRef, useCallback, useMemo, } from 'react';
import { useLocation } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import UserAvatar from '../components/UserAvatar';
import MeetingRTCManager from '../lib/meeting_rtc_webrtc';
import {
  MSG, sendMeetingInvite, sendMeetingInviteResponse, sendMeetingChat, sendMeetingLeave, sendMeetingEnded,
  sendMeetingScreenShareInvite, sendMeetingRejoinRequest, sendMeetingParticipantList, broadcastMeeting, loadMeetingChat,
  saveMeetingChat, clearMeetingChat, generateMeetingId, onSignalingMessage, meetingLog, onMeetingLog, isMeetingSignal,
} from '../lib/meeting_rtc_api';

let _idCounter = 0;
function localId() { return `m_${Date.now()}_${++_idCounter}`; }
function Icon({
  name,
  size = 20,
  className = '',
  strokeWidth = 1.8,
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    className,
  };

  const paths = {
    video: <> <rect x="2" y="3" width="20" height="14" rx="2" /> <path d="M8 21h8M12 17v4" /> </>,
    plus: <> <path d="M12 5v14M5 12h14" /> </>,
    copy: <> <rect x="9" y="9" width="13" height="13" rx="2" /> <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /> </>,
    users: <> <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /> <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /> </>,
    mic: <> <rect x="9" y="2" width="6" height="12" rx="3" /> <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /> </>,
    micOff: <> <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2c0 .99-.2 1.93-.57 2.78" /> <path d="M12 19v3M8 22h8M2 2l20 20" />
    </>,
    monitor: <> <rect x="2" y="3" width="20" height="14" rx="2" /> <path d="M8 21h8M12 17v4" /> </>,
    share: <> <circle cx="18" cy="5" r="3" /> <circle cx="6" cy="12" r="3" />
      <circle cx="18" cy="19" r="3" /> <path d="m8.7 10.7 6.6-4.2m-6.6 7.8 6.6 4.2" />
    </>,
    chat: <>
      <path d="M21 11.5a8.4 8.4 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.4 8.4 0 0 1-3.8-.9L3 21l1.9-5.7a8.4 8.4 0 0 1-.9-3.8A8.5 8.5 0 0 1 8.7 3.9a8.4 8.4 0 0 1 3.8-.9h.5a8.5 8.5 0 0 1 8 8z" />
    </>,
    userPlus: <><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /> <circle cx="8.5" cy="7" r="4" /> <path d="M20 8v6m3-3h-6" /></>,
    terminal: <> <path d="m4 17 6-6-6-6m8 14h8" /></>,
    phone: <>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z" />
      <path d="m2 2 20 20" />
    </>,
    close: <> <path d="m18 6-12 12M6 6l12 12" /> </>,
    send: <> <path d="m22 2-7 20-4-9-9-4Z" /> <path d="M22 2 11 13" /> </>,
    check: <> <path d="m5 12 4 4L19 6" /> </>,
    search: <><circle cx="11" cy="11" r="8" /> <path d="m21 21-4.35-4.35" /> </>,
    clock: <> <circle cx="12" cy="12" r="10" /> <path d="M12 6v6l4 2" /> </>,
    monitorUp: <> <rect x="2" y="3" width="20" height="14" rx="2" /> <path d="M12 17v4m-4 0h8m-4-17v8m-3-3 3-3 3 3" /> </>,
    wifi: <> <path d="M5 12.55a11 11 0 0 1 14.08 0" /> <path d="M1.42 9a16 16 0 0 1 21.16 0" />
      <path d="M8.53 16.11a6 6 0 0 1 6.95 0" /> <path d="M12 20h.01" /></>,
  };

  return <svg {...common}>{paths[name] || paths.video}</svg>;
}

export default function MeetingsPage() {
  const { localUser, deviceId, allUsers, peers } = useAppContext();
  const location = useLocation();
  const [view, setView] = useState('lobby');
  const [meetingId, setMeetingId] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [isMicOn, setIsMicOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [selectedPeersForShare, setSelectedPeersForShare] = useState([]);
  const [showSharePicker, setShowSharePicker] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [pendingInvites, setPendingInvites] = useState([]);
  const [toasts, setToasts] = useState([]);
  const [joinCode, setJoinCode] = useState('');
  const [screenStream, setScreenStream] = useState(null);
  const [remoteScreens, setRemoteScreens] = useState(new Map());
  const [focusedScreen, setFocusedScreen] = useState(null);
  const [logs, setLogs] = useState([]);
  const chatEndRef = useRef(null);
  const logsEndRef = useRef(null);
  const meetingIdRef = useRef('');
  const isHostRef = useRef(false);
  const participantsRef = useRef([]);
  const rtcRef = useRef(null);

  useEffect(() => { meetingIdRef.current = meetingId; }, [meetingId]);
  useEffect(() => { isHostRef.current = isHost; }, [isHost]);
  useEffect(() => { participantsRef.current = participants; }, [participants]);

  const onlinePeers = useMemo(() =>
    (allUsers || []).filter(u =>
      u.is_online && (u.id || u.device_id) !== deviceId
    ),
    [allUsers, deviceId]
  );

  const peerNameMap = useMemo(() => {
    const map = {};

    (allUsers || []).forEach(user => { map[user.id || user.device_id] = user.username || 'User'; });

    return map;
  }, [allUsers]);

  useEffect(() => {
    const unsub = onMeetingLog(entry => {
      setLogs(prev => [...prev.slice(-200), entry]);
    });

    return typeof unsub === 'function' ? unsub : undefined;
  }, []);


  const showToast = useCallback((message, type = 'info') => {
    const id = localId();

    setToasts(prev => [
      ...prev.slice(-3),
      { id, message, type },
    ]);

    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  const initRTC = useCallback((mid) => {
    if (rtcRef.current) {
      rtcRef.current.destroy();
    }

    const mgr = new MeetingRTCManager({
      deviceId,
      meetingId: mid,
    });

    mgr.onRemoteScreen = (peerId, stream) => {
      if (stream) {
        setRemoteScreens(prev => {
          const next = new Map(prev);
          next.set(peerId, stream);
          return next;
        });

        setFocusedScreen(prev => prev || peerId);

        meetingLog(`Remote screen from ${peerId.slice(0, 8)}`);
      } else {
        setRemoteScreens(prev => {
          const next = new Map(prev);
          next.delete(peerId);
          return next;
        });

        setFocusedScreen(prev =>
          prev === peerId ? null : prev
        );
      }
    };

    mgr.onChatMessage = data => {
      const msg = {
        sender: data.sender,
        senderName: data.senderName,
        text: data.text,
        timestamp: data.timestamp,
      };

      setChatMessages(prev => {
        if (prev.find(m =>
          m.timestamp === msg.timestamp &&
          m.sender === msg.sender
        )) {
          return prev;
        }

        const next = [...prev, msg];

        saveMeetingChat(meetingIdRef.current, next);

        return next;
      });
    };

    mgr.onPeerConnected = peerId => { meetingLog(`Peer connected: ${peerId.slice(0, 8)}`); };
    mgr.onPeerDisconnected = peerId => { meetingLog(`Peer disconnected: ${peerId.slice(0, 8)}`, 'warn'); };

    rtcRef.current = mgr;

    return mgr;
  }, [deviceId]);

  const broadcastMeetingMsg = useCallback(async (
    type,
    payload = {},
    targetPeers = null
  ) => {
    const targets = targetPeers || participantsRef.current.map(p => p.peerId);

    const errors = await broadcastMeeting(
      type,
      payload,
      targets,
      deviceId,
      meetingIdRef.current
    );

    if (errors.length) {
      meetingLog(
        `Broadcast ${type} failed for ${errors.length} peer(s)`,
        'warn'
      );
    }
  }, [deviceId]);

  const sendChatToAll = useCallback(async msg => {
    const mgr = rtcRef.current;

    if (mgr) {
      mgr.sendChatViaDataChannels(msg);
    }

    const targets = participantsRef.current.map(p => p.peerId);

    for (const pid of targets) {
      try {
        await sendMeetingChat(
          pid,
          deviceId,
          meetingIdRef.current,
          msg
        );
      } catch { }
    }
  }, [deviceId]);

  const negotiateWithPeer = useCallback(async peerId => {
    const mgr = rtcRef.current;

    if (!mgr) return;

    await mgr.negotiateWithPeer(peerId);
  }, []);

  const cleanupAll = useCallback(() => {
    if (rtcRef.current) {
      rtcRef.current.destroy();
    }

    rtcRef.current = null;

    setRemoteScreens(new Map());
    setFocusedScreen(null);
    setScreenStream(null);
    setIsScreenSharing(false);
    setIsMicOn(true);
  }, []);

  const leaveMeeting = useCallback((silent = false) => {
    meetingLog('Leaving meeting');

    if (!silent) {
      const targets = participantsRef.current.map(p => p.peerId);

      if (isHostRef.current) {
        for (const pid of targets) {
          sendMeetingEnded(
            pid,
            deviceId,
            meetingIdRef.current
          ).catch(() => { });
        }
      } else {
        for (const pid of targets) {
          sendMeetingLeave(
            pid,
            deviceId,
            meetingIdRef.current
          ).catch(() => { });
        }
      }
    }

    clearMeetingChat(meetingIdRef.current);
    cleanupAll();
    setView('lobby');
    setMeetingId('');
    meetingIdRef.current = '';
    setIsHost(false);
    isHostRef.current = false;
    setParticipants([]);
    participantsRef.current = [];
    setChatMessages([]);
    setChatInput('');
    setIsChatOpen(false);
    setIsParticipantsOpen(false);
    setIsLogsOpen(false);
    setPendingInvites([]);
    showToast('Left the meeting');
  }, [deviceId, cleanupAll, showToast]);


  useEffect(() => {
    const unsub = onSignalingMessage(async msg => {
      if (!msg || !isMeetingSignal(msg)) return;
      if (msg.from === deviceId) return;

      meetingLog(`← ${msg.type} from ${(msg.from || '').slice(0, 8)}`);

      if (msg.type === MSG.INVITE) {
        setPendingInvites(prev => {
          if (prev.find(i =>
            i.meeting_id === msg.meeting_id &&
            i.from === msg.from
          )) {
            return prev;
          }

          return [...prev, msg];
        });

        showToast(
          `${peerNameMap[msg.from] || 'Someone'} invited you to a meeting`,
          'info'
        );

        try {
          const { showScreenShareInvite } = await import('../lib/notifications.js');
          showScreenShareInvite(peerNameMap[msg.from] || 'Someone');
        } catch { }

        return;
      }

      if (
        msg.type === MSG.INVITE_RESPONSE &&
        msg.meeting_id === meetingIdRef.current
      ) {
        if (msg.accepted) {
          showToast(
            `${peerNameMap[msg.from] || 'User'} joined the meeting`,
            'success'
          );

          setParticipants(prev => {
            if (prev.find(p => p.peerId === msg.from)) {
              return prev;
            }

            return [
              ...prev,
              {
                peerId: msg.from,
                username: msg.username ||
                  peerNameMap[msg.from] ||
                  'User',
              },
            ];
          });

          await negotiateWithPeer(msg.from);
        } else {
          showToast(
            `${peerNameMap[msg.from] || 'User'} declined the invite`,
            'error'
          );
        }

        return;
      }

      if (
        msg.type === MSG.OFFER &&
        msg.meeting_id === meetingIdRef.current
      ) {
        const mgr = rtcRef.current;

        if (!mgr) return;

        if (!mgr.peerConnections.has(msg.from)) {
          mgr.createPeerConnection(msg.from, false);
        }

        await mgr.handleOffer(msg.from, msg.sdp);

        setParticipants(prev => {
          if (prev.find(p => p.peerId === msg.from)) {
            return prev;
          }

          return [
            ...prev,
            {
              peerId: msg.from,
              username: peerNameMap[msg.from] || 'User',
            },
          ];
        });

        return;
      }

      if (
        msg.type === MSG.ANSWER &&
        msg.meeting_id === meetingIdRef.current
      ) {
        const mgr = rtcRef.current;

        if (mgr) {
          await mgr.handleAnswer(msg.from, msg.sdp);
        }

        return;
      }

      if (
        msg.type === MSG.ICE_CANDIDATE &&
        msg.meeting_id === meetingIdRef.current
      ) {
        const mgr = rtcRef.current;

        if (mgr) {
          await mgr.handleIceCandidate(
            msg.from,
            msg.candidate,
            msg.sdp_mid,
            msg.sdp_mline_index
          );
        }

        return;
      }

      if (
        msg.type === MSG.CHAT &&
        msg.meeting_id === meetingIdRef.current &&
        msg.chat
      ) {
        const chatMsg = msg.chat;

        setChatMessages(prev => {
          if (prev.find(m =>
            m.timestamp === chatMsg.timestamp &&
            m.sender === chatMsg.sender
          )) {
            return prev;
          }

          const next = [...prev, chatMsg];

          saveMeetingChat(meetingIdRef.current, next);

          return next;
        });

        return;
      }

      if (
        msg.type === MSG.LEAVE &&
        msg.meeting_id === meetingIdRef.current
      ) {
        showToast(
          `${peerNameMap[msg.from] || 'User'} left the meeting`
        );

        const mgr = rtcRef.current;

        if (mgr) {
          mgr.cleanupPeer(msg.from);
        }

        setParticipants(prev =>
          prev.filter(p => p.peerId !== msg.from)
        );

        setRemoteScreens(prev => {
          const next = new Map(prev);
          next.delete(msg.from);
          return next;
        });

        setFocusedScreen(prev =>
          prev === msg.from ? null : prev
        );

        return;
      }

      if (
        msg.type === MSG.ENDED &&
        msg.meeting_id === meetingIdRef.current
      ) {
        showToast('Meeting ended by host', 'error');
        leaveMeeting(true);
        return;
      }

      if (
        msg.type === MSG.SCREEN_SHARE &&
        msg.meeting_id === meetingIdRef.current
      ) {
        if (msg.sharing) {
          showToast(
            `${peerNameMap[msg.from] || 'User'} started screen sharing`
          );

          await negotiateWithPeer(msg.from);
        } else {
          setRemoteScreens(prev => {
            if (!prev.has(msg.from)) {
              meetingLog(
                `Ignored SCREEN_SHARE stop from ${msg.from.slice(0, 8)}`,
                'warn'
              );

              return prev;
            }

            const next = new Map(prev);
            next.delete(msg.from);

            return next;
          });

          setFocusedScreen(prev =>
            prev === msg.from ? null : prev
          );

          showToast(
            `${peerNameMap[msg.from] || 'User'} stopped screen sharing`
          );
        }

        return;
      }

      if (msg.type === MSG.SCREEN_SHARE_INVITE) {
        setPendingInvites(prev => {
          if (prev.find(i =>
            i.meeting_id === msg.meeting_id &&
            i.type === MSG.SCREEN_SHARE_INVITE &&
            i.from === msg.from
          )) {
            return prev;
          }

          return [...prev, msg];
        });

        showToast(
          `${peerNameMap[msg.from] || 'Someone'} wants to share screen with you`,
          'info'
        );

        return;
      }

      if (
        msg.type === MSG.REJOIN_REQUEST &&
        msg.meeting_id === meetingIdRef.current
      ) {
        meetingLog(
          `Rejoin request from ${msg.username || msg.from.slice(0, 8)}`
        );

        setParticipants(prev => {
          if (prev.find(p => p.peerId === msg.from)) {
            return prev;
          }

          return [
            ...prev,
            {
              peerId: msg.from,
              username: msg.username ||
                peerNameMap[msg.from] ||
                'User',
            },
          ];
        });

        showToast(
          `${msg.username || peerNameMap[msg.from] || 'User'} joined`,
          'success'
        );

        await negotiateWithPeer(msg.from);

        const currentParts = participantsRef.current.map(
          p => p.peerId
        );

        try {
          await sendMeetingParticipantList(
            msg.from,
            deviceId,
            meetingIdRef.current,
            currentParts
          );
        } catch { }

        return;
      }

      if (
        msg.type === MSG.PARTICIPANT_LIST &&
        msg.meeting_id === meetingIdRef.current
      ) {
        meetingLog(`Received participant list: ${(msg.participants || []).length} peers`);

        const peerIds = msg.participants || [];

        for (const pid of peerIds) {
          if (pid === deviceId) continue;

          setParticipants(prev => {
            if (prev.find(p => p.peerId === pid)) {
              return prev;
            }

            return [
              ...prev,
              {
                peerId: pid,
                username: peerNameMap[pid] || 'User',
              },
            ];
          });

          const mgr = rtcRef.current;

          if (mgr && !mgr.peerConnections.has(pid)) {
            await mgr.negotiateWithPeer(pid);
          }
        }
      }
    });

    return () => {
      if (typeof unsub === 'function') {
        unsub();
      } else if (unsub && typeof unsub.then === 'function') {
        unsub.then(fn => {
          if (typeof fn === 'function') fn();
        });
      }
    };
  }, [
    deviceId,
    peerNameMap,
    showToast,
    negotiateWithPeer,
    leaveMeeting,
  ]);

  const handleAcceptInvite = useCallback(async invite => {
    const mid = invite.meeting_id;

    meetingLog(`Accepting invite to meeting ${mid.slice(0, 8)} from ${(invite.from || '').slice(0, 8)}`);

    setPendingInvites(prev =>
      prev.filter(i => !(
        i.meeting_id === mid &&
        i.from === invite.from
      ))
    );

    setMeetingId(mid);
    meetingIdRef.current = mid;
    setIsHost(false);
    isHostRef.current = false;
    setView('meeting');
    setParticipants([]);
    setChatMessages(loadMeetingChat(mid));
    setLogs([]);

    const mgr = initRTC(mid);

    await mgr.acquireAudio();

    setParticipants([{
      peerId: invite.from,
      username: peerNameMap[invite.from] || invite.host_name || 'User',
    }]);

    try {
      await sendMeetingInviteResponse(
        invite.from,
        deviceId,
        mid,
        true,
        localUser?.username || 'User'
      );

      meetingLog(`Sent invite response (accepted) → ${invite.from.slice(0, 8)}`);
    } catch (err) {
      meetingLog(`Failed to send invite response: ${err}`, 'error');
    }

    showToast('Joined meeting!', 'success');
  }, [
    initRTC,
    deviceId,
    localUser,
    peerNameMap,
    showToast,
  ]);

  useEffect(() => {
    const autoAcceptInvite = location.state?.autoAcceptInvite;

    if (autoAcceptInvite?.meeting_id) {
      handleAcceptInvite(autoAcceptInvite);
    }

    const handler = e => {
      const invite = e.detail;

      if (invite?.meeting_id) {
        handleAcceptInvite(invite);
      }
    };

    window.addEventListener(
      'meeting-invite-accepted',
      handler
    );

    return () => {
      window.removeEventListener(
        'meeting-invite-accepted',
        handler
      );
    };
  }, [location.state, handleAcceptInvite]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth', }); }, [chatMessages]);
  useEffect(() => { logsEndRef.current?.scrollIntoView({ behavior: 'smooth', }); }, [logs]);

  useEffect(() => {
    return () => {
      if (meetingIdRef.current) {
        const targets = participantsRef.current.map(
          p => p.peerId
        );

        broadcastMeeting(
          MSG.LEAVE,
          {},
          targets,
          deviceId,
          meetingIdRef.current
        );
      }

      if (rtcRef.current) {
        rtcRef.current.destroy();
      }
    };
  }, [deviceId]);


  const createMeeting = useCallback(async () => {
    const id = await generateMeetingId();

    meetingLog(`Creating meeting ${id.slice(0, 8)}…`);
    setMeetingId(id);
    meetingIdRef.current = id;
    setIsHost(true);
    isHostRef.current = true;
    setView('meeting');
    setParticipants([]);
    setChatMessages([]);
    setLogs([]);

    const mgr = initRTC(id);
    await mgr.acquireAudio();

    showToast(
      'Meeting created! Invite others to join.',
      'success'
    );
  }, [initRTC, showToast]);


  const joinMeetingByCode = useCallback(async code => {
    if (!code?.trim()) return;

    const trimmed = code.trim();

    meetingLog(`Joining meeting by code: ${trimmed.slice(0, 8)}…`);

    setMeetingId(trimmed);
    meetingIdRef.current = trimmed;
    setIsHost(false);
    isHostRef.current = false;
    setView('meeting');
    setParticipants([]);
    setChatMessages(loadMeetingChat(trimmed));
    setLogs([]);

    const mgr = initRTC(trimmed);

    await mgr.acquireAudio();

    let sentCount = 0;

    for (const peer of onlinePeers) {
      const pid = peer.id || peer.device_id;

      try {
        await sendMeetingRejoinRequest(
          pid,
          deviceId,
          trimmed,
          localUser?.username || 'User'
        );

        sentCount++;
      } catch (err) {
        meetingLog(
          `Rejoin request failed → ${pid.slice(0, 8)}: ${err}`,
          'warn'
        );
      }
    }

    meetingLog(`Sent rejoin requests to ${sentCount} online peer(s)`);

    showToast(
      sentCount > 0
        ? 'Joining meeting…'
        : 'No online peers found. Share the code with others.',
      sentCount > 0 ? 'info' : 'error'
    );
  }, [
    initRTC,
    deviceId,
    localUser,
    onlinePeers,
    showToast,
  ]);


  const handleDeclineInvite = useCallback(async invite => {
    setPendingInvites(prev =>
      prev.filter(i => !(
        i.meeting_id === invite.meeting_id &&
        i.from === invite.from
      ))
    );

    try {
      await sendMeetingInviteResponse(
        invite.from,
        deviceId,
        invite.meeting_id,
        false
      );
    } catch { }
  }, [deviceId]);

  const invitePeers = useCallback(async peerIds => {
    for (const pid of peerIds) {
      try {
        await sendMeetingInvite(
          pid,
          deviceId,
          meetingIdRef.current,
          localUser?.username || 'User'
        );

        meetingLog(`Sent invite → ${pid.slice(0, 8)}`);
      } catch (err) {
        meetingLog(
          `Invite failed → ${pid.slice(0, 8)}: ${err}`,
          'error'
        );
      }
    }

    setShowInviteModal(false);

    showToast(
      `Invited ${peerIds.length} user(s)`,
      'success'
    );
  }, [deviceId, localUser, showToast]);

  const toggleMic = useCallback(() => {
    const mgr = rtcRef.current;

    if (!mgr) return;

    const newState = !isMicOn;

    mgr.toggleMic(newState);

    setIsMicOn(newState);
  }, [isMicOn]);

  const stopScreenShare = useCallback(() => {
    const mgr = rtcRef.current;

    if (mgr) {
      mgr.stopScreenShare();
    }

    setScreenStream(null);
    setIsScreenSharing(false);
    showToast('Screen sharing stopped');
  }, [showToast]);

  const startScreenShare = useCallback(async (
    targetPeerIds = null
  ) => {
    const mgr = rtcRef.current;

    if (!mgr) return;

    const stream = await mgr.startScreenShare(targetPeerIds);

    if (stream) {
      setScreenStream(stream);
      setIsScreenSharing(true);

      stream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

      showToast('Screen sharing started');
    } else {
      showToast('Screen share cancelled', 'error');
    }
  }, [showToast, stopScreenShare]);


  const startSelectiveShare = useCallback(async () => {
    if (selectedPeersForShare.length === 0) return;

    setShowSharePicker(false);

    for (const pid of selectedPeersForShare) {
      try {
        await sendMeetingScreenShareInvite(
          pid,
          deviceId,
          meetingIdRef.current,
          localUser?.username || 'User'
        );
      } catch { }
    }

    await startScreenShare(selectedPeersForShare);

    setSelectedPeersForShare([]);
  }, [
    selectedPeersForShare,
    deviceId,
    localUser,
    startScreenShare,
  ]);

  const handleSendChat = useCallback(async () => {
    const text = chatInput.trim();

    if (!text) return;

    const msg = {
      sender: deviceId,
      senderName: localUser?.username || 'You',
      text,
      timestamp: Date.now(),
    };

    setChatMessages(prev => {
      const next = [...prev, msg];

      saveMeetingChat(meetingIdRef.current, next);

      return next;
    });

    setChatInput('');

    await sendChatToAll(msg);
  }, [
    chatInput,
    deviceId,
    localUser,
    sendChatToAll,
  ]);

  const copyMeetingCode = useCallback(() => {
    navigator.clipboard?.writeText(meetingId)
      .then(() => showToast('Meeting code copied!', 'success'))
      .catch(() => showToast('Unable to copy code', 'error'));
  }, [meetingId, showToast]);

  const closeSidePanel = useCallback(() => {
    setIsChatOpen(false);
    setIsParticipantsOpen(false);
    setIsLogsOpen(false);
  }, []);

  const toggleSidePanel = useCallback(panel => {
    const current =
      panel === 'chat' ? isChatOpen :
        panel === 'people' ? isParticipantsOpen :
          isLogsOpen;

    closeSidePanel();

    if (!current) {
      if (panel === 'chat') setIsChatOpen(true);
      if (panel === 'people') setIsParticipantsOpen(true);
      if (panel === 'logs') setIsLogsOpen(true);
    }
  }, [
    isChatOpen,
    isParticipantsOpen,
    isLogsOpen,
    closeSidePanel,
  ]);

  const allScreens = new Map(remoteScreens);

  if (screenStream) {
    allScreens.set('local', screenStream);
  }

  const firstScreenId = allScreens.keys().next().value;

  const activeScreenId = focusedScreen &&
    allScreens.has(focusedScreen)
    ? focusedScreen
    : firstScreenId;

  const focusStream = activeScreenId
    ? allScreens.get(activeScreenId)
    : null;

  const focusLabel = activeScreenId
    ? activeScreenId === 'local'
      ? 'You'
      : peerNameMap[activeScreenId] || 'User'
    : null;

  const hasSidePanel = isChatOpen || isParticipantsOpen || isLogsOpen;


  if (view === 'lobby') {
    return (
      <div className="relative min-h-full overflow-y-auto bg-slate-50 text-slate-900">

        <ToastContainer toasts={toasts} />

        <div className="w-full min-h-screen px-3 py-7 sm:px-6 lg:px-10">

          <div className="mb-5 pl-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 sm:text-4xl">Meetings</h1>
            <p className="max-w-xl text-sm leading-6 text-slate-500 sm:text-base"> Connect with your team, share your screen, and collaborate in real-time. </p>
          </div>

          {/* Invitation cards */}

          {pendingInvites.length > 0 && (
            <div className="mb-8 space-y-3">
              {pendingInvites.map(inv => (
                <div key={`${inv.meeting_id}_${inv.from}`}
                  className="flex flex-col gap-4 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                      <Icon name="video" size={21} />
                    </div>

                    <div>
                      <p className="font-semibold text-slate-900"> {inv.host_name || peerNameMap[inv.from] || 'Someone'} </p>
                      <p className="mt-0.5 text-sm text-slate-500">
                        {inv.type === MSG.SCREEN_SHARE_INVITE
                          ? 'Wants to share their screen with you'
                          : 'Invited you to a meeting'}
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => handleDeclineInvite(inv)}
                      className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
                    >
                      Decline 
                    </button>

                    <button onClick={() => handleAcceptInvite(inv)}
                      className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
                    >
                      Join meeting
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Main hero */}

          <div className="grid gap-6 grid-cols-2">

            {/* Create Meeting Card */}
            <div className="group relative isolate overflow-hidden rounded-3xl bg-[#19388b] bg-gradient-to-br from-[#164e63] via-[#09a2c9] to-[#6366f1] p-5 text-white">

              {/* Background decorations */}
              <div className="pointer-events-none absolute -right-16 -top-24 h-80 w-80 rounded-full border border-white/10 transition-transform duration-700 group-hover:scale-110" />
              <div className="pointer-events-none absolute -right-8 -top-16 h-64 w-64 rounded-full border border-white/10" />
              <div className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-blue-400/10 blur-3xl" />
              <div className="relative z-10 flex h-full flex-col justify-between">
                <div>
                  <h2 className="mt-4 max-w-sm text-3xl font-extrabold leading-tight tracking-tight">
                    Bring your team
                    <span className="block text-white/70">together.</span>
                  </h2>
                </div>

                <div className="mt-9">
                  <button onClick={createMeeting}
                    className="group/btn inline-flex items-center rounded-xl bg-white px-3 py-3 text-sm font-bold text-[#088bac] shadow-lg shadow-black/10 transition-all duration-300
                    hover:-translate-y-1 hover:bg-blue-50 hover:shadow-xl active:translate-y-0"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors">
                      <Icon name="plus" size={17} />
                    </span>
                    Create a meeting
                  </button>
                </div>

              </div>
            </div>


            {/* Join Meeting Card */}
            <div className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-5 shadow-sm 
            transition-all duration-300 hover:border-indigo-200 hover:shadow-xl hover:shadow-slate-200/50">

              {/* Decorative background */}
              <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-indigo-50/80 blur-3xl transition-all duration-500 
              group-hover:bg-blue-100/70" />

              <div className="relative z-10 flex h-full flex-col justify-between">

                <div>
                  <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900">
                    Join the
                    <span className=" text-[#088bac]"> conversation.</span>
                  </h2>
                </div>

                <div className="mt-9 space-y-3">
                  <div className="group/input relative">

                    <input
                      type="text"
                      placeholder="Enter meeting code..."
                      value={joinCode}
                      onChange={e => setJoinCode(e.target.value)}
                      onKeyDown={e =>
                        e.key === 'Enter' &&
                        joinMeetingByCode(joinCode)
                      }
                      className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-4 pl-3 pr-4 text-sm font-medium
                      text-slate-900 outline-none transition-all placeholder:font-normal placeholder:text-slate-400
                      hover:border-slate-300 focus:border-indigo-500 focus:bg-white focus:ring-4 focus:ring-indigo-500/10"
                    />

                  </div>

                  <button
                    onClick={() => joinMeetingByCode(joinCode)}
                    disabled={!joinCode.trim()}
                    className="flex w-full items-center justify-center gap-3 rounded-xl bg-slate-900 px-5 py-4 text-sm
                      font-bold text-white shadow-lg shadow-slate-900/10 transition-all duration-300 hover:-translate-y-0.5
                      hover:bg-indigo-700 hover:shadow-indigo-700/20 active:translate-y-0 disabled:cursor-not-allowed 
                      disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:bg-slate-900"
                  >
                    Join meeting
                  </button>

                  <p className="pt-1 text-center text-[11px] text-slate-400"> Enter the code shared by your meeting host. </p>
                </div>
              </div>
            </div>

          </div>

          {/* Online peers */}

          <div className="mt-10">
            <div className="mb-5 flex items-center justify-between">
              <div> <h3 className="text-lg font-bold text-slate-900"> Team members </h3> </div>
              <span className="rounded-full bg-[#088bac]/10 px-3 py-1.5 text-xs font-bold text-[#088bac]"> {onlinePeers.length} online </span>
            </div>


            {onlinePeers.length > 0 ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {onlinePeers.map(peer => (
                  <div key={peer.id || peer.device_id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-blue-200 hover:shadow-sm">
                    <div className="relative shrink-0">
                      <UserAvatar name={peer.username} size={38} avatarUrl={peer.avatar_path} />
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500" />
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-800"> {peer.username || 'User'}</p>
                      <p className="mt-0.5 text-xs text-emerald-600"> Online</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
                  <Icon name="users" size={23} />
                </div>

                <p className="text-sm font-semibold text-slate-700"> No one is online right now</p>
                <p className="mt-1 text-xs text-slate-400"> Your online teammates will appear here.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex flex-col overflow-hidden bg-slate-950 text-white">
      {/* Toasts */}
      <ToastContainer toasts={toasts} />

      {/* Pending invitations */}

      {pendingInvites.length > 0 && (
        <div className="absolute left-1/2 top-16 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 space-y-2">
          {pendingInvites.map(inv => (
            <div key={`${inv.meeting_id}_${inv.from}`}
              className="flex items-center justify-between gap-3 rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold"> {peerNameMap[inv.from] || 'User'}</p>

                <p className="text-xs text-slate-400">
                  {inv.type === MSG.SCREEN_SHARE_INVITE
                    ? 'Screen sharing invitation'
                    : 'Meeting invitation'}
                </p>
              </div>

              <div className="flex shrink-0 gap-2">
                <button onClick={() => handleDeclineInvite(inv)} className="rounded-lg px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-800">
                  Decline
                </button>

                <button onClick={() => handleAcceptInvite(inv)} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700"                 >
                  Accept
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}

      <header className="relative z-20 flex h-16.5 shrink-0 items-center justify-between border-b border-white/10 bg-slate-900/95 px-4 sm:px-6">

        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Icon name="video" size={19} />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-bold text-white"> Team Meeting</p>

            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                {isHost ? 'You are hosting' : 'Meeting in progress'}
              </span>
            </div>
          </div>

          <div className="hidden h-7 w-px bg-white/10 sm:block" />

          <button
            onClick={copyMeetingCode}
            title="Copy meeting code"
            className="hidden items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white sm:flex"
          >
            <Icon name="copy" size={14} />
            {meetingId.substring(0, 8)}...
          </button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">

          <button onClick={() => toggleSidePanel('people')}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${isParticipantsOpen
              ? 'bg-blue-600 text-white'
              : 'text-slate-300 hover:bg-white/10'
              }`}
          >
            <Icon name="users" size={17} />
            <span className="hidden sm:inline"> {participants.length + 1} people </span>
            <span className="sm:hidden"> {participants.length + 1} </span>
          </button>

          <button onClick={copyMeetingCode}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-300 transition hover:bg-white/10 sm:hidden"
            title="Copy meeting code"
          >
            <Icon name="copy" size={17} />
          </button>
        </div>
      </header>

      {/* Main meeting content */}

      <main className="relative flex min-h-0 flex-1 overflow-hidden">

        {/* Screen stage */}

        <section className="relative flex min-w-0 flex-1 flex-col overflow-hidden p-3 sm:p-5">

          {focusStream ? (
            <div className="relative min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
              <VideoTile
                stream={focusStream}
                label={focusLabel}
                muted={activeScreenId === 'local'}
              />

              {/* Screen label */}

              <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs font-medium text-white backdrop-blur-md">
                <Icon name="monitor" size={14} />
                {focusLabel}'s screen
              </div>
            </div>
          ) : (
            <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800">

              <div className="absolute inset-0 opacity-20">
                <div className="absolute left-1/2 top-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-400/20" />
                <div className="absolute left-1/2 top-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-400/20" />
                <div className="absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full border border-blue-400/20" />
              </div>

              <div className="relative z-10 flex flex-col items-center px-5 text-center">
                <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border border-white/10 bg-white/5 text-blue-400 shadow-xl">
                  <Icon name="monitor" size={38} strokeWidth={1.4} />
                </div>

                <h2 className="text-xl font-bold text-white sm:text-2xl"> Your meeting is ready</h2>

                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-400"> No screen is being shared right now. Start presenting to share your screen with the team.</p>

                <button
                  onClick={() => startScreenShare()}
                  className="mt-7 flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition hover:bg-blue-500"
                >
                  <Icon name="monitorUp" size={18} />
                  Present now
                </button>
              </div>
            </div>
          )}

          {/* Screen thumbnails */}

          {allScreens.size > 1 && (
            <div className="mt-3 flex shrink-0 gap-3 overflow-x-auto pb-1">
              {Array.from(allScreens.entries()).map(([pid, stream]) => (
                <button
                  key={pid}
                  onClick={() => setFocusedScreen(pid)}
                  className={`relative h-24 w-36 shrink-0 overflow-hidden rounded-xl border-2 transition ${activeScreenId === pid
                    ? 'border-blue-500 shadow-lg shadow-blue-500/20'
                    : 'border-white/10 hover:border-white/30'
                    }`}
                >
                  <VideoTile
                    stream={stream}
                    label={pid === 'local'
                      ? 'You'
                      : peerNameMap[pid] || 'User'}
                    muted
                    mini
                  />
                </button>
              ))}
            </div>
          )}

          {/* Participants when no screen is shared */}

          {allScreens.size === 0 && (
            <div className="absolute bottom-6 left-0 right-0 z-10 flex justify-center px-4">
              <div className="flex max-w-full flex-wrap justify-center gap-3">

                <ParticipantTile
                  name={localUser?.username || 'You'}
                  avatar={localUser?.avatar_path}
                  muted={!isMicOn}
                  isSelf
                />

                {participants.map(p => (
                  <ParticipantTile
                    key={p.peerId}
                    name={p.username}
                    avatar={(allUsers || []).find(
                      u => (u.id || u.device_id) === p.peerId
                    )?.avatar_path}
                  />
                ))}
              </div>
            </div>
          )}
        </section>

        {/* Side panel */}

        {hasSidePanel && (
          <aside className="absolute inset-y-0 right-0 z-30 flex w-full flex-col border-l border-slate-200 bg-white text-slate-900 shadow-2xl sm:relative sm:w-90 sm:shrink-0">

            {/* Panel header */}

            <div className="flex h-16.5 shrink-0 items-center justify-between border-b border-slate-200 px-5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {isChatOpen
                    ? 'Meeting chat'
                    : isParticipantsOpen
                      ? 'Participants'
                      : 'Meeting logs'}
                </h3>

                <p className="mt-0.5 text-xs text-slate-400">
                  {isChatOpen
                    ? `${chatMessages.length} messages`
                    : isParticipantsOpen
                      ? `${participants.length + 1} people in meeting`
                      : `${logs.length} events`}
                </p>
              </div>

              <button onClick={closeSidePanel}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100
               hover:text-slate-900"
              >
                <Icon name="close" size={19} />
              </button>
            </div>

            {/* Chat */}

            {isChatOpen && (
              <>
                <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">

                  {chatMessages.length === 0 && (
                    <EmptyPanel icon="chat" title="No messages yet"
                      description="Send a message to start the conversation with everyone in this meeting."
                    />
                  )}

                  {chatMessages.map((msg, i) => {
                    const own = msg.sender === deviceId;

                    return (
                      <div key={`${msg.timestamp}_${i}`} className={`flex flex-col ${own ? 'items-end' : 'items-start'}`}>
                        <div className="mb-1.5 flex items-center gap-2">
                          {!own && (<span className="text-xs font-semibold text-slate-700"> {msg.senderName || 'User'} </span>)}
                          {own && (<span className="text-xs font-semibold text-blue-600"> You </span>)}
                        </div>

                        <div className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 ${own
                          ? 'rounded-br-md bg-blue-600 text-white'
                          : 'rounded-bl-md bg-slate-100 text-slate-800'
                          }`}>
                          <p className="whitespace-pre-wrap wrap-break-word text-sm leading-5"> {msg.text} </p>
                        </div>

                        <span className="mt-1 text-[10px] text-slate-400">
                          {new Date(msg.timestamp).toLocaleTimeString(
                            [],
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                            }
                          )}
                        </span>
                      </div>
                    );
                  })}

                  <div ref={chatEndRef} />
                </div>

                <div className="shrink-0 border-t border-slate-200 p-4">
                  <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-1.5 transition focus-within:border-blue-400 focus-within:ring-4 focus-within:ring-blue-500/10">
                    <input
                      type="text"
                      placeholder="Type a message..."
                      value={chatInput}
                      onChange={e => setChatInput(e.target.value)}
                      onKeyDown={e =>
                        e.key === 'Enter' &&
                        handleSendChat()
                      }
                      className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-slate-800 outline-none placeholder:text-slate-400"
                    />

                    <button
                      onClick={handleSendChat}
                      disabled={!chatInput.trim()}
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Icon name="send" size={17} />
                    </button>
                  </div>

                  <p className="mt-2 text-center text-[10px] text-slate-400"> Messages are temporary and cleared when the meeting ends. </p>
                </div>
              </>
            )}

            {/* Participants */}

            {isParticipantsOpen && (
              <div className="flex-1 overflow-y-auto p-4">

                <div className="mb-3 flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400"> In this meeting</p>

                  <button onClick={() => setShowInviteModal(true)}
                    className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-600 transition hover:bg-blue-100"
                  >
                    <Icon name="userPlus" size={14} />
                    Invite
                  </button>
                </div>

                {/* Current user */}

                <ParticipantRow
                  name={localUser?.username || 'You'}
                  avatar={localUser?.avatar_path}
                  role={isHost ? 'Host' : 'You'}
                  muted={!isMicOn}
                  self
                />

                {/* Other participants */}

                {participants.map(p => (
                  <ParticipantRow
                    key={p.peerId}
                    name={p.username}
                    avatar={(allUsers || []).find(
                      u => (u.id || u.device_id) === p.peerId
                    )?.avatar_path}
                  />
                ))}

                {participants.length === 0 && (
                  <div className="mt-8 text-center">
                    <p className="text-sm font-medium text-slate-500"> Waiting for participants </p>
                    <p className="mt-1 text-xs text-slate-400"> Invite someone to join this meeting. </p>
                  </div>
                )}
              </div>
            )}

            {/* Logs */}

            {isLogsOpen && (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
                  <span className="text-xs font-medium text-slate-500"> {logs.length} log entries </span>
                  <button
                    onClick={() => setLogs([])}
                    className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-500 transition hover:bg-slate-100"
                  >
                    Clear logs
                  </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3 font-mono">
                  {logs.length === 0 && (
                    <EmptyPanel
                      icon="terminal"
                      title="No logs yet"
                      description="WebRTC events and meeting activity will appear here."
                    />
                  )}

                  {logs.map((entry, i) => (
                    <div key={i} className="mb-2 rounded-lg bg-slate-50 p-2.5">
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <span className="text-[10px] text-slate-400">
                          {new Date(entry.timestamp).toLocaleTimeString(
                            [],
                            {
                              hour: '2-digit',
                              minute: '2-digit',
                              second: '2-digit',
                            }
                          )}
                        </span>

                        <span className={`text-[9px] font-bold uppercase ${entry.level === 'error'
                          ? 'text-red-600'
                          : entry.level === 'warn'
                            ? 'text-amber-600'
                            : 'text-blue-600'
                          }`}>
                          {entry.level}
                        </span>
                      </div>

                      <p className="wrap-break-word text-[11px] leading-5 text-slate-700"> {entry.message} </p>
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              </div>
            )}
          </aside>
        )}
      </main>

      {/* Bottom control bar */}

      <footer className="relative z-20 flex min-h-20.5 shrink-0 items-center justify-center border-t border-white/10 bg-slate-900 px-2 py-3 sm:px-5">

        <div className="flex w-full max-w-5xl items-center justify-between gap-2">

          {/* Left controls */}

          <div className="flex items-center gap-1 sm:gap-3">

            <ControlButton
              icon={isMicOn ? 'mic' : 'micOff'}
              label={isMicOn ? 'Mute' : 'Unmute'}
              active={!isMicOn}
              danger={!isMicOn}
              onClick={toggleMic}
            />

            <ControlButton
              icon="monitor"
              label={isScreenSharing ? 'Stop share' : 'Share'}
              active={isScreenSharing}
              onClick={() =>
                isScreenSharing
                  ? stopScreenShare()
                  : startScreenShare()
              }
            />

            <ControlButton
              icon="share"
              label="Selective"
              onClick={() => setShowSharePicker(true)}
            />
          </div>

          {/* Center controls */}

          <div className="flex items-center gap-1 sm:gap-3">

            <ControlButton
              icon="chat"
              label="Chat"
              active={isChatOpen}
              onClick={() => toggleSidePanel('chat')}
            />

            <ControlButton
              icon="users"
              label="People"
              active={isParticipantsOpen}
              badge={participants.length + 1}
              onClick={() => toggleSidePanel('people')}
            />

            <ControlButton
              icon="userPlus"
              label="Invite"
              onClick={() => setShowInviteModal(true)}
            />

            <ControlButton
              icon="terminal"
              label="Logs"
              active={isLogsOpen}
              onClick={() => toggleSidePanel('logs')}
            />
          </div>

          {/* Leave */}

          <button
            onClick={() => leaveMeeting()}
            className="flex h-11 shrink-0 items-center gap-2 rounded-xl bg-red-600 px-3 text-white shadow-lg 
            shadow-red-900/20 transition hover:bg-red-700 sm:px-5"
            title={isHost ? 'End meeting' : 'Leave meeting'}
          >
            <Icon name="phone" size={18} />
            <span className="hidden text-sm font-bold sm:inline">
              {isHost ? 'End' : 'Leave'}
            </span>
          </button>
        </div>
      </footer>

      {/* Invite modal */}

      {showInviteModal && (
        <InviteModal
          peers={onlinePeers}
          participants={participants}
          meetingCode={meetingId}
          onInvite={invitePeers}
          onClose={() => setShowInviteModal(false)}
          onCopy={copyMeetingCode}
        />
      )}

      {/* Selective screen share modal */}

      {showSharePicker && (
        <SelectiveShareModal
          participants={participants}
          allUsers={allUsers}
          selected={selectedPeersForShare}
          setSelected={setSelectedPeersForShare}
          onShare={startSelectiveShare}
          onClose={() => setShowSharePicker(false)}
        />
      )}
    </div>
  );
}

function VideoTile({
  stream,
  label,
  muted = false,
  mini = false,
}) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="absolute inset-0 overflow-hidden bg-black">
      <video ref={videoRef} autoPlay playsInline muted={muted} className="h-full w-full object-contain" />
      {label && !mini && (<div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-medium text-white backdrop-blur"> {label} </div>)}
    </div>
  );
}


function ParticipantTile({
  name,
  avatar,
  muted = false,
  isSelf = false,
}) {
  return (
    <div className="flex min-w-27.5 items-center gap-2 rounded-xl border border-white/10 bg-slate-900/90 px-3 py-2.5 shadow-lg backdrop-blur">
      <UserAvatar name={name} size={34} avatarUrl={avatar} />
      <div className="min-w-0">
        <p className="max-w-25 truncate text-xs font-semibold text-white"> {isSelf ? 'You' : name} </p>
        <p className="text-[10px] text-slate-400"> {isSelf ? 'You' : 'Participant'} </p>
      </div>
      <div className="ml-auto text-slate-400">
        <Icon name={muted ? 'micOff' : 'mic'} size={15} />
      </div>
    </div>
  );
}


function ParticipantRow({
  name,
  avatar,
  role,
  muted = false,
  self = false,
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl px-3 py-3 transition hover:bg-slate-50">
      <UserAvatar name={name} size={36} avatarUrl={avatar} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-800">
          {name}
          {self && (<span className="ml-1 text-xs font-normal text-slate-400"> (You) </span>)}
        </p>

        <p className="mt-0.5 text-xs text-slate-400"> {role || 'Participant'} </p>
      </div>
      <div className={muted ? 'text-red-500' : 'text-slate-400'}>
        <Icon name={muted ? 'micOff' : 'mic'} size={17} />
      </div>
    </div>
  );
}


function ControlButton({
  icon,
  label,
  onClick,
  active = false,
  danger = false,
  badge,
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`group relative flex min-w-10.5 flex-col items-center justify-center gap-1 rounded-xl px-2 py-2 transition sm:min-w-17 sm:px-3 ${danger
        ? 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
        : active
          ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
          : 'text-slate-300 hover:bg-white/10 hover:text-white'
        }`}
    >
      <span className="relative">
        <Icon name={icon} size={20} />
        {badge !== undefined && (
          <span className="absolute -right-3 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-blue-500 px-1 text-[9px] font-bold text-white">
            {badge}
          </span>
        )}
      </span>
      <span className="hidden whitespace-nowrap text-[10px] font-medium sm:block">
        {label}
      </span>
    </button>
  );
}


function ToastContainer({ toasts }) {
  if (!toasts.length) return null;

  return (
    <div className="pointer-events-none fixed right-4 top-4 z-100 flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2">
      {toasts.map(toast => (
        <div key={toast.id}
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 shadow-xl backdrop-blur ${toast.type === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : toast.type === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : 'border-blue-200 bg-white text-slate-800'
            }`}
        >
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${toast.type === 'success'
            ? 'bg-emerald-100 text-emerald-600'
            : toast.type === 'error'
              ? 'bg-red-100 text-red-600'
              : 'bg-blue-100 text-blue-600'
            }`}>
            <Icon
              name={toast.type === 'success' ? 'check' : 'video'}
              size={15}
            />
          </span>
          <p className="text-sm font-medium"> {toast.message} </p>
        </div>
      ))}
    </div>
  );
}


function EmptyPanel({
  icon = 'chat',
  title,
  description,
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
        <Icon name={icon} size={25} />
      </div>
      <h4 className="text-sm font-bold text-slate-700"> {title} </h4>
      <p className="mt-1.5 max-w-60 text-xs leading-5 text-slate-400"> {description} </p>
    </div>
  );
}


function ModalWrapper({
  title,
  subtitle,
  children,
  onClose,
  footer,
}) {
  return (
    <div className="fixed inset-0 z-90 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-slate-200 bg-white 
        shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h3 className="text-lg font-bold text-slate-900"> {title} </h3>
            {subtitle && (<p className="mt-1 text-xs text-slate-500"> {subtitle} </p>)}
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 transition
            hover:bg-slate-100 hover:text-slate-800"
          >
            <Icon name="close" size={19} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5"> {children} </div>
        {footer && (<div className="flex shrink-0 justify-end gap-2 border-t border-slate-100 px-6 py-4"> {footer} </div>)}
      </div>
    </div>
  );
}


function InviteModal({
  peers,
  participants,
  meetingCode,
  onInvite,
  onClose,
  onCopy,
}) {
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState('');
  const alreadyIn = participants.map(p => p.peerId);
  const availablePeers = peers.filter(peer => {
    const id = peer.id || peer.device_id;

    return !alreadyIn.includes(id) &&
      (peer.username || '').toLowerCase().includes(search.toLowerCase());
  });

  const togglePeer = id => {
    setSelected(prev =>
      prev.includes(id)
        ? prev.filter(p => p !== id)
        : [...prev, id]
    );
  };

  return (
    <ModalWrapper
      title="Invite people"
      subtitle="Add teammates to your current meeting."
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>

          <button
            onClick={() => onInvite(selected)}
            disabled={selected.length === 0}
            className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Invite {selected.length > 0 ? `(${selected.length})` : ''}
          </button>
        </>
      }
    >
      {/* Meeting code */}

      <div className="mb-5 rounded-2xl border border-blue-100 bg-blue-50 p-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-blue-700"> Meeting code </span>

          <button onClick={onCopy} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800">
            <Icon name="copy" size={13} />
            Copy
          </button>
        </div>

        <p className="break-all font-mono text-sm font-bold tracking-wide text-slate-800"> {meetingCode} </p>
      </div>

      {/* Search */}

      <div className="relative mb-4">
        <Icon name="search" size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search teammates..."
          className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10"
        />
      </div>

      {/* Peer list */}

      <div className="space-y-1">
        {availablePeers.map(peer => {
          const id = peer.id || peer.device_id;
          const checked = selected.includes(id);

          return (
            <label key={id}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checked
                ? 'border-blue-200 bg-blue-50'
                : 'border-transparent hover:bg-slate-50'
                }`}
            >
              <input type="checkbox" checked={checked} onChange={() => togglePeer(id)}
                className="h-4 w-4 rounded border-slate-300 accent-blue-600"
              />

              <UserAvatar name={peer.username} size={36} avatarUrl={peer.avatar_path} />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-800">{peer.username || 'User'}</p>
                <p className="text-xs text-emerald-600"> Online</p>
              </div>

              {checked && (<span className="text-blue-600"> <Icon name="check" size={17} /> </span>)}
            </label>
          );
        })}

        {availablePeers.length === 0 && (
          <div className="py-8 text-center">
            <p className="text-sm font-semibold text-slate-600"> No users found </p>
            <p className="mt-1 text-xs text-slate-400"> Try another search or check who is online. </p>
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}


function SelectiveShareModal({
  participants,
  allUsers,
  selected,
  setSelected,
  onShare,
  onClose,
}) {
  const togglePeer = id => {
    setSelected(prev =>
      prev.includes(id)
        ? prev.filter(p => p !== id)
        : [...prev, id]
    );
  };

  return (
    <ModalWrapper
      title="Selective screen sharing"
      subtitle="Choose who can receive your screen stream."
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Cancel
          </button>

          <button
            onClick={onShare}
            disabled={selected.length === 0}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Icon name="monitorUp" size={16} />
            Share ({selected.length})
          </button>
        </>
      }
    >
      <div className="mb-5 flex items-start gap-3 rounded-xl bg-blue-50 p-3">
        <span className="mt-0.5 text-blue-600">
          <Icon name="monitor" size={19} />
        </span>

        <p className="text-xs leading-5 text-blue-800">
          Only the participants you select will receive
          your screen share.
        </p>
      </div>

      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-slate-400"> Participants </span>

        <button
          onClick={() => setSelected(
            selected.length === participants.length
              ? []
              : participants.map(p => p.peerId)
          )}
          className="text-xs font-semibold text-blue-600 hover:text-blue-800"
        >
          {selected.length === participants.length
            ? 'Clear all'
            : 'Select all'}
        </button>
      </div>

      <div className="space-y-1">
        {participants.map(p => {
          const checked = selected.includes(p.peerId);

          const avatar = (allUsers || []).find(
            u => (u.id || u.device_id) === p.peerId
          )?.avatar_path;

          return (
            <label key={p.peerId}
              className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition ${checked
                ? 'border-blue-200 bg-blue-50'
                : 'border-transparent hover:bg-slate-50'
                }`}
            >
              <input type="checkbox" checked={checked} onChange={() => togglePeer(p.peerId)}
                className="h-4 w-4 rounded accent-blue-600" />

              <UserAvatar name={p.username} size={36} avatarUrl={avatar} />
              <span className="flex-1 text-sm font-semibold text-slate-800"> {p.username} </span>
              {checked && (<Icon name="check" size={17} className="text-blue-600" />)}
            </label>
          );
        })}

        {participants.length === 0 && (
          <div className="py-8 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
              <Icon name="users" size={22} />
            </div>
            <p className="text-sm font-semibold text-slate-600"> No participants yet </p>
            <p className="mt-1 text-xs text-slate-400"> Invite someone before sharing selectively. </p>
          </div>
        )}
      </div>
    </ModalWrapper>
  );
}
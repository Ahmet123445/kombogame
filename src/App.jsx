import React, { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import { Mic, MicOff, Monitor, MonitorOff, Send, LogOut, Paperclip, Image as ImageIcon, Volume2, VolumeX, Headphones } from 'lucide-react';
import classNames from 'classnames';
import { v4 as uuidv4 } from 'uuid';

// --- STUN SERVERS (BAĞLANTI İÇİN KRİTİK) ---
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' }
];

// --- Components ---

const UserCard = ({ peer, username, isMuted, isScreenSharing }) => {
  const videoRef = useRef();
  const [volume, setVolume] = useState(1);
  const [hasVideo, setHasVideo] = useState(false);

  useEffect(() => {
    // Stream geldiğinde
    peer.on("stream", stream => {
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setHasVideo(stream.getVideoTracks().length > 0);
      }
      
      // Track değişikliklerini dinle (Ekran paylaşımı aç/kapa için)
      stream.onaddtrack = () => setHasVideo(stream.getVideoTracks().length > 0);
      stream.onremovetrack = () => setHasVideo(stream.getVideoTracks().length > 0);
    });
  }, [peer]);

  const handleVolumeChange = (e) => {
      const newVol = parseFloat(e.target.value);
      setVolume(newVol);
      if(videoRef.current) {
          videoRef.current.volume = newVol;
      }
  };

  return (
    <div className={classNames("relative bg-gamer-panel rounded-lg overflow-hidden border transition-all duration-300 group flex flex-col shadow-lg", {
      "border-gamer-cyan shadow-neon": !isMuted,
      "border-gray-800": isMuted,
      "col-span-2 row-span-2 aspect-video": hasVideo,
      "aspect-[3/2]": !hasVideo
    })}>
      
      <video 
        ref={videoRef} 
        playsInline 
        autoPlay 
        className={classNames("w-full h-full object-cover bg-black", { "hidden": !hasVideo })} 
      />

      {!hasVideo && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-black">
              <div className={classNames("w-20 h-20 rounded-full flex items-center justify-center border-2 transition-all duration-500", !isMuted ? "border-gamer-cyan shadow-[0_0_30px_cyan] bg-gamer-cyan/20" : "border-gray-700 bg-gray-800")}>
                  <span className="text-2xl font-gamer text-white uppercase">{username.substring(0,2)}</span>
              </div>
          </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-2 flex items-center justify-between backdrop-blur-sm z-10">
        <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-white font-gamer text-xs tracking-wider truncate max-w-[100px]">{username}</span>
            {isMuted && <MicOff size={12} className="text-red-500 shrink-0" />}
        </div>
        
        <div className="flex items-center gap-2 group/vol">
            <Volume2 size={14} className="text-gray-400 group-hover/vol:text-gamer-cyan" />
            <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.1" 
                value={volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-gamer-cyan"
            />
        </div>
      </div>
    </div>
  );
};


function App() {
  const [inRoom, setInRoom] = useState(false);
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("Lobi");
  
  const [peers, setPeers] = useState([]);
  const [stream, setStream] = useState();
  const [messages, setMessages] = useState([]);
  
  const [messageInput, setMessageInput] = useState("");
  const fileInputRef = useRef();

  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  
  const socketRef = useRef();
  const userAudioRef = useRef();
  const peersRef = useRef([]); // Peer objelerini tutar
  const streamRef = useRef(); // Güncel stream referansı

  // --- Keybinds ---
  useEffect(() => {
    const handleKeyDown = (e) => {
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
            e.preventDefault();
            toggleMute();
        }
        if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') {
             e.preventDefault();
             toggleDeafen();
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [muted, deafened]);


  // --- Socket & WebRTC Logic ---
  const joinRoom = () => {
    if (!username || !roomId) return;
    
    // Render.com Sunucu Adresi
    socketRef.current = io('https://kombogame-server.onrender.com');

    navigator.mediaDevices.getUserMedia({ video: false, audio: true }).then(currentStream => {
        setStream(currentStream);
        streamRef.current = currentStream;
        
        if(userAudioRef.current) userAudioRef.current.srcObject = currentStream;

        socketRef.current.emit("join-room", { roomId, username });

        socketRef.current.on("message-history", (history) => {
            setMessages(history);
        });

        socketRef.current.on("all-users", users => {
            const peersArray = [];
            users.forEach(user => {
                const peer = createPeer(user.id, socketRef.current.id, currentStream, user.username);
                peersRef.current.push({ peerID: user.id, peer, username: user.username });
                peersArray.push({ peerID: user.id, peer, username: user.username });
            });
            setPeers(peersArray);
        });

        socketRef.current.on("user-joined", payload => {
            const peer = addPeer(payload.signal, payload.callerId, currentStream, payload.username);
            peersRef.current.push({ peerID: payload.callerId, peer, username: payload.username });
            setPeers(users => [...users, { peerID: payload.callerId, peer, username: payload.username }]);
        });

        socketRef.current.on("receiving-returned-signal", payload => {
            const item = peersRef.current.find(p => p.peerID === payload.id);
            if(item) item.peer.signal(payload.signal);
        });
        
        socketRef.current.on("user-left", id => {
            const peerObj = peersRef.current.find(p => p.peerID === id);
            if(peerObj) peerObj.peer.destroy();
            const newPeers = peersRef.current.filter(p => p.peerID !== id);
            peersRef.current = newPeers;
            setPeers(newPeers);
        });

        socketRef.current.on("receive-message", message => {
            setMessages(prev => [...prev, message]);
        });

        setInRoom(true);

    }).catch(err => {
        console.error("Error accessing media devices:", err);
        alert("Mikrofon erişimi sağlanamadı. Tarayıcı izinlerini kontrol edin.");
    });
  };

  function createPeer(userToSignal, callerId, stream, remoteUsername) {
      const peer = new Peer({ 
          initiator: true, 
          trickle: false, 
          stream,
          config: { iceServers: ICE_SERVERS } // STUN SERVER EKLENDİ
      });
      peer.on("signal", signal => {
          socketRef.current.emit("sending-signal", { userToSignal, callerId, signal, username });
      });
      return peer;
  }

  function addPeer(incomingSignal, callerId, stream, remoteUsername) {
      const peer = new Peer({ 
          initiator: false, 
          trickle: false, 
          stream,
          config: { iceServers: ICE_SERVERS } // STUN SERVER EKLENDİ
      });
      peer.on("signal", signal => {
          socketRef.current.emit("returning-signal", { signal, callerId });
      });
      peer.signal(incomingSignal);
      return peer;
  }

  const sendMessage = (e) => {
      e.preventDefault();
      if(!messageInput.trim()) return;
      socketRef.current.emit("send-message", { roomId, message: messageInput, username, type: 'text' });
      setMessageInput("");
  }

  const handleFileUpload = (e) => {
      const file = e.target.files[0];
      if(!file) return;

      const reader = new FileReader();
      reader.onload = () => {
          const base64 = reader.result;
          const type = file.type.startsWith('image/') ? 'image' : 'file';
          socketRef.current.emit("send-message", { 
              roomId, 
              message: file.name, 
              fileData: base64,
              type: type,
              username 
          });
      };
      reader.readAsDataURL(file);
      e.target.value = null; 
  };

  const toggleMute = () => {
      const currentStream = streamRef.current;
      if(!currentStream) return;
      
      const audioTrack = currentStream.getAudioTracks()[0];
      if (audioTrack) {
          const newMuteState = !muted;
          setMuted(newMuteState);
          audioTrack.enabled = !newMuteState; // Toggle track
          socketRef.current.emit("toggle-audio", { roomId, isMuted: newMuteState });
      }
  }

  const toggleDeafen = () => {
      const newDeafenState = !deafened;
      setDeafened(newDeafenState);
      
      const mediaElements = document.querySelectorAll('video, audio');
      mediaElements.forEach(el => {
          if(el !== userAudioRef.current) {
             el.muted = newDeafenState;
          }
      });
  }

  const toggleScreenShare = () => {
    if (screenSharing) {
        // Ekran Paylaşımını DURDUR
        // Sadece ses moduna geri dön
        navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(audioStream => {
             const audioTrack = audioStream.getAudioTracks()[0];
             
             // Peer'lardaki video track'i kaldır ve ses track'ini güncelle
             peersRef.current.forEach(p => {
                 const senders = p.peer._pc.getSenders();
                 const videoSender = senders.find(s => s.track && s.track.kind === 'video');
                 if(videoSender) {
                     // Video track'i kaldır
                     p.peer.removeTrack(videoSender, streamRef.current);
                 }
                 const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
                 if(audioSender) {
                     // Ses trackini değiştir (bazen gerekmez ama garanti olsun)
                     audioSender.replaceTrack(audioTrack);
                 }
             });
             
             // State güncelle
             setStream(audioStream);
             streamRef.current = audioStream;
             setScreenSharing(false);
             
             // Ekran paylaşımı streamini durdur
             screenTrackRef.current?.stop();
        });

    } else {
        // Ekran Paylaşımını BAŞLAT
        navigator.mediaDevices.getDisplayMedia({ cursor: true }).then(displayStream => {
            const screenTrack = displayStream.getVideoTracks()[0];
            const audioTrack = streamRef.current.getAudioTracks()[0];
            screenTrackRef.current = screenTrack;
            
            // Yeni bir stream oluştur (Ses + Ekran)
            const newStream = new MediaStream([screenTrack, audioTrack]);

            peersRef.current.forEach(p => {
                 // Video track'i ekle
                 p.peer.addTrack(screenTrack, newStream);
            });

            // Local view update
            setStream(newStream);
            streamRef.current = newStream;
            setScreenSharing(true);
            if(userAudioRef.current) userAudioRef.current.srcObject = newStream;

            screenTrack.onended = () => {
                 toggleScreenShare(); // Kullanıcı tarayıcı UI'sından durdurursa
            };
        });
    }
  }


  if (!inRoom) {
      return (
          <div className="h-screen w-full flex items-center justify-center bg-gamer-bg relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1511512578047-dfb367046420?q=80&w=2071&auto=format&fit=crop')] bg-cover opacity-20 blur-sm"></div>
              <div className="z-10 bg-gamer-panel p-8 rounded-2xl border border-gamer-cyan/30 shadow-neon w-96 backdrop-blur-md">
                  <h1 className="text-4xl text-gamer-cyan font-gamer text-center mb-2">KOMBOGAME</h1>
                  <p className="text-gray-400 text-center mb-8 text-sm">Voice & Screen Share</p>
                  
                  <div className="space-y-4">
                      <div>
                          <label className="block text-gray-500 text-xs uppercase mb-1">Username</label>
                          <input 
                              value={username} 
                              onChange={e => setUsername(e.target.value)}
                              className="w-full bg-black/50 border border-gray-700 rounded p-3 text-white focus:border-gamer-cyan focus:outline-none transition-colors"
                              placeholder="Kullanıcı Adı"
                          />
                      </div>
                      <div>
                          <label className="block text-gray-500 text-xs uppercase mb-1">Room ID</label>
                          <input 
                              value={roomId} 
                              onChange={e => setRoomId(e.target.value)}
                              className="w-full bg-black/50 border border-gray-700 rounded p-3 text-white focus:border-gamer-cyan focus:outline-none transition-colors"
                              placeholder="Oda İsmi"
                          />
                      </div>
                      <button 
                          onClick={joinRoom}
                          className="w-full bg-gamer-cyan/20 hover:bg-gamer-cyan text-gamer-cyan hover:text-black border border-gamer-cyan py-3 rounded font-gamer tracking-widest transition-all duration-300 mt-4 shadow-[0_0_15px_rgba(0,255,255,0.2)] hover:shadow-[0_0_25px_rgba(0,255,255,0.6)]"
                      >
                          BAĞLAN
                      </button>
                  </div>
              </div>
          </div>
      )
  }

  return (
    <div className="h-screen flex flex-col md:flex-row bg-gamer-bg text-gray-200 overflow-hidden">
      
      <div className="flex-1 flex flex-col relative order-2 md:order-1">
          
          <div className="absolute top-4 left-4 z-10 flex gap-4 bg-black/50 p-2 rounded border border-gray-800 backdrop-blur text-xs text-gray-400">
             <span>ROOM: <strong className="text-white">{roomId}</strong></span>
             <span className="border-l border-gray-600 pl-4">USERS: <strong className="text-white">{peers.length + 1}</strong></span>
          </div>

          <div className="flex-1 p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto content-start pt-16">
              <div className={classNames("relative bg-gamer-panel rounded-lg overflow-hidden border border-gamer-cyan shadow-neon aspect-[3/2] flex flex-col", { "col-span-2 row-span-2 aspect-video": screenSharing })}>
                  <video ref={userAudioRef} muted autoPlay playsInline className={classNames("w-full h-full object-cover", screenSharing ? "block" : "hidden")} />
                  
                  {!screenSharing && (
                      <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 to-black">
                        <div className="w-20 h-20 rounded-full flex items-center justify-center border-2 border-gamer-cyan bg-gamer-cyan/20 shadow-[0_0_30px_cyan]">
                            <span className="text-2xl font-gamer text-white uppercase">{username.substring(0,2)}</span>
                        </div>
                      </div>
                  )}

                  <div className="absolute bottom-0 left-0 right-0 bg-black/80 p-2 flex justify-between items-center z-10">
                       <span className="text-gamer-cyan font-gamer text-xs">YOU</span>
                       {muted && <MicOff size={12} className="text-red-500" />}
                  </div>
              </div>
              
              {peers.map((peer, index) => (
                  <UserCard key={index} peer={peer.peer} username={peer.username} />
              ))}
          </div>

          <div className="h-24 bg-gamer-panel border-t border-gray-800 flex items-center justify-center gap-8 z-20 pb-4">
              
              <div className="flex flex-col items-center gap-1">
                  <button onClick={toggleMute} className={classNames("p-4 rounded-full transition-all duration-300 border", muted ? "bg-red-500/10 border-red-500 text-red-500" : "bg-gray-800 border-gray-700 text-white hover:border-gamer-cyan hover:shadow-neon")}>
                      {muted ? <MicOff size={24} /> : <Mic size={24} />}
                  </button>
                  <span className="text-[10px] text-gray-500 font-gamer">MIC (Ctrl+M)</span>
              </div>

              <div className="flex flex-col items-center gap-1">
                  <button onClick={toggleDeafen} className={classNames("p-4 rounded-full transition-all duration-300 border", deafened ? "bg-red-500/10 border-red-500 text-red-500" : "bg-gray-800 border-gray-700 text-white hover:border-gamer-cyan hover:shadow-neon")}>
                      {deafened ? <VolumeX size={24} /> : <Headphones size={24} />}
                  </button>
                  <span className="text-[10px] text-gray-500 font-gamer">SOUND (Ctrl+Q)</span>
              </div>

              <div className="flex flex-col items-center gap-1">
                  <button onClick={toggleScreenShare} className={classNames("p-4 rounded-full transition-all duration-300 border", screenSharing ? "bg-green-500/10 border-green-500 text-green-500 shadow-[0_0_15px_rgba(0,255,0,0.4)]" : "bg-gray-800 border-gray-700 text-white hover:border-gamer-cyan hover:shadow-neon")}>
                       {screenSharing ? <MonitorOff size={24} /> : <Monitor size={24} />}
                  </button>
                  <span className="text-[10px] text-gray-500 font-gamer">SCREEN</span>
              </div>
              
              <div className="w-px h-12 bg-gray-800 mx-2"></div>

              <button onClick={() => window.location.reload()} className="p-4 rounded-full bg-red-500/10 border border-red-900 text-red-500 hover:bg-red-600 hover:text-white transition-all">
                  <LogOut size={24} />
              </button>
          </div>
      </div>

      <div className="w-80 bg-gamer-panel border-l border-gray-800 flex flex-col order-1 md:order-2">
          <div className="p-4 border-b border-gray-800 font-gamer text-gray-400 flex justify-between items-center">
              <span>CHAT</span>
              <span className="text-xs text-gray-600">{messages.length} msgs</span>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto space-y-4">
              {messages.map((msg, i) => (
                  <div key={i} className={classNames("flex flex-col", msg.username === username ? "items-end" : "items-start")}>
                       <span className={classNames("text-[10px] mb-1 px-1", msg.username === username ? "text-gamer-cyan" : "text-gray-500")}>{msg.username}</span>
                       
                       <div className={classNames("p-3 rounded-lg max-w-[90%] text-sm break-words shadow-sm", 
                           msg.username === username ? "bg-gamer-cyan/10 border border-gamer-cyan/30 text-white rounded-tr-none" : "bg-gray-800 text-gray-300 rounded-tl-none")}>
                           
                           {msg.type === 'text' && msg.message}
                           
                           {msg.type === 'image' && (
                               <div className="space-y-1">
                                   <img src={msg.fileData} alt="Shared" className="max-w-full rounded border border-gray-700 max-h-40 cursor-pointer hover:opacity-90" onClick={() => window.open(msg.fileData)} />
                                   {msg.message && <p className="text-xs text-gray-400 truncate">{msg.message}</p>}
                               </div>
                           )}

                            {msg.type === 'file' && (
                               <div className="flex items-center gap-2">
                                   <Paperclip size={16} />
                                   <a href={msg.fileData} download={msg.message} className="underline hover:text-gamer-cyan truncate max-w-[150px]">{msg.message}</a>
                               </div>
                           )}
                       </div>
                  </div>
              ))}
          </div>
          
          <div className="p-3 bg-black/20 border-t border-gray-800">
             <form onSubmit={sendMessage} className="flex gap-2">
                  <div className="relative flex-1">
                      <input 
                          value={messageInput}
                          onChange={e => setMessageInput(e.target.value)}
                          placeholder="Mesaj..." 
                          className="w-full bg-black/50 border border-gray-700 rounded p-2 pl-3 pr-8 text-sm text-white focus:border-gamer-cyan focus:outline-none"
                      />
                      <input 
                          type="file" 
                          ref={fileInputRef} 
                          className="hidden" 
                          onChange={handleFileUpload} 
                          accept="image/*,.pdf,.doc,.txt"
                      />
                      <button 
                          type="button" 
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gamer-cyan"
                      >
                          <Paperclip size={16} />
                      </button>
                  </div>
                  <button type="submit" className="bg-gamer-cyan text-black p-2 rounded hover:bg-white transition-colors">
                      <Send size={18} />
                  </button>
              </form>
          </div>
      </div>
    </div>
  )
}

export default App

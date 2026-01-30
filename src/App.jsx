import React, { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import { Mic, MicOff, Monitor, MonitorOff, Send, LogOut, Paperclip, Volume2, VolumeX, Headphones } from 'lucide-react';
import classNames from 'classnames';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { 
    urls: 'turn:openrelay.metered.ca:80', 
    username: 'openrelayproject', 
    credential: 'openrelayproject' 
  },
  { 
    urls: 'turn:openrelay.metered.ca:443', 
    username: 'openrelayproject', 
    credential: 'openrelayproject' 
  },
  { 
    urls: 'turn:openrelay.metered.ca:443?transport=tcp', 
    username: 'openrelayproject', 
    credential: 'openrelayproject' 
  }
];

// --- Yardımcı Fonksiyon: Siyah (Dummy) Stream Oluşturucu ---
function createDummyStream() {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, 640, 360);
    
    // 10 FPS'lik sessiz bir stream oluştur
    const stream = canvas.captureStream(10);
    // Videonun "canlı" kalması için sürekli çizim yap (bazı tarayıcılar donuk canvas'ı durdurur)
    setInterval(() => {
        ctx.fillStyle = 'black';
        ctx.fillRect(0, 0, 640, 360);
        ctx.fillStyle = '#010101'; // Çok hafif renk değişimi yap ki stream aktif kalsın
        ctx.fillRect(0, 0, 1, 1);
    }, 100);
    
    return stream;
}

const UserCard = ({ peer, username, isMuted, onExpand, isExpanded }) => {
  const videoRef = useRef();
  const audioRef = useRef();
  const [volume, setVolume] = useState(1);
  const [hasVideo, setHasVideo] = useState(false);
  const [connectionState, setConnectionState] = useState('connecting'); // connecting, connected, disconnected

  useEffect(() => {
    peer.on("stream", stream => {
      // SES: Audio elementine bağla
      if (audioRef.current) {
        audioRef.current.srcObject = stream;
        audioRef.current.play().catch(e => console.warn("Audio auto-play blocked:", e));
      }

      // VIDEO: Video elementine bağla
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn("Video auto-play blocked:", e));
      }
      
      // Video track var mı kontrol et
      setHasVideo(stream.getVideoTracks().length > 0 && stream.getVideoTracks()[0].enabled);
      setConnectionState('connected');
    });

    // Bağlantı durumlarını dinle
    peer.on('connect', () => setConnectionState('connected'));
    peer.on('close', () => setConnectionState('disconnected'));
    peer.on('error', () => setConnectionState('disconnected'));

  }, [peer]);

  const handleVolumeChange = (e) => {
      const newVol = parseFloat(e.target.value);
      setVolume(newVol);
      if(audioRef.current) audioRef.current.volume = newVol;
  };

  return (
    <div 
        className={classNames("relative bg-gamer-panel rounded-lg overflow-hidden border transition-all duration-300 group flex flex-col shadow-lg cursor-pointer hover:border-gamer-cyan/50", {
        "border-gamer-cyan shadow-neon": !isMuted,
        "border-gray-800": isMuted,
        "fixed inset-4 z-50 aspect-auto": isExpanded, // Genişletilmiş mod
        "aspect-[3/2]": !isExpanded && !hasVideo,
        "col-span-2 row-span-2 aspect-video": !isExpanded && hasVideo
      })}
        onClick={onExpand}
    >
      
      <audio ref={audioRef} autoPlay playsInline />

      {/* Bağlantı Durumu Göstergesi */}
      {connectionState !== 'connected' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
              <span className="text-gamer-cyan animate-pulse font-gamer text-xs">BAĞLANIYOR...</span>
          </div>
      )}

      <video 
        ref={videoRef} 
        playsInline 
        autoPlay 
        muted // Yankı olmaması için video sesi kapalı (ses audio'dan geliyor)
        className="w-full h-full object-cover bg-black"
      />

      {/* Kontrol Barı (Expanded modda daha büyük) */}
      <div className={classNames("absolute bottom-0 left-0 right-0 bg-black/80 flex items-center justify-between backdrop-blur-sm z-10", isExpanded ? "p-4" : "p-2")}>
        <div className="flex items-center gap-2 overflow-hidden">
            <span className={classNames("text-white font-gamer tracking-wider truncate", isExpanded ? "text-xl" : "text-xs max-w-[100px]")}>{username}</span>
            {isMuted && <MicOff size={isExpanded ? 20 : 12} className="text-red-500 shrink-0" />}
        </div>
        
        <div className="flex items-center gap-2 group/vol" onClick={e => e.stopPropagation()}>
            <Volume2 size={isExpanded ? 20 : 14} className="text-gray-400 group-hover/vol:text-gamer-cyan" />
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
      
      {/* Kapat Butonu (Sadece Expanded modda) */}
      {isExpanded && (
          <button className="absolute top-4 right-4 text-white hover:text-red-500 bg-black/50 p-2 rounded-full z-50">
              <MonitorOff size={24} />
          </button>
      )}
    </div>
  );
};


function App() {
  const [inRoom, setInRoom] = useState(false);
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("Lobi");
  
  const [peers, setPeers] = useState([]); // [{ peerID, peer, username }]
  const [expandedPeerID, setExpandedPeerID] = useState(null); // Hangi kullanıcı büyütüldü?

  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState("");
  
  const [muted, setMuted] = useState(false);
  const [deafened, setDeafened] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  
  const socketRef = useRef();
  const userVideoRef = useRef();
  const peersRef = useRef([]); 
  const localStreamRef = useRef(); // { audio: MediaStreamTrack, video: MediaStreamTrack }
  const fileInputRef = useRef();

  // --- Keybinds ---
  useEffect(() => {
    const handleKeyDown = (e) => {
        if(e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') { e.preventDefault(); toggleMute(); }
        if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'q') { e.preventDefault(); toggleDeafen(); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [muted, deafened]);


  // --- JOIN LOGIC ---
  const joinRoom = async () => {
    if (!username || !roomId) return;
    
    // URL Belirleme Mantığı:
    // 1. Önce .env dosyasında VITE_SERVER_URL var mı diye bakar.
    // 2. Yoksa ve uygulama "Production" (Canlı) modundaysa, Render adresini kullanır.
    // 3. Hiçbiri değilse (Geliştirme modu), localhost kullanır.
    const SOCKET_URL = import.meta.env.VITE_SERVER_URL || (import.meta.env.PROD ? 'https://kombogame-server.onrender.com' : 'http://localhost:3000');
    
    socketRef.current = io(SOCKET_URL);

    try {
        // 1. SESİ AL
        const audioStream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
        const audioTrack = audioStream.getAudioTracks()[0];

        // 2. DUMMY VIDEO AL (Siyah Ekran)
        const dummyStream = createDummyStream();
        const videoTrack = dummyStream.getVideoTracks()[0];

        // 3. İKİSİNİ BİRLEŞTİR (Master Stream)
        const masterStream = new MediaStream([audioTrack, videoTrack]);
        localStreamRef.current = masterStream;

        // Kendi önizlememize koy
        if(userVideoRef.current) userVideoRef.current.srcObject = masterStream;

        // 4. BAĞLAN - Önce eski dinleyicileri temizle (Safety)
        socketRef.current.off("all-users");
        socketRef.current.off("user-joined");
        socketRef.current.off("receiving-returned-signal");
        socketRef.current.off("user-left");
        socketRef.current.off("message-history");
        socketRef.current.off("receive-message");
        socketRef.current.off("user-toggled-audio"); // Temizlik

        socketRef.current.emit("join-room", { roomId, username });

        socketRef.current.on("all-users", users => {
            const peersArray = [];
            users.forEach(user => {
                // DUPLICATE CHECK
                const existing = peersRef.current.find(p => p.peerID === user.id);
                if (existing) {
                    existing.peer.destroy(); 
                }

                const peer = createPeer(user.id, socketRef.current.id, masterStream, user.username);
                // isMuted bilgisini de sakla
                const peerObj = { peerID: user.id, peer, username: user.username, isMuted: user.isMuted };
                peersRef.current.push(peerObj);
                peersArray.push(peerObj);
            });
            setPeers(peersArray);
        });

        socketRef.current.on("user-joined", payload => {
            const existing = peersRef.current.find(p => p.peerID === payload.callerId);
            if(existing) return; 

            const peer = addPeer(payload.signal, payload.callerId, masterStream, payload.username);
            const peerObj = { peerID: payload.callerId, peer, username: payload.username, isMuted: false };
            peersRef.current.push(peerObj);
            setPeers(users => [...users, peerObj]);
        });

        // Ses açma/kapama olayını dinle
        socketRef.current.on("user-toggled-audio", ({ userId, isMuted }) => {
            peersRef.current = peersRef.current.map(p => p.peerID === userId ? { ...p, isMuted } : p);
            setPeers(prev => prev.map(p => p.peerID === userId ? { ...p, isMuted } : p));
        });

        socketRef.current.on("receiving-returned-signal", payload => {
            const item = peersRef.current.find(p => p.peerID === payload.id);
            if(item) item.peer.signal(payload.signal);
        });

        socketRef.current.on("user-left", id => {
            const item = peersRef.current.find(p => p.peerID === id);
            if(item) item.peer.destroy();
            const newPeers = peersRef.current.filter(p => p.peerID !== id);
            peersRef.current = newPeers;
            setPeers(newPeers);
        });

        socketRef.current.on("message-history", hist => setMessages(hist));
        socketRef.current.on("receive-message", msg => setMessages(prev => [...prev, msg]));

        setInRoom(true);

    } catch(err) {
        console.error("Setup error:", err);
        alert("Mikrofon hatası: " + err.message);
    }
  };

  function createPeer(userToSignal, callerId, stream, remoteUsername) {
      const peer = new Peer({ 
          initiator: true, 
          trickle: true, // Hızlı bağlantı için
          stream,
          config: { iceServers: ICE_SERVERS } 
      });
      peer.on("signal", signal => {
          socketRef.current.emit("sending-signal", { userToSignal, callerId, signal, username });
      });
      return peer;
  }

  function addPeer(incomingSignal, callerId, stream, remoteUsername) {
      const peer = new Peer({ 
          initiator: false, 
          trickle: true, 
          stream,
          config: { iceServers: ICE_SERVERS }
      });
      peer.on("signal", signal => {
          socketRef.current.emit("returning-signal", { signal, callerId });
      });
      peer.signal(incomingSignal);
      return peer;
  }

  // --- ACTIONS ---

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
          socketRef.current.emit("send-message", { roomId, message: file.name, fileData: base64, type, username });
      };
      reader.readAsDataURL(file);
      e.target.value = null; 
  };

  const toggleMute = () => {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if(audioTrack) {
          const newState = !muted;
          setMuted(newState);
          audioTrack.enabled = !newState;
          socketRef.current.emit("toggle-audio", { roomId, isMuted: newState });
      }
  }

  const toggleDeafen = () => {
      const newState = !deafened;
      setDeafened(newState);
      document.querySelectorAll('audio').forEach(el => el.muted = newState);
  }

  const toggleScreenShare = async () => {
    if (screenSharing) {
        // DURDUR -> Siyah ekrana dön
        const dummyStream = createDummyStream();
        const dummyTrack = dummyStream.getVideoTracks()[0];
        const oldTrack = localStreamRef.current.getVideoTracks()[0];

        // Replace Track
        peersRef.current.forEach(p => {
            p.peer.replaceTrack(oldTrack, dummyTrack, localStreamRef.current);
        });

        // Local'i güncelle
        oldTrack.stop(); // Ekran paylaşımını bitir
        localStreamRef.current.removeTrack(oldTrack);
        localStreamRef.current.addTrack(dummyTrack);
        
        // Önizlemeyi güncelle
        if(userVideoRef.current) userVideoRef.current.srcObject = localStreamRef.current; // Force refresh
        
        setScreenSharing(false);

    } else {
        // BAŞLAT -> Ekran al
        try {
            const displayStream = await navigator.mediaDevices.getDisplayMedia({ cursor: true });
            const screenTrack = displayStream.getVideoTracks()[0];
            const oldTrack = localStreamRef.current.getVideoTracks()[0];

            // Replace Track (Siyah -> Ekran)
            peersRef.current.forEach(p => {
                p.peer.replaceTrack(oldTrack, screenTrack, localStreamRef.current);
            });

            // Local güncelle
            localStreamRef.current.removeTrack(oldTrack);
            localStreamRef.current.addTrack(screenTrack);
            oldTrack.stop(); // Siyah stream'i durdur (kaynak tasarrufu)

            setScreenSharing(true);

            // Kullanıcı "Paylaşımı Durdur" derse
            screenTrack.onended = () => {
                // Manuel olarak durdurma fonksiyonunu çağır ama state'i kontrol etmeden (recursion önle)
                // En temizi toggleScreenShare çağırmaktır ama state senkronizasyonu gerekir.
                // Burada basitçe sayfayı yenilemek bile daha stabil olabilir ama biz düzgün yapalım:
                // Siyah ekrana dönüş kodunu buraya kopyalamak en güvenlisi (toggle fonksiyonunu çağırmak yerine)
                
                const dummyStream = createDummyStream();
                const dummyTrack = dummyStream.getVideoTracks()[0];
                peersRef.current.forEach(p => {
                    p.peer.replaceTrack(screenTrack, dummyTrack, localStreamRef.current);
                });
                localStreamRef.current.removeTrack(screenTrack);
                localStreamRef.current.addTrack(dummyTrack);
                setScreenSharing(false);
            };

        } catch(err) {
            console.error("Screen share cancel/error:", err);
        }
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

          {/* Genişletilmiş Görünüm Arka Planı (Overlay) */}
          {expandedPeerID && (
              <div 
                className="fixed inset-0 bg-black/80 z-40 backdrop-blur-sm flex items-center justify-center p-8"
                onClick={() => setExpandedPeerID(null)} // Boşluğa tıklayınca kapat
              >
                 {/* Kartın kendisi zaten 'fixed' oluyor UserCard içinde, burası sadece arka planı karartmak için */}
              </div>
          )}

          <div className="flex-1 p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto content-start pt-16">
              
              {/* LOCAL USER */}
              <div className={classNames("relative bg-gamer-panel rounded-lg overflow-hidden border border-gamer-cyan shadow-neon aspect-[3/2] flex flex-col", { "col-span-2 row-span-2 aspect-video": screenSharing })}>
                  
                  {/* Local Video/Ekran */}
                  <video ref={userVideoRef} muted autoPlay playsInline className={classNames("w-full h-full object-cover", screenSharing ? "block" : "hidden")} />
                  
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
              
              {/* REMOTE USERS */}
              {peers.map((peer, index) => (
                  <UserCard 
                    key={peer.peerID} 
                    peer={peer.peer} 
                    username={peer.username}
                    isMuted={peer.isMuted} // Mute durumu eklendi
                    isExpanded={expandedPeerID === peer.peerID}
                    onExpand={() => setExpandedPeerID(expandedPeerID === peer.peerID ? null : peer.peerID)}
                  />
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

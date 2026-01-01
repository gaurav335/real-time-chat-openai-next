import React, { useState, useRef, useEffect, useCallback } from "react";
import { Message, AudioFile } from "./types";
import MessageBubble from "./components/MessageBubble";
import { io, Socket } from "socket.io-client";

const App: React.FC = () => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [socketID, setSocketID] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "model",
      text: "Hello! I am Agent. Upload an audio file or send a message to start analyzing sound.",
      timestamp: new Date(),
    },
  ]);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [inputValue, setInputValue] = useState("");
  const [selectedAudio, setSelectedAudio] = useState<AudioFile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const upsertMessage = (prevMessages: Message[], newMsg: Message) => {
    const index = prevMessages.findIndex((m) => m.id === newMsg.id);
    if (index !== -1) {
      const updatedMessages = [...prevMessages];

      updatedMessages[index] = {
        ...updatedMessages[index],
        text: `${updatedMessages[index].text} ${newMsg.text}`.trim(),
      };

      return updatedMessages;
    }

    return [
      ...prevMessages,
      {
        ...newMsg,
        timestamp: new Date(),
      },
    ];
  };
  const textBufferRef = useRef<Map<number, string>>(new Map());
  const expectedSeqRef = useRef(0);
  const messageIdRef = useRef<string | null>(null);

  let audioQueue: Uint8Array[] = [];
  let isPlaying = false;
  let audioContext: AudioContext | null = null;
  const audioBufferMap = new Map<number, AudioBuffer>();
  let expectedSeq = 0;
  let nextPlayTime = 0;
  let schedulerRunning = false;
  function initAudio() {
    if (!audioContext) {
      audioContext = new AudioContext();
      nextPlayTime = audioContext.currentTime + 0.05; // slight safety delay
    }
  }
  useEffect(() => {
    initAudio();
  }, []);
  useEffect(() => {
    const socketIo = io("https://35b8c02a1be1.ngrok-free.app", {
    // const socketIo = io("http://localhost:7777", {
      transports: ["websocket"],
      secure: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // const socketIo = io("https://8f782c1f0632.ngrok-free.app");

    socketIo.on("connect", () => {
      console.log("Socket connect");
      setSocketID(socketIo.id);
    });

    // socketIo.on("answer", (msg: Message) => {
    //   console.log(msg);
    //   setMessages((prev) => upsertMessage(prev, msg));
    //   setIsLoading(false);
    // });

    socketIo.on("partial-answer", (msg: Message) => {
      console.log(msg);
      setMessages((prev) => upsertMessage(prev, msg));
    });
    socketIo.on("partial-complete", (msg: Message) => {
      console.log(msg);
      setIsLoading(false);
    });

    // socketIo.on("audio-translation", (msg: Message) => {
    //   console.log(msg);
    //   setMessages((prev) => upsertMessage(prev, msg));
    // });
    // socketIo.on("audio-translation-complete", (msg: Message) => {
    //   console.log(msg);
    //   setIsLoading(false);
    // });

    socketIo.on("ai-audio-chunk", async (msg: any) => {
      const data: any = {
        id: msg.id,
        role: "model" as const,
        text: msg.text,
        partial: true,
      };
      // setMessages((prev) => upsertMessage(prev, data));
      if (!messageIdRef.current) {
        messageIdRef.current = msg.id;
      }
      textBufferRef.current.set(msg.seq, msg.text);

      const audioBuffer = await decodeBase64Audio(msg.base64Audio);
      audioBufferMap.set(msg.seq, audioBuffer);
      startScheduler();
      // const binary = atob(msg?.base64Audio || "");
      // const buffer = new Uint8Array(binary.length);
      // for (let i = 0; i < binary.length; i++) {
      //   buffer[i] = binary.charCodeAt(i);
      // }
      // audioQueue.push(buffer);
      // playNext();
    });
    socketIo.on("ai-audio-complete", (msg: Message) => {
      setIsLoading(false);
    });
    setSocket(socketIo);
    return () => {
      console.log("Not connect");
      socketIo.disconnect();
    };
  }, []);

  function startScheduler() {
    if (schedulerRunning) return;
    schedulerRunning = true;

    requestAnimationFrame(scheduleLoop);
  }
  function scheduleLoop() {
    while (audioBufferMap.has(expectedSeq)) {
      const buffer = audioBufferMap.get(expectedSeq)!;
      audioBufferMap.delete(expectedSeq);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      const startTime = Math.max(nextPlayTime, audioContext.currentTime + 0.01);
      source.start(startTime);
      flushTextForSeq(expectedSeq);

      nextPlayTime = startTime + buffer.duration;
      expectedSeq++;
    }

    // Stop scheduler if nothing left
    if (audioBufferMap.has(expectedSeq)) {
      requestAnimationFrame(scheduleLoop);
    } else {
      schedulerRunning = false;
    }
  }

  function flushTextForSeq(seq: number) {
    const text = textBufferRef.current.get(seq);
    if (!text) return;

    textBufferRef.current.delete(seq);

    setMessages((prev) => {
      const id = messageIdRef.current!;
      const index = prev.findIndex((m) => m.id === id);

      if (index !== -1) {
        const updated = [...prev];
        updated[index] = {
          ...updated[index],
          text: `${updated[index].text} ${text}`.trim(),
        };
        return updated;
      }

      return [
        ...prev,
        {
          id,
          role: "model",
          text,
          partial: true,
          timestamp: new Date(),
        },
      ];
    });
  }

  async function decodeBase64Audio(base64: string): Promise<AudioBuffer> {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return audioContext.decodeAudioData(bytes.buffer);
  }

  // async function playNext() {
  //   if (isPlaying) return; // 🚫 already playing
  //   if (audioQueue.length === 0) return;

  //   isPlaying = true;

  //   const chunk: any = audioQueue.shift();
  //   if (!chunk || !audioContext) {
  //     isPlaying = false;
  //     return;
  //   }

  //   try {
  //     const audioBuffer = await audioContext.decodeAudioData(chunk.buffer);

  //     const source = audioContext.createBufferSource();
  //     source.buffer = audioBuffer;
  //     source.connect(audioContext.destination);

  //     source.onended = () => {
  //       isPlaying = false;
  //       playNext(); // 🔁 play next chunk
  //     };

  //     source.start();
  //   } catch (err) {
  //     console.error("Audio decode error:", err);
  //     isPlaying = false;
  //     playNext();
  //   }
  // }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("audio/")) {
        alert("Please select an audio file.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = (reader.result as string).split(",")[1];
        setSelectedAudio({
          file,
          previewUrl: URL.createObjectURL(file),
          base64: base64String,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!inputValue.trim() && !selectedAudio) || isLoading) return;
    setIsLoading(true);
    const randomUid = Math.random().toString(36).substring(2, 32);
    const randomUidNew = Math.random().toString(36).substring(2, 32);
    const userMessage: Message = {
      id: randomUid,
      role: "user",
      text:
        inputValue ||
        (selectedAudio ? `Analyzing ${selectedAudio.file.name}...` : ""),
      timestamp: new Date(),
      audio: selectedAudio
        ? {
            base64: selectedAudio.base64,
            name: selectedAudio.file.name,
            url: selectedAudio.previewUrl,
            mimeType: selectedAudio.file.type,
          }
        : undefined,
    };
    setMessages((prev) => [...prev, userMessage]);
    setInputValue("");
    setSelectedAudio(null);

    if (selectedAudio === null) {
      socket?.emit("question", { ...userMessage, socketID });
    } else {
      const audioFile = selectedAudio?.file;
      const CHUNK_SIZE = 64 * 1024; // 64KB
      let offset = 0;
      while (offset < audioFile.size) {
        const chunk = await audioFile
          .slice(offset, offset + CHUNK_SIZE)
          .arrayBuffer();
        await socket.emit("audio-chunk-with-voice", { responseId:randomUidNew,chunk });
        offset += CHUNK_SIZE;
      }
      await socket.emit("audio-end-with-voice", {responseId:randomUidNew});
    }
  };

  const removeSelectedAudio = () => {
    setSelectedAudio(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };
  const isStoppingRef = useRef(false);

  const startRecording = async () => {
    if (!socket || isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });

      recorder.ondataavailable = async (event) => {
        if (!event.data || event.data.size === 0) return;

        const buffer = await event.data.arrayBuffer();
        console.log("Send Events ");
        socket.emit("audio-chunk-with-voice", { chunk: buffer });
        if (isStoppingRef.current) {
          console.log("Finalizing recording...");
          socket.emit("audio-end-with-voice", null);
          isStoppingRef.current = false;
        }
      };

      recorder.onstart = () => {
        console.log("🎤 Recording started");
        setIsRecording(true);
      };

      recorder.onstop = () => {
        console.log("🛑 Recording stopped");
        mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(2000);
    } catch (err) {
      alert("Microphone permission denied");
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state !== "recording") return;

    // 🔐 Mark stopping state
    isStoppingRef.current = true;

    // ✅ Force final (<2s) chunk FIRST
    recorder.requestData();

    // ✅ Stop AFTER requestData
    recorder.stop();
  };

  return (
    <div className="flex flex-col h-screen max-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="22" />
            </svg>
          </div>
          <div>
            <h1 className="font-bold text-lg leading-tight">AI</h1>
          </div>
        </div>
      </header>

      {/* Messages Area */}
      <main className="flex-1 overflow-y-auto custom-scrollbar px-4 py-6 md:px-8 max-w-5xl mx-auto w-full">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div className="flex justify-start mb-6">
            <div className="bg-white rounded-2xl rounded-tl-none p-4 border border-slate-100 shadow-sm">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="bg-white border-t border-slate-200 p-4 md:p-6 sticky bottom-0">
        <div className="max-w-5xl mx-auto w-full relative">
          {/* Audio Preview Tooltip */}
          {selectedAudio && (
            <div className="absolute bottom-full mb-4 left-0 right-0 p-3 bg-blue-50 border border-blue-100 rounded-xl shadow-lg flex items-center justify-between animate-in slide-in-from-bottom-2">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="bg-blue-600 p-2 rounded-lg text-white shrink-0">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" y1="19" x2="12" y2="23" />
                    <line x1="8" y1="23" x2="16" y2="23" />
                  </svg>
                </div>
                <div className="overflow-hidden">
                  <p className="text-sm font-semibold text-blue-900 truncate">
                    {selectedAudio.file.name}
                  </p>
                  <p className="text-xs text-blue-700">
                    {(selectedAudio.file.size / 1024 / 1024).toFixed(2)} MB •
                    Ready for analysis
                  </p>
                </div>
              </div>
              <button
                onClick={removeSelectedAudio}
                className="p-1.5 hover:bg-blue-100 rounded-full text-blue-600 transition-colors"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          )}

          <form
            onSubmit={handleSendMessage}
            className="relative flex items-end gap-2"
          >
            <div className="flex-1 relative">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={
                  selectedAudio
                    ? "Ask something about the audio..."
                    : "Type a message or upload audio..."
                }
                rows={1}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl py-3 pl-4 pr-12 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-none max-h-32 min-h-[50px] custom-scrollbar"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute right-3 bottom-2.5 p-1.5 text-slate-400 hover:text-blue-600 transition-colors"
                title="Upload audio"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
              </button>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="audio/*"
              />
            </div>
            <button
              type="button"
              onClick={isRecording ? stopRecording : startRecording}
              className={`px-3 py-2 rounded text-white ${
                isRecording ? "bg-red-600" : "bg-green-600"
              }`}
            >
              {isRecording ? "Stop" : "Mic"}
            </button>
            <button
              type="submit"
              disabled={isLoading || (!inputValue.trim() && !selectedAudio)}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white p-3.5 rounded-2xl shadow-lg shadow-blue-200 transition-all shrink-0 active:scale-95"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polyline points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      </footer>
    </div>
  );
};

export default App;

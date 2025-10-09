"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  Send,
  Paperclip,
  Bot,
  User,
  Copy,
  ThumbsUp,
  RefreshCcw,
  ThumbsDown,
  RefreshCw,
  Settings,
  MessageSquare,
  X,
  Plus,
  MoreHorizontal,
} from "lucide-react"
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import UserLayout from "@/app/user-layout"
import AuthGuard from "@/app/components/AuthGuard"
import { useUser } from "@/app/contexts/UserContext"
import { listDocumentsWithFilters } from "@/lib/api-client";

interface Message {
  id: string
  type: "user" | "ai"
  content: string
  timestamp: Date
  isStreaming?: boolean
  sources?: Array<{
    document: string
    page: number
    relevance: number
  }>
  attachments?: Array<{
    name: string
    type: string
  }>
  metadata?: {
    isFormsQuery?: boolean
    linksFound?: string[]
    category?: string
  }
}

export default function ChatPage() {
  const { user } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;

  const [aiOnline, setAiOnline] = useState(true)
  const [availableDocuments, setAvailableDocuments] = useState<any[]>([]);
  const [searchMode, setSearchMode] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [filteredDocuments, setFilteredDocuments] = useState<any[]>([])

  const latestAIMessageId = [...messages]
  .reverse()
  .find((msg) => msg.type === "ai")?.id

  const suggestedQuestions = [
    "What is the Oxytec Solutions Inc. COC?",
    "Give me the link of the budget request form",
    "What products are available in the catalog?",
    "When is the next board meeting scheduled?",
  ]

  const checkAIStatus = async () => {
    try {
      const response = await fetch("/api/ollama/status", {
        method: "GET",
      })

      if (response.ok) {
        const data = await response.json()
        setAiOnline(data.online)
      } else {
        setAiOnline(false)
      }
    } catch (error) {
      console.error("AI status check failed:", error)
      setAiOnline(false)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    checkAIStatus()
    const interval = setInterval(checkAIStatus, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!user) {
      setAvailableDocuments([]);
      return;
    }
    const fetchDocuments = async () => {
      try {
        const data = await listDocumentsWithFilters({ userId: user._id, userRole: user.role });
        setAvailableDocuments(data.documents || []);
      } catch (err) {
        setAvailableDocuments([]);
      }
    };
    fetchDocuments();
  }, [user]);

  const connectWebSocket = useCallback(() => {
    if (!user) return;

    const token = localStorage.getItem('authToken'); // Adjust based on your auth implementation
    if (!token) {
      console.error('No auth token found for WebSocket connection');
      setAiOnline(false);
      return;
    }

    const wsUrl = `ws://localhost:8000/api/chat/ws?token=${token}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('WebSocket connected');
      setAiOnline(true);
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      console.log('WebSocket message:', data);

      switch (data.type) {
        case 'connected':
          console.log('Connection established');
          break;

        case 'metadata':
          console.log('Query metadata:', data);
          break;

        case 'token':
          // Update the last AI message with new token
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage && lastMessage.type === 'ai' && lastMessage.isStreaming) {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: lastMessage.content + data.token,
                },
              ];
            }
            return prev;
          });
          break;

        case 'complete':
          setIsLoading(false);
          // Update final message
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage && lastMessage.type === 'ai') {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  content: preprocessAIResponse(data.answer),
                  isStreaming: false,
                  metadata: {
                    isFormsQuery: data.isFormsQuery,
                    linksFound: data.linksFound,
                    category: data.category,
                  },
                },
              ];
            }
            return prev;
          });
          break;

        case 'error':
          console.error('WebSocket error:', data.message);
          setIsLoading(false);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
              type: 'ai',
              content: `Error: ${data.message}`,
              timestamp: new Date(),
            },
          ]);
          break;
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setAiOnline(false);
    };

    ws.onclose = (event) => {
      console.log('WebSocket disconnected', event);
      setAiOnline(false);

      if (reconnectAttemptsRef.current < maxReconnectAttempts) {
        const timeout = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
        console.log(`Attempting to reconnect in ${timeout} ms`);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttemptsRef.current += 1;
          connectWebSocket();
        }, timeout);
      } else {
        console.error('Max WebSocket reconnection attempts reached');
      }
    };

    wsRef.current = ws;
  }, [user]);

  useEffect(() => {
    connectWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connectWebSocket]);

  const preprocessAIResponse = (response: string): string => {
    const urlRegex = /https?:\/\/[^\s]*/g;
    let processed = response.replace(urlRegex, (match) => match.replace(/\s/g, ''));
    processed = processed.replace(urlRegex, (match) => `[${match}](${match})`);
    return processed;
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not ready');
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      type: "user",
      content: inputMessage,
      timestamp: new Date(),
      attachments:
        selectedDocuments.length > 0
          ? selectedDocuments.map((id) => ({
              name: availableDocuments.find((doc) => doc._id === id)?.name || "",
              type: "pdf",
            }))
          : undefined,
    }

    setMessages((prev) => [...prev, userMessage])
    
    // Add placeholder AI message for streaming
    const aiMessageId = (Date.now() + 1).toString();
    const aiMessage: Message = {
      id: aiMessageId,
      type: 'ai',
      content: '',
      timestamp: new Date(),
      isStreaming: true,
    };
    setMessages((prev) => [...prev, aiMessage]);

    setInputMessage("")
    setIsLoading(true)

    // Send message via WebSocket
    wsRef.current.send(JSON.stringify({
      question: inputMessage,
      docIds: selectedDocuments,
      user: {
        _id: user?._id,
        name: user?.name,
        email: user?.email,
        role: user?.role,
      },
    }));

    // Reset textarea height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInputMessage(value);
    
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
    
    const atIndex = value.lastIndexOf('@');
    if (atIndex !== -1) {
      const query = value.slice(atIndex + 1);
      setSearchQuery(query);
      setSearchMode(true);
      setFilteredDocuments(
        availableDocuments.filter(doc =>
          doc.name.toLowerCase().includes(query.toLowerCase())
        )
      );
    } else {
      setSearchMode(false);
      setSearchQuery("");
      setFilteredDocuments([]);
    }
  };

  const handleSelectDocument = (doc: any) => {
    setSelectedDocuments(prev => [...prev, doc._id]);
    const atIndex = inputMessage.lastIndexOf('@');
    const newMessage = inputMessage.slice(0, atIndex);
    setInputMessage(newMessage);
    setSearchMode(false);
  };

  const handleRetryAIResponse = async (aiMessageId: string) => {
    const userMessage = messages
      .slice()
      .reverse()
      .find((msg) => msg.type === "user")

    if (!userMessage || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    setIsLoading(true)

    // Clear the AI message content for re-streaming
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === aiMessageId
          ? {
              ...msg,
              content: '',
              isStreaming: true,
              timestamp: new Date(),
            }
          : msg
      )
    )

    // Resend via WebSocket
    wsRef.current.send(JSON.stringify({
      question: userMessage.content,
      docIds: selectedDocuments,
      user: {
        _id: user?._id,
        name: user?.name,
        email: user?.email,
        role: user?.role,
      },
    }));
  }

  const handleSuggestedQuestion = (question: string) => {
    setInputMessage(question)
  }

  return (
    <AuthGuard requiredPermissions={['user_page_access']}>
      <UserLayout>
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <img src="/logo/OXY_gray.png" alt="OXY Logo" className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-gray-900">AI Assistant</h1>
                <p className="text-sm text-gray-500">
                  {selectedDocuments.length > 0
                    ? `Using ${selectedDocuments.length} document(s)`
                    : "Ready to help"}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Badge
                variant={aiOnline ? "default" : "destructive"}
                className="text-xs"
              >
                {aiOnline ? "● Online" : "○ Offline"}
              </Badge>
            </div>
          </div>

          {/* Messages Container */}
          <div className="h-[calc(90vh-180px)] ">
            <ScrollArea className="h-full">
              <div className="max-w-4xl mx-auto">
                {/* Empty State */}
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full px-6 py-20">
                    <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-6">
                      <img src="/logo/OXY_gray.png" alt="OXY Logo" className="w-9 h-9 text-gray-600" />
                    </div>
                    <h2 className="text-2xl font-semibold text-gray-900 mb-2">How can I help you today?</h2>
                    <p className="text-gray-500 text-center mb-8">I can help you analyze documents, answer questions, and assist with various tasks.</p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                      {suggestedQuestions.map((question, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestedQuestion(question)}
                          className="p-4 text-left bg-gray-50 hover:bg-gray-100 rounded-lg border border-gray-200 transition-colors duration-200"
                        >
                          <div className="font-medium text-gray-900 mb-1">{question}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Messages */}
                {messages.length > 0 ? (
                  <div className="space-y-6 pt-6 px-6 pb-6">
                    {messages.map((message, idx) => {
                      return (
                        <div key={message.id} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                          <div className={`flex space-x-3 max-w-[75%] ${message.type === "user" ? "flex-row-reverse space-x-reverse" : ""}`}>
                            <Avatar className="h-8 w-8 flex-shrink-0">
                              {message.type === "user" ? (
                                <AvatarFallback className="bg-[#2C2C2C]">
                                  <User className="h-4 w-4 text-white" />
                                </AvatarFallback>
                              ) : (
                                <AvatarFallback className="bg-gray-100">
                                  <img src="/logo/OXY_gray.png" alt="OXY Logo" className="w-5 h-5 text-gray-600" />
                                </AvatarFallback>
                              )}
                            </Avatar>
                            
                            <div className={`space-y-2 ${message.type === "user" ? "items-end" : "items-start"} flex flex-col group`}>
                              <div className={`p-4 ${
                                message.type === "user" 
                                  ? "bg-[#2C2C2C] text-white rounded-2xl rounded-br-md" 
                                  : "bg-white border border-gray-200 shadow-sm rounded-2xl rounded-bl-md"
                              }`}>
                                <div className="text-sm leading-relaxed">
                                  {message.isStreaming && !message.content ? (
                                    <div className="flex items-center space-x-2">
                                      <div className="flex space-x-1">
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: "0.1s"}}></div>
                                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay: "0.2s"}}></div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="prose prose-sm max-w-none [&>*:last-child]:mb-0 [&>*:first-child]:mt-0 [&>p]:mb-2 [&>ul]:mb-2 [&>ol]:mb-2">
                                      <ReactMarkdown
                                        remarkPlugins={[remarkGfm]}
                                        components={{
                                          a: ({ children, href }) => (
                                            <a href={href} className="text-blue-600 underline break-all" target="_blank" rel="noopener noreferrer">
                                              {children}
                                            </a>
                                          ),
                                        }}
                                      >
                                        {message.content}
                                      </ReactMarkdown>
                                      {message.isStreaming && (
                                        <span className="inline-block w-2 h-4 bg-gray-400 animate-pulse ml-1"></span>
                                      )}
                                    </div>
                                  )}
                                </div>
                                
                                {message.attachments && (
                                  <div className="mt-3 space-y-2">
                                    {message.attachments.map((attachment, index) => (
                                      <div key={index} className={`flex items-center space-x-2 text-xs ${
                                        message.type === "user" ? "text-blue-100" : "text-gray-500"
                                      }`}>
                                        <Paperclip className="h-3 w-3" />
                                        <span>{attachment.name}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}

                                {message.metadata?.linksFound && message.metadata.linksFound.length > 0 && (
                                  <div className="mt-3 pt-3 border-t border-gray-200">
                                    <p className="text-xs text-gray-500 mb-2">Links found:</p>
                                    <div className="space-y-1">
                                      {message.metadata.linksFound.map((link, idx) => (
                                        <a
                                          key={idx}
                                          href={link}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs text-blue-600 hover:underline block break-all"
                                        >
                                          {link}
                                        </a>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              <div className={`flex items-center space-x-2 text-xs text-gray-500 px-1 opacity-0 group-hover:opacity-100 transition-opacity ${
                                message.type === "user" ? "justify-end" : "justify-start"
                              }`}>
                                <span>{message.timestamp.toLocaleTimeString()}</span>
                                
                                {message.type === "ai" && !message.isStreaming && (
                                  <div className="flex items-center space-x-1">
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-6 w-6 p-0 hover:bg-gray-200 rounded-md"
                                      onClick={() => {
                                        navigator.clipboard.writeText(message.content);
                                      }}
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                    
                                    {message.id === latestAIMessageId && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 hover:bg-gray-200 rounded-md"
                                        onClick={() => handleRetryAIResponse(message.id)}
                                      >
                                        <RefreshCcw className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    
                    <div ref={messagesEndRef} />
                  </div>
                ) : (
                  <div ref={messagesEndRef} />
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Input Area */}
          <div className="fixed bottom-0 left-0 right-0">
            <div className="px-4 py-4 flex justify-center">
              <div className="w-full max-w-3xl relative">
                {/* Document Search Dropdown */}
                {searchMode && filteredDocuments.length > 0 && (
                  <div className="absolute bottom-full mb-2 bg-white border border-gray-200 rounded-xl shadow-lg max-h-48 overflow-y-auto w-full z-10">
                    {filteredDocuments.map(doc => (
                      <div
                        key={doc._id}
                        className="p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0 first:rounded-t-xl last:rounded-b-xl"
                        onClick={() => handleSelectDocument(doc)}
                      >
                        <div className="flex items-center space-x-2">
                          <FileText className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-900">{doc.name}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Selected Documents */}
                {selectedDocuments.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {selectedDocuments.map((docId) => {
                      const doc = availableDocuments.find((d) => d._id === docId)
                      return (
                        <Badge key={docId} variant="secondary" className="flex items-center gap-1 px-3 py-1 rounded-full">
                          <FileText className="w-3 h-3" />
                          {doc?.name}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-4 w-4 p-0 ml-1 hover:bg-red-100 rounded-full"
                            onClick={() => setSelectedDocuments(prev => prev.filter(id => id !== docId))}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </Badge>
                      )
                    })}
                  </div>
                )}

                {/* Input Box */}
                <div className="flex items-end space-x-3 bg-gray-50 rounded-2xl border border-gray-200 p-3 shadow-sm">
                  <Textarea
                    ref={textareaRef}
                    placeholder="Message AI Assistant..."
                    value={inputMessage}
                    onChange={handleInputChange}
                    onKeyDown={handleInputKeyDown}
                    className="flex-1 min-h-[24px] max-h-[200px] resize-none border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0 p-2 rounded-lg"
                    rows={1}
                    disabled={!aiOnline}
                  />
                  <Button 
                    onClick={handleSendMessage} 
                    disabled={!inputMessage.trim() || isLoading || !aiOnline}
                    className="flex-shrink-0 w-10 h-10 p-0 rounded-xl bg-[#2C2C2C] hover:bg-gray-680 disabled:bg-gray-300"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </UserLayout>
    </AuthGuard>
  )
}
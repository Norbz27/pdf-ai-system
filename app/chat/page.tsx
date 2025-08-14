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
} from "lucide-react"
import ReactMarkdown from 'react-markdown';
import UserLayout from "@/app/user-layout"
import AuthGuard from "@/app/components/AuthGuard"
import { useUser } from "@/app/contexts/UserContext"

interface Message {
  id: string
  type: "user" | "ai"
  content: string
  timestamp: Date
  sources?: Array<{
    document: string
    page: number
    relevance: number
  }>
  attachments?: Array<{
    name: string
    type: string
  }>
}

function TypingMessage({ content, onDone }: { content: string; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(content.slice(0, i + 1));
      i++;
      if (i >= content.length) {
        clearInterval(interval);
        if (onDone) onDone();
      }
    }, 12); // ~80 chars/sec
    return () => clearInterval(interval);
  }, [content, onDone]);
  return <ReactMarkdown>{displayed}</ReactMarkdown>;
}

export default function ChatPage() {
  const { user } = useUser();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [aiOnline, setAiOnline] = useState(true)
  const [availableDocuments, setAvailableDocuments] = useState<any[]>([]);

  const latestAIMessageId = [...messages]
  .reverse()
  .find((msg) => msg.type === "ai")?.id

  const suggestedQuestions = [
    "What are the company's vacation policies?",
    "Summarize the Q4 financial performance",
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
    // Fetch available documents from backend
    const fetchDocuments = async () => {
      try {
        const res = await fetch("/api/documents");
        if (!res.ok) throw new Error("Failed to fetch documents");
        const data = await res.json();
        setAvailableDocuments(data.documents || []);
      } catch (err) {
        setAvailableDocuments([]);
      }
    };
    fetchDocuments();
  }, []);

  // Personalized greeting logic
  useEffect(() => {
    async function fetchGreeting() {
      if (user) {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: "__greeting__", user })
        });
        if (res.ok) {
          const data = await res.json();
          setMessages([{ id: "1", type: "ai", content: data.answer, timestamp: new Date() }]);
        } else {
          setMessages([{ id: "1", type: "ai", content: `Hello ${user.name || "User"}! I'm your AI assistant. How can I help you today?`, timestamp: new Date() }]);
        }
      }
    }
    fetchGreeting();
  }, [user]);

  const fetchAIResponse = async (prompt: string): Promise<string> => {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        question: prompt,
        docIds: selectedDocuments,
        user,
      }),
    })

    if (!response.ok) {
      throw new Error("Failed to get AI response")
    }

    const data = await response.json()
    return data.answer
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return

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
    setInputMessage("")
    setIsLoading(true)

    try {
      const aiResponse = await fetchAIResponse(inputMessage)

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        type: "ai",
        content: aiResponse,
        timestamp: new Date(),
      }

      setMessages((prev) => [...prev, aiMessage])
    } catch (error) {
      console.error("AI Error:", error)
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          type: "ai",
          content: "Sorry, I couldn't process your request at the moment. Please make sure Ollama is running. You can start it by running `docker-compose up -d` in your project directory.",
          timestamp: new Date(),
        },
      ])
    } finally {
      setIsLoading(false)
    }
    // Reset textarea height after sending
    if (textareaRef.current) {
      textareaRef.current.style.height = "40px";
    }
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
    // Shift+Enter will allow a new line by default
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    // Auto-expand textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = "40px"; // reset first
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  };

  const handleRetryAIResponse = async (aiMessageId: string) => {
    const userMessage = messages
      .slice() // clone
      .reverse() // search backwards
      .find((msg) => msg.type === "user")

    if (!userMessage) return

    setIsLoading(true)

    try {
      const aiResponse = await fetchAIResponse(userMessage.content)

      // Replace the failed AI message with a new response
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId
            ? {
                ...msg,
                content: aiResponse,
                timestamp: new Date(),
              }
            : msg
        )
      )
    } catch (error) {
      console.error("Retry AI Error:", error)
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === aiMessageId
            ? {
                ...msg,
                content: "Retry failed. Please try again later.",
                timestamp: new Date(),
              }
            : msg
        )
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleSuggestedQuestion = (question: string) => {
    setInputMessage(question)
  }

  return (
    <AuthGuard requiredPermissions={['user_page_access']}>
      <UserLayout>
        <div className="grid lg:grid-cols-4 gap-8 h-[calc(100vh-200px)]">
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Available Documents</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {availableDocuments.map((doc) => (
                    <div
                      key={doc._id}
                      className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedDocuments.includes(doc._id)
                          ? "bg-gray-200 border-[#D9D9D9]"
                          : "hover:bg-gray-50 border-gray-200"
                      }`}
                      onClick={() => {
                        setSelectedDocuments((prev) =>
                          prev.includes(doc._id) ? prev.filter((id) => id !== doc._id) : [...prev, doc._id],
                        )
                      }}
                    >
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4 text-600" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{doc.name}</p>
                          <div className="flex items-center space-x-2 text-xs text-gray-500">
                            {doc.pages && <span>{doc.pages} pages</span>}
                            {doc.size && <span>• {doc.size}</span>}
                            {doc.categoryName && <span>• {doc.categoryName}</span>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Chat Area */}
          <div className="flex-1 overflow-hidden flex flex-col lg:col-span-3">
           <Card className="flex flex-col h-full">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Bot className="h-6 w-6 text-600" />
                    <div>
                      <CardTitle>AI Assistant</CardTitle>
                      <p className="text-sm text-gray-500">
                        {selectedDocuments.length > 0
                          ? `Analyzing ${selectedDocuments.length} document(s)`
                          : "Ready to help with your documents"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Badge
                      variant="outline"
                      className={aiOnline ? "text-green-600 border-green-200" : "text-red-500 border-red-200"}>
                      {aiOnline ? "Ollama Online" : "Ollama Offline"}
                    </Badge>
                    {!aiOnline && (
                      <div className="text-xs text-gray-500">
                        Run: docker-compose up -d
                      </div>
                    )}
                  </div>
                </div>
              </CardHeader>

              {/* Messages */}
              <ScrollArea className="flex-1 p-6 overflow-y-auto max-h-[calc(100vh-260px)]">
                <div className="space-y-6">
                  {messages.map((message, idx) => {
                    const isLatestAI = message.type === "ai" && message.id === latestAIMessageId && idx === messages.length - 1;
                    return (
                      <div key={message.id} className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}>
                        <div className={`flex space-x-3 max-w-3xl ${message.type === "user" ? "flex-row-reverse space-x-reverse" : ""}`}>
                          <Avatar className="h-8 w-8">
                            {message.type === "user" ? (
                              <AvatarFallback>
                                <User className="h-4 w-4" />
                              </AvatarFallback>
                            ) : (
                              <AvatarFallback className="bg-gray-100">
                                <Bot className="h-4 w-4 text-[#2C2C2C]" />
                              </AvatarFallback>
                            )}
                          </Avatar>
                          <div className={`space-y-2 ${message.type === "user" ? "items-end" : "items-start"} flex flex-col`}>
                            <div className={`p-4 rounded-lg ${message.type === "user" ? "bg-[#2C2C2C] text-white" : "bg-white border shadow-sm"}`}>
                              <div className="text-sm whitespace-pre-wrap">
                                {isLatestAI ? (
                                  <TypingMessage content={message.content} />
                                ) : (
                                  <ReactMarkdown>{message.content}</ReactMarkdown>
                                )}
                              </div>
                              {message.attachments && (
                                <div className="mt-2 space-y-1">
                                  {message.attachments.map((attachment, index) => (
                                    <div key={index} className="flex items-center space-x-2 text-xs opacity-75">
                                      <Paperclip className="h-3 w-3" />
                                      <span>{attachment.name}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {message.sources && (
                              <div className="bg-gray-50 rounded-lg p-3 text-xs">
                                <p className="font-medium text-gray-700 mb-2">Sources:</p>
                                {message.sources.map((source, index) => (
                                  <div key={index} className="flex items-center justify-between text-gray-600">
                                    <span>
                                      {source.document} (Page {source.page})
                                    </span>
                                    <Badge variant="outline" className="text-xs">
                                      {Math.round(source.relevance * 100)}% match
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            )}

                            <div className="flex items-center space-x-2 text-xs text-gray-500">
                              <span>{message.timestamp.toLocaleTimeString()}</span>
                              {message.type === "ai" && (
                                <div className="flex items-center space-x-1">
                                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                    <Copy className="h-3 w-3" />
                                  </Button>
                                  {message.id === latestAIMessageId && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-6 w-6 p-0"
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

                  {isLoading && (
                    <div className="flex justify-start">
                      <div className="flex space-x-3 max-w-3xl">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="bg-blue-100">
                            <Bot className="h-4 w-4 text-blue-600" />
                          </AvatarFallback>
                        </Avatar>
                        <div className="bg-white border shadow-sm rounded-lg p-4">
                          <div className="flex items-center space-x-2">
                            <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
                            <span className="text-sm text-gray-600">AI is thinking...</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div ref={messagesEndRef} />
              </ScrollArea>

              {/* Suggested Questions */}
              {messages.length === 1 && (
                <div className="px-6 py-4 border-t bg-gray-50">
                  <p className="text-sm font-medium text-gray-700 mb-3">Suggested questions:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {suggestedQuestions.map((question, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestedQuestion(question)}
                        className="text-left p-3 bg-white rounded-lg border hover:border-blue-300 hover:bg-blue-50 transition-colors text-sm"
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Area */}
              <div className="p-6 border-t">
                <div className="flex space-x-4">
                  <div className="flex-1">
                    <Textarea
                      ref={textareaRef}
                      placeholder="Ask a question about your documents..."
                      value={inputMessage}
                      onChange={handleInputChange}
                      onKeyDown={handleInputKeyDown}
                      className="w-full resize-none min-h-[40px] max-h-[200px]"
                    />
                  </div>
                  <Button variant="dark" onClick={handleSendMessage} disabled={!inputMessage.trim() || isLoading}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
                {selectedDocuments.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedDocuments.map((docId) => {
                      const doc = availableDocuments.find((d) => d._id === docId)
                      return (
                        <Badge key={docId} variant="secondary" className="text-xs">
                          {doc?.name}
                        </Badge>
                      )
                    })}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </UserLayout>
    </AuthGuard>
  )
}

import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { sendMessage, parseFlowSteps, getInvokedAgents } from '../api';
import { saveRun } from '../runStore';
import type { ResponsesResponse, FlowStep } from '../types';
import './ChatPage.css';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: string[];
  response?: ResponsesResponse;
  flowSteps?: FlowStep[];
}

const CHAT_STORAGE_KEY = 'uaip-chat-messages';

function loadMessages(): ChatMessage[] {
  try { return JSON.parse(sessionStorage.getItem(CHAT_STORAGE_KEY) || '[]'); } catch { return []; }
}

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>(loadMessages);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { sessionStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages)); }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const response = await sendMessage(userMsg);
      const flowSteps = parseFlowSteps(response);

      // Extract the final assistant message
      const outputItems = response.output || [];
      const lastMessage = outputItems
        .filter(o => o.type === 'message' && o.role === 'assistant')
        .pop();
      const text = lastMessage?.content?.[0]?.text || 'No response received.';

      // Extract tool call names (V2) or detect from text (V3)
      const agents = getInvokedAgents(response);
      const tools = outputItems
        .filter(o => o.type === 'function_call')
        .map(o => o.name || 'unknown');

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: text,
        toolCalls: agents.length > 0 ? agents : tools,
        response,
        flowSteps,
      }]);

      // Save to run history for the Agent Flow page
      saveRun({
        id: response.id || `run-${Date.now()}`,
        query: userMsg,
        timestamp: Date.now(),
        status: response.status === 'completed' ? 'completed' : 'failed',
        toolsUsed: agents.length > 0 ? agents : tools,
        response,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${msg}` }]);
    } finally {
      setLoading(false);
    }
  };

  const viewFlow = (msg: ChatMessage) => {
    if (msg.response) {
      sessionStorage.setItem('flowResponse', JSON.stringify(msg.response));
      navigate('/flow');
    }
  };

  const clearChat = () => {
    setMessages([]);
    sessionStorage.removeItem(CHAT_STORAGE_KEY);
  };

  return (
    <div className="chat-page">
      <div className="chat-header">
        <h2>Supervisor Agent</h2>
        <p>Search your knowledge base, check compliance, query cross-cloud agents — across Azure and AWS</p>
        {messages.length > 0 && (
          <button className="new-chat-btn" onClick={clearChat} disabled={loading}>+ New Chat</button>
        )}
      </div>
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-msg ${msg.role}`}>
            <div className="msg-avatar">
              {msg.role === 'user' ? '👤' : '⬡'}
            </div>
            <div className="msg-body">
              {msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="tool-chips">
                  {msg.toolCalls.map((t, j) => {
                    const isKnowledge = t.includes('Knowledge') || t.includes('search');
                    const isCompliance = t.includes('Compliance') || t.includes('analyze');
                    const isEngineering = t.includes('External') || t.includes('bedrock');
                    const isGovernance = t.includes('Governance') || t.includes('governance') || t.includes('health');
                    const chipClass = isEngineering ? 'aws' : isGovernance ? 'gov' : 'azure';
                    const label = isKnowledge ? '🔍 Knowledge Agent' : isCompliance ? '🛡️ Compliance Agent' : isEngineering ? '🔧 External Agent (AWS)' : isGovernance ? '📊 Governance Agent' : `🤖 ${t}`;
                    return (
                      <span key={j} className={`tool-chip ${chipClass}`}>{label}</span>
                    );
                  })}
                </div>
              )}
              <div className="msg-text"><ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown></div>
              {msg.role === 'assistant' && msg.response && (
                <button className="flow-btn" onClick={() => viewFlow(msg)}>
                  🔀 View Agent Flow
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-msg assistant">
            <div className="msg-avatar">⬡</div>
            <div className="msg-body">
              <div className="typing-indicator">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
      <div className="chat-input-bar">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask about your documents, policies, compliance, projects..."
          disabled={loading}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}

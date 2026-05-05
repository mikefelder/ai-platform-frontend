import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  MarkerType,
  Handle,
  Position,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { parseFlowSteps } from '../api';
import { getRuns, type RunRecord } from '../runStore';
import type { ResponsesResponse, FlowStep } from '../types';
import './FlowPage.css';

// Custom node component
function AgentNode({ data }: { data: { label: string; cloud: string; type: string; detail?: string; status?: string; icon: string; model?: string; payload?: string } }) {
  const cloudColors: Record<string, string> = {
    user: '#6b7280',
    azure: '#0078d4',
    aws: '#ff9900',
    governance: '#7c3aed',
  };
  const borderColor = cloudColors[data.cloud] || '#555';
  const isActive = data.status === 'active';
  const isIdle = data.status === 'idle';
  const isCompleted = data.status === 'completed';

  return (
    <div className={`agent-node ${data.type} ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isIdle ? 'idle' : ''}`}
         style={{ borderColor: isIdle ? '#dce1e8' : borderColor, boxShadow: isActive ? `0 0 20px ${borderColor}44` : undefined }}>
      <Handle type="target" position={Position.Left} />
      <div className="node-header" style={{ background: `${borderColor}22` }}>
        <span className="node-icon">{data.icon}</span>
        <span className="node-label">{data.label}</span>
        <span className="node-cloud" style={{ color: borderColor }}>
          {data.cloud === 'aws' ? 'Cross-Cloud' : data.cloud === 'governance' ? 'Platform' : data.cloud === 'azure' ? '' : ''}
        </span>
      </div>
      {data.model && (
        <div className="node-model">🤖 {data.model}</div>
      )}
      {data.detail && (
        <div className="node-detail">{data.detail.slice(0, 150)}{data.detail.length > 150 ? '...' : ''}</div>
      )}
      {data.status && (
        <div className={`node-status ${data.status}`}>
          {data.status === 'completed' ? '✓' : data.status === 'active' ? '●' : '○'} {data.status}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}

const nodeTypes = { agent: AgentNode };

function buildFlowGraph(steps: FlowStep[], query: string): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // User node
  nodes.push({
    id: 'user',
    type: 'agent',
    position: { x: 50, y: 250 },
    data: { label: 'User', cloud: 'user', type: 'user', icon: '👤', detail: query, status: 'completed', payload: JSON.stringify({ input: query }, null, 2) },
  });

  // APIM node
  nodes.push({
    id: 'apim',
    type: 'agent',
    position: { x: 280, y: 250 },
    data: { label: 'APIM AI Gateway', cloud: 'azure', type: 'gateway', icon: '🔒', status: 'completed', detail: 'Rate limiting, trace injection, token tracking', payload: JSON.stringify({ route: 'POST /uc2/responses', headers: { 'Ocp-Apim-Subscription-Key': '***', traceparent: '00-{traceId}-{spanId}-01' } }, null, 2) },
  });
  edges.push({ id: 'e-user-apim', source: 'user', target: 'apim', animated: true, style: { stroke: '#6b7280' }, markerEnd: { type: MarkerType.ArrowClosed } });

  // Supervisor node
  const planStep = steps.find(s => s.type === 'supervisor_plan');
  nodes.push({
    id: 'supervisor',
    type: 'agent',
    position: { x: 530, y: 250 },
    data: {
      label: 'Supervisor Agent',
      cloud: 'azure',
      type: 'supervisor',
      icon: '⬡',
      model: 'gpt-4.1',
      detail: planStep?.detail?.slice(0, 200),
      status: 'completed',
      payload: planStep ? JSON.stringify({ role: 'assistant', content: planStep.detail?.slice(0, 500) }, null, 2) : undefined,
    },
  });
  edges.push({ id: 'e-apim-sup', source: 'apim', target: 'supervisor', animated: true, style: { stroke: '#0078d4' }, markerEnd: { type: MarkerType.ArrowClosed } });

  // Agent nodes — always show all agents, highlight those that were invoked
  const toolCalls = steps.filter(s => s.type === 'tool_call');
  const toolResults = steps.filter(s => s.type === 'tool_result');

  const allAgents: Array<{ key: string; label: string; cloud: 'azure' | 'aws' | 'governance'; x: number; y: number; icon: string; model: string }> = [
    { key: 'KnowledgeUC1', label: 'Knowledge Agent', cloud: 'azure', x: 850, y: 50, icon: '🔍', model: 'gpt-4.1-mini' },
    { key: 'Compliance', label: 'Compliance Agent', cloud: 'azure', x: 850, y: 200, icon: '🛡️', model: 'o4-mini' },
    { key: 'BedrockAWS', label: 'Engineering Agent (AWS)', cloud: 'aws', x: 850, y: 350, icon: '🔧', model: 'Claude Sonnet 4' },
    { key: 'GovernanceUC3', label: 'Governance Agent', cloud: 'governance', x: 850, y: 500, icon: '📊', model: 'gpt-4.1' },
  ];

  const invokedAgents = new Set(toolCalls.map(c => c.agent));

  for (const agent of allAgents) {
    const wasInvoked = invokedAgents.has(agent.label);
    const call = toolCalls.find(c => c.agent === agent.label);
    const result = toolResults.find(r => r.agent === agent.label);
    const nodeId = `agent-${agent.key}`;
    const cloudColor = agent.cloud === 'aws' ? '#ff9900' : agent.cloud === 'governance' ? '#7c3aed' : '#0078d4';

    nodes.push({
      id: nodeId,
      type: 'agent',
      position: { x: agent.x, y: agent.y },
      data: {
        label: agent.label,
        cloud: agent.cloud,
        type: 'agent',
        icon: agent.icon,
        model: wasInvoked ? agent.model : undefined,
        detail: wasInvoked ? result?.detail?.slice(0, 200) : undefined,
        status: wasInvoked ? 'completed' : 'idle',
        payload: wasInvoked ? (() => {
          let invokeData = {};
          try { invokeData = call?.detail ? JSON.parse(call.detail) : {}; } catch { invokeData = { info: call?.detail || '' }; }
          return JSON.stringify({ invoke: invokeData, result: result?.detail?.slice(0, 500) }, null, 2).replace(/\\n/g, '\n');
        })() : undefined,
      },
    });

    if (wasInvoked) {
      edges.push({
        id: `e-sup-${nodeId}`,
        source: 'supervisor',
        target: nodeId,
        animated: true,
        style: { stroke: cloudColor },
        markerEnd: { type: MarkerType.ArrowClosed },
        label: 'invoke',
      });
      edges.push({
        id: `e-${nodeId}-sup`,
        source: nodeId,
        target: 'supervisor',
        animated: true,
        style: { stroke: cloudColor, strokeDasharray: '5,5' },
        markerEnd: { type: MarkerType.ArrowClosed },
        label: 'result',
      });
    } else {
      // Dimmed connection line for agents not invoked
      edges.push({
        id: `e-sup-${nodeId}`,
        source: 'supervisor',
        target: nodeId,
        animated: false,
        style: { stroke: '#dce1e8', strokeDasharray: '4,4' },
      });
    }
  }

  // Final response — flows back through the return path below the main flow
  const finalStep = steps.filter(s => s.type === 'supervisor_response').pop();
  if (finalStep) {
    nodes.push({
      id: 'response',
      type: 'agent',
      position: { x: 280, y: 480 },
      data: { label: 'Response to User', cloud: 'azure', type: 'response', icon: '📄', detail: finalStep.detail?.slice(0, 200), status: 'completed', model: 'gpt-4.1', payload: JSON.stringify({ type: 'synthesized_response', content: finalStep.detail?.slice(0, 500) }, null, 2) },
    });
    // Supervisor synthesizes → response
    edges.push({ id: 'e-sup-resp', source: 'supervisor', target: 'response', animated: true, style: { stroke: '#0078d4' }, markerEnd: { type: MarkerType.ArrowClosed }, label: 'synthesize' });
    // Response delivered back to user
    edges.push({ id: 'e-resp-user', source: 'response', target: 'user', style: { stroke: '#00c389', strokeDasharray: '5,5' }, markerEnd: { type: MarkerType.ArrowClosed }, label: 'response' });
  }

  return { nodes, edges };
}

function NodeInspector({ node }: { node: Node }) {
  const d = node.data as { label?: string; model?: string; detail?: string; payload?: string };
  return (
    <div className="node-inspector">
      <h4>{d.label || ''}</h4>
      {d.model && <div className="inspector-model">Model: {d.model}</div>}
      {d.detail && (
        <div className="inspector-section">
          <div className="inspector-section-title">Output</div>
          <div className="inspector-detail">{d.detail}</div>
        </div>
      )}
      {d.payload && (
        <div className="inspector-section">
          <div className="inspector-section-title">Payload (JSON)</div>
          <pre className="inspector-json">{d.payload}</pre>
        </div>
      )}
    </div>
  );
}

export default function FlowPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  // Load runs from store
  useEffect(() => {
    setRuns(getRuns());

    // Also check for response passed from chat page (View Agent Flow button)
    const stored = sessionStorage.getItem('flowResponse');
    if (stored) {
      sessionStorage.removeItem('flowResponse');
      const response: ResponsesResponse = JSON.parse(stored);
      loadFlow(response, response.id || 'from-chat');
    }
  }, []);

  // Refresh runs when tab becomes visible
  useEffect(() => {
    const onFocus = () => setRuns(getRuns());
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  const loadFlow = useCallback((response: ResponsesResponse, runId: string) => {
    setActiveRunId(runId);
    setSelectedNode(null);
    const steps = parseFlowSteps(response);
    const queryText = response.output?.find(o => o.type === 'message')?.content?.[0]?.text?.slice(0, 80) || 'Query';
    const { nodes: n, edges: e } = buildFlowGraph(steps, queryText);
    setNodes(n);
    setEdges(e);
  }, [setNodes, setEdges]);

  const selectRun = useCallback((run: RunRecord) => {
    loadFlow(run.response, run.id);
  }, [loadFlow]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  const memoNodeTypes = useMemo(() => nodeTypes, []);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const toolLabel = (name: string) => {
    if (name === 'Knowledge Agent' || name.includes('search')) return 'Knowledge';
    if (name === 'Compliance Agent' || name.includes('compliance') || name.includes('analyze')) return 'Compliance';
    if (name === 'Engineering Agent (AWS)' || name.includes('bedrock')) return 'Engineering (AWS)';
    if (name === 'Governance Agent' || name.includes('governance') || name.includes('health')) return 'Governance';
    return name;
  };

  return (
    <div className="flow-page">
      <div className="flow-sidebar">
        <h3>Agent Flow</h3>
        <p className="sidebar-desc">Select a conversation to visualize how it was routed through the multi-agent system</p>

        <div className="runs-list">
          {runs.length === 0 && (
            <div className="runs-empty">
              No runs yet. Start a conversation in the Chat tab.
            </div>
          )}
          {runs.map(run => (
            <button
              key={run.id}
              className={`run-item ${activeRunId === run.id ? 'active' : ''}`}
              onClick={() => selectRun(run)}
            >
              <div className="run-query">{run.query}</div>
              <div className="run-meta">
                <span className="run-time">{formatTime(run.timestamp)}</span>
                <span className="run-tools">
                  {run.toolsUsed.map((t, i) => (
                    <span key={i} className={`run-tool-tag ${t.includes('bedrock') ? 'aws' : t.includes('governance') || t.includes('health') ? 'gov' : 'azure'}`}>
                      {toolLabel(t)}
                    </span>
                  ))}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="legend">
          <h4>Legend</h4>
          <div className="legend-item"><span className="legend-dot" style={{ background: '#6b7280' }} /> User</div>
          <div className="legend-item"><span className="legend-dot" style={{ background: '#0078d4' }} /> Azure</div>
          <div className="legend-item"><span className="legend-dot" style={{ background: '#ff9900' }} /> AWS</div>
          <div className="legend-item"><span className="legend-dot" style={{ background: '#7c3aed' }} /> Governance</div>
        </div>

        {selectedNode && <NodeInspector node={selectedNode} />}
      </div>

      <div className="flow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={memoNodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#dce1e8" gap={20} />
          <Controls />
          <MiniMap
            nodeColor={(n) => {
              const d = n.data as { cloud?: string };
              if (d.cloud === 'aws') return '#ff9900';
              if (d.cloud === 'governance') return '#7c3aed';
              if (d.cloud === 'azure') return '#0078d4';
              return '#6b7280';
            }}
            style={{ background: '#f5f7fa' }}
          />
        </ReactFlow>

        {nodes.length === 0 && (
          <div className="empty-canvas">
            <div className="empty-icon">🔀</div>
            <h3>Agent Flow Visualizer</h3>
            <p>Send messages in the Chat tab, then select a run here to see how it was routed through User → APIM → Supervisor → specialized agents across Azure and AWS.</p>
          </div>
        )}
      </div>
    </div>
  );
}

import type { ResponsesResponse, FlowStep } from './types';

const API_BASE = import.meta.env.VITE_API_BASE || '/api';
const API_KEY = import.meta.env.VITE_API_KEY || '';

export async function sendMessage(input: string): Promise<ResponsesResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['Ocp-Apim-Subscription-Key'] = API_KEY;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 300000); // 5 min timeout

  const res = await fetch(`${API_BASE}/uc2/responses`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ input }),
    signal: controller.signal,
  });
  clearTimeout(timeout);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text.slice(0, 200)}`);
  }

  return res.json();
}

/** Parse a Responses API response into flow steps for the visualizer */
export function parseFlowSteps(response: ResponsesResponse): FlowStep[] {
  const steps: FlowStep[] = [];
  let stepIndex = 0;

  for (const item of response.output) {
    if (item.type === 'message' && item.role === 'assistant' && item.content?.[0]?.text) {
      const text = item.content[0].text;
      const isPlan = text.toLowerCase().includes('plan') && stepIndex === 0;

      steps.push({
        id: item.id || `step-${stepIndex}`,
        type: isPlan ? 'supervisor_plan' : 'supervisor_response',
        agent: 'Supervisor',
        cloud: 'azure',
        label: isPlan ? 'Supervisor Plans' : 'Supervisor Response',
        detail: text,
        status: 'completed',
      });
    } else if (item.type === 'function_call') {
      const agent = detectAgent(item.name || '');
      steps.push({
        id: item.id || `step-${stepIndex}`,
        type: 'tool_call',
        agent: agent.name,
        cloud: agent.cloud,
        label: `→ ${agent.name}`,
        detail: item.arguments || '',
        status: 'completed',
      });
    } else if (item.type === 'function_call_output') {
      const matchingCall = response.output.find(
        o => o.type === 'function_call' && o.call_id === item.call_id
      );
      const agent = matchingCall ? detectAgent(matchingCall.name || '') : { name: 'Unknown', cloud: 'azure' as const };
      steps.push({
        id: item.id || `step-${stepIndex}`,
        type: 'tool_result',
        agent: agent.name,
        cloud: agent.cloud,
        label: `← ${agent.name}`,
        detail: item.output || '',
        status: 'completed',
      });
    }
    stepIndex++;
  }

  // V3 workflow fallback: if no tool_call steps found, detect agents from response text
  const hasToolCalls = steps.some(s => s.type === 'tool_call');
  if (!hasToolCalls) {
    const responseText = response.output
      .filter(o => o.type === 'message' && o.role === 'assistant')
      .map(o => o.content?.[0]?.text || '')
      .join(' ');
    const detected = detectAgentsFromText(responseText);
    for (const agent of detected) {
      steps.push({
        id: `inferred-call-${agent.name}`,
        type: 'tool_call',
        agent: agent.name,
        cloud: agent.cloud,
        label: `→ ${agent.name}`,
        detail: '(routed by workflow)',
        status: 'completed',
      });
      steps.push({
        id: `inferred-result-${agent.name}`,
        type: 'tool_result',
        agent: agent.name,
        cloud: agent.cloud,
        label: `← ${agent.name}`,
        detail: '(included in synthesized response)',
        status: 'completed',
      });
    }
  }

  return steps;
}

function detectAgent(toolName: string): { name: string; cloud: 'azure' | 'aws' | 'governance' } {
  if (toolName.includes('search_knowledge')) return { name: 'Knowledge Agent', cloud: 'azure' };
  if (toolName.includes('analyze_compliance')) return { name: 'Compliance Agent', cloud: 'azure' };
  if (toolName.includes('invoke_bedrock')) return { name: 'External Agent (AWS)', cloud: 'aws' };
  if (toolName.includes('governance') || toolName.includes('agent_health')) return { name: 'Governance Agent', cloud: 'governance' };
  return { name: toolName, cloud: 'azure' };
}

/** Detect which agents contributed by analyzing the response text (V3 workflow fallback) */
function detectAgentsFromText(text: string): Array<{ name: string; cloud: 'azure' | 'aws' | 'governance' }> {
  const lower = text.toLowerCase();
  const agents: Array<{ name: string; cloud: 'azure' | 'aws' | 'governance' }> = [];

  // Look for agent section headers (## Knowledge, ## Compliance) or content signatures
  if (/## knowledge\b/i.test(text) || lower.includes('knowledge base') || lower.includes('document search') || lower.includes('instrument data sheet'))
    agents.push({ name: 'Knowledge Agent', cloud: 'azure' });
  if (/## compliance\b/i.test(text) || lower.includes('compliance') || lower.includes('regulatory') || /\basme\b|\bapi 6d\b|\biec\b|\biso\b/.test(lower))
    agents.push({ name: 'Compliance Agent', cloud: 'azure' });
  if (/## engineering\b/i.test(text) || lower.includes('cross-project') || lower.includes('bedrock') || lower.includes('historical'))
    agents.push({ name: 'External Agent (AWS)', cloud: 'aws' });
  if (/## governance\b/i.test(text) || lower.includes('agent health') || lower.includes('platform status') || lower.includes('cost summary'))
    agents.push({ name: 'Governance Agent', cloud: 'governance' });

  return agents;
}

/** Get the list of agents that contributed to a response (works for both V2 and V3) */
export function getInvokedAgents(response: ResponsesResponse): string[] {
  const outputItems = response.output || [];

  // V2: check for function_call items
  const toolNames = outputItems
    .filter(o => o.type === 'function_call')
    .map(o => o.name || '');
  if (toolNames.length > 0) {
    return toolNames.map(t => detectAgent(t).name);
  }

  // V3: detect from response text
  const responseText = outputItems
    .filter(o => o.type === 'message' && o.role === 'assistant')
    .map(o => o.content?.[0]?.text || '')
    .join(' ');
  return detectAgentsFromText(responseText).map(a => a.name);
}

import http from 'node:http';

// Mock Supervisor responses that simulate real agent behavior
const MOCK_RESPONSES = {
  default: {
    id: 'caresp_mock_001',
    object: 'response',
    status: 'completed',
    model: 'gpt-4.1',
    response_id: 'caresp_mock_001',
    output: [
      {
        type: 'message', id: 'msg_plan', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: '**Plan**: I\'ll use multiple tools to answer your question:\n1. **search_knowledge** — Search the knowledge base for relevant documents\n2. **analyze_compliance** — Get compliance analysis from Azure AI Foundry\n3. **invoke_bedrock_agent** — Query the AWS Bedrock agent for cross-cloud knowledge retrieval\n\nProceeding now.', annotations: [] }],
      },
      {
        type: 'function_call', id: 'fc_001', call_id: 'call_001', name: 'search_knowledge', status: 'completed',
        arguments: '{"query":"product specifications compliance requirements"}',
      },
      {
        type: 'function_call', id: 'fc_002', call_id: 'call_002', name: 'analyze_compliance', status: 'completed',
        arguments: '{"question":"What are the compliance requirements for our product specifications?"}',
      },
      {
        type: 'function_call', id: 'fc_003', call_id: 'call_003', name: 'invoke_bedrock_agent', status: 'completed',
        arguments: '{"task":"Retrieve documents related to product specifications","agent_name":"compliance"}',
      },
      {
        type: 'function_call_output', id: 'fco_001', call_id: 'call_001', status: 'completed',
        output: '**[1] Sample Project — Product Technical Specification**\nSource: SPEC-001 Rev 3 | Category: Technical Specification\nCovers design requirements, material standards, testing protocols, and acceptance criteria.\n\n---\n**[2] Equipment Maintenance Data Sheet**\nSource: DS-003 Rev 2 | Category: Data Sheet\nDetailed maintenance procedures, inspection intervals, and replacement criteria.',
      },
      {
        type: 'function_call_output', id: 'fco_002', call_id: 'call_002', status: 'completed',
        output: 'Compliance requirements for product specifications involve:\n\n1. **Industry Standards** — Design, materials, testing\n2. **Regulatory Requirements** — Safety, environmental, quality\n3. **Quality Management** — ISO 9001, inspection protocols\n4. **Documentation** — Traceability and audit trails\n\nAll critical components must meet applicable regulatory standards.',
      },
      {
        type: 'function_call_output', id: 'fco_003', call_id: 'call_003', status: 'completed',
        output: '[AWS Bedrock — compliance]\nCross-cloud analysis confirms alignment with international standards. AWS-sourced documentation references additional regulatory frameworks and best practices from similar projects.\n\n(execution: aws-exec-mock-001, duration: 2340ms, tokens: 180 in / 95 out)',
      },
      {
        type: 'message', id: 'msg_response', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: 'Based on the knowledge base, compliance analysis, and cross-cloud retrieval:\n\n## Product Specifications — Sample Project\n\n### Applicable Standards\n- **Industry Standards** — Design and material requirements\n- **Quality Management** — ISO 9001 compliance\n- **Regulatory Requirements** — Safety and environmental standards\n\n### Key Specifications\n- **Design Requirements**: Per SPEC-001 Rev 3\n- **Material Standards**: Per STD-002 Rev 7\n- **Testing Protocols**: Defined inspection and acceptance criteria\n- **Maintenance**: Scheduled intervals per DS-003 Rev 2\n\n### Compliance Notes\nAll components must meet applicable regulatory standards with full material traceability.\n\n*Sources: SPEC-001 Rev 3, DS-003 Rev 2, AWS Bedrock compliance agent*', annotations: [] }],
      },
    ],
  },
  governance: {
    id: 'caresp_mock_gov',
    object: 'response',
    status: 'completed',
    model: 'gpt-4.1',
    response_id: 'caresp_mock_gov',
    output: [
      {
        type: 'message', id: 'msg_plan_gov', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: '**Plan**: I\'ll query the governance hub for platform status:\n1. **query_agent_health** — Check all agent health\n2. **query_governance_costs** — Get cost summary', annotations: [] }],
      },
      {
        type: 'function_call', id: 'fc_gov_1', call_id: 'call_gov_1', name: 'query_agent_health', status: 'completed',
        arguments: '{}',
      },
      {
        type: 'function_call', id: 'fc_gov_2', call_id: 'call_gov_2', name: 'query_governance_costs', status: 'completed',
        arguments: '{"scope":"summary"}',
      },
      {
        type: 'function_call_output', id: 'fco_gov_1', call_id: 'call_gov_1', status: 'completed',
        output: '{"agents":[{"name":"uc1-rag-agent","status":"healthy","latency_ms":120},{"name":"uc2-supervisor","status":"healthy","latency_ms":85},{"name":"uc3-governance","status":"healthy","latency_ms":45},{"name":"aws-bedrock-compliance","status":"healthy","latency_ms":2100}]}',
      },
      {
        type: 'function_call_output', id: 'fco_gov_2', call_id: 'call_gov_2', status: 'completed',
        output: '{"period":"2026-04","total_tokens":142500,"total_cost_usd":4.28,"by_model":{"gpt-4.1":{"tokens":128000,"cost":3.84},"claude-haiku":{"tokens":14500,"cost":0.44}}}',
      },
      {
        type: 'message', id: 'msg_gov_resp', role: 'assistant', status: 'completed',
        content: [{ type: 'output_text', text: '## UAIP Platform Status\n\n### Agent Health\n| Agent | Status | Latency |\n|-------|--------|--------|\n| UC1 RAG Agent | ✅ Healthy | 120ms |\n| UC2 Supervisor | ✅ Healthy | 85ms |\n| UC3 Governance | ✅ Healthy | 45ms |\n| AWS Bedrock (compliance) | ✅ Healthy | 2.1s |\n\n### Cost Summary (April 2026)\n- **Total tokens**: 142,500\n- **Total cost**: $4.28 USD\n- **GPT-4.1**: 128K tokens ($3.84)\n- **Claude Haiku**: 14.5K tokens ($0.44)\n\nAll agents are operational. Cross-cloud latency to AWS Bedrock is within expected range for ap-southeast-2.', annotations: [] }],
      },
    ],
  },
};

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Ocp-Apim-Subscription-Key');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Readiness
  if (req.url?.includes('/readiness')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'healthy' }));
    return;
  }

  // POST /uc2/responses
  if (req.method === 'POST' && req.url?.includes('/responses')) {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const parsed = JSON.parse(body || '{}');
      const input = (parsed.input || '').toLowerCase();

      // Simulate processing delay
      const delay = 1500 + Math.random() * 1500;

      console.log(`[mock] POST /responses — "${parsed.input}" (${delay.toFixed(0)}ms delay)`);

      setTimeout(() => {
        const response = input.includes('governance') || input.includes('health') || input.includes('cost')
          ? MOCK_RESPONSES.governance
          : MOCK_RESPONSES.default;

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
      }, delay);
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`\n  🟢 UAIP Mock Server running at http://localhost:${PORT}`);
  console.log(`  Routes:`);
  console.log(`    POST /uc2/responses  — Supervisor agent (mock)`);
  console.log(`    GET  /uc2/readiness  — Health check\n`);
});

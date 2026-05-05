// OpenAI Responses API types from the UC2 supervisor

export interface ResponsesRequest {
  input: string;
  stream?: boolean;
}

export interface OutputItem {
  type: 'message' | 'function_call' | 'function_call_output';
  id?: string;
  role?: string;
  content?: Array<{ type: string; text: string; annotations?: unknown[] }>;
  name?: string;
  arguments?: string;
  call_id?: string;
  output?: string;
  status?: string;
  response_id?: string;
}

export interface ResponsesResponse {
  id: string;
  object: string;
  status: string;
  output: OutputItem[];
  error?: { code: string; message: string };
  model: string;
  response_id: string;
}

// Parsed flow step for the visualizer
export interface FlowStep {
  id: string;
  type: 'user' | 'supervisor_plan' | 'tool_call' | 'tool_result' | 'supervisor_response';
  agent: string;
  cloud: 'user' | 'azure' | 'aws' | 'governance';
  label: string;
  detail: string;
  status: 'pending' | 'active' | 'completed' | 'error';
  timestamp?: number;
}

# Unified AI Platform Frontend

> The user interface for the [Unified AI Platform Accelerator](../docs/uaip_solution_architecture.md).
> A React application providing a Chat interface and Agent Flow visualization for multi-agent orchestration.

---

## Overview

The Frontend provides two primary interfaces for interacting with the Unified AI Platform:

1. **Chat** — Conversational interface for querying the Multi-Agent Supervisor. Sends requests to the OpenAI Responses API, renders assistant responses with tool call indicators showing which agents were invoked.

2. **Agent Flow** — Visual orchestration diagram using React Flow. Displays the fan-out/fan-in workflow DAG with agent nodes showing status (active/idle), model names, cloud provider badges (Azure/AWS), and execution payloads.

### Key Features

- **Customizable branding** — Dark navy navigation with accent color, easily themeable
- **New Chat button** — Clear conversation and start fresh (appears after first message)
- **Tool call visualization** — Colored chips indicating which agents were invoked (Azure blue, AWS orange, Governance purple)
- **V3 workflow support** — Detects invoked agents from response text when workflow doesn't expose individual tool calls
- **Agent Flow DAG** — Interactive graph showing Supervisor → Knowledge/Compliance/External/Governance → Synthesizer
- **Chat persistence** — Messages saved to sessionStorage, survive tab switching
- **Run history** — Previous queries saved to sessionStorage, selectable from Agent Flow sidebar
- **Node inspector** — Click any agent node to view its output and JSON payload
- **5-minute timeout** — Handles long-running multi-agent workflows

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (React SPA)                                            │
│                                                                  │
│  ┌────────────┐  ┌────────────────────────────────────────────┐ │
│  │  Chat Page │  │  Agent Flow Page                           │ │
│  │            │  │  ┌─────────┐                               │ │
│  │  User msg  │  │  │Supervisor│                              │ │
│  │  ↓         │  │  └────┬────┘                               │ │
│  │  Tool call │  │  ┌────┼────────┬──────────┐                │ │
│  │  chips     │  │  ▼    ▼        ▼          ▼                │ │
│  │  ↓         │  │ Know Comply  Engineer Governance           │ │
│  │  Response  │  │  └────┴────────┴──────────┘                │ │
│  │            │  │       ▼                                     │ │
│  │            │  │  ┌──────────┐                               │ │
│  │            │  │  │Synthesizer│                              │ │
│  │            │  │  └──────────┘                               │ │
│  └────────────┘  └────────────────────────────────────────────┘ │
└─────────┬───────────────────────────────────────────────────────┘
          │ /api/uc2/responses (APIM subscription key)
          ▼
┌──────────────────────────┐
│  nginx reverse proxy     │
│  /api/* → APIM (private  │
│  IP 192.168.4.4)         │
│  Host: ai-alz-apim-      │
│  i40e.azure-api.net      │
│  Timeout: 300s           │
└──────────────────────────┘
          │
          ▼
┌──────────────────────────┐
│  Azure API Management    │
│  /supervisor/responses →  │
│  Supervisor Agent         │
└──────────────────────────┘
```

### Technology Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| React | 19.2 | UI framework |
| TypeScript | 6 | Type safety |
| Vite | 8 | Build tool + dev server |
| @xyflow/react | 12 | Agent Flow visualization (React Flow) |
| framer-motion | — | Animations |
| lucide-react | — | Icons |
| nginx | alpine | Production reverse proxy |

---

## Pages

### Chat Page

- Sends messages to `POST /api/supervisor/responses` with APIM subscription key
- Renders assistant responses with markdown formatting
- Shows tool call chips colored by type:
  - 🟢 **Azure** — Knowledge (AI Search), Compliance (OpenAI o4-mini)
  - 🟠 **Cross-Cloud** — External Agent (AWS Bedrock, Claude Haiku 4.5)
  - 🟣 **Governance** — Platform health, costs, traces
- **"+ New Chat"** button clears conversation to start fresh
- "View Agent Flow" button saves the run and navigates to visualization

### Agent Flow Page

- Renders orchestration DAG using React Flow with custom `AgentNode` components
- All 4 agents always visible — invoked agents highlighted, idle agents dimmed (40% opacity)
- Agent nodes show: name, model, cloud provider, execution status
- Click node → sidebar with Output text + JSON Payload
- Runs sidebar lists previous queries from sessionStorage
- Animated edges show data flow direction

---

## Project Structure

```
src/
  App.tsx              # Root — BrowserRouter, nav bar, routes
  pages/
    ChatPage.tsx       # Chat interface
    FlowPage.tsx       # Agent Flow visualization (React Flow)
  api.ts               # API client — sendMessage(), parseFlowSteps()
  types.ts             # TypeScript types (ResponsesResponse, FlowStep)
  runStore.ts          # Run history via sessionStorage
  App.css              # Platform styling
  index.css            # Global styles

public/                # Static assets
mock-server.mjs        # Local dev mock API (Node.js, port 3001)
nginx.conf             # Production reverse proxy config
Dockerfile             # Multi-stage: node build → nginx serve
vite.config.ts         # Vite config with dev proxy
.env                   # API base URL + APIM key
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- npm

### Local Development (with mock server)

```bash
# Install dependencies
npm install

# Start mock API server (port 3001)
node mock-server.mjs &

# Start Vite dev server (port 5173, proxies /api to mock)
npm run dev
```

### Local Development (against real APIM)

Requires VPN or Bastion tunnel to reach APIM private IP.

```bash
# Edit .env to point at APIM
VITE_API_BASE=/api
VITE_API_KEY=<apim-subscription-key>

npm run dev
```

### Build for Production

```bash
npm run build
# Output in dist/
```

### Deploy to Azure Container Apps

```bash
# Open ACR firewall
az acr update -n genaicri40e --default-action Allow

# Build and push
az acr build --registry genaicri40e \
  --image uaip-frontend:cr27 .

# Restore ACR firewall
az acr update -n genaicri40e --default-action Deny

# Deploy new image
az containerapp update -n ca-uaip-frontend -g ai-lz-rg-msdn-mb44x \
  --image genaicri40e.azurecr.io/uaip-frontend:cr27
```

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE` | `/api` | API base path |
| `VITE_API_KEY` | — | APIM subscription key |

### nginx Reverse Proxy

The production nginx config (`nginx.conf`) proxies all `/api/*` requests to the APIM private IP:

```nginx
location /api/ {
    proxy_pass https://192.168.4.4/;
    proxy_set_header Host ai-alz-apim-i40e.azure-api.net;
    proxy_ssl_server_name on;
    proxy_read_timeout 300s;    # 5-minute timeout for multi-agent workflows
}
```

---

## Styling

Platform design system:

| Element | Value |
|---------|-------|
| Nav background | `#0d2137` (dark navy) |
| Body background | `#f5f7fa` (light off-white) |
| Accent color | `#00c389` (green) |
| Card background | `#ffffff` (white) |
| Font | System sans-serif stack |

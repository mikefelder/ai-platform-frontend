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
          │ /api/uc2/responses (HTTP Basic authentication)
          ▼
┌──────────────────────────┐
│  nginx reverse proxy     │
│  /api/* → APIM (private  │
│  IP 192.168.4.4)         │
│  Host: ai-alz-apim-      │
│  i40e.azure-api.net      │
│  Runtime APIM key       │
│  Verified upstream TLS  │
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

- Sends messages to `POST /api/uc2/responses`; nginx adds the server-side APIM subscription key
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
.npmrc                 # Approved npm feed
docker/                # Runtime secret validation
tests/                 # API and container security regression tests
```

---

## Getting Started

### Prerequisites

- Node.js 26 (matches the production build and CI)
- npm

### Local Development (with mock server)

```bash
# Install dependencies
npm ci

# Start mock API server (port 3001)
node mock-server.mjs &

# Start Vite dev server (port 5173, proxies /api to mock)
npm run dev
```

### Local Development (against real APIM)

Requires private network connectivity to APIM. Use the production nginx proxy,
not a browser-held subscription key. Create a password file with `htpasswd`
(Apache utilities), and obtain a rotated APIM key through your secret manager.

```bash
# Prompts for the frontend user's password; do not reuse an APIM credential
htpasswd -cB frontend.htpasswd reviewer

# APIM_SUBSCRIPTION_KEY must already be exported securely in this shell
podman build -t localhost/uaip-frontend:security .
podman run --rm -p 127.0.0.1:8080:8080 \
  -e APIM_SUBSCRIPTION_KEY \
  -v "$PWD/frontend.htpasswd:/run/secrets/frontend/htpasswd:ro" \
  localhost/uaip-frontend:security
```

Open `http://localhost:8080` and authenticate at the browser prompt. This
loopback-only HTTP binding is for development; shared deployments must terminate
HTTPS before nginx. The local Vite mock workflow remains unauthenticated and
never needs an APIM key.

### Build for Production

```bash
npm run build
# Output in dist/
```

### Deploy to Azure Container Apps

Provision the runtime secrets before rolling out this image. The Terraform
configuration injects the APIM key from a Container Apps secret, and injects the
password hashes into an `EmptyDir` volume at startup. The AzureRM provider does
not expose direct secret-volume item mounts. A missing key or password file
stops nginx startup instead of exposing an unauthenticated proxy.

```bash
# Export APIM_SUBSCRIPTION_KEY securely first; do not commit it to a tfvars file
export TF_VAR_apim_subscription_key="$APIM_SUBSCRIPTION_KEY"
export TF_VAR_frontend_htpasswd="$(cat frontend.htpasswd)"

# Build from an environment already authorized to reach ACR
az acr build --registry genaicri40e \
  --image uaip-frontend:security .

# Supply the existing ALZ variables using your normal deployment configuration
terraform -chdir=infra plan -var='frontend_image_tag=security'
terraform -chdir=infra apply -var='frontend_image_tag=security'
```

Terraform state contains sensitive secret values; use an access-controlled,
encrypted remote backend and never commit state or saved plans. The password
file contains hashes, not plaintext passwords. Prefer unique accounts with
strong passwords; Basic authentication is not a replacement for production
SSO/MFA, per-user authorization, or APIM rate limiting.

**Credential rotation is required:** the previous production key was committed
and shipped in browser bundles. Regenerate that key in APIM and deploy a fresh
key using the runtime secret above. Remove old revisions and invalidate cached
assets containing the old key. Deleting the tracked file does not revoke the
credential or erase Git history; coordinate any history cleanup separately.
Do not restore the old key for rollback.

---

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE` | `/api` | Public API base path; keep same-origin in production |
| `APIM_SUBSCRIPTION_KEY` | Required | Server-only runtime secret, never a build variable |
| `FRONTEND_HTPASSWD` | — | Runtime password-file content for Container Apps; alternatively mount `/run/secrets/frontend/htpasswd` read-only |

Never put credentials in any `VITE_*` variable: those variables are public
browser configuration. `.env*`, password files, and Terraform configuration are
excluded from the image build context.

### nginx Reverse Proxy

The production nginx template (`nginx.conf`) requires Basic authentication for
the SPA and API. It proxies JSON POST requests under `/api/` to the APIM private
IP, rejects cross-site browser requests, strips the frontend Basic credentials,
and replaces any client-supplied subscription header with the runtime key.
The official nginx entrypoint substitutes only `APIM_SUBSCRIPTION_KEY`.

```nginx
location ^~ /api/ {
    proxy_pass https://192.168.4.4/;
    proxy_set_header Host ai-alz-apim-i40e.azure-api.net;
    proxy_ssl_server_name on;
    proxy_ssl_name ai-alz-apim-i40e.azure-api.net;
    proxy_ssl_verify on;
    proxy_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;
    proxy_set_header Ocp-Apim-Subscription-Key "${APIM_SUBSCRIPTION_KEY}";
    proxy_set_header Authorization "";
    proxy_read_timeout 300s;    # 5-minute timeout for multi-agent workflows
}
```

### Security checks and dependency maintenance

```bash
npm ci
VITE_API_KEY=build-only-secret-canary npm run build
npm test
CONTAINER_ENGINE=podman npm run test:container  # defaults to Docker in CI
npm audit --audit-level=low
terraform -chdir=infra init -backend=false
terraform -chdir=infra validate
```

Container checks use isolated mock TLS upstreams and temporary credentials,
never the live APIM endpoint. They cover missing/unsafe secrets, authentication,
credential forwarding, CSRF defenses, and rejection of untrusted or mismatched
certificates. Test containers, networks, image tags, and fixtures are removed
afterward.

Security updates include Vite 8.3.5, PostCSS 8.5.32, Babel 7.29.7, and other
compatible transitive fixes. The `minimatch` override selects the patched 11.x
line for ESLint and typescript-eslint because their 10.x dependency ranges
include GHSA-g3hv-75wg-m249; retain it until upstream ranges include the fix.
All lockfile tarballs use the approved npm feed and retain integrity hashes.

The security-validation workflow builds, runs regression checks, audits all
dependencies, and publishes CodeQL analysis. It replaces the broken, unvalidated
Dependabot auto-approval workflow; dependency updates require review before
merging. Full-repository lint currently has pre-existing `FlowPage.tsx` errors;
CI checks the changed API module without suppressing or rewriting those rules.

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

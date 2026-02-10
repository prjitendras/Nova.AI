# AI OPS Workflow Platform - Backend

Enterprise workflow + ticketing platform with AI-assisted workflow generation.

## Tech Stack

- **Python 3.11+**
- **FastAPI** - Web framework
- **PyMongo** - MongoDB driver
- **Pydantic v2** - Data validation
- **APScheduler** - Background jobs
- **Loguru** - Structured logging

## Project Structure

```
backend/
├── app/
│   ├── main.py                     # FastAPI application entry point
│   │
│   ├── api/
│   │   ├── deps.py                 # Dependencies (auth, correlation)
│   │   ├── middleware/             # Request/response middleware
│   │   │   ├── correlation.py      # Correlation ID middleware
│   │   │   └── error_handlers.py   # Exception handlers
│   │   └── routes/                 # API endpoints
│   │       ├── workflows.py        # Workflow CRUD
│   │       ├── tickets/            # Ticket operations (modular)
│   │       │   ├── schemas.py      # Request/response models
│   │       │   ├── crud.py         # Create, list, get
│   │       │   ├── actions.py      # Submit, approve, reject
│   │       │   ├── info.py         # Info request/respond
│   │       │   ├── assignment.py   # Assign/reassign
│   │       │   ├── lifecycle.py    # Cancel, hold, resume
│   │       │   ├── manager.py      # Manager endpoints
│   │       │   └── agent.py        # Agent endpoints
│   │       ├── directory.py        # User directory
│   │       ├── attachments.py      # File attachments
│   │       ├── genai.py            # AI workflow generation
│   │       └── admin.py            # Admin operations
│   │
│   ├── config/
│   │   └── settings.py             # Configuration
│   │
│   ├── domain/
│   │   ├── models.py               # Pydantic models
│   │   ├── enums.py                # Status/type enums
│   │   └── errors.py               # Domain exceptions
│   │
│   ├── engine/
│   │   ├── engine.py               # Workflow engine (brain) - 3300+ lines
│   │   ├── permission_guard.py     # Authorization checks
│   │   ├── transition_resolver.py  # Next step resolution
│   │   ├── condition_evaluator.py  # Condition evaluation
│   │   └── audit_writer.py         # Audit trail
│   │
│   ├── repositories/               # MongoDB data access
│   │   ├── mongo_client.py         # Database connection
│   │   ├── workflow_repo.py        # Workflow CRUD
│   │   ├── ticket_repo.py          # Ticket/step CRUD
│   │   ├── attachment_repo.py      # Attachment CRUD
│   │   ├── notification_repo.py    # Notification queue
│   │   └── audit_repo.py           # Audit log
│   │
│   ├── services/                   # Business logic
│   │   ├── workflow_service.py     # Workflow operations
│   │   ├── ticket_service.py       # Ticket operations
│   │   ├── attachment_service.py   # File handling
│   │   ├── directory_service.py    # User/manager lookup
│   │   ├── notification_service.py # Email notifications
│   │   └── genai_service.py        # AI workflow generation
│   │
│   ├── scheduler/                  # Background jobs
│   │   └── dev_scheduler.py        # Notification processor
│   │
│   └── utils/                      # Utilities
│       ├── idgen.py                # ID generation
│       ├── jwt.py                  # JWT validation
│       ├── logger.py               # Logging setup
│       └── time.py                 # Time utilities
│
├── scripts/
│   ├── __init__.py
│   └── seed_data.py                # Database seeding
│
├── tests/                          # Test suite
│   ├── __init__.py
│   ├── conftest.py                 # Pytest fixtures
│   ├── unit/                       # Unit tests
│   └── integration/                # Integration tests
│
├── logs/                           # Application logs
├── storage/attachments/            # File storage
├── requirements.txt
└── README.md
```

## Setup

### 1. Prerequisites

- Python 3.11+
- MongoDB Community Edition (localhost:27017)
- Azure AD App Registration (for auth)

### 2. Install Dependencies

```bash
cd backend
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure Environment

Copy `env.example.txt` to `.env` and fill in values:

```env
# MongoDB
MONGO_URI=mongodb://localhost:27017
MONGO_DB=workflow_ops_dev

# Azure AD
AAD_CLIENT_ID=<your-client-id>
AAD_TENANT_ID=<your-tenant-id>
AAD_API_SCOPE=api://<client-id>/user_impersonation

# Email (ROPC)
SERVICE_MAILBOX_USERNAME=<service-account>
SERVICE_MAILBOX_PASSWORD=<password>

# Azure OpenAI (for AI workflow generation)
AZURE_OPENAI_ENDPOINT=<endpoint>
AZURE_OPENAI_API_KEY=<api-key>
AZURE_OPENAI_DEPLOYMENT_NAME=<deployment>

# App Settings
DEBUG=true
ENVIRONMENT=development
```

### 4. Seed Database

```bash
python -m scripts.seed_data
```

### 5. Run Server

```bash
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
## API Documentation

- **Swagger UI**: http://localhost:8000/api/docs
- **ReDoc**: http://localhost:8000/api/redoc
- **OpenAPI JSON**: http://localhost:8000/api/openapi.json

## API Endpoints

### Workflows
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/workflows` | List workflows |
| POST | `/api/v1/workflows` | Create workflow |
| GET | `/api/v1/workflows/{id}` | Get workflow |
| PUT | `/api/v1/workflows/{id}/draft` | Save draft |
| POST | `/api/v1/workflows/{id}/publish` | Publish |
| GET | `/api/v1/workflows/catalog` | Published catalog |

### Tickets
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/tickets` | List tickets |
| POST | `/api/v1/tickets` | Create ticket |
| GET | `/api/v1/tickets/{id}` | Get ticket detail |
| POST | `/api/v1/tickets/{id}/steps/{stepId}/submit-form` | Submit form |
| POST | `/api/v1/tickets/{id}/steps/{stepId}/approve` | Approve |
| POST | `/api/v1/tickets/{id}/steps/{stepId}/reject` | Reject |
| POST | `/api/v1/tickets/{id}/steps/{stepId}/complete` | Complete task |
| POST | `/api/v1/tickets/{id}/steps/{stepId}/request-info` | Request info |
| POST | `/api/v1/tickets/{id}/steps/{stepId}/respond-info` | Respond to info |
| POST | `/api/v1/tickets/{id}/steps/{stepId}/assign` | Assign agent |
| POST | `/api/v1/tickets/{id}/cancel` | Cancel ticket |

### Manager/Agent
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/tickets/manager/approvals` | Pending approvals |
| GET | `/api/v1/tickets/manager/assignments` | Unassigned tasks |
| GET | `/api/v1/tickets/manager/handovers` | Pending handovers |
| GET | `/api/v1/tickets/manager/dashboard` | Team dashboard |
| GET | `/api/v1/tickets/agent/tasks` | My assigned tasks |
| GET | `/api/v1/tickets/agent/history` | Completed tasks |

### GenAI
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/genai/generate-workflow` | AI workflow generation |

### Admin
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/admin/health` | System health |
| GET | `/api/v1/admin/notifications/failed` | Failed notifications |

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│  API Routes │────▶│  Services   │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                           ┌───────────────────┼───────────────────┐
                           ▼                   ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                    │   Engine    │     │   Repos     │     │  Scheduler  │
                    │  (Brain)    │     │  (MongoDB)  │     │ (APScheduler)│
                    └─────────────┘     └─────────────┘     └─────────────┘
```

## Key Features

1. **Workflow Engine** - State machine with permission guard
2. **Optimistic Concurrency** - Version-based conflict detection
3. **Idempotent Actions** - Safe retry for approve/reject/complete
4. **Outbox Pattern** - Reliable notification delivery
5. **Audit Trail** - Complete action history
6. **Role Resolution** - Dynamic approver/assignee resolution
7. **Parallel Branches** - Fork/join with configurable policies
8. **File Attachments** - Upload/download with context tracking
9. **Token Validation** - Azure AD JWT verification

## Testing

### Health Check

```bash
curl http://localhost:8000/health
```

### Run Tests

```bash
# Run all tests
pytest tests/

# Run unit tests only
pytest tests/unit/# Run with coverage
pytest tests/ --cov=app --cov-report=html
```

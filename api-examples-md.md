# API Examples - Prompt Machine

## Authentication

### POST /api/auth/login
Login with email and password.

**Request:**
```bash
curl -X POST https://api.prompt-machine.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@prompt-machine.com",
    "password": "Uhr4ryPWey"
  }'
```

**Success Response (200):**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@prompt-machine.com",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error Response (401):**
```json
{
  "error": "Invalid credentials"
}
```

### GET /api/auth/me
Get current authenticated user.

**Request:**
```bash
curl https://api.prompt-machine.com/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Success Response (200):**
```json
{
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "admin@prompt-machine.com",
    "created_at": "2024-01-01T00:00:00.000Z"
  }
}
```

## Projects

### GET /api/projects
List all projects for authenticated user.

**Request:**
```bash
curl https://api.prompt-machine.com/api/projects \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Success Response (200):**
```json
{
  "projects": [
    {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "name": "Story Writer",
      "slug": "story-writer",
      "created_at": "2024-01-01T00:00:00.000Z",
      "is_deployed": false,
      "usage_count": 0
    }
  ]
}
```

### POST /api/projects
Create a new project.

**Request:**
```bash
curl -X POST https://api.prompt-machine.com/api/projects \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Email Assistant",
    "description": "AI-powered email writing assistant"
  }'
```

**Success Response (201):**
```json
{
  "project": {
    "id": "456e7890-e89b-12d3-a456-426614174000",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Email Assistant",
    "slug": "email-assistant",
    "created_at": "2024-01-02T00:00:00.000Z"
  }
}
```

## Claude Integration

### POST /api/claude/chat
Interactive chat for prompt building.

**Request:**
```bash
curl -X POST https://api.prompt-machine.com/api/claude/chat \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "123e4567-e89b-12d3-a456-426614174000",
    "message": "I want to create a story writing assistant",
    "conversation_id": "789e0123-e89b-12d3-a456-426614174000"
  }'
```

**Success Response (200):**
```json
{
  "reply": "Great! I'll help you create a story writing assistant. Let me understand your needs better:\n\n1. What genres should it support?\n2. Should it write complete stories or help with specific elements?\n3. What length of stories are you targeting?",
  "conversation_id": "789e0123-e89b-12d3-a456-426614174000",
  "suggested_fields": [
    {
      "name": "genre",
      "type": "select",
      "options": ["Fantasy", "Sci-Fi", "Mystery", "Romance"],
      "required": true
    }
  ]
}
```

## Prompts

### POST /api/prompts
Save a prompt configuration.

**Request:**
```bash
curl -X POST https://api.prompt-machine.com/api/prompts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "123e4567-e89b-12d3-a456-426614174000",
    "system_prompt": "You are a creative story writer...",
    "fields": [
      {
        "name": "genre",
        "type": "select",
        "options": ["Fantasy", "Sci-Fi"],
        "required": true
      },
      {
        "name": "characters",
        "type": "textarea",
        "placeholder": "Describe your main characters",
        "required": false
      }
    ]
  }'
```

**Success Response (201):**
```json
{
  "prompt": {
    "id": "abc12345-e89b-12d3-a456-426614174000",
    "project_id": "123e4567-e89b-12d3-a456-426614174000",
    "system_prompt": "You are a creative story writer...",
    "fields": [...],
    "is_active": true,
    "created_at": "2024-01-02T00:00:00.000Z"
  }
}
```

## Deployment

### POST /api/deploy/:projectId
Deploy a project as a tool.

**Request:**
```bash
curl -X POST https://api.prompt-machine.com/api/deploy/123e4567-e89b-12d3-a456-426614174000 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Success Response (200):**
```json
{
  "success": true,
  "url": "https://story-writer.tool.prompt-machine.com",
  "deployment": {
    "id": "def45678-e89b-12d3-a456-426614174000",
    "project_id": "123e4567-e89b-12d3-a456-426614174000",
    "subdomain": "story-writer",
    "deployed_at": "2024-01-02T00:00:00.000Z"
  }
}
```

## Tool API (Used by deployed tools)

### POST /api/tools/generate
Called by deployed tools to generate content.

**Request:**
```bash
curl -X POST https://api.prompt-machine.com/api/tools/generate \
  -H "Content-Type: application/json" \
  -d '{
    "tool_id": "story-writer",
    "inputs": {
      "genre": "Fantasy",
      "characters": "A brave knight and a wise wizard"
    }
  }'
```

**Success Response (200):**
```json
{
  "output": "In the mystical realm of Eldoria, Sir Garrett the Bold stood at the crossroads...",
  "usage": {
    "tokens": 1500,
    "cost": 0.0015
  }
}
```

## Error Responses

### 400 Bad Request
```json
{
  "error": "Validation error",
  "details": {
    "field": "email",
    "message": "Invalid email format"
  }
}
```

### 401 Unauthorized
```json
{
  "error": "Authentication required"
}
```

### 403 Forbidden
```json
{
  "error": "Access denied"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error",
  "message": "An unexpected error occurred"
}
```

## Headers

### Required for authenticated routes:
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

### CORS headers (automatically added):
```
Access-Control-Allow-Origin: https://app.prompt-machine.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Authorization, Content-Type
```
---
name: agentmail
description: Creates email inboxes and sends/receives emails using the AgentMail API. Use when the user asks to create an email address, set up email communication, send emails, or check their inbox.
metadata:
  author: nanoclaw
  version: "1.0"
---

# AgentMail Skill

You have access to the AgentMail API for email management. The `AGENTMAIL_API_KEY` environment variable is already configured.

## Quick Reference

### Create an Inbox
```bash
curl -s -X POST "https://api.agentmail.to/v0/inboxes" \
  -H "Authorization: Bearer $AGENTMAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"username": "my-inbox", "client_id": "unique-client-id"}'
```

Note: `client_id` makes the request idempotent - using the same client_id returns the existing inbox instead of creating a duplicate.

### List Inboxes
```bash
curl -s "https://api.agentmail.to/v0/inboxes" \
  -H "Authorization: Bearer $AGENTMAIL_API_KEY"
```

### Send an Email
```bash
curl -s -X POST "https://api.agentmail.to/v0/inboxes/{inbox_id}/messages" \
  -H "Authorization: Bearer $AGENTMAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": [{"email": "recipient@example.com", "name": "Recipient Name"}],
    "subject": "Email Subject",
    "text": "Plain text body",
    "html": "<p>HTML body (optional)</p>"
  }'
```

### List Messages in Inbox
```bash
curl -s "https://api.agentmail.to/v0/inboxes/{inbox_id}/messages" \
  -H "Authorization: Bearer $AGENTMAIL_API_KEY"
```

### Get a Specific Message
```bash
curl -s "https://api.agentmail.to/v0/inboxes/{inbox_id}/messages/{message_id}" \
  -H "Authorization: Bearer $AGENTMAIL_API_KEY"
```

### Delete an Inbox
```bash
curl -s -X DELETE "https://api.agentmail.to/v0/inboxes/{inbox_id}" \
  -H "Authorization: Bearer $AGENTMAIL_API_KEY"
```

## Common Workflows

### Create an Email for User Communication

1. **Create the inbox with a memorable username:**
   ```bash
   curl -s -X POST "https://api.agentmail.to/v0/inboxes" \
     -H "Authorization: Bearer $AGENTMAIL_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{"username": "support", "client_id": "support-inbox-v1"}'
   ```
   Note the `id` and `email` from the response.

2. **Save the inbox details** to your memory file for future reference:
   ```markdown
   ## Email Inboxes
   - support@agentmail.to (id: inbox_xxx)
   ```

3. **Give the user their email address** so they can share it.

### Send an Email

1. **List inboxes to find the right one:**
   ```bash
   curl -s "https://api.agentmail.to/v0/inboxes" \
     -H "Authorization: Bearer $AGENTMAIL_API_KEY" | jq '.inboxes[] | {id, email, username}'
   ```

2. **Send the email:**
   ```bash
   curl -s -X POST "https://api.agentmail.to/v0/inboxes/inbox_xxx/messages" \
     -H "Authorization: Bearer $AGENTMAIL_API_KEY" \
     -H "Content-Type: application/json" \
     -d '{
       "to": [{"email": "customer@example.com", "name": "Customer"}],
       "subject": "Hello from NanoClaw",
       "text": "This is a test email sent via AgentMail."
     }'
   ```

### Check for New Messages

1. **List messages in the inbox:**
   ```bash
   curl -s "https://api.agentmail.to/v0/inboxes/inbox_xxx/messages" \
     -H "Authorization: Bearer $AGENTMAIL_API_KEY" | jq '.messages'
   ```

2. **Read a specific message:**
   ```bash
   curl -s "https://api.agentmail.to/v0/inboxes/inbox_xxx/messages/msg_xxx" \
     -H "Authorization: Bearer $AGENTMAIL_API_KEY" | jq '.subject, .from, .text'
   ```

## Output Parsing

AgentMail API returns JSON. Use `jq` to extract specific fields:

```bash
# Get inbox email address after creation
curl -s -X POST "https://api.agentmail.to/v0/inboxes" \
  -H "Authorization: Bearer $AGENTMAIL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"username": "test"}' | jq -r '.email'

# List all inbox emails
curl -s "https://api.agentmail.to/v0/inboxes" \
  -H "Authorization: Bearer $AGENTMAIL_API_KEY" | jq -r '.inboxes[].email'

# Get message count
curl -s "https://api.agentmail.to/v0/inboxes/inbox_xxx/messages" \
  -H "Authorization: Bearer $AGENTMAIL_API_KEY" | jq '.messages | length'
```

## Response Formats

### Inbox Object
```json
{
  "id": "inbox_abc123",
  "email": "username@agentmail.to",
  "username": "username",
  "created_at": "2024-01-01T00:00:00Z"
}
```

### Message Object
```json
{
  "id": "msg_xyz789",
  "from": {"email": "sender@example.com", "name": "Sender"},
  "to": [{"email": "username@agentmail.to"}],
  "subject": "Hello",
  "text": "Message body",
  "html": "<p>HTML body</p>",
  "received_at": "2024-01-01T00:00:00Z"
}
```

## Error Handling

If you get authentication errors, the `AGENTMAIL_API_KEY` may not be set. Check with:
```bash
echo $AGENTMAIL_API_KEY | head -c 10
```

If it's empty, ask the user to add their AgentMail API key to the `.env` file.

Common errors:
- `401 Unauthorized`: Invalid or missing API key
- `404 Not Found`: Inbox or message doesn't exist
- `409 Conflict`: Username already taken (use `client_id` for idempotency)

## Best Practices

1. **Use descriptive usernames** - They become the email address (e.g., support@agentmail.to)
2. **Always use client_id** - Makes inbox creation idempotent and prevents duplicates
3. **Save inbox IDs** - Store them in your memory file for future reference
4. **Check inbox before sending** - Verify the inbox exists before sending emails
5. **Include both text and HTML** - For better email compatibility

## Example Interactions

User: "Create me an email inbox called support"

Steps:
1. Create inbox: `curl -s -X POST "https://api.agentmail.to/v0/inboxes" -H "Authorization: Bearer $AGENTMAIL_API_KEY" -H "Content-Type: application/json" -d '{"username": "support", "client_id": "support-inbox"}'`
2. Extract the email address from the response
3. Save to memory and return the email address to the user

User: "Send an email to john@example.com saying hello"

Steps:
1. List inboxes to find an available one (or create one if none exist)
2. Send the email using the inbox ID
3. Confirm delivery to the user

User: "Check my inbox for new messages"

Steps:
1. List inboxes to identify which one to check
2. List messages in that inbox
3. Summarize any new messages for the user

## Memory Integration

After creating or managing inboxes, update your memory:

```markdown
## Email Inboxes
- support@agentmail.to (id: inbox_abc123) - created for customer support
- notifications@agentmail.to (id: inbox_def456) - for automated notifications
```

This allows you to quickly reference inbox IDs in future conversations.

#!/bin/bash
set -e

# Read JSON input from stdin
INPUT=$(cat)

# Extract fields
PROMPT=$(echo "$INPUT" | node -e "
  const input = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write(input.prompt || '');
")

SESSION_ID=$(echo "$INPUT" | node -e "
  const input = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write(input.sessionId || '');
")

ANTHROPIC_API_KEY=$(echo "$INPUT" | node -e "
  const input = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
  process.stdout.write((input.secrets && input.secrets.ANTHROPIC_API_KEY) || '');
")

export ANTHROPIC_API_KEY

# Ensure Claude Code config file exists (it expects ~/.claude.json)
if [ ! -f "$HOME/.claude.json" ]; then
  # Check for backup first
  BACKUP=$(find "$HOME/.claude/backups" -name ".claude.json.backup.*" 2>/dev/null | sort | tail -1)
  if [ -n "$BACKUP" ]; then
    cp "$BACKUP" "$HOME/.claude.json"
  else
    echo '{}' > "$HOME/.claude.json"
  fi
fi

# Build claude args
CLAUDE_ARGS=(--print --output-format json --max-turns 25 --dangerously-skip-permissions)

if [ -n "$SESSION_ID" ]; then
  CLAUDE_ARGS+=(--resume "$SESSION_ID")
fi

# Run Claude Code and capture output
RESULT=""
ERROR=""
NEW_SESSION_ID=""
STATUS="success"

CLAUDE_OUTPUT=$(echo "$PROMPT" | claude "${CLAUDE_ARGS[@]}" 2>/tmp/claude_stderr) || {
  STATUS="error"
  ERROR=$(cat /tmp/claude_stderr 2>/dev/null || echo "Claude exited with error")
}

if [ "$STATUS" = "success" ]; then
  # Extract the result text and session ID from JSON output
  RESULT=$(echo "$CLAUDE_OUTPUT" | node -e "
    const lines = require('fs').readFileSync('/dev/stdin','utf8').trim().split('\n');
    let result = '';
    let sessionId = '';
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'result' && obj.result) {
          result = obj.result;
        }
        if (obj.session_id) {
          sessionId = obj.session_id;
        }
      } catch {}
    }
    process.stdout.write(JSON.stringify({ result, sessionId }));
  ")

  NEW_SESSION_ID=$(echo "$RESULT" | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    process.stdout.write(d.sessionId || '');
  ")

  RESULT=$(echo "$RESULT" | node -e "
    const d = JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'));
    process.stdout.write(d.result || '');
  ")
fi

# Build output JSON
OUTPUT=$(node -e "
  const output = {
    status: '$STATUS',
    result: $(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" -- "$RESULT"),
    error: $(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" -- "$ERROR"),
    newSessionId: $(node -e "process.stdout.write(JSON.stringify(process.argv[1]))" -- "$NEW_SESSION_ID")
  };
  process.stdout.write(JSON.stringify(output));
")

# Output with markers
echo "---NANOCLAW_OUTPUT_START---"
echo "$OUTPUT"
echo "---NANOCLAW_OUTPUT_END---"

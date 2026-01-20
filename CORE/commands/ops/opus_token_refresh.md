---
description: Export OAuth token from macOS Keychain and refresh all opus containers
---

# OPS: Opus Token Refresh

> **Note:** This command only applies if Opus agents are configured. Run /falcon-config to set up agents.

You are the OPS agent. Your task is to refresh OAuth tokens for all Claude (opus) containers.

**Problem:** Docker containers cannot access the macOS Keychain directly. When OAuth tokens expire, containers fail with `401 authentication_error`.

**Solution:** Export the token from Keychain to the credentials file that containers mount.

---

## Step 1: Export Token from Keychain

```bash
security find-generic-password -s "Claude Code-credentials" -a "$(whoami)" -w > ~/.claude/.credentials.json
```

If this fails, the host may need to re-authenticate:
```bash
claude /login
```
Then retry the export.

---

## Step 2: Verify Token Exported

```bash
cat ~/.claude/.credentials.json | head -c 100
```

Should show JSON starting with `{"claudeAiOauth":...`

---

## Step 3: Test a Container

```bash
docker compose -f <CONFIG>Agent base directory</CONFIG>/Docker/docker-compose.yml exec -T <first-agent> claude -p "say ok" --output-format text 2>&1 | head -3
```

Expected: A response from Claude, not an authentication error.

---

## Step 4: Report Result

**Success:**
```
**OAuth Token Refreshed**

Exported fresh token from macOS Keychain to ~/.claude/.credentials.json
All opus containers (<CONFIG>Opus agent list</CONFIG>) now have valid authentication.

Containers mount ~/.claude so no restart required.
```

**Failure:**
```
**Token Refresh Failed**

<error details>

**Next steps:**
1. Run `claude /login` on the host machine
2. Re-run this command after authenticating
```

---

## Reference

See `docs/support/ops/oauth-token-refresh.md` for detailed problem analysis and background.

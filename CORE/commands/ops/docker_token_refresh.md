---
description: Export OAuth token from macOS Keychain to Docker containers
---

# OPS: Docker Token Refresh

> **Note:** This command only applies if Docker test agents are configured. Run /falcon-config to set up agents.

Export the OAuth token from macOS Keychain to the credentials file that Docker containers mount.

**Assumption:** The host machine is already authenticated. If you're running this command, you ARE logged in.

---

## Step 1: Check for API Key Override

First check if any containers have `ANTHROPIC_API_KEY` in their `.env` files (this overrides OAuth and causes auth failures when the API key expires):

```bash
grep -l "ANTHROPIC_API_KEY" <CONFIG>Agent base directory</CONFIG>/<CONFIG>Docker agent list</CONFIG>/.env 2>/dev/null
```

If any files are found, remove the `ANTHROPIC_API_KEY` line and recreate the containers:

```bash
# Remove API key from .env files (run for any that were found)
sed -i '' '/ANTHROPIC_API_KEY/d' <CONFIG>Agent base directory</CONFIG>/<agent>/.env

# Recreate containers
cd <CONFIG>Agent base directory</CONFIG>/Docker && docker compose down && docker compose up -d
```

---

## Step 2: Export Token from Keychain

```bash
security find-generic-password -s "Claude Code-credentials" -a "$(whoami)" -w > ~/.claude/.credentials.json
```

---

## Step 3: Verify Token Exported

```bash
cat ~/.claude/.credentials.json | head -c 100
```

Should show JSON starting with `{"claudeAiOauth":...`

---

## Step 4: Ensure Onboarding Flags Are Set

New or recreated containers need onboarding flags in their `.claude.json` files, otherwise Claude will show the first-time setup wizard:

```bash
python3 -c "
import json

for agent in [<CONFIG>Docker agent list</CONFIG>]:
    path = f'<CONFIG>Agent base directory</CONFIG>/{agent}/.claude.json'
    try:
        with open(path, 'r') as f:
            data = json.load(f)
        if not data.get('hasCompletedOnboarding'):
            data['hasCompletedOnboarding'] = True
            data['lastOnboardingVersion'] = '2.0.76'
            with open(path, 'w') as f:
                json.dump(data, f, indent=2)
            print(f'Updated {agent}/.claude.json with onboarding flags')
        else:
            print(f'{agent} already has onboarding flags')
    except FileNotFoundError:
        print(f'{agent}/.claude.json not found - skipping')
"
```

---

## Step 5: Report Result

**Success:**
```
**Docker Token Refreshed**

Exported fresh token from macOS Keychain to ~/.claude/.credentials.json
All Docker containers now have valid authentication (via mounted ~/.claude volume).
```

**Failure (export command failed):**
```
**Token Export Failed**

The Keychain export failed. Error: <error details>
```

---

## Notes

- Containers mount `~/.claude` from the host, so credential changes are immediate
- No container restart required for token refresh
- Container restart IS required if you remove `ANTHROPIC_API_KEY` from `.env` files
- Affected containers: Any container mounting `~/.claude` (<CONFIG>Docker agent list</CONFIG>)

## Troubleshooting

**Still asking for login after token refresh?**

1. Check if `ANTHROPIC_API_KEY` is set in container env (overrides OAuth):
   ```bash
   docker exec <agent> bash -c 'echo $ANTHROPIC_API_KEY'
   ```
   If set, remove from `.env` and recreate container.

2. Check if onboarding is complete:
   ```bash
   docker exec <agent> cat /home/agent/.claude.json | grep hasCompletedOnboarding
   ```
   If missing or false, run Step 4.

3. Verify credentials are visible in container:
   ```bash
   docker exec <agent> cat /home/agent/.claude/.credentials.json | head -c 100
   ```

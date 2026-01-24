# Claude Code Streaming Output Problem

## Goal
Run `claude -p "/checkout FALT-2"` from Node.js and stream output to the user's terminal in real-time.

## Environment
- User has `claude` aliased to `claude --dangerously-skip-permissions` in zsh
- Real binary is at `/Users/tbelfort/.local/bin/claude`
- Running on macOS with zsh

## Key Observation
**When Claude runs from my Bash tool, output is captured and shown. When user runs the same command in their terminal, no output appears - but Claude IS executing (Linear status changes).**

---

## Attempts (in order)

### 1. spawn with shell: true
```typescript
spawn('claude', ['-p', prompt], {
  stdio: 'inherit',
  shell: true,
});
```
**Result:** Deprecation warning, hangs with no output

### 2. spawn with --yes flag
```typescript
spawn('claude', ['--yes', '-p', prompt], {
  stdio: 'inherit',
});
```
**Result:** `error: unknown option '--yes'`

### 3. spawn with --permission-mode acceptEdits
```typescript
spawn('claude', ['--permission-mode', 'acceptEdits', prompt], {
  stdio: 'inherit',
});
```
**Result:** Opens interactive Claude UI, asks for permission (doesn't cover skills)

### 4. spawn with -p and --dangerously-skip-permissions
```typescript
spawn('claude', ['-p', '--dangerously-skip-permissions', prompt], {
  stdio: 'inherit',
});
```
**Result:** Hangs - alias not picked up by spawn

### 5. spawnSync with stdio: inherit
```typescript
spawnSync('claude', args, {
  stdio: 'inherit',
  encoding: 'utf-8',
});
```
**Result:** Hangs - same alias problem

### 6. spawnSync with shell: true
```typescript
spawnSync('claude', args, {
  stdio: 'inherit',
  encoding: 'utf-8',
  shell: true,
});
```
**Result:** Deprecation warning, doesn't pick up alias (non-interactive shell)

### 7. spawnSync with full path to claude binary
```typescript
const claudePath = '/Users/tbelfort/.local/bin/claude';
spawnSync(claudePath, args, {
  stdio: 'inherit',
  encoding: 'utf-8',
});
```
**Result:** Hangs with no output

### 8. execSync with shell: '/bin/zsh'
```typescript
execSync(cmd, {
  stdio: 'inherit',
  encoding: 'utf-8',
  shell: '/bin/zsh',
});
```
**Result:** Hangs with no output in user's terminal

### 9. execSync capturing output then printing
```typescript
const output = execSync(cmd, {
  encoding: 'utf-8',
  shell: '/bin/zsh',
  maxBuffer: 10 * 1024 * 1024,
});
console.log(output);
```
**Result:** WORKS when I run it! But user says no output (likely buffered until completion)

### 10. spawn with /bin/zsh -c and piped stdout/stderr
```typescript
const child = spawn('/bin/zsh', ['-c', cmd], {
  stdio: ['inherit', 'pipe', 'pipe'],
});
child.stdout?.on('data', (data) => process.stdout.write(data));
child.stderr?.on('data', (data) => process.stderr.write(data));
```
**Result:** Works when I run it, no output for user

### 11. spawn with /bin/zsh -c and full stdio: inherit
```typescript
const child = spawn('/bin/zsh', ['-c', cmd], {
  stdio: 'inherit',
});
```
**Result:** Current attempt - pending user test

---

## What Works
- Running `claude -p "prompt"` directly in terminal works
- Running the command through my Bash tool captures output
- `execSync` with output capture works (but buffers until completion)

## What Doesn't Work
- Any spawn/spawnSync with stdio: inherit - no output shown to user
- Piping stdout/stderr manually - no output shown to user

## Theories
1. **TTY issue**: Claude's `-p` mode might detect it's not in a real TTY and behave differently
2. **zsh interactive vs non-interactive**: Aliases only load in interactive shells
3. **Output buffering**: Node's process.stdout might be buffering differently than a real terminal
4. **Claude-specific**: Claude Code might have special handling for piped vs terminal output

## Things NOT Yet Tried
1. Using `pty.js` or `node-pty` to create a pseudo-terminal
2. ~~Using `script` command to wrap claude in a PTY~~ **TRYING NOW (attempt 12)**
3. Using `--output-format stream-json` and parsing the JSON stream
4. ~~Setting `FORCE_COLOR` or `TERM` environment variables~~ (tried with -i)
5. Using `unbuffer` (from expect package) to disable output buffering
6. ~~Running zsh as interactive with `-i` flag~~ (tried, still no output for user)

---

## Attempt 12: script command for PTY
```typescript
const child = spawn('script', ['-q', '/dev/null', '/bin/zsh', '-i', '-c', claudeCmd], {
  stdio: 'inherit',
  env: { ...process.env, TERM: 'xterm-256color' },
});
```
**Result:** Pending user test

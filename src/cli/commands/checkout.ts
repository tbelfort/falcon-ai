/**
 * falcon checkout command.
 *
 * Automates the full checkout workflow:
 * 1. Fetch issue details from Linear
 * 2. Set injection context
 * 3. Checkout git branch
 * 4. Run Claude Code to execute the workflow
 */

import { Command } from 'commander';
import { execSync, spawn } from 'child_process';
import { createInterface } from 'readline';
import { updateSessionState } from '../../config/session.js';
import { findConfigPath } from '../../config/loader.js';

interface CheckoutOptions {
  state?: string;
  noClaude?: boolean;
  print?: boolean;
}

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  state: { name: string };
  labels: { nodes: Array<{ name: string }> };
  branchName?: string;
}

interface ClaudeStreamEvent {
  type?: string;
  delta?: { text?: string };
  message?: { content?: Array<{ type?: string; text?: string }> };
  result?: string;
}

interface ClaudeStreamState {
  parseErrors: number;
  sawDelta: boolean;
}

export const checkoutCommand = new Command('checkout')
  .description('Checkout a Linear issue and run the workflow')
  .argument('<issueId>', 'Linear issue ID (e.g., FALT-2)')
  .option('-s, --state <state>', 'Override workflow state')
  .option('--no-claude', 'Skip running Claude Code (just set context)')
  .option('-p, --print', 'Print mode - show Claude output without interactive UI')
  .action(async (issueId: string, options: CheckoutOptions) => {
    try {
      await runCheckout(issueId, options);
    } catch (e) {
      console.error('Error:', (e as Error).message);
      process.exit(1);
    }
  });

async function runCheckout(issueId: string, options: CheckoutOptions): Promise<void> {
  // Step 0: Verify we're in a falcon project
  const configPath = findConfigPath();
  if (!configPath) {
    throw new Error('Not in a Falcon project. Run "falcon init" first.');
  }

  console.log(`\n🦅 Falcon Checkout: ${issueId}\n`);

  // Step 1: Fetch issue from Linear
  console.log('📋 Fetching issue from Linear...');
  const issue = await fetchLinearIssue(issueId);

  console.log(`   Title: ${issue.title}`);
  console.log(`   State: ${issue.state.name}`);
  if (issue.labels.nodes.length > 0) {
    console.log(`   Labels: ${issue.labels.nodes.map(l => l.name).join(', ')}`);
  }

  // Step 2: Set injection context
  const workflowState = options.state || issue.state.name;
  console.log('\n⚙️  Setting injection context...');

  const session = updateSessionState({
    issueId: issue.identifier,
    workflowState,
    issueTitle: issue.title,
    issueDescription: issue.description,
    issueLabels: issue.labels.nodes.map(l => l.name),
  });

  console.log(`   Target: ${session.target || 'none'}`);

  // Step 3: Checkout git branch (if available)
  if (issue.branchName) {
    console.log(`\n🌿 Checking out branch: ${issue.branchName}`);
    try {
      // Fetch latest
      execSync('git fetch origin', { stdio: 'pipe' });

      // Check if branch exists on remote
      try {
        execSync(`git ls-remote --heads origin ${issue.branchName}`, { stdio: 'pipe' });
        // Branch exists on remote
        execSync(`git checkout ${issue.branchName}`, { stdio: 'pipe' });
        execSync(`git reset --hard origin/${issue.branchName}`, { stdio: 'pipe' });
        console.log('   Checked out existing branch from remote');
      } catch {
        // Branch doesn't exist, check if it exists locally
        try {
          execSync(`git rev-parse --verify ${issue.branchName}`, { stdio: 'pipe' });
          execSync(`git checkout ${issue.branchName}`, { stdio: 'pipe' });
          console.log('   Checked out existing local branch');
        } catch {
          // Create new branch from main
          execSync('git checkout main', { stdio: 'pipe' });
          execSync('git pull origin main', { stdio: 'pipe' });
          execSync(`git checkout -b ${issue.branchName}`, { stdio: 'pipe' });
          console.log('   Created new branch from main');
        }
      }
    } catch (e) {
      console.log(`   Warning: Could not checkout branch - ${(e as Error).message}`);
    }
  }

  // Step 4: Run Claude Code (unless --no-claude)
  if (options.noClaude) {
    console.log('\n✅ Context set. Run Claude Code manually to continue.');
    return;
  }

  console.log('\n🤖 Starting Claude Code...\n');
  console.log('─'.repeat(60));

  await runClaudeCode(issue.identifier, options.print);
}

async function fetchLinearIssue(issueId: string): Promise<LinearIssue> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey) {
    throw new Error(
      'LINEAR_API_KEY not set. Export it or add to .env:\n' +
      '  export LINEAR_API_KEY=lin_api_...'
    );
  }

  const query = `
    query GetIssue($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        description
        branchName
        state {
          name
        }
        labels {
          nodes {
            name
          }
        }
      }
    }
  `;

  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiKey,
    },
    body: JSON.stringify({
      query,
      variables: { id: issueId },
    }),
  });

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { data?: { issue?: LinearIssue }; errors?: Array<{ message: string }> };

  if (data.errors) {
    throw new Error(`Linear API error: ${data.errors[0].message}`);
  }

  if (!data.data?.issue) {
    throw new Error(`Issue not found: ${issueId}`);
  }

  return data.data.issue;
}

async function runClaudeCode(issueId: string, _printMode?: boolean): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn('claude', ['--print', '--verbose', '--dangerously-skip-permissions', '--output-format', 'stream-json'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'xterm-256color' },
    });

    child.stdin?.write(`/checkout ${issueId}\n`);
    child.stdin?.end();

    const streamState: ClaudeStreamState = { parseErrors: 0, sawDelta: false };

    if (child.stdout) {
      const rl = createInterface({ input: child.stdout, crlfDelay: Infinity });
      rl.on('line', (line) => {
        const text = extractClaudeText(line, streamState);
        if (text) {
          process.stdout.write(text);
        }
      });
    }

    if (child.stderr) {
      child.stderr.on('data', (data) => {
        process.stderr.write(data);
      });
    }

    child.on('close', (code) => {
      console.log('\n' + '─'.repeat(60));
      if (code === 0) {
        console.log('\n✅ Workflow complete');
      } else {
        console.log(`\n⚠️  Claude Code exited with code ${code}`);
      }
      resolve();
    });

    child.on('error', (err) => {
      console.error(`\nFailed to start Claude Code: ${err.message}`);
      resolve();
    });
  });
}

function extractClaudeText(line: string, state: ClaudeStreamState): string {
  const trimmed = line.trim();
  if (!trimmed) {
    return '';
  }

  let event: ClaudeStreamEvent;
  try {
    event = JSON.parse(trimmed) as ClaudeStreamEvent;
  } catch {
    state.parseErrors += 1;
    if (state.parseErrors <= 3) {
      process.stderr.write(`Warning: JSON parse error on line: ${trimmed.slice(0, 100)}...\n`);
    }
    return '';
  }

  if (event.type === 'content_block_delta') {
    state.sawDelta = true;
    return event.delta?.text ?? '';
  }

  if (event.type === 'assistant') {
    if (state.sawDelta) {
      return '';
    }
    let text = '';
    for (const block of event.message?.content ?? []) {
      if (block.type === 'text' && block.text) {
        text += block.text;
      }
    }
    return text;
  }

  if (event.type === 'result') {
    if (state.sawDelta) {
      return '';
    }
    return event.result ?? '';
  }

  return '';
}

# Fixes Applied to errors.md

## Changes Made

### Gap ID 62: Monitoring infrastructure choice not specified
**What Changed**: Added "Monitoring System Requirements" section specifying minimum capabilities and acceptable monitoring systems.

**Lines Affected**: Lines 797-818 (after "Production deployments MUST implement error rate monitoring")

**Content Added/Modified**:
```markdown
**Monitoring System Requirements:**

Implementations MUST use a monitoring system that supports the following minimum capabilities:
- Counter metrics (tracking total operations, errors by type)
- Rate calculations (operations per second, error rate percentages)
- Sliding time windows (minimum 5-minute windows)
- Alert threshold configuration
- Alerting mechanisms (email, webhook, or logging)

**Acceptable Monitoring Systems (examples):**
- **Prometheus** with Alertmanager (reference implementation shown in examples below)
- **DataDog** with custom metrics API
- **CloudWatch** with CloudWatch Alarms (AWS environments)
- **Grafana** with any compatible data source
- **Custom solution** meeting minimum capabilities above

The monitoring examples in this document use Prometheus format. Implementations MAY adapt these patterns to their chosen monitoring system while maintaining equivalent functionality.
```

### Gap ID 81: Interactive quick action prompts design incomplete
**What Changed**: Added "Quick Action Execution Behavior" section detailing what happens when user selects each option, including wizard mode for option [1].

**Lines Affected**: Lines 1078-1129 (after interactive prompts example)

**Content Added/Modified**:
```markdown
**Quick Action Execution Behavior:**

When the user selects an option, the CLI MUST execute the corresponding action immediately (not just display a command to copy). The execution behavior depends on the selected option:

| Option | Action | Input Collection | Execution |
|--------|--------|------------------|-----------|
| [1] Create this item now | Launch wizard | Prompt for: --name (required), --quantity (required), --description (optional), --location (optional), --min-stock (optional) | Execute `add-item` with collected inputs |
| [2] Search for similar SKUs | Execute search | No additional input (uses SKU prefix from error) | Execute `search --sku "{sku_prefix}*"` and display results |
| [3] List all items | Execute search | No additional input | Execute `search --name ""` and display all items |
| [Enter] Cancel | Exit | N/A | Return exit code 3 (preserving original error) |

**Wizard Mode for Option [1] (Create Item):**
...provides detailed prompt sequence and confirmation flow...

**Direct Execution for Options [2] and [3]:**
...specifies immediate execution without additional prompts...

**Exit Code Behavior After Quick Actions:**
- Quick action succeeds: Exit code 0 (original error code 3 is replaced)
- Quick action fails: Exit code from the failed operation (1, 2, 3, or 4)
- User cancels: Exit code 3 (preserving original "not found" error)
```

### Gap ID 72: Circuit Breaker Pattern Will Not Work in CLI Context
**What Changed**: Added "CLI Process Model Limitation for Circuit Breaker" section acknowledging the limitation and providing cross-invocation protection alternatives, including file-based state implementation.

**Lines Affected**: Lines 679-732 (after circuit breaker behavior description)

**Content Added/Modified**:
```markdown
**CLI Process Model Limitation for Circuit Breaker:**

Like the `ProcessRetryBudget` implementation, the `DatabaseCircuitBreaker` uses in-memory state that resets with each CLI invocation. This limitation affects the circuit breaker's effectiveness in typical CLI usage patterns:

**Effective Protection Scope:**
- **Within-process protection:** Prevents cascading failures during multi-step operations within a single CLI invocation (e.g., batch imports)
- **NOT protected:** Rapid repeated CLI invocations from separate processes (each process starts with circuit CLOSED)

**Cross-Invocation Protection Alternatives:**

For deployments requiring circuit breaker state to persist across CLI invocations, consider:
1. **File-based state:** Store circuit state (OPEN/CLOSED/HALF_OPEN, failure count, timestamp) in a lock file at `/tmp/warehouse-cli-circuit.lock` with file locking to prevent race conditions
2. **Shared memory:** Use IPC mechanisms like `mmap` or `multiprocessing.Manager` for state sharing (adds complexity)
3. **Wrapper daemon:** Long-running service that maintains circuit state and proxies CLI operations
4. **External circuit breaker:** Use infrastructure-level circuit breakers (e.g., Envoy, Istio) if CLI operations route through a service mesh

The file-based state approach is the most practical for CLI contexts:
```python
import os
import fcntl
import json
import time

CIRCUIT_STATE_FILE = "/tmp/warehouse-cli-circuit.lock"

def load_circuit_state():
    """Load circuit state from shared file with locking."""
    ...implementation...

def save_circuit_state(state):
    """Save circuit state to shared file with locking."""
    ...implementation...
```

**Note:** File-based state adds I/O overhead and requires handling file permissions, stale locks, and cleanup. For single-user CLI deployments, the in-memory circuit breaker with rate limiting provides adequate protection.
```

### Gap ID 79: Circuit breaker and rate limiter integration undefined
**What Changed**: Added "Integration Points for ProcessRetryBudget and DatabaseCircuitBreaker" section specifying module ownership, call chain, detailed integration example, testing/reset procedures, and relationship to AD2 architecture principle.

**Lines Affected**: Lines 602-729 (after ProcessRetryBudget implementation)

**Content Added/Modified**:
```markdown
**Integration Points for ProcessRetryBudget and DatabaseCircuitBreaker:**

Both `ProcessRetryBudget` and `DatabaseCircuitBreaker` are singleton instances that integrate with the layered architecture as follows:

**Module Ownership and Instantiation:**
- **Location:** Both classes are defined in `database.py` (database layer module)
- **Instantiation:** Module-level singleton instances are created when `database.py` is imported
- **Access:** The `retry_with_backoff()` and `execute_with_circuit_breaker()` functions in `database.py` reference these singletons

```python
# database.py - Database layer module
import sqlite3

# Module-level singletons (instantiated once per process)
_process_retry_budget = ProcessRetryBudget(budget=20, window_seconds=60.0)
_circuit_breaker = DatabaseCircuitBreaker()

# Public API functions use the singletons
def execute_query(conn: sqlite3.Connection, query: str, params: tuple):
    """Execute database query with retry budget and circuit breaker protection."""
    def operation():
        return conn.execute(query, params)

    # Circuit breaker check happens first
    return execute_with_circuit_breaker(operation)
```

**Call Chain Integration:**

The protection mechanisms are invoked in this order for every database operation:

1. **CLI layer** (`cli.py`) receives user command
2. **Command layer** (`commands.py`) validates input and calls repository
3. **Repository layer** (`repository.py`) prepares database operation
4. **Database layer** (`database.py`) applies protections:
   - Check circuit breaker state (fail fast if OPEN)
   - Execute operation with retry logic (if circuit allows)
   - For each retry attempt: check retry budget before sleeping
   - Update circuit breaker state based on success/failure
5. Result or exception propagates back up the chain

**Detailed Integration Example:**
...provides complete code example of execute_with_protections...

**Testing and Reset:**
...provides test reset functions for singleton state...

**Relationship to Architecture Principle AD2 (No Global State):**
...justifies singleton exceptions with security requirements...
```

### Gap ID 80: Monitoring integration examples lack specifics
**What Changed**: Added "Wrapper Deployment Instructions" section with prerequisites, installation steps, log rotation configuration, and monitoring system alternatives (DataDog, CloudWatch).

**Lines Affected**: Lines 925-1011 (after wrapper script examples)

**Content Added/Modified**:
```markdown
**Wrapper Deployment Instructions:**

To deploy the monitoring wrapper in a production environment:

**Prerequisites:**
- Bash 4.0+ (for associative arrays if extended)
- `jq` binary installed (`apt-get install jq` or `brew install jq`)
- Write permissions to log directories (`/var/log/` or custom location)

**Installation Steps:**

1. **Install wrapper script:**
   ```bash
   sudo cp warehouse-cli-monitored /usr/local/bin/
   sudo chmod +x /usr/local/bin/warehouse-cli-monitored
   ```

2. **Install metrics collection script:**
   ...complete installation steps...

3. **Create log directories with correct permissions:**
   ...directory setup...

4. **Configure log rotation to prevent disk exhaustion:**
   ```bash
   # /etc/logrotate.d/warehouse-cli
   /var/log/warehouse-cli/*.json {
       daily
       rotate 30
       compress
       delaycompress
       missingok
       notifempty
       create 0644 warehouse warehouse
   }
   ...complete logrotate config...
   ```

5. **Set up Prometheus node_exporter (if using Prometheus):**
   ...node_exporter configuration...

6. **Optional: Create alias for convenience:**
   ...alias setup...

**Log Rotation Configuration Details:**

| Aspect | Setting | Rationale |
|--------|---------|-----------|
| JSON logs rotation | Daily, 30 days | Balances disk usage with troubleshooting window |
| Metrics file rotation | Hourly, 24 hours | High write frequency requires frequent rotation |
| Compression | Enabled with delaycompress | Saves disk space, delaycompress allows in-progress writes |
| Permissions | 0644 warehouse:warehouse | Readable by monitoring systems, writable by CLI |

**Monitoring System Alternatives:**

**DataDog Integration:**
```bash
# warehouse-metrics-datadog.sh
...StatsD integration code...
```

**CloudWatch Integration (AWS):**
```bash
# warehouse-metrics-cloudwatch.sh
...CloudWatch CLI integration code...
```

**Note:** CloudWatch integration requires AWS CLI installed and IAM permissions configured (`cloudwatch:PutMetricData`).
```

## Summary
- **Gaps addressed:** 5 (all provided gaps)
- **Sections added:** 5 major sections
- **Sections modified:** 0 (all additions were net new content)

## Key Improvements

1. **Monitoring Infrastructure (Gap 62):** Spec now defines minimum monitoring system capabilities and provides examples of acceptable alternatives to Prometheus (DataDog, CloudWatch, Grafana, custom solutions).

2. **Interactive Prompts (Gap 81):** Complete specification of what happens after user selects an option, including wizard mode for item creation, direct execution for searches, and exit code behavior.

3. **Circuit Breaker CLI Limitation (Gap 72):** Explicitly acknowledges the in-memory state limitation in CLI context and provides practical alternatives (file-based state, shared memory, wrapper daemon, external circuit breakers) with implementation example.

4. **Integration Architecture (Gap 79):** Comprehensive specification of where ProcessRetryBudget and DatabaseCircuitBreaker live (database.py), how they're instantiated (module-level singletons), complete call chain documentation, testing reset procedures, and justification for exception to AD2 architecture principle.

5. **Deployment Details (Gap 80):** Complete wrapper deployment instructions including prerequisites, installation steps, log rotation configuration with rationale, and monitoring alternatives for DataDog and CloudWatch with specific implementation code.

All changes are additive and preserve existing content, style, and formatting conventions. No existing sections were removed or significantly modified.

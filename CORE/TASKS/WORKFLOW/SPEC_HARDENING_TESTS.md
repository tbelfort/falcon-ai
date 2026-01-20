# Task: Spec Hardening Tests

Instructions for hardening test coverage in specs. Read after checking out a task in **Spec Drafted** state.

---

## Overview

Your job is to review the existing spec and ensure it has **comprehensive test coverage**. You will:
1. Analyze the spec for all testable requirements
2. Identify edge cases, failure modes, and boundary conditions
3. Add/expand the testing section to create a full test suite
4. Ensure every MUST/SHOULD requirement has corresponding tests

---

## Prerequisites

- Issue is in **Spec Drafted** state
- Spec file exists (check `**Spec:**` in Linear comments)

---

## Step 1: Get Issue Details

```bash
# Use /linear-tool skill for Linear operations
```

**Extract from comments:**
- `**Spec:**` — Full path to the spec file (REQUIRED)
- `**Branch:**` — Branch name to checkout

If spec path is missing, **FAIL** and tell human: "No spec path found in comments. Cannot proceed."

---

## Step 2: Checkout Branch and Claim Task

```bash
git fetch origin
git checkout <branch-name>

# Update status
# Use /linear-tool skill for Linear operations

# Swap labels (remove agent_ready if present, add agent_working)
# Use /linear-tool skill for Linear operations

# Comment to claim
# Use /linear-tool skill for Linear operations
```

---

## Step 3: Read and Analyze the Spec

1. **Read the spec file** at the path from comments
2. **Read any ai_docs** referenced in the spec
3. **Read architecture docs** if the spec references them

---

## Step 4: Identify Test Cases

**Read the architecture docs for test requirements:**
- `docs/systems/architecture/QUALITY-ATTRIBUTES.md` — Test count formula and required categories
- `docs/systems/architecture/COMPONENT-TYPES.md` — Component-specific test requirements
- `docs/systems/architecture/SECURITY.md` — Path security test cases

Create a comprehensive list of test cases covering:

### Mandatory Categories (ALL SPECS)

- Import boundary tests (verify no forbidden imports per `LAYERS.md`)
- Error handling tests (verify <CONFIG>Error base class</CONFIG> usage per `QUALITY-ATTRIBUTES.md`)
- Functional tests (MUST/SHOULD requirements)
- Edge cases (empty inputs, boundaries, null handling)

### Conditional Categories (by component type)

<CONFIG>Component type requirements</CONFIG>

### Integration and Cross-Cutting

- Tests for each external dependency interaction
- Mock/stub strategies documented
- Performance tests (if applicable)
- Security tests (if applicable)

---

## Step 4.5: Verify Test Count

Calculate minimum tests using the formula from `docs/systems/architecture/QUALITY-ATTRIBUTES.md#minimum-test-count-formula`.

**Tests in spec before hardening:** ___
**Tests after hardening:** ___
**Status:** Meets minimum / Below minimum - add more tests

---

## Step 5: Update the Spec

Add or expand the **Testing** section in the spec with:

### Test Categories Template

```markdown
## Testing

### Unit Tests

#### <Component/Function Name>

| Test ID | Description | Input | Expected Output | Covers |
|---------|-------------|-------|-----------------|--------|
| UT-001 | Happy path - basic operation | ... | ... | MUST-1 |
| UT-002 | Empty input handling | ... | ... | Edge case |
| UT-003 | Maximum size input | ... | ... | Boundary |
| ... | ... | ... | ... | ... |

### Edge Case Tests

| Test ID | Description | Scenario | Expected Behavior |
|---------|-------------|----------|-------------------|
| EC-001 | Null input | Input is null | Raises ValidationError |
| EC-002 | Empty collection | Input is [] | Returns empty result |
| ... | ... | ... | ... |

### Error Handling Tests

| Test ID | Description | Trigger Condition | Expected Error |
|---------|-------------|-------------------|----------------|
| ERR-001 | Invalid type | String where int expected | TypeError |
| ERR-002 | Network failure | Connection refused | RetryableError |
| ... | ... | ... | ... |

### Integration Tests

| Test ID | Description | Components | Verification |
|---------|-------------|------------|--------------|
| INT-001 | End-to-end flow | A -> B -> C | Output matches expected |
| ... | ... | ... | ... |

### Test Data Requirements

- [ ] List any test fixtures needed
- [ ] List any mock data requirements
- [ ] List any test environment setup

### Coverage Goals

- **Line coverage:** >= X%
- **Branch coverage:** >= X%
- **All MUST requirements:** 100% covered
- **All SHOULD requirements:** >= 80% covered
```

---

## Step 6: Commit and Push

```bash
git add .
git commit -m "spec: harden test coverage

Added comprehensive test cases for CON-XXX:
- <count> unit tests
- <count> edge case tests
- <count> error handling tests
- <count> integration tests"

git push
```

---

## Step 7: Update Spec in Linear

**Linear is the source of truth.** Update the existing spec document (don't create a new one).

1. **Find the document ID** from the `**Spec Doc:**` URL in the Linear comments:
   - Example URL: `https://linear.app/<CONFIG>Linear workspace</CONFIG>/document/con-123-spec-title-b61c234e4b40`
   - The document ID is the last segment: `b61c234e4b40`

2. **Update the document:**
   ```bash
   # Use /linear-tool skill for Linear operations
   ```

The document URL stays the same — no need to update references.

---

## Step 8: Update Linear

```bash
# Move to Spec In Review
# Use /linear-tool skill for Linear operations

# CRITICAL: Swap labels
# Use /linear-tool skill for Linear operations

# Comment with summary
# Use /linear-tool skill for Linear operations
```

---

## Step 9: Report to Human

```
Spec hardening complete for CON-XXX

**Spec file:** <path>
**Spec Doc:** Updated in place (same URL)

**Test cases added:**
- Unit tests: <count>
- Edge case tests: <count>
- Error handling tests: <count>
- Integration tests: <count>

**Status:** Spec In Review — Ready for spec review

**Next steps:** Run `/checkout CON-XXX` to start spec review.
```


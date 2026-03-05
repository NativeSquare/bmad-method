# Quinn QA - Automate

**Goal**: Generate automated API and E2E tests for implemented code.

**Scope**: This workflow generates tests ONLY. It does **not** perform code review or story validation (use Code Review `CR` for that).

## Instructions

### Step 0a: Load Relevant OpenClaw Skills

Before generating any tests, load the appropriate skills based on what you're testing:

1. **Always** load the `test-master` skill (read its SKILL.md) — this is your primary testing reference
2. Read the story file (if provided) and extract the `storyType` field (frontend | backend | fullstack)
3. Based on storyType or project analysis:
   - **Mobile E2E (Expo/React Native)** → load `test-master/references/maestro-e2e.md` for Maestro patterns
   - **Web E2E** → load `test-master/references/e2e-testing.md` for Playwright patterns
   - **Unit tests** → load `test-master/references/unit-testing.md`
   - **Backend (Convex)** → load `convex-guidelines` skill for backend patterns
4. Load relevant references from test-master based on what tests you'll write

### Step 0b: Detect Test Framework

Check project for existing test framework:

- Look for `package.json` dependencies (playwright, jest, vitest, cypress, etc.)
- Check for existing test files to understand patterns
- Use whatever test framework the project already has
- If no framework exists:
  - Analyze source code to determine project type (React, Vue, Node API, etc.)
  - Search online for current recommended test framework for that stack
  - Suggest the meta framework and use it (or ask user to confirm)

### Step 1: Identify Features

Ask user what to test:

- Specific feature/component name
- Directory to scan (e.g., `src/components/`)
- Or auto-discover features in the codebase

### Step 2: Generate API Tests (if applicable)

For API endpoints/services, generate tests that:

- Test status codes (200, 400, 404, 500)
- Validate response structure
- Cover happy path + 1-2 error cases
- Use project's existing test framework patterns

### Step 3: Generate E2E Tests (if UI exists)

For UI features, generate tests that:

- Test user workflows end-to-end
- Use semantic locators (roles, labels, text)
- Focus on user interactions (clicks, form fills, navigation)
- Assert visible outcomes
- Keep tests linear and simple
- Follow project's existing test patterns

### Step 4: Run Tests

Execute tests to verify they pass (use project's test command).

If failures occur, fix them immediately.

### Step 5: Create Summary

Output markdown summary:

```markdown
# Test Automation Summary

## Generated Tests

### API Tests
- [x] tests/api/endpoint.spec.ts - Endpoint validation

### E2E Tests
- [x] tests/e2e/feature.spec.ts - User workflow

## Coverage
- API endpoints: 5/10 covered
- UI features: 3/8 covered

## Next Steps
- Run tests in CI
- Add more edge cases as needed
```

## Keep It Simple

**Do:**

- Use standard test framework APIs
- Focus on happy path + critical errors
- Write readable, maintainable tests
- Run tests to verify they pass

**Avoid:**

- Complex fixture composition
- Over-engineering
- Unnecessary abstractions

**For Advanced Features:**

If the project needs:

- Risk-based test strategy
- Test design planning
- Quality gates and NFR assessment
- Comprehensive coverage analysis
- Advanced testing patterns and utilities

→ **Install Test Architect (TEA) module**: <https://bmad-code-org.github.io/bmad-method-test-architecture-enterprise/>

## Output

Save summary to: `{implementation_artifacts}/tests/test-summary.md`

**Done!** Tests generated and verified.

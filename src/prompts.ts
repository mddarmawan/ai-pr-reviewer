import {type Inputs} from './inputs'

export class Prompts {
  summarize: string
  summarizeReleaseNotes: string

  summarizeFileDiff = `## GitHub PR Title

\`$title\` 

## Description

\`\`\`
$description
\`\`\`

## Diff

\`\`\`diff
$file_diff
\`\`\`

## Instructions

I would like you to succinctly summarize the diff within 100 words.
If applicable, your summary should include a note about alterations 
to the signatures of exported functions, global data structures and 
variables, and any changes that might affect the external interface or 
behavior of the code.
`
  triageFileDiff = `Below the summary, I would also like you to triage the diff as \`NEEDS_REVIEW\` or 
\`APPROVED\` based on the following criteria:

- If the diff involves any modifications to the logic or functionality, even if they 
  seem minor, triage it as \`NEEDS_REVIEW\`. This includes changes to control structures, 
  function calls, or variable assignments that might impact the behavior of the code.
- If the diff only contains very minor changes that don't affect the code logic, such as 
  fixing typos, formatting, or renaming variables for clarity, triage it as \`APPROVED\`.

Please evaluate the diff thoroughly and take into account factors such as the number of 
lines changed, the potential impact on the overall system, and the likelihood of 
introducing new bugs or security vulnerabilities. 
When in doubt, always err on the side of caution and triage the diff as \`NEEDS_REVIEW\`.

You must strictly follow the format below for triaging the diff:
[TRIAGE]: <NEEDS_REVIEW or APPROVED>

Important:
- In your summary do not mention that the file needs a through review or caution about
  potential issues.
`

  reviewFileDiff = `## GitHub PR Title

\`$title\` 

## Description

\`\`\`
$description
\`\`\`

## Diff

\`\`\`diff
$file_diff
\`\`\`

## IMPORTANT Instructions

Input: New hunks annotated with line numbers and old hunks (replaced code). Hunks represent incomplete code fragments.
Additional Context: PR title, description, summaries and comment chains.
Task: Review new hunks for substantive issues using provided context and respond with comments if necessary.
Output: Review comments in markdown with exact line number ranges in new hunks. Start and end line numbers must be within the same hunk. For single-line comments, start=end line number. Must use example response format below.
Use fenced code blocks using the relevant language identifier where applicable.
Don't annotate code snippets with line numbers. Format and indent code correctly.
Do not use \`suggestion\` code blocks.
For fixes, use \`diff\` code blocks, marking changes with \`+\` or \`-\`. The line number range for comments with fix snippets must exactly match the range to replace in the new hunk.

## 🔍 ENHANCED SECURITY & QUALITY FOCUS

**PRIORITY 1 - SECURITY VULNERABILITIES (CRITICAL):**
- Hardcoded secrets (API keys, passwords, tokens, database URLs)
- Authentication bypass (missing auth middleware, weak auth checks)
- Authorization flaws (missing role checks, privilege escalation)
- Input validation issues (SQL injection, XSS, injection attacks)
- Cryptographic weaknesses (weak hashing, insecure random generation)
- Sensitive data exposure (logs, error messages, stack traces)
- CORS misconfigurations (overly permissive origins)
- Missing or insufficient rate limiting

**PRIORITY 2 - INPUT VALIDATION & SANITIZATION:**
- Weak validation (basic regex, missing edge cases)
- Insufficient sanitization (unescaped output, raw user input)
- Missing validation (required fields, data types, ranges)
- Email validation (proper format checking, not just @ symbol)
- Password requirements (strength, complexity, length)

**PRIORITY 3 - ERROR HANDLING & LOGGING:**
- Information disclosure (stack traces in production)
- Missing error handling (uncaught exceptions, silent failures)
- Poor error messages (generic errors, no debugging info)
- Logging issues (sensitive data in logs, insufficient logging)

**PRIORITY 4 - PERFORMANCE & SCALABILITY:**
- N+1 queries (database query optimization)
- Memory leaks (resource cleanup, circular references)
- Inefficient algorithms (time complexity, space complexity)
- Missing pagination (large data sets, memory issues)

**PRIORITY 5 - CODE QUALITY & ARCHITECTURE:**
- Logic errors (control flow, business logic)
- Data races (concurrency issues, thread safety)
- Consistency (data integrity, state management)
- Maintainability (code organization, documentation)
- Best practices (DRY, SOLID, KISS principles)

## 🔎 SPECIFIC DETECTION PATTERNS:

**CRITICAL AUTHENTICATION VULNERABILITIES:**
- Routes that access sensitive data (users, profiles, admin data) without authentication
- GET endpoints that return user data without proper auth middleware
- API endpoints that should require authentication but are missing it
- Routes with comments like "admin only" but no auth middleware

**Security Patterns to Flag:**
- \`const.*=.*['"](secret|key|password|token)['"]\` - Hardcoded secrets
- \`bcrypt\.genSalt\([0-9]+\)\` - Check salt rounds (should be 12+)
- \`router\.(get|post|put|delete)\(['"][^'"]*['"],\s*async\s*\(req,\s*res\)\` - Missing auth middleware
- \`router\.(get|post|put|delete)\(['"][^'"]*['"],\s*\(req,\s*res\)\` - Missing auth middleware (non-async)
- \`process\.env\.[A-Z_]+\` - Environment variable usage
- \`error\.stack\` - Stack trace exposure
- \`console\.log\(.*error\` - Error logging

**Authentication & Authorization Patterns:**
- Routes with comments indicating admin-only access but missing authentication
- GET endpoints that return user data without proper auth middleware
- API endpoints that should require authentication but are missing it
- Routes that access sensitive data but don't have authenticateToken, auth, or middleware

**Validation Patterns to Flag:**
- \`email\.includes\('@')\` - Weak email validation
- \`password\.length.*[<>=].*[0-9]\` - Password length checks
- \`JSON\.parse\(.*req\.body\` - Unsafe JSON parsing
- \`req\.query\..*\` - Direct query parameter usage

**Critical Security Checks:**
1. **Authentication Bypass**: Look for route handlers that should have authentication but don't
2. **Authorization Issues**: Check for missing role-based access controls
3. **Sensitive Data Exposure**: Routes that return user data without proper auth
4. **Input Validation**: Weak or missing validation on user inputs
5. **Error Information Disclosure**: Stack traces or sensitive info in error responses

**SPECIFIC AUTHENTICATION VULNERABILITIES TO DETECT:**
- Routes with comments like "admin only" or "admin" but missing authentication middleware
- GET endpoints that return user data without proper auth (especially /users, /api/users)
- Routes that access sensitive data but don't have authenticateToken, auth, or middleware
- API endpoints that should require authentication but are missing it
- Look for patterns like: router.get("/", async (req, res) => { without auth middleware

- Do NOT provide general feedback, summaries, explanations of changes, or praises 
  for making good additions. 
- Focus solely on offering specific, objective insights based on the 
  given context and refrain from making broad comments about potential impacts on 
  the system or question intentions behind the changes.
- Only comment when you find actual issues, vulnerabilities, or problems that need attention.
- If no issues are found, do NOT comment at all (no LGTM or approval messages).

## Example

### Example changes

---new_hunk---
\`\`\`
  z = x / y
    return z

20: def add(x, y):
21:     z = x + y
22:     retrn z
23: 
24: def multiply(x, y):
25:     return x * y

def subtract(x, y):
  z = x - y
\`\`\`
  
---old_hunk---
\`\`\`
  z = x / y
    return z

20: def add(x, y):
21:     z = x + y
22:     return z
23: 
24: def multiply(x, y):
25:     return x * y

def subtract(x, y):
  z = x - y
\`\`\`
---

## Changes made to \`$filename\` for your review

$patches
`
}

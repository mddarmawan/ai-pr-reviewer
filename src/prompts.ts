import {type Inputs} from './inputs'

export class Prompts {
  summarize: string
  reviewFileDiff: string
  comment: string
  summarizeFileDiff: string
  summarizeReleaseNotes: string

  constructor(inputs: Inputs) {
    this.summarize = `You are an expert software engineer reviewing a pull request. Your task is to provide a concise summary of the changes made in this PR.

Focus on:
- Key changes and their impact
- Security implications
- Code quality improvements
- Potential issues or concerns
- Overall assessment

Keep the summary brief but comprehensive.`

    this.reviewFileDiff = `You are an expert software engineer conducting a code review. Your task is to identify and comment on actual issues in the code changes.

## 🎯 REVIEW FOCUS

**ONLY comment on ACTUAL ISSUES that need attention. Do not comment on:**
- Code that is already secure and well-implemented
- Minor style preferences
- Already fixed issues
- Security improvements that are correctly implemented

**PRIORITY 1 - CRITICAL SECURITY VULNERABILITIES (MUST DETECT):**
- Hardcoded secrets (API keys, passwords, tokens, database URLs) - ALWAYS FLAG THESE
- Authentication bypass (missing auth middleware, weak auth checks)
- Authorization flaws (missing role checks, privilege escalation)
- Input validation issues (SQL injection, XSS, injection attacks)
- Cryptographic weaknesses (weak hashing, insecure random generation)
- Sensitive data exposure (passwords in responses, logs, error messages, stack traces) - ALWAYS FLAG THESE
- CORS misconfigurations (overly permissive origins)
- Missing or insufficient rate limiting
- ANY hardcoded credentials or secrets in the code - IMMEDIATE SECURITY RISK

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

## 🚫 DO NOT COMMENT ON:

- Security improvements that are correctly implemented
- Proper error handling that only logs error.message
- Good authentication and authorization patterns
- Proper input validation and sanitization
- Security headers and middleware that are correctly configured
- Environment variable usage for secrets
- Proper password hashing with appropriate rounds
- Good error response patterns
- Documentation comments (lines starting with // or /*)
- Code formatting and style issues
- Timestamp comments or logging statements
- Variable naming conventions
- Code organization and structure

## 📝 RESPONSE FORMAT:

**IMPORTANT: You MUST use this exact structured format for each issue found:**

For each issue, use this format:
\`\`\`
### (type): title

<!-- DESCRIPTION START -->
detailed description of the issue
<!-- DESCRIPTION END -->

<!-- LOCATIONS START
filename#LstartLine-LendLine
LOCATIONS END -->
\`\`\`

**CRITICAL: Use PRECISE line numbers that exist in the actual diff/patch.**
- Target ONLY the specific lines containing the vulnerability
- For hardcoded passwords: target the line with the hardcoded value (e.g., const adminPassword = 'admin123456')
- For SQL injection: target the line with the vulnerable query (e.g., const query = \`SELECT * FROM users WHERE id = \${userId}\`)
- For exposed secrets: target the line exposing the secret (e.g., res.json({ password: adminPassword }))
- Use single line numbers when possible (e.g., L150-L150)
- Use small ranges only when necessary (e.g., L150-L152)
- Look at the actual diff content to find the EXACT line numbers
- Do NOT guess line numbers - analyze the diff carefully

Example format:
\`\`\`
### Security: Hardcoded Password Exposure

<!-- DESCRIPTION START -->
This line contains a hardcoded admin password ('admin123') that should never be stored in source code. Hardcoded credentials pose a critical security risk as they can be exposed through version control, code sharing, or unauthorized access. Passwords should be stored securely using environment variables or a secure secrets management system.
<!-- DESCRIPTION END -->

<!-- LOCATIONS START
server.js#L150-L150
LOCATIONS END -->
\`\`\`
Suggested Fix: Use process.env.API_KEY instead

---

**CRITICAL: If you see ANY of these patterns, you MUST flag them:**
- \`const password = 'admin123'\` - HARDCODED PASSWORD
- \`const dbUrl = 'mongodb://user:pass@localhost'\` - HARDCODED CREDENTIALS
- \`res.json({ password: adminPassword })\` - PASSWORD EXPOSURE
- \`const apiKey = 'sk-1234567890'\` - HARDCODED API KEY
- \`SELECT * FROM users WHERE id = \${userId}\` - SQL INJECTION VULNERABILITY
- \`const query = \`SELECT * FROM users WHERE id = \${userId}\`\` - SQL INJECTION
- \`res.send(\`<h1>Search results for: \${searchTerm}</h1>\`)\` - XSS VULNERABILITY

These are IMMEDIATE security vulnerabilities that MUST be detected!

For multiple issues, separate each with the format above.

## 🎨 COMMENT FORMATTING:

**IMPORTANT: Generate comments in this EXACT format for each issue:**

For each issue found, use this EXACT structure:
\`\`\`
### (type): title

<!-- DESCRIPTION START -->
description
<!-- DESCRIPTION END -->

<!-- LOCATIONS START
filename#LstartLine-LendLine
LOCATIONS END -->
\`\`\`

Where:
- (type) = Security, Performance, Error Handling, Code Quality, etc.
- title = Brief descriptive title (no duplicate "###" or type)
- description = Detailed explanation of the issue
- filename#LstartLine-LendLine = Exact file location with line numbers

Example:
\`\`\`
### Security: Hardcoded API Key Exposure

<!-- DESCRIPTION START -->
This line contains a hardcoded API key that should be moved to environment variables. Hardcoded secrets in source code pose a significant security risk as they can be exposed in version control and accessed by unauthorized users.
<!-- DESCRIPTION END -->

<!-- LOCATIONS START
server.js#L140-L140
LOCATIONS END -->
\`\`\`

**CRITICAL: You MUST use the EXACT structured format above. Do NOT use any other format.**

## ⚠️ IMPORTANT:

- **ONLY comment on actual security vulnerabilities or code issues**
- **DO NOT comment on security improvements or best practices**
- **Focus on what's broken, not what's being fixed**
- **Be constructive and provide actionable feedback**
- **Always look for security vulnerabilities and code issues - be thorough in your analysis**
- **Use PRECISE line numbers that exist in the actual patch/diff**
- **Target ONLY the specific lines containing the vulnerability**
- **Use single line numbers when possible (e.g., L150-L150)**
- **Be VERY careful with line numbers - they must match the patch context**

**FINAL REMINDER: You MUST use the EXACT structured format above. Do NOT use any other format.**
**For each vulnerability, you MUST include the LOCATIONS START block with precise line numbers.**
**Example: If you see hardcoded password 'admin123' on line 150, use:**
\`\`\`
### Security: Hardcoded Password Exposure

<!-- DESCRIPTION START -->
This line contains a hardcoded admin password ('admin123') that should never be stored in source code.
<!-- DESCRIPTION END -->

<!-- LOCATIONS START
server.js#L150-L150
LOCATIONS END -->
\`\`\`

Remember: You are reviewing code changes, not the final state. Focus on what's being changed and whether those changes introduce vulnerabilities or issues.`

    this.comment = this.reviewFileDiff
    this.summarizeFileDiff = `You are an expert software engineer reviewing a pull request. Your task is to provide a concise summary of the changes made in this PR.

Focus on:
- Key changes and their impact
- Security implications
- Code quality improvements
- Potential issues or concerns
- Overall assessment

Keep the summary brief but comprehensive.

## Code Changes to Review:

**File:** $filename

**Diff:**
\`\`\`diff
$file_diff
\`\`\`

Please analyze the above code changes and provide your assessment.`
    this.summarizeReleaseNotes = this.summarize
  }

  system_message = (inputs: Inputs): string => {
    return this.reviewFileDiff
  }

  // Add missing methods that the code expects
  renderSummarizeFileDiff = (inputs: Inputs): string => {
    return this.summarizeFileDiff
      .replace('$filename', inputs.filename)
      .replace('$file_diff', inputs.fileDiff)
  }

  renderSummarizeChangesets = (inputs: Inputs): string => this.summarize
  renderSummarize = (inputs: Inputs): string => this.summarize
  renderSummarizeReleaseNotes = (inputs: Inputs): string => this.summarize
  renderSummarizeShort = (inputs: Inputs): string => this.summarize

  renderReviewFileDiff = (inputs: Inputs): string => {
    let prompt = this.reviewFileDiff

    if (inputs.patches) {
      // Include the actual file content with line numbers
      const fileContent = inputs.fileContent || ''
      const lines = fileContent.split('\n')
      const numberedLines = lines.map((line, index) => `${(index + 1).toString().padStart(3, ' ')}|${line}`).join('\n')
      
      prompt += `\n\n## Code Changes to Review:\n\n**File:** ${inputs.filename}\n\n**Full File Content with Line Numbers:**\n\`\`\`\n${numberedLines}\n\`\`\`\n\n**Diff of Changes:**\n\`\`\`diff\n${inputs.patches}\n\`\`\`\n\n**INSTRUCTIONS:**\n1. Look at the full file content above to see the exact line numbers\n2. Find the vulnerabilities in the diff\n3. Use the EXACT line numbers from the numbered file content above\n4. For example, if you see \`const adminPassword = 'admin123456';\` in the diff, find that exact line in the numbered content and use its line number`
    }

    return prompt
  }

  renderComment = (inputs: Inputs): string => this.reviewFileDiff
}

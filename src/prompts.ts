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

**CRITICAL: Use PRECISE line numbers from the file content with line numbers provided.**
- You will see file content with format "LINE_NUMBER|CODE_CONTENT"
- When referencing lines in your response, extract the EXACT line numbers shown in this format
- For hardcoded passwords: target the line with the hardcoded value (e.g., "85|    const adminPassword = 'admin123456';")
- For sensitive data exposure: target the line exposing the secret (e.g., "94|      adminPassword,")
- Use single line numbers when possible (e.g., L85-L85)
- Use small ranges only when necessary (e.g., L85-L86)
- Look at the actual numbered file content (not just the diff) to find the EXACT line numbers
- Do NOT rely on the diff line numbers - use ONLY the explicit line numbers from the numbered content

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
Suggested Fix: Use process.env.ADMIN_PASSWORD instead

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
- **Use PRECISE line numbers from the numbered file content**
- **Target ONLY the specific lines containing the vulnerability**
- **Use single line numbers when possible (e.g., L85-L85)**
- **Be VERY careful with line numbers - they must match the line numbers in the code**

**FINAL REMINDER: You MUST use the EXACT structured format above. Do NOT use any other format.**
**For each vulnerability, you MUST include the LOCATIONS START block with precise line numbers.**
**Example: If you see hardcoded password 'admin123' at line number 85, use:**
\`\`\`
### Security: Hardcoded Password Exposure

<!-- DESCRIPTION START -->
This line contains a hardcoded admin password ('admin123') that should never be stored in source code.
<!-- DESCRIPTION END -->

<!-- LOCATIONS START
server.js#L85-L85
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

      // Find the range of changes from the patches to show only relevant section
      let startLine = 1
      let endLine = lines.length

      // Extract line numbers from patches to show only the relevant section
      const patchLines = inputs.patches.match(/@@ -(\d+),\d+ \+(\d+),\d+ @@/g)
      if (patchLines) {
        const lineNumbers = patchLines.map(match => {
          const m = match.match(/@@ -(\d+),\d+ \+(\d+),\d+ @@/)
          // Extract the line number after the + sign, this is the new file line number
          return m ? parseInt(m[2], 10) : 0
        })
        if (lineNumbers.length > 0) {
          // Make sure we're showing enough context around each patch
          startLine = Math.max(1, Math.min(...lineNumbers) - 10) // Show 10 lines before
          endLine = Math.min(lines.length, Math.max(...lineNumbers) + 50) // Show 50 lines after to capture more context

          // Debugging - log the actual line ranges we're extracting
          console.log(`Extracted patch line ranges: ${JSON.stringify(lineNumbers)}`)
          console.log(`Using file content lines ${startLine}-${endLine}`)
        }
      }

      const relevantLines = lines.slice(startLine - 1, endLine)
      const numberedLines = relevantLines.map((line, index) => {
        const actualLineNumber = startLine + index
        return `${actualLineNumber.toString().padStart(6, ' ')}|${line}`
      }).join('\n')

      prompt += `\n\n## Code Changes to Review:\n\n**File:** ${inputs.filename}\n\n**Relevant File Content with Line Numbers (lines ${startLine}-${endLine}):**\n\`\`\`\n${numberedLines}\n\`\`\`\n\n**Diff of Changes:**\n\`\`\`diff\n${inputs.patches}\n\`\`\`\n\n**INSTRUCTIONS:**\n1. Look at the numbered file content above to see the exact line numbers\n2. Find the vulnerabilities in the diff (lines marked with +)\n3. Use the EXACT line numbers from the numbered content above\n4. For example, if you see \`const adminPassword = 'admin123456';\` in the diff and it's on line 85 in the numbered content, use line number 85\n5. DO NOT reference the line numbers in the diff - use ONLY the explicit line numbers from the numbered file content`
    }

    return prompt
  }

  renderComment = (inputs: Inputs): string => this.reviewFileDiff
}

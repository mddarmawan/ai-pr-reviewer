import {type Inputs} from './inputs'

export class Prompts {
  summarize: string
  reviewFileDiff: string
  comment: string
  summarizeFileDiff: string
  summarizeReleaseNotes: string

  constructor(inputs: Inputs) {
    this.summarize = `Summarize the PR changes below into a concise review. Output only the summary — no greetings, no "I'd be happy to", no conversational filler.

Format:
**Key Changes & Impact:**
- ...

**Security Implications:**
- ...

**Code Quality Concerns:**
- ...

**Overall Assessment:**
- ...

Skip sections that don't apply. Keep each bullet one line.`

    this.summarizeReleaseNotes = `Generate release notes from these PR changes. Output only the notes — no greetings, no filler. Focus on user-facing changes, bug fixes, and new features. Keep it concise.`

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

    this.reviewFileDiff = `You are an expert code reviewer. Find and report actual issues in the code changes. Report issues at ALL severity levels: high, medium, and low.

## What to Report

**High Severity** — must fix before merge:
- Hardcoded secrets (passwords, API keys, tokens, connection strings)
- Authentication/authorization bypasses or missing checks
- SQL injection, XSS, command injection
- Sensitive data exposure (passwords in responses, logs, error messages)
- Cryptographic weaknesses (weak hashing, insecure random)
- Missing rate limiting on auth endpoints

**Medium Severity** — should fix:
- Weak input validation (missing edge cases, bypassable regex)
- Missing error handling (uncaught exceptions, silent failures)
- Information disclosure (stack traces in production, debug endpoints)
- Logic errors (incorrect conditions, off-by-one, race conditions)
- N+1 queries, missing pagination

**Low Severity** — nice to fix:
- Misleading variable/function names
- Missing null/undefined guards
- Inefficient patterns (unnecessary loops, redundant calls)
- Missing TypeScript types where they'd catch bugs

## What NOT to Report

- Code formatting, whitespace, or style preferences
- Variable naming that is merely unconventional
- Documentation comments or logging statements
- Code that is already correct and secure
- Security measures that are properly implemented
- "Looks good" or "LGTM" on unchanged code

## Response Format

Report each issue using EXACTLY this format:

\`\`\`
### Brief, descriptive title explaining the actual impact

**High Severity** (or Medium Severity, or Low Severity)

<!-- DESCRIPTION START -->
Clear explanation of what the issue is and why it matters. Include the concrete impact or risk.
<!-- DESCRIPTION END -->

<!-- LOCATIONS START
filename#LstartLine-LendLine
LOCATIONS END -->
\`\`\`

Separate multiple issues with \`---\` on its own line.

**Line numbers:** You will receive file content with line number prefixes like \`   85|code here\`. Use THOSE exact line numbers from the numbered file content. Target only the specific lines where the issue lives.

**If you find NO issues:** Respond with exactly:
\`\`\`
NO_ISSUES_FOUND
\`\`\`

Do not add any other text when there are no issues. Do not say "looks good" or "LGTM" — just \`NO_ISSUES_FOUND\`.

Remember: Report issues at ALL severity levels. Low severity issues are worth flagging too — they help the author improve code quality over time. But don't invent issues where none exist.`

    this.comment = `Answer the follow-up question directly. Output only the answer — no greetings, no "I'd be happy to", no "let me know if", no conversational filler. Be brief.`
  }

  system_message = (inputs: Inputs): string => {
    return this.reviewFileDiff
  }

  renderSummarizeFileDiff = (inputs: Inputs): string => {
    return this.summarizeFileDiff
      .replace('$filename', inputs.filename)
      .replace('$file_diff', inputs.fileDiff)
  }

  renderSummarizeChangesets = (inputs: Inputs): string => {
    if (inputs.rawSummary) {
      return this.summarize + '\n\n## Changes to Summarize\n\n' + inputs.rawSummary
    }
    return this.summarize
  }
  renderSummarize = (inputs: Inputs): string => {
    if (inputs.rawSummary) {
      return this.summarize + '\n\n## Changes to Summarize\n\n' + inputs.rawSummary
    }
    return this.summarize
  }
  renderSummarizeReleaseNotes = (inputs: Inputs): string => {
    if (inputs.rawSummary) {
      return this.summarizeReleaseNotes + '\n\n## Changes\n\n' + inputs.rawSummary
    }
    return this.summarizeReleaseNotes
  }
  renderSummarizeShort = (inputs: Inputs): string => {
    if (inputs.rawSummary) {
      return this.summarize + '\n\n## Changes to Summarize\n\n' + inputs.rawSummary
    }
    return this.summarize
  }

  renderReviewFileDiff = (inputs: Inputs): string => {
    let prompt = this.reviewFileDiff

    if (inputs.patches) {
      const fileContent = inputs.fileContent || ''
      const lines = fileContent.split('\n')

      let startLine = 1
      let endLine = lines.length

      const patchMatches = inputs.patches.match(/@@ -(\d+),\d+ \+(\d+),\d+ @@/g)
      if (patchMatches) {
        const lineNumbers = patchMatches.map(match => {
          const m = match.match(/@@ -(\d+),\d+ \+(\d+),\d+ @@/)
          return m ? parseInt(m[2], 10) : 0
        }).filter(n => n > 0)

        if (lineNumbers.length > 0) {
          startLine = Math.max(1, Math.min(...lineNumbers) - 10)
          endLine = Math.min(lines.length, Math.max(...lineNumbers) + 50)
        }
      }

      const relevantLines = lines.slice(startLine - 1, endLine)
      const numberedLines = relevantLines.map((line, index) => {
        const actualLineNumber = startLine + index
        return `${actualLineNumber.toString().padStart(6, ' ')}|${line}`
      }).join('\n')

      prompt += `\n\n## Code to Review\n\n**File:** ${inputs.filename}\n\n**Relevant file content with line numbers (lines ${startLine}-${endLine}):**\n\`\`\`\n${numberedLines}\n\`\`\`\n\n**Diff of changes:**\n\`\`\`diff\n${inputs.patches}\n\`\`\`\n\nUse the line numbers shown in the numbered file content above (e.g., \`   85|\`) to report exact locations.`
    }

    return prompt
  }

  renderComment = (inputs: Inputs): string => {
    let prompt = this.comment

    if (inputs.commentChain) {
      prompt += `\n\n## Comment Chain\n\`\`\`\n${inputs.commentChain}\n\`\`\``
    }
    if (inputs.diff) {
      prompt += `\n\n## Diff Being Discussed\n\`\`\`diff\n${inputs.diff}\n\`\`\``
    }

    prompt += `\n\nProvide a direct answer. No follow-up questions, no "let me know if...", no conversation starters.`

    return prompt
  }
}

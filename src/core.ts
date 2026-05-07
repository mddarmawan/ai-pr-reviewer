// Shared review core — used by both GitHub Action and backend server

import {ChatGPTAPI} from 'chatgpt'
import pLimit from 'p-limit'

export const COMMENT_TAG = '<!-- This is an auto-generated comment by EventX AI Reviewer -->'

export interface ReviewConfig {
  owner: string; repo: string; pullNumber: number
  openaiApiKey: string; openaiBaseUrl: string
  heavyModel: string; lightModel: string
  octokit: any // Octokit instance (already authenticated)
}

export interface ReviewIssue {
  path: string; startLine: number; endLine: number; body: string
}

export function renderNumberedPatch(patch: string): string {
  const output: string[] = []
  let currentLine = 0
  const addedLines: string[] = []
  let preContext: string[] = []
  let postContextCount = 0

  const flushHunk = () => {
    if (addedLines.length > 0) {
      if (preContext.length > 0) output.push(...preContext)
      output.push(...addedLines)
      preContext = []
    }
    addedLines.length = 0
    postContextCount = 0
  }

  for (const line of patch.split('\n')) {
    const m = line.match(/^@@ -(\d+),\d+ \+(\d+),\d+ @@/)
    if (m) {
      flushHunk()
      currentLine = parseInt(m[2]) - 1
      output.push(line)
      continue
    }
    if (line.startsWith('-')) continue
    if (line.startsWith('+')) {
      currentLine++
      addedLines.push(`+${String(currentLine).padStart(5)}|${line.substring(1)}`)
      postContextCount = 0
    } else {
      currentLine++
      if (addedLines.length > 0 && postContextCount < 2) {
        addedLines.push(` ~${String(currentLine).padStart(5)}|${line}`)
        postContextCount++
      } else if (addedLines.length === 0) {
        preContext = [` ~${String(currentLine).padStart(5)}|${line}`]
      }
    }
  }
  flushHunk()
  return output.join('\n')
}

export function buildReviewPrompt(filename: string, numberedPatch: string): string {
  return `You are an expert code reviewer. Find and report actual issues in the code changes.

## What to Report

![High](https://img.shields.io/badge/High-red) — must fix: hardcoded secrets, auth bypass, SQL injection/XSS, sensitive data exposure, crypto weaknesses, missing rate limiting
![Medium](https://img.shields.io/badge/Medium-orange) — should fix: weak validation, missing error handling, info disclosure, logic errors, N+1 queries, missing pagination
![Low](https://img.shields.io/badge/Low-blue) — nice to fix: misleading names, missing guards, inefficient patterns, grammar errors and typos in user-facing strings (UI copy, error messages, meta tags, alt text)

## What NOT to Report
Code formatting, style, naming conventions, already-correct code, properly implemented security measures, typos in code comments or debug logs

## Response Format

Report each issue using EXACTLY this format:
\`\`\`
### Brief descriptive title

![High](https://img.shields.io/badge/High-red)

<!-- DESCRIPTION START -->
Clear explanation of the issue and impact.
<!-- DESCRIPTION END -->

<!-- LOCATIONS START
filename#LstartLine-LendLine
LOCATIONS END -->
\`\`\`

Separate issues with \`---\`. If no issues, respond with exactly: NO_ISSUES_FOUND

## Code to Review

**File:** ${filename}

\`\`\`
${numberedPatch}
\`\`\`

- Lines with \`+\` prefix: NEW/CHANGED — review these.
- Lines with \`~\` prefix: pre-existing context — DO NOT flag.
- Use the line numbers shown.`
}

export function parseIssues(response: string, filename: string): Issue[] {
  const issues: Issue[] = []
  const blocks = response.split(/^---$/m).filter(b => b.trim())

  for (const block of blocks) {
    const lines = block.split('\n')
    let title = ''
    let severity = 'Low'

    for (const line of lines) {
      const t = line.trim()
      if (t.startsWith('### ') && !title) { title = t.replace(/^### /, ''); continue }
      if (t.includes('High')) severity = 'High'
      else if (t.includes('Medium')) severity = 'Medium'
      else if (t.includes('Low')) severity = 'Low'
    }

    if (!title) continue

    let desc = ''
    let inDesc = false
    for (const line of lines) {
      if (line.includes('<!-- DESCRIPTION START -->')) { inDesc = true; continue }
      if (line.includes('<!-- DESCRIPTION END -->')) { inDesc = false; continue }
      if (inDesc) desc += line + '\n'
    }
    if (!desc.trim()) continue

    let startLine = 0; let endLine = 0
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('<!-- LOCATIONS START')) {
        const next = lines[i + 1]
        if (next) {
          const m = next.match(/#L(\d+)(?:-L(\d+))?/)
          if (m) { startLine = parseInt(m[1]); endLine = m[2] ? parseInt(m[2]) : startLine }
        }
        break
      }
    }

    if (startLine === 0) continue

    const badgeColor = severity === 'High' ? 'red' : severity === 'Medium' ? 'orange' : 'blue'
    issues.push({
      path: filename,
      startLine,
      endLine,
      body: `### ${title}\n\n![${severity}](https://img.shields.io/badge/${severity}-${badgeColor})\n\n<!-- DESCRIPTION START -->\n${desc.trim()}\n<!-- DESCRIPTION END -->\n\n<!-- LOCATIONS START\n${filename}#L${startLine}-L${endLine}\nLOCATIONS END -->\n\n${COMMENT_TAG}`
    })
  }

  return issues
}

export interface Issue {
  path: string; startLine: number; endLine: number; body: string
}

export async function runReview(config: ReviewConfig): Promise<number> {
  const {octokit} = config
  const concurrency = pLimit(3)

  const heavyApi = new ChatGPTAPI({
    apiBaseUrl: config.openaiBaseUrl,
    apiKey: config.openaiApiKey,
    completionParams: {model: config.heavyModel, temperature: 0},
    maxModelTokens: 128000,
    maxResponseTokens: 32000
  })

  const chat = async (message: string): Promise<string> => {
    const res = await heavyApi.sendMessage(message, {timeoutMs: 180000})
    return res.text
  }

  // Get PR diff
  const {data: pr} = await octokit.pulls.get({
    owner: config.owner, repo: config.repo, pull_number: config.pullNumber
  })

  const {data: files} = await octokit.pulls.listFiles({
    owner: config.owner, repo: config.repo, pull_number: config.pullNumber
  })

  if (!files || files.length === 0) return 0

  const filteredFiles = files.filter((f: any) => {
    const name = f.filename
    return !name.match(/\.(lock|json|yml|yaml|toml|md|svg|png|jpg|gif|ico|woff2?|min\.js|sum)$/)
      && !name.includes('node_modules/') && !name.includes('dist/') && !name.includes('.github/')
  })

  const reviewBuffer: ReviewIssue[] = []

  for (const file of filteredFiles) {
    await concurrency(async () => {
      if (!file.patch) return
      const numberedPatch = renderNumberedPatch(file.patch)
      if (!numberedPatch.trim()) return

      const prompt = buildReviewPrompt(file.filename, numberedPatch)
      const response = await chat(prompt)
      if (response === 'NO_ISSUES_FOUND' || response.trim() === '') return

      const issues = parseIssues(response, file.filename)
      for (const issue of issues) reviewBuffer.push(issue)
    })
  }

  return postReview(config, reviewBuffer)
}

export async function autoResolveThreads(
  octokit: any, owner: string, repo: string, pullNumber: number, changedFiles: string[]
): Promise<number> {
  const query = `query($owner:String!,$repo:String!,$pr:Int!,$first:Int!){
    repository(owner:$owner,name:$repo){
      pullRequest(number:$pr){
        reviewThreads(first:$first){edges{node{
          id isResolved path line
          comments(first:1){nodes{body}}
        }}}
      }
    }
  }`

  const resp: any = await octokit.request('POST /graphql', {
    query, variables: {owner, repo, pr: pullNumber, first: 100}
  })

  let resolved = 0
  const edges = resp.data?.data?.repository?.pullRequest?.reviewThreads?.edges || []
  for (const edge of edges) {
    const t = edge.node
    if (t.isResolved) continue
    if (!(t.comments.nodes[0]?.body || '').includes(COMMENT_TAG)) continue
    if (!changedFiles.includes(t.path)) continue

    const r: any = await octokit.request('POST /graphql', {
      query: `mutation($id:ID!){resolveReviewThread(input:{threadId:$id}){thread{isResolved}}}`,
      variables: {id: t.id}
    })
    if (r.data?.data?.resolveReviewThread?.thread?.isResolved) resolved++
  }
  return resolved
}

export async function postReview(config: ReviewConfig, issues: ReviewIssue[]): Promise<number> {
  const {octokit} = config

  // Dedup
  const {data: existing} = await octokit.pulls.listReviewComments({
    owner: config.owner, repo: config.repo, pull_number: config.pullNumber, per_page: 100
  })
  const newIssues = issues.filter(issue => {
    const dup = existing.some((c: any) =>
      c.path === issue.path && c.body.includes(COMMENT_TAG) &&
      c.line != null && Math.abs((c.line || 0) - issue.endLine) <= 3
    )
    if (dup) console.log(`Skipping duplicate: ${issue.path}:${issue.startLine}-${issue.endLine}`)
    return !dup
  })

  if (newIssues.length === 0) {
    await octokit.issues.createComment({
      owner: config.owner, repo: config.repo,
      issue_number: config.pullNumber,
      body: `✅ Reviewed your changes and found no new issues!\n\n${COMMENT_TAG}`
    })
    return 0
  }

  await octokit.pulls.createReview({
    owner: config.owner, repo: config.repo,
    pull_number: config.pullNumber,
    event: 'COMMENT',
    comments: newIssues.map(c => ({
      path: c.path, body: c.body, line: c.endLine, side: 'RIGHT' as const,
      ...(c.startLine !== c.endLine ? {start_line: c.startLine, start_side: 'RIGHT' as const} : {})
    }))
  })

  return newIssues.length
}

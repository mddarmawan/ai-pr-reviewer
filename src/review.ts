import {error, info, warning} from '@actions/core'
// eslint-disable-next-line camelcase
import {context as github_context} from '@actions/github'
import pLimit from 'p-limit'
import {type Bot} from './bot'
import {
  Commenter,
  COMMENT_REPLY_TAG,
  RAW_SUMMARY_END_TAG,
  RAW_SUMMARY_START_TAG,
  SHORT_SUMMARY_END_TAG,
  SHORT_SUMMARY_START_TAG,
  SUMMARIZE_TAG
} from './commenter'
import {Inputs} from './inputs'
import {octokit} from './octokit'
import {type Options} from './options'
import {type Prompts} from './prompts'
import {getTokenCount} from './tokenizer'

// eslint-disable-next-line camelcase
const context = github_context
const repo = context.repo

const ignoreKeyword = '@coderabbitai: ignore'

export const codeReview = async (
  lightBot: Bot,
  heavyBot: Bot,
  options: Options,
  prompts: Prompts
): Promise<void> => {
  const commenter: Commenter = new Commenter()

  const openaiConcurrencyLimit = pLimit(options.openaiConcurrencyLimit)
  const githubConcurrencyLimit = pLimit(options.githubConcurrencyLimit)

  if (
    context.eventName !== 'pull_request' &&
    context.eventName !== 'pull_request_target'
  ) {
    warning(
      `Skipped: current event is ${context.eventName}, only support pull_request event`
    )
    return
  }
  if (context.payload.pull_request == null) {
    warning('Skipped: context.payload.pull_request is null')
    return
  }

  const inputs: Inputs = new Inputs()
  inputs.title = context.payload.pull_request.title
  if (context.payload.pull_request.body != null) {
    inputs.description = commenter.getDescription(
      context.payload.pull_request.body
    )
  }

  // if the description contains ignore_keyword, skip
  if (inputs.description.includes(ignoreKeyword)) {
    info('Skipped: description contains ignore_keyword')
    return
  }

  // as gpt-3.5-turbo isn't paying attention to system message, add to inputs for now
  inputs.systemMessage = options.systemMessage

  // get SUMMARIZE_TAG message
  const existingSummarizeCmt = await commenter.findCommentWithTag(
    SUMMARIZE_TAG,
    context.payload.pull_request.number
  )
  let existingCommitIdsBlock = ''
  let existingSummarizeCmtBody = ''
  if (existingSummarizeCmt != null) {
    existingSummarizeCmtBody = existingSummarizeCmt.body
    inputs.rawSummary = commenter.getRawSummary(existingSummarizeCmtBody)
    inputs.shortSummary = commenter.getShortSummary(existingSummarizeCmtBody)
    existingCommitIdsBlock = commenter.getReviewedCommitIdsBlock(
      existingSummarizeCmtBody
    )
  }

  const allCommitIds = await commenter.getAllCommitIds()
  // find highest reviewed commit id
  let highestReviewedCommitId = ''
  if (existingCommitIdsBlock !== '') {
    highestReviewedCommitId = commenter.getHighestReviewedCommitId(
      allCommitIds,
      commenter.getReviewedCommitIds(existingCommitIdsBlock)
    )
  }

  if (
    highestReviewedCommitId === '' ||
    highestReviewedCommitId === context.payload.pull_request.head.sha
  ) {
    info(
      `Will review from the base commit: ${
        context.payload.pull_request.base.sha as string
      }`
    )
    highestReviewedCommitId = context.payload.pull_request.base.sha
  } else {
    info(`Will review from commit: ${highestReviewedCommitId}`)
  }

  // Fetch the diff between the highest reviewed commit and the latest commit of the PR branch
  const incrementalDiff = await octokit.repos.compareCommits({
    owner: repo.owner,
    repo: repo.repo,
    base: highestReviewedCommitId,
    head: context.payload.pull_request.head.sha
  })

  // Fetch the diff between the target branch's base commit and the latest commit of the PR branch
  const targetBranchDiff = await octokit.repos.compareCommits({
    owner: repo.owner,
    repo: repo.repo,
    base: context.payload.pull_request.base.sha,
    head: context.payload.pull_request.head.sha
  })

  const incrementalFiles = incrementalDiff.data.files
  const targetBranchFiles = targetBranchDiff.data.files

  if (incrementalFiles == null || targetBranchFiles == null) {
    warning('Skipped: files data is missing')
    return
  }

  // MODIFIED: Always review full PR diff instead of incremental changes
  const files = targetBranchFiles

  if (files.length === 0) {
    warning('Skipped: files is null')
    return
  }

  // skip files if they are filtered out
  const filterSelectedFiles = []
  const filterIgnoredFiles = []
  info(`Processing ${files.length} files from diff`)
  for (const file of files) {
    info(`Checking file: ${file.filename}`)
    if (!options.checkPath(file.filename)) {
      info(`skip for excluded path: ${file.filename}`)
      filterIgnoredFiles.push(file)
    } else {
      info(`selected file: ${file.filename}`)
      filterSelectedFiles.push(file)
    }
  }

  if (filterSelectedFiles.length === 0) {
    warning('Skipped: filterSelectedFiles is null')
    return
  }

  const commits = targetBranchDiff.data.commits // MODIFIED: Use full PR diff

  if (commits.length === 0) {
    warning('Skipped: commits is null')
    return
  }

  // find hunks to review
  const filteredFiles: Array<
    [string, string, string, Array<[number, number, string]>] | null
  > = await Promise.all(
    filterSelectedFiles.map(file =>
      githubConcurrencyLimit(async () => {
        // retrieve file contents
        let fileContent = ''
        if (context.payload.pull_request == null) {
          warning('Skipped: context.payload.pull_request is null')
          return null
        }
        try {
          const contents = await octokit.repos.getContent({
            owner: repo.owner,
            repo: repo.repo,
            path: file.filename,
            ref: context.payload.pull_request.base.sha
          })
          if (contents.data != null) {
            if (!Array.isArray(contents.data)) {
              if (
                contents.data.type === 'file' &&
                contents.data.content != null
              ) {
                fileContent = Buffer.from(
                  contents.data.content,
                  'base64'
                ).toString()
              }
            }
          }
        } catch (e: any) {
          warning(
            `Failed to get file contents: ${
              e as string
            }. This is OK if it's a new file.`
          )
        }

        let fileDiff = ''
        if (file.patch != null) {
          fileDiff = file.patch
        }

        const patches: Array<[number, number, string]> = []
        info(`Processing patches for ${file.filename}`)
        const splitPatches = splitPatch(file.patch)
        info(`Split into ${splitPatches.length} patches for ${file.filename}`)

        for (const patch of splitPatches) {
          const patchLines = patchStartEndLine(patch)
          if (patchLines == null) {
            info(`Skipping patch for ${file.filename} - no valid lines`)
            continue
          }
          const hunks = parsePatch(patch)
          if (hunks == null) {
            info(`Skipping patch for ${file.filename} - no valid hunks`)
            continue
          }
          const hunksStr = `
---new_hunk---
\`\`\`
${hunks.newHunk}
\`\`\`

---old_hunk---
\`\`\`
${hunks.oldHunk}
\`\`\`
`
          patches.push([
            patchLines.newHunk.startLine,
            patchLines.newHunk.endLine,
            hunksStr
          ])
          info(`Added patch for ${file.filename}: lines ${patchLines.newHunk.startLine}-${patchLines.newHunk.endLine}`)
        }
        if (patches.length > 0) {
          info(`File ${file.filename}: Generated ${patches.length} patches`)
          return [file.filename, fileContent, fileDiff, patches] as [
            string,
            string,
            string,
            Array<[number, number, string]>
          ]
        } else {
          info(`File ${file.filename}: No patches generated, skipping file`)
          return null
        }
      })
    )
  )

  // Filter out any null results
  const filesAndChanges = filteredFiles.filter(file => file !== null) as Array<
    [string, string, string, Array<[number, number, string]>]
  >

  info(`Total files processed: ${filteredFiles.length}, Files with patches: ${filesAndChanges.length}`)
  for (const [filename, , , patches] of filesAndChanges) {
    info(`File ${filename}: ${patches.length} patches`)
  }

  if (filesAndChanges.length === 0) {
    error('Skipped: no files to review')
    return
  }

  let statusMsg = `<details>
<summary>Commits</summary>
Files that changed in the full PR diff from base to head ${
    context.payload.pull_request.head.sha
  } commits.
</details>
${
  filesAndChanges.length > 0
    ? `
<details>
<summary>Files selected (${filesAndChanges.length})</summary>

* ${filesAndChanges
        .map(([filename, , , patches]) => `${filename} (${patches.length})`)
        .join('\n* ')}
</details>
`
    : ''
}
${
  filterIgnoredFiles.length > 0
    ? `
<details>
<summary>Files ignored due to filter (${filterIgnoredFiles.length})</summary>

* ${filterIgnoredFiles.map(file => file.filename).join('\n* ')}

</details>
`
    : ''
}
`

  // update the existing comment with in progress status
  const inProgressSummarizeCmt = commenter.addInProgressStatus(
    existingSummarizeCmtBody,
    statusMsg
  )

  // add in progress status to the summarize comment
  await commenter.comment(`${inProgressSummarizeCmt}`, SUMMARIZE_TAG, 'replace')

  const summariesFailed: string[] = []

  const doSummary = async (
    filename: string,
    fileContent: string,
    fileDiff: string
  ): Promise<[string, string, boolean] | null> => {
    info(`summarize: ${filename}`)
    const ins = inputs.clone()
    if (fileDiff.length === 0) {
      warning(`summarize: file_diff is empty, skip ${filename}`)
      summariesFailed.push(`${filename} (empty diff)`)
      return null
    }

    ins.filename = filename
    ins.fileDiff = fileDiff

    // render prompt based on inputs so far
    const summarizePrompt = prompts.renderSummarizeFileDiff(ins)
    const tokens = getTokenCount(summarizePrompt)
    if (tokens > options.lightTokenLimits.requestTokens) {
      info(`summarize: diff tokens exceeds limit, skip ${filename}`)
      summariesFailed.push(`${filename} (diff tokens exceeds limit)`)
      return null
    }    try {
      const [summarizeResp] = await lightBot.chat(summarizePrompt, {})

      if (summarizeResp === '') {
        info('summarize: nothing obtained from openai')
        summariesFailed.push(`${filename} (nothing obtained from openai)`)
        return null
      } else {
        if (options.reviewSimpleChanges === false) {
          // parse the comment to look for triage classification
          // Format is : [TRIAGE]: <NEEDS_REVIEW or APPROVED>
          // if the change needs review return true, else false
          const triageRegex = /\[TRIAGE\]:\s*(NEEDS_REVIEW|APPROVED)/
          const triageMatch = summarizeResp.match(triageRegex)

          if (triageMatch != null) {
            const triage = triageMatch[1]
            const needsReview = triage === 'NEEDS_REVIEW'

            // remove this line from the comment
            const summary = summarizeResp.replace(triageRegex, '').trim()
            info(`filename: ${filename}, triage: ${triage}`)
            return [filename, summary, needsReview]
          }
        }
        return [filename, summarizeResp, true]
      }
    } catch (e: any) {
      warning(`summarize: error from openai: ${e as string}`)
      summariesFailed.push(`${filename} (error from openai: ${e as string})})`)
      return null
    }
  }

  const summaryPromises = []
  const skippedFiles = []
  for (const [filename, fileContent, fileDiff] of filesAndChanges) {
    if (options.maxFiles <= 0 || summaryPromises.length < options.maxFiles) {
      summaryPromises.push(
        openaiConcurrencyLimit(
          async () => await doSummary(filename, fileContent, fileDiff)
        )
      )
    } else {
      skippedFiles.push(filename)
    }
  }

  const summaries = (await Promise.all(summaryPromises)).filter(
    summary => summary !== null
  ) as Array<[string, string, boolean]>

  if (summaries.length > 0) {
    const batchSize = 10
    // join summaries into one in the batches of batchSize
    // and ask the bot to summarize the summaries
    for (let i = 0; i < summaries.length; i += batchSize) {
      const summariesBatch = summaries.slice(i, i + batchSize)
      for (const [filename, summary] of summariesBatch) {
        inputs.rawSummary += `---
${filename}: ${summary}
`
      }
      // ask chatgpt to summarize the summaries
      const [summarizeResp] = await lightBot.chat(
        prompts.summarize,
        {}
      )
      if (summarizeResp === '') {
        warning('summarize: nothing obtained from openai')
      } else {
        inputs.rawSummary = summarizeResp
      }
    }
  }

  // final summary
  const [summarizeFinalResponse] = await lightBot.chat(
    prompts.summarize,
    {}
  )
  if (summarizeFinalResponse === '') {
    info('summarize: nothing obtained from openai')
  }

  if (options.disableReleaseNotes === false) {
    // final release notes
    const [releaseNotesResponse] = await lightBot.chat(
      prompts.summarizeReleaseNotes,
      {}
    )
    if (releaseNotesResponse === '') {
      info('release notes: nothing obtained from openai')
    } else {
      let message = '### Summary by CodeRabbit\n\n'
      message += releaseNotesResponse
      try {
        await commenter.updateDescription(
          context.payload.pull_request.number,
          message
        )
      } catch (e: any) {
        warning(`release notes: error from github: ${e.message as string}`)
      }
    }
  }

  // generate a short summary as well
  const [summarizeShortResponse] = await lightBot.chat(
    prompts.summarize,
    {}
  )
  inputs.shortSummary = summarizeShortResponse

  let summarizeComment = `${summarizeFinalResponse}
${RAW_SUMMARY_START_TAG}
${inputs.rawSummary}
${RAW_SUMMARY_END_TAG}
${SHORT_SUMMARY_START_TAG}
${inputs.shortSummary}
${SHORT_SUMMARY_END_TAG}

---

<details>
<summary>Uplevel your code reviews with CodeRabbit Pro</summary>

### CodeRabbit Pro

If you like this project, please support us by purchasing the [Pro version](https://coderabbit.ai). The Pro version has advanced context, superior noise reduction and several proprietary improvements compared to the open source version. Moreover, CodeRabbit Pro is free for open source projects.

</details>
`

  statusMsg += `
${
  skippedFiles.length > 0
    ? `
<details>
<summary>Files not processed due to max files limit (${
        skippedFiles.length
      })</summary>

* ${skippedFiles.join('\n* ')}

</details>
`
    : ''
}
${
  summariesFailed.length > 0
    ? `
<details>
<summary>Files not summarized due to errors (${
        summariesFailed.length
      })</summary>

* ${summariesFailed.join('\n* ')}

</details>
`
    : ''
}
`

  if (!options.disableReview) {
    const filesAndChangesReview = filesAndChanges.filter(([filename]) => {
      const needsReview =
        summaries.find(
          ([summaryFilename]) => summaryFilename === filename
        )?.[2] ?? true
      return needsReview
    })

    const reviewsSkipped = filesAndChanges
      .filter(
        ([filename]) =>
          !filesAndChangesReview.some(
            ([reviewFilename]) => reviewFilename === filename
          )
      )
      .map(([filename]) => filename)

    // failed reviews array
    const reviewsFailed: string[] = []
    let lgtmCount = 0
    let reviewCount = 0
    const doReview = async (
      filename: string,
      fileContent: string,
      patches: Array<[number, number, string]>
    ): Promise<void> => {
      info(`reviewing ${filename}`)
      // make a copy of inputs
      const ins: Inputs = inputs.clone()
      ins.filename = filename
      ins.fileContent = fileContent

      // calculate tokens based on inputs so far
      let tokens = getTokenCount(prompts.renderReviewFileDiff(ins))
      // loop to calculate total patch tokens
      let patchesToPack = 0
      for (const [, , patch] of patches) {
        const patchTokens = getTokenCount(patch)
        if (tokens + patchTokens > options.heavyTokenLimits.requestTokens) {
          info(
            `only packing ${patchesToPack} / ${patches.length} patches, tokens: ${tokens} / ${options.heavyTokenLimits.requestTokens}`
          )
          break
        }
        tokens += patchTokens
        patchesToPack += 1
      }

      let patchesPacked = 0
      for (const [startLine, endLine, patch] of patches) {
        if (context.payload.pull_request == null) {
          warning('No pull request found, skipping.')
          continue
        }
        // see if we can pack more patches into this request
        if (patchesPacked >= patchesToPack) {
          info(
            `unable to pack more patches into this request, packed: ${patchesPacked}, total patches: ${patches.length}, skipping.`
          )
          if (options.debug) {
            info(`prompt so far: ${prompts.renderReviewFileDiff(ins)}`)
          }
          break
        }
        patchesPacked += 1

        let commentChain = ''
        try {
          const allChains = await commenter.getCommentChainsWithinRange(
            context.payload.pull_request.number,
            filename,
            startLine,
            endLine,
            COMMENT_REPLY_TAG
          )

          if (allChains.length > 0) {
            info(`Found comment chains: ${allChains} for ${filename}`)
            commentChain = allChains
          }
        } catch (e: any) {
          warning(
            `Failed to get comments: ${e as string}, skipping. backtrace: ${
              e.stack as string
            }`
          )
        }
        // try packing comment_chain into this request
        const commentChainTokens = getTokenCount(commentChain)
        if (
          tokens + commentChainTokens >
          options.heavyTokenLimits.requestTokens
        ) {
          commentChain = ''
        } else {
          tokens += commentChainTokens
        }

        ins.patches += `
${patch}
`
        if (commentChain !== '') {
          ins.patches += `
---comment_chains---
\`\`\`
${commentChain}
\`\`\`
`
        }

        ins.patches += `
---end_change_section---
`
      }

      if (patchesPacked > 0) {
        // perform review - use heavy model for better issue detection and line targeting
        try {
          const [response] = await heavyBot.chat(
            prompts.renderReviewFileDiff(ins),
            {}
          )
          if (response === '') {
            info('review: nothing obtained from openai')
            reviewsFailed.push(`${filename} (no response)`)
            return
          }
          // parse review
          const reviews = parseReview(response, patches, options.debug)

          // Use reviews directly - single stage approach
          const refinedReviews = reviews

          for (const review of refinedReviews) {
            // check for LGTM
            if (
              !options.reviewCommentLGTM &&
              (review.comment.includes('LGTM') ||
                review.comment.includes('looks good to me'))
            ) {
              lgtmCount += 1
              continue
            }
            if (context.payload.pull_request == null) {
              warning('No pull request found, skipping.')
              continue
            }

            try {
              reviewCount += 1
              await commenter.bufferReviewComment(
                filename,
                review.startLine,
                review.endLine,
                `${review.comment}`
              )
            } catch (e: any) {
              reviewsFailed.push(`${filename} comment failed (${e as string})`)
            }
          }
        } catch (e: any) {
          warning(
            `Failed to review: ${e as string}, skipping. backtrace: ${
              e.stack as string
            }`
          )
          reviewsFailed.push(`${filename} (${e as string})`)
        }
      } else {
        reviewsSkipped.push(`${filename} (diff too large)`)
      }
    }

    const reviewPromises = []
    for (const [filename, fileContent, , patches] of filesAndChangesReview) {
      if (options.maxFiles <= 0 || reviewPromises.length < options.maxFiles) {
        reviewPromises.push(
          openaiConcurrencyLimit(async () => {
            await doReview(filename, fileContent, patches)
          })
        )
      } else {
        skippedFiles.push(filename)
      }
    }

    await Promise.all(reviewPromises)

    statusMsg += `
${
  reviewsFailed.length > 0
    ? `<details>
<summary>Files not reviewed due to errors (${reviewsFailed.length})</summary>

* ${reviewsFailed.join('\n* ')}

</details>
`
    : ''
}
${
  reviewsSkipped.length > 0
    ? `<details>
<summary>Files skipped from review due to trivial changes (${
        reviewsSkipped.length
      })</summary>

* ${reviewsSkipped.join('\n* ')}

</details>
`
    : ''
}
<details>
<summary>Review comments generated (${reviewCount + lgtmCount})</summary>

* Review: ${reviewCount}
* LGTM: ${lgtmCount}

</details>

---

<details>
<summary>Tips</summary>

### Chat with <img src="https://avatars.githubusercontent.com/in/347564?s=41&u=fad245b8b4c7254fe63dd4dcd4d662ace122757e&v=4" alt="Image description" width="20" height="20">  CodeRabbit Bot (\`@coderabbitai\`)
- Reply on review comments left by this bot to ask follow-up questions. A review comment is a comment on a diff or a file.
- Invite the bot into a review comment chain by tagging \`@coderabbitai\` in a reply.

### Code suggestions
- The bot may make code suggestions, but please review them carefully before committing since the line number ranges may be misaligned.
- You can edit the comment made by the bot and manually tweak the suggestion if it is slightly off.

### Pausing incremental reviews
- Add \`@coderabbitai: ignore\` anywhere in the PR description to pause further reviews from the bot.

</details>
`
    // add existing_comment_ids_block with latest head sha
    summarizeComment += `\n${commenter.addReviewedCommitId(
      existingCommitIdsBlock,
      context.payload.pull_request.head.sha
    )}`

    // post the review
    await commenter.submitReview(
      context.payload.pull_request.number,
      commits[commits.length - 1].sha,
      statusMsg
    )
  }

  // post the final summary comment
  await commenter.comment(`${summarizeComment}`, SUMMARIZE_TAG, 'replace')
}

const splitPatch = (patch: string | null | undefined): string[] => {
  if (patch == null) {
    return []
  }

  const pattern = /(^@@ -(\d+),(\d+) \+(\d+),(\d+) @@).*$/gm

  const result: string[] = []
  let last = -1
  let match: RegExpExecArray | null
  while ((match = pattern.exec(patch)) !== null) {
    if (last === -1) {
      last = match.index
    } else {
      result.push(patch.substring(last, match.index))
      last = match.index
    }
  }
  if (last !== -1) {
    result.push(patch.substring(last))
  }
  return result
}

const patchStartEndLine = (
  patch: string
): {
  oldHunk: {startLine: number; endLine: number}
  newHunk: {startLine: number; endLine: number}
} | null => {
  const pattern = /(^@@ -(\d+),(\d+) \+(\d+),(\d+) @@)/gm
  const match = pattern.exec(patch)
  if (match != null) {
    const oldBegin = parseInt(match[2])
    const oldDiff = parseInt(match[3])
    const newBegin = parseInt(match[4])
    const newDiff = parseInt(match[5])
    return {
      oldHunk: {
        startLine: oldBegin,
        endLine: oldBegin + oldDiff - 1
      },
      newHunk: {
        startLine: newBegin,
        endLine: newBegin + newDiff - 1
      }
    }
  } else {
    return null
  }
}

const parsePatch = (
  patch: string
): {oldHunk: string; newHunk: string} | null => {
  const hunkInfo = patchStartEndLine(patch)
  if (hunkInfo == null) {
    return null
  }

  const oldHunkLines: string[] = []
  const newHunkLines: string[] = []

  let newLine = hunkInfo.newHunk.startLine

  const lines = patch.split('\n').slice(1) // Skip the @@ line

  // Remove the last line if it's empty
  if (lines[lines.length - 1] === '') {
    lines.pop()
  }

  // Skip annotations for the first 3 and last 3 lines
  const skipStart = 3
  const skipEnd = 3

  let currentLine = 0

  const removalOnly = !lines.some(line => line.startsWith('+'))

  for (const line of lines) {
    currentLine++
    if (line.startsWith('-')) {
      oldHunkLines.push(`${line.substring(1)}`)
    } else if (line.startsWith('+')) {
      newHunkLines.push(line.substring(1))
      newLine++
    } else {
      // context line
      oldHunkLines.push(`${line}`)
      if (
        removalOnly ||
        (currentLine > skipStart && currentLine <= lines.length - skipEnd)
      ) {
        newHunkLines.push(line)
      } else {
        newHunkLines.push(`${line}`)
      }
      newLine++
    }
  }

  return {
    oldHunk: oldHunkLines.join('\n'),
    newHunk: newHunkLines.join('\n')
  }
}

interface Review {
  startLine: number
  endLine: number
  comment: string
}

function parseStructuredReview(
  response: string,
  patches: Array<[number, number, string]>,
  debug = false
): Review[] {
  const reviews: Review[] = []

  // Split response by ### headers to find individual issues
  const issueBlocks = response.split(/^### /m).filter(block => block.trim())

  // Try to match issues to patches by analyzing content
  for (const block of issueBlocks) {
    const lines = block.split('\n')

    // Extract title (first line)
    const title = lines[0].trim()
    if (!title) continue

    // Find description between <!-- DESCRIPTION START --> and <!-- DESCRIPTION END -->
    let description = ''
    let inDescription = false

    for (const line of lines) {
      if (line.includes('<!-- DESCRIPTION START -->')) {
        inDescription = true
        continue
      }
      if (line.includes('<!-- DESCRIPTION END -->')) {
        inDescription = false
        continue
      }

      if (inDescription) {
        description += line + '\n'
      }
    }

    // If description is empty, skip this issue
    if (description.trim() === '') {
      if (debug) {
        info(`Skipping issue with empty description: ${title}`)
      }
      continue
    }

    // Extract line numbers from LOCATIONS block
    let extractedStart: number | null = null
    let extractedEnd: number | null = null

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]
      if (line.includes('<!-- LOCATIONS START')) {
        const nextLine = lines[i + 1]
        if (debug) {
          info(`Looking for line numbers in: "${nextLine}"`)
        }
        if (nextLine && nextLine.includes('#')) {
          const locationMatch = nextLine.match(/#L(\d+)-L(\d+)/)
          if (locationMatch) {
            extractedStart = parseInt(locationMatch[1], 10)
            extractedEnd = parseInt(locationMatch[2], 10)
            if (debug) {
              info(`Extracted line numbers: ${extractedStart}-${extractedEnd}`)
            }
          } else if (debug) {
            info(`No match found for line: "${nextLine}"`)
          }
        }
        break
      }
    }

    // Use the AI's line numbers directly - let the AI do all the work
    let [startLine, endLine] = [patches[0][0], patches[0][1]]

    // If AI provided specific line numbers, use them (but validate they're within patch bounds)
    if (extractedStart != null && extractedEnd != null) {
      if (debug) {
        info(`AI provided line numbers: ${extractedStart}-${extractedEnd}`)
        info(`Available patches: ${patches.map(([s, e]) => `${s}-${e}`).join(', ')}`)
      }
      // Find which patch contains these line numbers
      for (const [pStart, pEnd] of patches) {
        if (extractedStart >= pStart && extractedEnd <= pEnd) {
          startLine = extractedStart
          endLine = extractedEnd
          if (debug) {
            info(`Using AI line numbers: ${startLine}-${endLine} (within patch ${pStart}-${pEnd})`)
          }
          break
        }
      }
      if (debug && startLine === patches[0][0]) {
        info(`Line numbers ${extractedStart}-${extractedEnd} not found in any patch, using patch bounds`)
      }
    }

    // Create the comment with the determined line numbers
    const comment = `### ${title}

<!-- DESCRIPTION START -->
${description.trim()}
<!-- DESCRIPTION END -->

<!-- LOCATIONS START
L${startLine}-L${endLine}
LOCATIONS END -->`

    reviews.push({
      startLine,
      endLine,
      comment
    })

    if (debug) {
      info(`Parsed structured review: ${title} at lines ${startLine}-${endLine}`)
      info(`Issue text: ${(title + ' ' + description).toLowerCase()}`)
      info(`Using patch bounds: ${patches[0][0]}-${patches[0][1]}`)
    }
  }

  return reviews
}

// Simple fallback - let AI handle all detection and line targeting
function choosePreciseLines(
  issueTextLower: string,
  patchContent: string,
  patchStartLine: number
): [number, number] | null {
  // The AI should provide precise line numbers in its response
  // This is just a fallback that returns null to use patch bounds
  return null
}

async function refineLineTargeting(
  bot: Bot,
  review: Review,
  patchContent: string,
  debug = false
): Promise<Review> {
  try {
    // Extract the issue type and description from the comment
    const issueMatch = review.comment.match(/###\s*([^:]+):\s*(.+)/)
    const issueCategory = issueMatch ? issueMatch[1].trim() : 'Code Review'
    const issueDescription = issueMatch ? issueMatch[2].trim() : review.comment

    // Enhanced generic prompt for any type of code review
    const prompt = `You are a code reviewer analyzing a git patch. Your task is to identify the EXACT line number(s) where the specific issue mentioned in the review comment occurs.

PATCH CONTENT:
\`\`\`
${patchContent}
\`\`\`

REVIEW COMMENT:
Category: ${issueCategory}
Description: ${issueDescription}

INSTRUCTIONS:
1. Analyze the patch content to find the specific line(s) where the issue described in the review comment occurs.
2. Look for code that directly relates to the issue mentioned in the review comment.
3. Consider the context of the issue:
   - If it's about a specific function or method, find where that function is defined or called
   - If it's about a variable or parameter, find where that variable is declared or used
   - If it's about code structure or logic, find the relevant control flow or logic blocks
   - If it's about performance, find the potentially inefficient operations
   - If it's about style or formatting, find the lines with style issues
   - If it's about error handling, find where errors might occur or where handling is missing
4. Return ONLY the line number(s) where the issue is most relevant.
5. If multiple consecutive lines contain the issue, return the range as "start,end".
6. Be precise and specific - target only the lines that directly relate to the issue.

RESPONSE FORMAT:
- For a single line: Just the number (e.g., "42")
- For multiple consecutive lines: "start,end" (e.g., "42,45")
- Do not include any explanation or other text.

Example responses:
"42"
"42,45"

Now, identify the line number(s) for: ${issueCategory}: ${issueDescription}`

    const [response] = await bot.chat(prompt, {})

    if (debug) {
      info(`AI response for line targeting: ${response}`)
    }

    // Try to parse the response to extract line numbers
    const refinedReview = parseLineResponse(response, review, patchContent, debug)

    if (refinedReview) {
      return refinedReview
    }

    // If parsing failed, try a more specific context-aware prompt
    const contextPrompt = `Based on this review comment: "${issueCategory}: ${issueDescription}"

Find the MOST RELEVANT line number in this code patch:

\`\`\`
${patchContent}
\`\`\`

Return only the single most relevant line number as a number.`

    const [contextResponse] = await bot.chat(contextPrompt, {})

    if (debug) {
      info(`Context-aware AI response: ${contextResponse}`)
    }

    const contextReview = parseLineResponse(contextResponse, review, patchContent, debug)

    return contextReview || review
  } catch (error) {
    if (debug) {
      info(`Line refinement error: ${error}, using original range: ${review.startLine}-${review.endLine}`)
    }
    return review
  }
}

// Enhanced helper function to parse line response and validate
function parseLineResponse(
  response: string,
  review: Review,
  patchContent: string,
  debug: boolean
): Review | null {
  if (!response || typeof response !== 'string') return null

  // Clean the response - remove any non-numeric characters except commas and digits
  const cleanResponse = response.replace(/[^\d,]/g, '').trim()
  if (!cleanResponse) return null

  // Split the patch into lines for validation
  const patchLines = patchContent.split('\n')
  const totalLines = patchLines.length

  // Try to parse single line number first
  const singleLineMatch = cleanResponse.match(/^(\d+)$/)
  if (singleLineMatch) {
    const lineNum = parseInt(singleLineMatch[1], 10)

    // Validate the line number
    if (!isNaN(lineNum) &&
        lineNum >= 1 &&
        lineNum <= totalLines &&
        lineNum >= review.startLine &&
        lineNum <= review.endLine) {

      if (debug) {
        info(`Refined to single line: ${review.startLine}-${review.endLine} → ${lineNum}-${lineNum}`)
      }

      return {
        ...review,
        startLine: lineNum,
        endLine: lineNum
      }
    } else if (debug) {
      info(`Line ${lineNum} out of bounds (patch: 1-${totalLines}, review: ${review.startLine}-${review.endLine})`)
    }
  }

  // Try to parse range "start,end"
  const rangeMatch = cleanResponse.match(/^(\d+),(\d+)$/)
  if (rangeMatch) {
    const start = parseInt(rangeMatch[1], 10)
    const end = parseInt(rangeMatch[2], 10)

    // Validate the range
    if (!isNaN(start) && !isNaN(end) &&
        start <= end &&
        start >= 1 &&
        end <= totalLines &&
        start >= review.startLine &&
        end <= review.endLine) {

      if (debug) {
        info(`Refined to range: ${review.startLine}-${review.endLine} → ${start}-${end}`)
      }

      return {
        ...review,
        startLine: start,
        endLine: end
      }
    } else if (debug) {
      info(`Range ${start}-${end} out of bounds (patch: 1-${totalLines}, review: ${review.startLine}-${review.endLine})`)
    }
  }

  if (debug) {
    info(`Failed to parse response: "${response}" (cleaned: "${cleanResponse}")`)
  }

  return null
}

function parseReview(
  response: string,
  patches: Array<[number, number, string]>,
  debug = false
): Review[] {
  const reviews: Review[] = []

  response = sanitizeResponse(response.trim())

  // Check if AI responded with "No issues found" - this means there are actually issues!
  // The AI is being too conservative and not detecting obvious security vulnerabilities
  if (response.toLowerCase().includes('no issues found') ||
      response.toLowerCase().includes('no issues') ||
      response.toLowerCase().includes('looks good') ||
      response.toLowerCase().includes('lgtm')) {
    info('AI responded with "no issues found" - this may indicate the AI is not detecting obvious security vulnerabilities')
    // Don't return empty array - let the AI reviewer show the "no issues found" message
    return []
  }

  // Check if response is in the new structured format
  if (response.includes('### ') && response.includes('<!-- DESCRIPTION START -->')) {
    return parseStructuredReview(response, patches, debug)
  }

  // Fallback to old format parsing
  const lines = response.split('\n')
  const lineNumberRangeRegex = /(?:^|\s)(\d+)-(\d+):\s*$/
  const commentSeparator = '---'

  let currentStartLine: number | null = null
  let currentEndLine: number | null = null
  let currentComment = ''
  function storeReview(): void {
    if (currentStartLine !== null && currentEndLine !== null) {
      // Use the comment as-is from the AI (it should already be in structured format)
      const review: Review = {
        startLine: currentStartLine,
        endLine: currentEndLine,
        comment: currentComment.trim()
      }

      let withinPatch = false
      let bestPatchStartLine = -1
      let bestPatchEndLine = -1
      let maxIntersection = 0

      for (const [startLine, endLine] of patches) {
        const intersectionStart = Math.max(review.startLine, startLine)
        const intersectionEnd = Math.min(review.endLine, endLine)
        const intersectionLength = Math.max(
          0,
          intersectionEnd - intersectionStart + 1
        )

        if (intersectionLength > maxIntersection) {
          maxIntersection = intersectionLength
          bestPatchStartLine = startLine
          bestPatchEndLine = endLine
          withinPatch =
            intersectionLength === review.endLine - review.startLine + 1
        }

        if (withinPatch) break
      }

      if (!withinPatch) {
        if (bestPatchStartLine !== -1 && bestPatchEndLine !== -1) {
          review.comment = `> Note: This review was outside of the patch, so it was mapped to the patch with the greatest overlap. Original lines [${review.startLine}-${review.endLine}]

${review.comment}`
          review.startLine = bestPatchStartLine
          review.endLine = bestPatchEndLine
        } else {
          review.comment = `> Note: This review was outside of the patch, but no patch was found that overlapped with it. Original lines [${review.startLine}-${review.endLine}]

${review.comment}`
          review.startLine = patches[0][0]
          review.endLine = patches[0][1]
        }
      }

      reviews.push(review)

      info(
        `Stored comment for line range ${currentStartLine}-${currentEndLine}: ${currentComment.trim()}`
      )
    }
  }

  function sanitizeCodeBlock(comment: string, codeBlockLabel: string): string {
    const codeBlockStart = `\`\`\`${codeBlockLabel}`
    const codeBlockEnd = '```'
    const lineNumberRegex = /^ *(\d+): /gm

    let codeBlockStartIndex = comment.indexOf(codeBlockStart)

    while (codeBlockStartIndex !== -1) {
      const codeBlockEndIndex = comment.indexOf(
        codeBlockEnd,
        codeBlockStartIndex + codeBlockStart.length
      )

      if (codeBlockEndIndex === -1) break

      const codeBlock = comment.substring(
        codeBlockStartIndex + codeBlockStart.length,
        codeBlockEndIndex
      )
      const sanitizedBlock = codeBlock.replace(lineNumberRegex, '')

      comment =
        comment.slice(0, codeBlockStartIndex + codeBlockStart.length) +
        sanitizedBlock +
        comment.slice(codeBlockEndIndex)

      codeBlockStartIndex = comment.indexOf(
        codeBlockStart,
        codeBlockStartIndex +
          codeBlockStart.length +
          sanitizedBlock.length +
          codeBlockEnd.length
      )
    }

    return comment
  }

  function sanitizeResponse(comment: string): string {
    comment = sanitizeCodeBlock(comment, 'suggestion')
    comment = sanitizeCodeBlock(comment, 'diff')
    return comment
  }

  for (const line of lines) {
    const lineNumberRangeMatch = line.match(lineNumberRangeRegex)

    if (lineNumberRangeMatch != null) {
      storeReview()
      currentStartLine = parseInt(lineNumberRangeMatch[1], 10)
      currentEndLine = parseInt(lineNumberRangeMatch[2], 10)
      currentComment = ''
      if (debug) {
        info(`Found line number range: ${currentStartLine}-${currentEndLine}`)
      }
      continue
    }

    if (line.trim() === commentSeparator) {
      storeReview()
      currentStartLine = null
      currentEndLine = null
      currentComment = ''
      if (debug) {
        info('Found comment separator')
      }
      continue
    }

    if (currentStartLine !== null && currentEndLine !== null) {
      currentComment += `${line}\n`
    }
  }

  storeReview()

  return reviews
}

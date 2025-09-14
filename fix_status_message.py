#!/usr/bin/env python3
import re

# Read the file
with open('src/review.ts', 'r') as f:
    content = f.read()

# Remove the incremental diff fetch since we're not using it
old_pattern = r'  // Fetch the diff between the highest reviewed commit and the latest commit of the PR branch\n  const incrementalDiff = await octokit\.repos\.compareCommits\(\{\n    owner: repo\.owner,\n    repo: repo\.repo,\n    base: highestReviewedCommitId,\n    head: context\.payload\.pull_request\.head\.sha\n  \}\)\n\n  // Fetch the diff between the target branch\'s base commit and the latest commit of the PR branch'

new_pattern = '''  // Fetch the diff between the target branch's base commit and the latest commit of the PR branch'''

content = re.sub(old_pattern, new_pattern, content, flags=re.MULTILINE)

# Update the status message to remove incremental references
content = content.replace(
    'Files that changed in the full PR diff from base to head ${highestReviewedCommitId} and ${',
    'Files that changed in the full PR diff from base to head ${'
)

# Write back
with open('src/review.ts', 'w') as f:
    f.write(content)

print("Fixed status message for full PR review")

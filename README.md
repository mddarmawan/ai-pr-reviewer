# AI PR Reviewer

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

AI-powered code reviewer for GitHub pull requests using DeepSeek (`deepseek-v4-pro` and `deepseek-v4-flash`) or any OpenAI-compatible API. Designed to run as a GitHub Action on every pull request.

## Features

- **Severity-classified code review** — catches High, Medium, and Low severity issues with structured feedback
- **PR Summarization** — generates a concise summary of changes
- **Line-by-line feedback** — each issue includes exact file locations with line numbers
- **Incremental reviews** — reviews each commit within a PR, not just a one-time pass
- **Conversation support** — reply to review comments or tag `@ai-reviewer` to ask follow-up questions
- **Smart triage** — skips in-depth review for trivial changes (configurable)
- **Customizable prompts** — configure `system_message`, `summarize`, and model selection

## Install

Add `.github/workflows/ai-pr-reviewer.yml` to your repo:

```yaml
name: Code Review

permissions:
  contents: read
  pull-requests: write

on:
  pull_request:
  pull_request_review_comment:
    types: [created]

concurrency:
  group:
    ${{ github.repository }}-${{ github.event.number || github.head_ref ||
    github.sha }}-${{ github.workflow }}-${{ github.event_name ==
    'pull_request_review_comment' && 'pr_comment' || 'pr' }}
  cancel-in-progress: ${{ github.event_name != 'pull_request_review_comment' }}

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: mddarmawan/ai-pr-reviewer@main
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
        with:
          debug: false
          openai_heavy_model: deepseek-v4-pro
          openai_light_model: deepseek-v4-flash
          openai_base_url: https://api.deepseek.com
```

### Environment variables

- `GITHUB_TOKEN` — auto-provided by GitHub Actions, used to post review comments.
- `OPENAI_API_KEY` — your DeepSeek or OpenAI API key. Add this to your repo's Actions secrets.
- `OPENAI_API_ORG` — (optional) organization ID for OpenAI API.

### Models

Defaults to DeepSeek:
- `deepseek-v4-pro` (heavy) — 1M context, 32K response, for thorough code review
- `deepseek-v4-flash` (light) — 1M context, 4K response, for summarization

Also supports OpenAI models (`gpt-4`, `gpt-3.5-turbo`) and any OpenAI-compatible API via `openai_base_url`.

### Configuration

See [action.yml](./action.yml) for all options.

Customize the bot's personality via `system_message`. Example for a docs reviewer:

```yaml
system_message: |
  You are @ai-reviewer, a language model trained to review technical documentation.
  Focus on accuracy, clarity, technical depth, grammar, and SEO.
```

## Conversation

Reply to any review comment to ask a follow-up question, or tag `@ai-reviewer` in a PR comment:

> @ai-reviewer generate test cases for this endpoint

### Ignoring PRs

Add the following to the PR description to skip review:

```
@ai-reviewer: ignore
```

## Developing

```bash
npm install
npm run build && npm run package
```

## Reviewing PRs from forks

Use `pull_request_target` instead of `pull_request`:

```yaml
on:
  pull_request_target:
    types: [opened, synchronize, reopened]
```

See: https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#pull_request_target

## Disclaimer

- Your code (files, diff, PR title/description) will be sent to the LLM provider's servers for processing.
- This action is not affiliated with OpenAI, DeepSeek, or any LLM provider.

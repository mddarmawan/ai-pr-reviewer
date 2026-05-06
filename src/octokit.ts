import {getInput} from '@actions/core'
import {Octokit} from '@octokit/rest'

const token = getInput('token') || process.env.GITHUB_TOKEN

export const octokit = new Octokit({
  auth: token,
  request: {
    retries: 3
  }
})

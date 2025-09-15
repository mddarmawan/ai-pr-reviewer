import {getInput, setFailed} from '@actions/core'
import {context as github_context} from '@actions/github'
import {Bot} from './bot'
import {Inputs} from './inputs'
import {Options} from './options'
import {Prompts} from './prompts'
import {codeReview} from './review'

// eslint-disable-next-line camelcase
const context = github_context

async function run(): Promise<void> {
  try {
    // get inputs
    const options = new Options()

    // print options
    options.print()

    const prompts: Prompts = new Prompts(new Inputs())

    // Create two bots, one for summary and one for review
    let lightBot: Bot | null = null
    let heavyBot: Bot | null = null

    try {
      lightBot = new Bot(options.lightModel, options.lightTokenLimits, options.debug)
      heavyBot = new Bot(options.heavyModel, options.heavyTokenLimits, options.debug)
    } catch (e: any) {
      setFailed(`Failed to create summary bot, please check your openai_api_key: ${e}`)
      return
    }

    if (lightBot == null || heavyBot == null) {
      setFailed('Failed to create summary bot, please check your openai_api_key')
      return
    }

    // run the code review
    await codeReview(lightBot, heavyBot, options, prompts)
  } catch (error) {
    if (error instanceof Error) {
      setFailed(error.message)
    } else {
      setFailed('Unknown error occurred')
    }
  }
}

run()

import {getInput, setFailed} from '@actions/core'
import {context as github_context} from '@actions/github'
import {Bot} from './bot'
import {Inputs} from './inputs'
import {Options, OpenAIOptions} from './options'
import {Prompts} from './prompts'
import {codeReview} from './review'

// eslint-disable-next-line camelcase
const context = github_context

async function run(): Promise<void> {
  try {
    // get inputs
    const options = new Options(
      getInput('debug') === 'true',
      getInput('disable_review') === 'true',
      getInput('disable_release_notes') === 'true',
      getInput('max_files'),
      getInput('review_simple_changes') === 'true',
      getInput('review_comment_lgtm') === 'true',
      getInput('path_filters') ? getInput('path_filters').split('\n') : null,
      getInput('system_message'),
      getInput('openai_light_model'),
      getInput('openai_heavy_model'),
      getInput('openai_model_temperature'),
      getInput('openai_retries'),
      getInput('openai_timeout_ms'),
      getInput('openai_concurrency_limit'),
      getInput('github_concurrency_limit'),
      getInput('openai_base_url'),
      getInput('language')
    )

    // print options
    options.print()

    const prompts: Prompts = new Prompts(new Inputs())

    // Create two bots, one for summary and one for review
    let lightBot: Bot | null = null
    let heavyBot: Bot | null = null

    try {
      const lightOpenAIOptions = new OpenAIOptions(options.openaiLightModel, options.lightTokenLimits)
      const heavyOpenAIOptions = new OpenAIOptions(options.openaiHeavyModel, options.heavyTokenLimits)
      
      lightBot = new Bot(options, lightOpenAIOptions)
      heavyBot = new Bot(options, heavyOpenAIOptions)
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

import { info } from '@actions/core';
import { minimatch } from 'minimatch';
import { TokenLimits } from './limits';
export class Options {
    debug;
    disableReview;
    disableReleaseNotes;
    maxFiles;
    reviewSimpleChanges;
    reviewCommentLGTM;
    pathFilters;
    systemMessage;
    openaiLightModel;
    openaiHeavyModel;
    openaiModelTemperature;
    openaiRetries;
    openaiTimeoutMS;
    openaiConcurrencyLimit;
    githubConcurrencyLimit;
    lightTokenLimits;
    heavyTokenLimits;
    apiBaseUrl;
    language;
    constructor(debug, disableReview, disableReleaseNotes, maxFiles = '0', reviewSimpleChanges = false, reviewCommentLGTM = false, pathFilters = null, systemMessage = '', openaiLightModel = 'deepseek-chat', openaiHeavyModel = 'deepseek-reasoner', openaiModelTemperature = '0.0', openaiRetries = '3', openaiTimeoutMS = '120000', openaiConcurrencyLimit = '6', githubConcurrencyLimit = '6', apiBaseUrl = 'https://api.deepseek.com', language = 'en-US') {
        this.debug = debug;
        this.disableReview = disableReview;
        this.disableReleaseNotes = disableReleaseNotes;
        this.maxFiles = parseInt(maxFiles);
        this.reviewSimpleChanges = reviewSimpleChanges;
        this.reviewCommentLGTM = reviewCommentLGTM;
        this.pathFilters = new PathFilter(pathFilters);
        this.systemMessage = systemMessage;
        this.openaiLightModel = openaiLightModel;
        this.openaiHeavyModel = openaiHeavyModel;
        this.openaiModelTemperature = parseFloat(openaiModelTemperature);
        this.openaiRetries = parseInt(openaiRetries);
        this.openaiTimeoutMS = parseInt(openaiTimeoutMS);
        this.openaiConcurrencyLimit = parseInt(openaiConcurrencyLimit);
        this.githubConcurrencyLimit = parseInt(githubConcurrencyLimit);
        this.lightTokenLimits = new TokenLimits(openaiLightModel);
        this.heavyTokenLimits = new TokenLimits(openaiHeavyModel);
        this.apiBaseUrl = apiBaseUrl;
        this.language = language;
    }
    // print all options using core.info
    print() {
        info(`debug: ${this.debug}`);
        info(`disable_review: ${this.disableReview}`);
        info(`disable_release_notes: ${this.disableReleaseNotes}`);
        info(`max_files: ${this.maxFiles}`);
        info(`review_simple_changes: ${this.reviewSimpleChanges}`);
        info(`review_comment_lgtm: ${this.reviewCommentLGTM}`);
        info(`path_filters: ${this.pathFilters}`);
        info(`system_message: ${this.systemMessage}`);
        info(`openai_light_model: ${this.openaiLightModel}`);
        info(`openai_heavy_model: ${this.openaiHeavyModel}`);
        info(`openai_model_temperature: ${this.openaiModelTemperature}`);
        info(`openai_retries: ${this.openaiRetries}`);
        info(`openai_timeout_ms: ${this.openaiTimeoutMS}`);
        info(`openai_concurrency_limit: ${this.openaiConcurrencyLimit}`);
        info(`github_concurrency_limit: ${this.githubConcurrencyLimit}`);
        info(`summary_token_limits: ${this.lightTokenLimits.string()}`);
        info(`review_token_limits: ${this.heavyTokenLimits.string()}`);
        info(`api_base_url: ${this.apiBaseUrl}`);
        info(`language: ${this.language}`);
    }
    checkPath(path) {
        const ok = this.pathFilters.check(path);
        info(`checking path: ${path} => ${ok}`);
        return ok;
    }
}
export class PathFilter {
    rules;
    constructor(rules = null) {
        this.rules = [];
        if (rules != null) {
            for (const rule of rules) {
                const trimmed = rule?.trim();
                if (trimmed) {
                    if (trimmed.startsWith('!')) {
                        this.rules.push([trimmed.substring(1).trim(), true]);
                    }
                    else {
                        this.rules.push([trimmed, false]);
                    }
                }
            }
        }
    }
    check(path) {
        if (this.rules.length === 0) {
            return true;
        }
        let included = false;
        let excluded = false;
        let inclusionRuleExists = false;
        for (const [rule, exclude] of this.rules) {
            if (minimatch(path, rule)) {
                if (exclude) {
                    excluded = true;
                }
                else {
                    included = true;
                }
            }
            if (!exclude) {
                inclusionRuleExists = true;
            }
        }
        return (!inclusionRuleExists || included) && !excluded;
    }
}
export class OpenAIOptions {
    model;
    tokenLimits;
    constructor(model = 'gpt-3.5-turbo', tokenLimits = null) {
        this.model = model;
        if (tokenLimits != null) {
            this.tokenLimits = tokenLimits;
        }
        else {
            this.tokenLimits = new TokenLimits(model);
        }
    }
}

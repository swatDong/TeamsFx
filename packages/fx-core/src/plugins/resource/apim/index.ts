// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { Plugin, FxError, PluginContext, SystemError, UserError, Result, err, ok, QTreeNode, Stage, Func } from "@microsoft/teamsfx-api";
import { BuildError, UnhandledError } from "./error";
import { Telemetry } from "./utils/telemetry";
import { AadPluginConfig, ApimPluginConfig, FunctionPluginConfig, SolutionConfig } from "./config";
import { AadDefaultValues, PluginLifeCycle, PluginLifeCycleToProgressStep, ProgressMessages, ProgressStep, ProjectConstants, OperationStatus } from "./constants";
import { Factory } from "./factory";
import { ProgressBar } from "./utils/progressBar";
import { buildAnswer } from "./answer";

export class ApimPlugin implements Plugin {
    private progressBar: ProgressBar = new ProgressBar();

    public async getQuestions(stage: Stage, ctx: PluginContext): Promise<Result<QTreeNode | undefined, FxError>> {
        return await this.executeWithFxError(PluginLifeCycle.GetQuestions, _getQuestions, ctx, stage);
    }

    public async callFunc(func: Func, ctx: PluginContext): Promise<Result<any, FxError>> {
        return await this.executeWithFxError(PluginLifeCycle.CallFunc, _callFunc, ctx, func);
    }

    public async scaffold(ctx: PluginContext): Promise<Result<any, FxError>> {
        return await this.executeWithFxError(PluginLifeCycle.Scaffold, _scaffold, ctx);
    }

    public async provision(ctx: PluginContext): Promise<Result<any, FxError>> {
        return await this.executeWithFxError(PluginLifeCycle.Provision, _provision, ctx);
    }

    public async postProvision(ctx: PluginContext): Promise<Result<any, FxError>> {
        return await this.executeWithFxError(PluginLifeCycle.PostProvision, _postProvision, ctx);
    }

    public async deploy(ctx: PluginContext): Promise<Result<any, FxError>> {
        return await this.executeWithFxError(PluginLifeCycle.Deploy, _deploy, ctx);
    }

    private async executeWithFxError<T>(
        lifeCycle: PluginLifeCycle,
        fn: (ctx: PluginContext, progressBar: ProgressBar, ...params: any[]) => Promise<T>,
        ctx: PluginContext,
        ...params: any[]
    ): Promise<Result<T, FxError>> {
        try {
            await this.progressBar.init(PluginLifeCycleToProgressStep[lifeCycle], ctx);
            Telemetry.sendLifeCycleEvent(ctx.telemetryReporter, ctx.configOfOtherPlugins, lifeCycle, OperationStatus.Started);
            const result = await fn(ctx, this.progressBar, ...params);
            Telemetry.sendLifeCycleEvent(ctx.telemetryReporter, ctx.configOfOtherPlugins, lifeCycle, OperationStatus.Succeeded);
            return ok(result);
        } catch (error) {
            let packagedError: SystemError | UserError;
            if (error instanceof SystemError || error instanceof UserError) {
                packagedError = error;
            } else if (error instanceof Error) {
                packagedError = BuildError(UnhandledError, error);
            } else {
                packagedError = BuildError(UnhandledError);
            }

            ctx.logProvider?.error(`[${ProjectConstants.pluginDisplayName}] ${error.message}`);
            Telemetry.sendLifeCycleEvent(ctx.telemetryReporter, ctx.configOfOtherPlugins, lifeCycle, OperationStatus.Failed, packagedError);
            return err(packagedError);
        } finally {
            await this.progressBar.close(PluginLifeCycleToProgressStep[lifeCycle]);
        }
    }
}

async function _getQuestions(ctx: PluginContext, progressBar: ProgressBar, stage: Stage): Promise<QTreeNode | undefined> {
    const solutionConfig = new SolutionConfig(ctx.configOfOtherPlugins);
    const apimConfig = new ApimPluginConfig(ctx.config);
    const questionManager = await Factory.buildQuestionManager(ctx, solutionConfig);
    switch (stage) {
        case Stage.update:
            return await questionManager.update(apimConfig);
        case Stage.deploy:
            return await questionManager.deploy(apimConfig);
        default:
            return undefined;
    }
}

async function _callFunc(ctx: PluginContext, progressBar: ProgressBar, func: Func): Promise<any> {
    const solutionConfig = new SolutionConfig(ctx.configOfOtherPlugins);
    const questionManager = await Factory.buildQuestionManager(ctx, solutionConfig);
    return await questionManager.callFunc(func, ctx);
}

async function _scaffold(ctx: PluginContext, progressBar: ProgressBar): Promise<void> {
    const solutionConfig = new SolutionConfig(ctx.configOfOtherPlugins);
    const apimConfig = new ApimPluginConfig(ctx.config);
    const answer = buildAnswer(ctx);
    const scaffoldManager = await Factory.buildScaffoldManager(ctx, solutionConfig);

    if (answer.validate) {
        await answer.validate(Stage.update, apimConfig, ctx.root);
    }

    answer.save(Stage.update, apimConfig);

    await progressBar.next(ProgressStep.Scaffold, ProgressMessages[ProgressStep.Scaffold].Scaffold);
    await scaffoldManager.scaffold(ctx.app.name.short, ctx.root);
}

async function _provision(ctx: PluginContext, progressBar: ProgressBar): Promise<void> {
    const solutionConfig = new SolutionConfig(ctx.configOfOtherPlugins);
    const apimConfig = new ApimPluginConfig(ctx.config);

    const apimManager = await Factory.buildApimManager(ctx, solutionConfig);
    const aadManager = await Factory.buildAadManager(ctx);

    await progressBar.next(ProgressStep.Provision, ProgressMessages[ProgressStep.Provision].CreateApim);
    await apimManager.provision(apimConfig, solutionConfig, ctx.app.name.short);

    await progressBar.next(ProgressStep.Provision, ProgressMessages[ProgressStep.Provision].CreateAad);
    await aadManager.provision(apimConfig, ctx.app.name.short);
}

async function _postProvision(ctx: PluginContext, progressBar: ProgressBar): Promise<void> {
    const solutionConfig = new SolutionConfig(ctx.configOfOtherPlugins);
    const apimConfig = new ApimPluginConfig(ctx.config);
    const aadConfig = new AadPluginConfig(ctx.configOfOtherPlugins);

    const apimManager = await Factory.buildApimManager(ctx, solutionConfig);
    const aadManager = await Factory.buildAadManager(ctx);
    const teamsAppAadManager = await Factory.buildTeamsAppAadManager(ctx);

    await progressBar.next(ProgressStep.PostProvision, ProgressMessages[ProgressStep.PostProvision].ConfigClientAad);
    await aadManager.postProvision(apimConfig, aadConfig, AadDefaultValues.redirectUris);

    await progressBar.next(ProgressStep.PostProvision, ProgressMessages[ProgressStep.PostProvision].ConfigApim);
    await apimManager.postProvision(apimConfig, solutionConfig, aadConfig, ctx.app.name.short);

    await progressBar.next(ProgressStep.PostProvision, ProgressMessages[ProgressStep.PostProvision].ConfigAppAad);
    await teamsAppAadManager.postProvision(aadConfig, apimConfig);
}

async function _deploy(ctx: PluginContext, progressBar: ProgressBar): Promise<void> {
    const solutionConfig = new SolutionConfig(ctx.configOfOtherPlugins);
    const apimConfig = new ApimPluginConfig(ctx.config);
    const functionConfig = new FunctionPluginConfig(ctx.configOfOtherPlugins);
    const answer = buildAnswer(ctx);

    if (answer.validate) {
        await answer.validate(Stage.deploy, apimConfig, ctx.root);
    }

    answer.save(Stage.deploy, apimConfig);

    const apimManager = await Factory.buildApimManager(ctx, solutionConfig);

    await progressBar.next(ProgressStep.Deploy, ProgressMessages[ProgressStep.Deploy].ImportApi);
    await apimManager.deploy(apimConfig, solutionConfig, functionConfig, answer, ctx.root);
}

export default new ApimPlugin();

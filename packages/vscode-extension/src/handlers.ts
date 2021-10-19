// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

"use strict";

import {
  commands,
  Uri,
  window,
  workspace,
  ExtensionContext,
  env,
  debug,
  QuickPickItem,
} from "vscode";
import {
  Result,
  FxError,
  err,
  ok,
  Stage,
  Platform,
  Func,
  UserError,
  SystemError,
  returnSystemError,
  Inputs,
  VsCodeEnv,
  AppStudioTokenProvider,
  SharepointTokenProvider,
  Void,
  Tools,
  AzureSolutionSettings,
  ConfigFolderName,
  TreeItem,
  TreeCategory,
  LocalEnvironmentName,
} from "@microsoft/teamsfx-api";
import {
  isUserCancelError,
  FxCore,
  InvalidProjectError,
  isValidProject,
  globalStateUpdate,
  globalStateGet,
  Correlator,
  getAppDirectory,
  environmentManager,
  isMigrateFromV1Project,
  isMultiEnvEnabled,
  LocalSettingsProvider,
  CollaborationState,
  getHashedEnv,
} from "@microsoft/teamsfx-core";
import GraphManagerInstance from "./commonlib/graphLogin";
import AzureAccountManager from "./commonlib/azureLogin";
import AppStudioTokenInstance from "./commonlib/appStudioLogin";
import SharepointTokenInstance from "./commonlib/sharepointLogin";
import AppStudioCodeSpaceTokenInstance from "./commonlib/appStudioCodeSpaceLogin";
import VsCodeLogInstance from "./commonlib/log";
import { TreeViewCommand } from "./treeview/commandsTreeViewProvider";
import TreeViewManagerInstance from "./treeview/treeViewManager";
import { ExtTelemetry } from "./telemetry/extTelemetry";
import {
  TelemetryEvent,
  TelemetryProperty,
  TelemetryTiggerFrom,
  TelemetrySuccess,
  AccountType,
  TelemetryUpdateAppReason,
} from "./telemetry/extTelemetryEvents";
import * as commonUtils from "./debug/commonUtils";
import { ExtensionErrors, ExtensionSource } from "./error";
import { WebviewPanel } from "./controls/webviewPanel";
import * as constants from "./debug/constants";
import { anonymizeFilePaths, isSPFxProject, syncFeatureFlags } from "./utils/commonUtils";
import * as fs from "fs-extra";
import * as vscode from "vscode";
import { DepsChecker } from "./debug/depsChecker/checker";
import { BackendExtensionsInstaller } from "./debug/depsChecker/backendExtensionsInstall";
import { DotnetChecker } from "./debug/depsChecker/dotnetChecker";
import { FuncToolChecker } from "./debug/depsChecker/funcToolChecker";
import * as util from "util";
import * as StringResources from "./resources/Strings.json";
import { vscodeAdapter } from "./debug/depsChecker/vscodeAdapter";
import { vscodeLogger } from "./debug/depsChecker/vscodeLogger";
import { vscodeTelemetry } from "./debug/depsChecker/vscodeTelemetry";
import { PanelType } from "./controls/PanelType";
import { signedIn, signedOut } from "./commonlib/common/constant";
import { AzureNodeChecker } from "./debug/depsChecker/azureNodeChecker";
import { SPFxNodeChecker } from "./debug/depsChecker/spfxNodeChecker";
import { terminateAllRunningTeamsfxTasks } from "./debug/teamsfxTaskHandler";
import { VS_CODE_UI } from "./extension";
import { registerAccountTreeHandler } from "./accountTree";
import {
  addCollaboratorToEnv,
  generateCollaboratorNode,
  generateCollaboratorWarningNode,
  registerEnvTreeHandler,
  updateNewEnvCollaborators,
} from "./envTree";
import { selectAndDebug } from "./debug/runIconHandler";
import * as path from "path";
import { exp } from "./exp/index";
import { TreatmentVariables, TreatmentVariableValue } from "./exp/treatmentVariables";
import { StringContext } from "./utils/stringContext";
import { ext } from "./extensionVariables";
import { InputConfigsFolderName } from "@microsoft/teamsfx-api";
import { CoreCallbackEvent } from "@microsoft/teamsfx-api";
import { CommandsWebviewProvider } from "./treeview/commandsWebviewProvider";

export let core: FxCore;
export let tools: Tools;
export function getWorkspacePath(): string | undefined {
  const workspacePath: string | undefined = workspace.workspaceFolders?.length
    ? workspace.workspaceFolders[0].uri.fsPath
    : undefined;
  return workspacePath;
}

export async function activate(): Promise<Result<Void, FxError>> {
  const result: Result<Void, FxError> = ok(Void);
  try {
    const workspacePath = getWorkspacePath();
    const validProject = isValidProject(workspacePath);
    if (validProject) {
      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenTeamsApp, {});
    }

    if (!validProject) {
      const expService = exp.getExpService();
      if (expService) {
        switch (
          await expService.getTreatmentVariableAsync(
            TreatmentVariables.VSCodeConfig,
            TreatmentVariables.QuickStartInSidebar,
            true
          )
        ) {
          case TreatmentVariableValue.TopSidebar:
            vscode.commands.executeCommand("setContext", "fx-extension.sidebarWelcome.top", true);
            break;
          case TreatmentVariableValue.BottomSidebar:
            vscode.commands.executeCommand(
              "setContext",
              "fx-extension.sidebarWelcome.bottom",
              true
            );
            break;
          case TreatmentVariableValue.OriginalTreeView:
            vscode.commands.executeCommand(
              "setContext",
              "fx-extension.sidebarWelcome.treeview",
              true
            );
            break;
          default:
            vscode.commands.executeCommand(
              "setContext",
              "fx-extension.sidebarWelcome.default",
              true
            );
            break;
        }
      }
    } else {
      vscode.commands.executeCommand("setContext", "fx-extension.sidebarWelcome.treeview", true);
    }

    const telemetry = ExtTelemetry.reporter;
    AzureAccountManager.setStatusChangeMap(
      "successfully-sign-in-azure",
      (status, token, accountInfo) => {
        if (status === signedIn) {
          window.showInformationMessage(StringResources.vsc.handlers.azureSignIn);
        } else if (status === signedOut) {
          window.showInformationMessage(StringResources.vsc.handlers.azureSignOut);
        }
        return Promise.resolve();
      },
      false
    );
    let appstudioLogin: AppStudioTokenProvider = AppStudioTokenInstance;
    const vscodeEnv = detectVsCodeEnv();
    if (vscodeEnv === VsCodeEnv.codespaceBrowser || vscodeEnv === VsCodeEnv.codespaceVsCode) {
      appstudioLogin = AppStudioCodeSpaceTokenInstance;
    }
    const sharepointLogin: SharepointTokenProvider = SharepointTokenInstance;

    const m365NotificationCallback = (
      status: string,
      token: string | undefined,
      accountInfo: Record<string, unknown> | undefined
    ) => {
      if (status === signedIn) {
        window.showInformationMessage(StringResources.vsc.handlers.m365SignIn);
      } else if (status === signedOut) {
        window.showInformationMessage(StringResources.vsc.handlers.m365SignOut);
      }
      return Promise.resolve();
    };
    appstudioLogin.setStatusChangeMap("successfully-sign-in-m365", m365NotificationCallback, false);
    // sharepointLogin.setStatusChangeMap(
    //   "successfully-sign-in-m365",
    //   m365NotificationCallback,
    //   false
    // );
    tools = {
      logProvider: VsCodeLogInstance,
      tokenProvider: {
        azureAccountProvider: AzureAccountManager,
        graphTokenProvider: GraphManagerInstance,
        appStudioToken: appstudioLogin,
        sharepointTokenProvider: SharepointTokenInstance,
      },
      telemetryReporter: telemetry,
      treeProvider: TreeViewManagerInstance.getTreeView("teamsfx-accounts")!,
      ui: VS_CODE_UI,
    };
    core = new FxCore(tools);
    registerCoreEvents();
    await registerAccountTreeHandler();
    await registerEnvTreeHandler();
    await openMarkdownHandler();
    await openSampleReadmeHandler();
    ExtTelemetry.isFromSample = await getIsFromSample();

    if (workspacePath) {
      // refresh env tree when env config files added or deleted.
      workspace.onDidCreateFiles(async (event) => {
        await refreshEnvTreeOnFileChanged(workspacePath, event.files);
      });

      workspace.onDidDeleteFiles(async (event) => {
        await refreshEnvTreeOnFileChanged(workspacePath, event.files);
      });

      workspace.onDidRenameFiles(async (event) => {
        const files = [];
        for (const f of event.files) {
          files.push(f.newUri);
          files.push(f.oldUri);
        }

        await refreshEnvTreeOnFileChanged(workspacePath, files);
      });
    }
  } catch (e) {
    const FxError: FxError = {
      name: e.name,
      source: ExtensionSource,
      message: e.message,
      stack: e.stack,
      timestamp: new Date(),
    };
    showError(FxError);
    return err(FxError);
  }
  return result;
}

async function getIsFromSample() {
  if (core) {
    const input = getSystemInputs();
    input.ignoreEnvInfo = true;
    const projectConfigRes = await core.getProjectConfig(input);

    if (projectConfigRes.isOk() && projectConfigRes.value) {
      const projectSettings = projectConfigRes.value.settings;
      if (projectSettings) {
        return projectSettings.isFromSample;
      }
    }
    return undefined;
  }
}

async function refreshEnvTreeOnFileChanged(workspacePath: string, files: readonly Uri[]) {
  let needRefresh = false;
  for (const file of files) {
    // check if file is env config
    if (environmentManager.isEnvConfig(workspacePath, file.fsPath)) {
      needRefresh = true;
      break;
    }
  }

  if (needRefresh) {
    await registerEnvTreeHandler();
  }
}

function registerCoreEvents() {
  const developmentView = TreeViewManagerInstance.getTreeView("teamsfx-development");
  if (developmentView instanceof CommandsWebviewProvider) {
    core.on(CoreCallbackEvent.lock, () => {
      (
        TreeViewManagerInstance.getTreeView("teamsfx-development") as CommandsWebviewProvider
      ).onLockChanged(true);
    });
    core.on(CoreCallbackEvent.unlock, () => {
      (
        TreeViewManagerInstance.getTreeView("teamsfx-development") as CommandsWebviewProvider
      ).onLockChanged(false);
    });
  }

  const deploymentView = TreeViewManagerInstance.getTreeView("teamsfx-deployment");
  if (deploymentView instanceof CommandsWebviewProvider) {
    core.on(CoreCallbackEvent.lock, () => {
      (
        TreeViewManagerInstance.getTreeView("teamsfx-deployment") as CommandsWebviewProvider
      ).onLockChanged(true);
    });
    core.on(CoreCallbackEvent.unlock, () => {
      (
        TreeViewManagerInstance.getTreeView("teamsfx-deployment") as CommandsWebviewProvider
      ).onLockChanged(false);
    });
  }
}

export async function getAzureSolutionSettings(): Promise<AzureSolutionSettings | undefined> {
  const input = getSystemInputs();
  input.ignoreEnvInfo = true;
  const projectConfigRes = await core.getProjectConfig(input);

  if (projectConfigRes?.isOk()) {
    if (projectConfigRes.value) {
      return projectConfigRes.value.settings?.solutionSettings as AzureSolutionSettings;
    }
  }
  // else {
  //   showError(projectConfigRes.error);
  // }
  return undefined;
}

export function getSystemInputs(): Inputs {
  const answers: Inputs = {
    projectPath: getWorkspacePath(),
    platform: Platform.VSCode,
    vscodeEnv: detectVsCodeEnv(),
    "function-dotnet-checker-enabled": vscodeAdapter.dotnetCheckerEnabled(),
  };
  return answers;
}

export async function createNewProjectHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.CreateProjectStart, getTriggerFromProperty(args));
  return await runCommand(Stage.create);
}

export async function migrateV1ProjectHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.MigrateV1ProjectStart,
    getTriggerFromProperty(args)
  );
  const result = await runCommand(Stage.migrateV1);
  await openMarkdownHandler();
  await vscode.commands.executeCommand("setContext", "fx-extension.sidebarWelcome.treeview", true);
  await vscode.commands.executeCommand("setContext", "fx-extension.sidebarWelcome.top", false);
  await vscode.commands.executeCommand("setContext", "fx-extension.sidebarWelcome.bottom", false);
  await vscode.commands.executeCommand("setContext", "fx-extension.sidebarWelcome.default", false);
  return result;
}

export async function selectAndDebugHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.RunIconDebugStart);
  const result = await selectAndDebug();
  await processResult(TelemetryEvent.RunIconDebug, result);
  return result;
}

export async function addResourceHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.AddResourceStart, getTriggerFromProperty(args));
  const func: Func = {
    namespace: "fx-solution-azure",
    method: "addResource",
  };
  return await runUserTask(func, TelemetryEvent.AddResource, true);
}

export async function addCapabilityHandler(args: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.AddCapStart, getTriggerFromProperty(args));
  const func: Func = {
    namespace: "fx-solution-azure",
    method: "addCapability",
  };
  return await runUserTask(func, TelemetryEvent.AddCap, true);
}

export async function validateManifestHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.ValidateManifestStart,
    getTriggerFromProperty(args)
  );

  const func: Func = {
    namespace: "fx-solution-azure",
    method: "validateManifest",
  };
  return await runUserTask(func, TelemetryEvent.ValidateManifest, false);
}

export async function buildPackageHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.BuildStart, getTriggerFromProperty(args));

  const func: Func = {
    namespace: "fx-solution-azure",
    method: "buildPackage",
  };
  return await runUserTask(func, TelemetryEvent.Build, false);
}

export async function provisionHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ProvisionStart, getTriggerFromProperty(args));
  const result = await runCommand(Stage.provision);
  await registerEnvTreeHandler();
  return result;
}

export async function deployHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.DeployStart, getTriggerFromProperty(args));
  return await runCommand(Stage.deploy);
}

export async function publishHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.PublishStart, getTriggerFromProperty(args));
  return await runCommand(Stage.publish);
}

export async function cicdGuideHandler(args?: any[]): Promise<boolean> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.CICDGuide, getTriggerFromProperty(args));
  return await env.openExternal(Uri.parse("https://aka.ms/teamsfx-cicd-guide"));
}

export async function runCommand(stage: Stage): Promise<Result<any, FxError>> {
  const eventName = ExtTelemetry.stageToEvent(stage);
  let result: Result<any, FxError> = ok(null);
  let inputs: Inputs | undefined;
  try {
    const checkCoreRes = checkCoreNotEmpty();
    if (checkCoreRes.isErr()) {
      throw checkCoreRes.error;
    }

    inputs = getSystemInputs();
    inputs.stage = stage;

    switch (stage) {
      case Stage.create: {
        const tmpResult = await core.createProject(inputs);
        if (tmpResult.isErr()) {
          result = err(tmpResult.error);
        } else {
          const uri = Uri.file(tmpResult.value);
          commands.executeCommand("vscode.openFolder", uri);
          result = ok(null);
        }
        break;
      }
      case Stage.migrateV1: {
        const tmpResult = await core.migrateV1Project(inputs);
        if (tmpResult.isErr()) {
          result = err(tmpResult.error);
        } else {
          if (tmpResult?.value) {
            const uri = Uri.file(tmpResult.value);
            commands.executeCommand("vscode.openFolder", uri);
          }
          result = ok(null);
        }
        break;
      }
      case Stage.provision: {
        result = await core.provisionResources(inputs);
        break;
      }
      case Stage.deploy: {
        result = await core.deployArtifacts(inputs);
        break;
      }
      case Stage.publish: {
        result = await core.publishApplication(inputs);
        break;
      }
      case Stage.debug: {
        if (isMultiEnvEnabled()) {
          inputs.ignoreEnvInfo = true;
        }
        result = await core.localDebug(inputs);
        break;
      }
      case Stage.createEnv: {
        result = await core.createEnv(inputs);
        break;
      }
      case Stage.listCollaborator: {
        result = await core.listCollaborator(inputs);
        break;
      }
      default:
        throw new SystemError(
          ExtensionErrors.UnsupportedOperation,
          util.format(StringResources.vsc.handlers.operationNotSupport, stage),
          ExtensionSource
        );
    }
  } catch (e) {
    result = wrapError(e);
  }
  await processResult(eventName, result, inputs);

  return result;
}

export function detectVsCodeEnv(): VsCodeEnv {
  // extensionKind returns ExtensionKind.UI when running locally, so use this to detect remote
  const extension = vscode.extensions.getExtension("TeamsDevApp.ms-teams-vscode-extension");

  if (extension?.extensionKind === vscode.ExtensionKind.Workspace) {
    // running remotely
    // Codespaces browser-based editor will return UIKind.Web for uiKind
    if (vscode.env.uiKind === vscode.UIKind.Web) {
      return VsCodeEnv.codespaceBrowser;
    } else if (vscode.env.remoteName === "codespaces") {
      return VsCodeEnv.codespaceVsCode;
    } else {
      return VsCodeEnv.remote;
    }
  } else {
    // running locally
    return VsCodeEnv.local;
  }
}

export async function runUserTask(
  func: Func,
  eventName: string,
  ignoreEnvInfo: boolean
): Promise<Result<any, FxError>> {
  let result: Result<any, FxError> = ok(null);
  let inputs: Inputs | undefined;
  try {
    const checkCoreRes = checkCoreNotEmpty();
    if (checkCoreRes.isErr()) {
      throw checkCoreRes.error;
    }

    inputs = getSystemInputs();
    inputs.ignoreEnvInfo = ignoreEnvInfo;
    result = await core.executeUserTask(func, inputs);
  } catch (e) {
    result = wrapError(e);
  }

  await processResult(eventName, result, inputs);

  return result;
}

//TODO workaround
function isLoginFaiureError(error: FxError): boolean {
  return !!error.message && error.message.includes("Cannot get user login information");
}

async function processResult(
  eventName: string | undefined,
  result: Result<null, FxError>,
  inputs?: Inputs
) {
  const envProperty: { [key: string]: string } = {};
  if (inputs?.env) {
    envProperty[TelemetryProperty.Env] = getHashedEnv(inputs.env);
  }

  if (result.isErr()) {
    if (eventName) {
      ExtTelemetry.sendTelemetryErrorEvent(eventName, result.error, envProperty);
    }
    const error = result.error;
    if (isUserCancelError(error)) {
      return;
    }
    if (isLoginFaiureError(error)) {
      window.showErrorMessage(StringResources.vsc.handlers.loginFailed);
      return;
    }
    showError(error);
  } else {
    if (eventName) {
      if (eventName === TelemetryEvent.CreateNewEnvironment) {
        if (inputs?.sourceEnvName) {
          envProperty[TelemetryProperty.SourceEnv] = getHashedEnv(inputs.sourceEnvName);
        }
        if (inputs?.targetEnvName) {
          envProperty[TelemetryProperty.TargetEnv] = getHashedEnv(inputs.targetEnvName);
        }
      }
      ExtTelemetry.sendTelemetryEvent(eventName, {
        [TelemetryProperty.Success]: TelemetrySuccess.Yes,
        ...envProperty,
      });
    }
  }
}

function wrapError(e: Error): Result<null, FxError> {
  if (
    e instanceof UserError ||
    e instanceof SystemError ||
    (e.constructor &&
      e.constructor.name &&
      (e.constructor.name === "SystemError" || e.constructor.name === "UserError"))
  ) {
    return err(e as FxError);
  }
  return err(returnSystemError(e, ExtensionSource, ExtensionErrors.UnknwonError));
}

function checkCoreNotEmpty(): Result<null, SystemError> {
  if (!core) {
    return err(
      returnSystemError(
        new Error(StringResources.vsc.handlers.coreNotReady),
        ExtensionSource,
        ExtensionErrors.UnsupportedOperation
      )
    );
  }
  return ok(null);
}

/**
 * check & install required dependencies during local debug when selected hosting type is Azure.
 */
export async function validateDependenciesHandler(): Promise<void> {
  const nodeChecker = new AzureNodeChecker(vscodeAdapter, vscodeLogger, vscodeTelemetry);
  const dotnetChecker = new DotnetChecker(vscodeAdapter, vscodeLogger, vscodeTelemetry);
  const funcChecker = new FuncToolChecker(vscodeAdapter, vscodeLogger, vscodeTelemetry);
  const depsChecker = new DepsChecker(vscodeLogger, vscodeAdapter, [
    nodeChecker,
    dotnetChecker,
    funcChecker,
  ]);
  await validateDependenciesCore(depsChecker);
}

/**
 * check & install required dependencies during local debug when selected hosting type is SPFx.
 */
export async function validateSpfxDependenciesHandler(): Promise<void> {
  const nodeChecker = new SPFxNodeChecker(vscodeAdapter, vscodeLogger, vscodeTelemetry);
  const depsChecker = new DepsChecker(vscodeLogger, vscodeAdapter, [nodeChecker]);
  await validateDependenciesCore(depsChecker);
}

async function validateDependenciesCore(depsChecker: DepsChecker): Promise<void> {
  const shouldContinue = await depsChecker.resolve();
  if (!shouldContinue) {
    await debug.stopDebugging();
    // TODO: better mechanism to stop the tasks and debug session.
    throw new Error("debug stopped.");
  }
}

/**
 * install functions binding before launch local debug
 */
export async function backendExtensionsInstallHandler(): Promise<void> {
  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    const workspaceFolder = workspace.workspaceFolders[0];
    const backendRoot = await commonUtils.getProjectRoot(
      workspaceFolder.uri.fsPath,
      constants.backendFolderName
    );

    if (backendRoot) {
      const dotnetChecker = new DotnetChecker(vscodeAdapter, vscodeLogger, vscodeTelemetry);
      const backendExtensionsInstaller = new BackendExtensionsInstaller(
        dotnetChecker,
        vscodeLogger
      );

      try {
        await backendExtensionsInstaller.install(backendRoot);
      } catch (error) {
        await DepsChecker.handleErrorWithDisplay(error, vscodeAdapter);
        throw error;
      }
    }
  }
}

/**
 * call localDebug on core
 */
export async function preDebugCheckHandler(): Promise<void> {
  try {
    const localAppId = commonUtils.getLocalTeamsAppId() as string;
    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.DebugPreCheck, {
      [TelemetryProperty.DebugAppId]: localAppId,
    });
  } catch {
    // ignore telemetry error
  }

  let result: Result<any, FxError> = ok(null);
  result = await runCommand(Stage.debug);
  if (result.isErr()) {
    try {
      const localAppId = commonUtils.getLocalTeamsAppId() as string;
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.DebugPreCheck, result.error, {
        [TelemetryProperty.DebugAppId]: localAppId,
      });
    } finally {
      // ignore telemetry error
      terminateAllRunningTeamsfxTasks();
      throw result.error;
    }
  }

  const portsInUse = await commonUtils.getPortsInUse();
  if (portsInUse.length > 0) {
    let message: string;
    if (portsInUse.length > 1) {
      message = util.format(
        StringResources.vsc.localDebug.portsAlreadyInUse,
        portsInUse.join(", ")
      );
    } else {
      message = util.format(StringResources.vsc.localDebug.portAlreadyInUse, portsInUse[0]);
    }
    const error = new UserError(ExtensionErrors.PortAlreadyInUse, message, ExtensionSource);
    try {
      const localAppId = commonUtils.getLocalTeamsAppId() as string;
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.DebugPreCheck, error, {
        [TelemetryProperty.DebugAppId]: localAppId,
      });
    } finally {
      // ignore telemetry error
      window.showErrorMessage(message);
      terminateAllRunningTeamsfxTasks();
      throw error;
    }
  }
}

export async function openDocumentHandler(args: any[]): Promise<boolean> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Documentation, getTriggerFromProperty(args));
  return env.openExternal(Uri.parse("https://aka.ms/teamsfx-build-first-app"));
}

export async function openWelcomeHandler(args?: any[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.QuickStart, getTriggerFromProperty(args));
  WebviewPanel.createOrShow(PanelType.QuickStart);
}

export async function openSurveyHandler(args?: any[]) {
  WebviewPanel.createOrShow(PanelType.Survey);
}

function getTriggerFromProperty(args?: any[]) {
  // if not args are not supplied, by default, it is trigger from "CommandPalette"
  // e.g. vscode.commands.executeCommand("fx-extension.openWelcome");
  // in this case, "fx-exentiosn.openWelcome" is trigged from "CommandPalette".
  if (!args || (args && args.length === 0)) {
    return { [TelemetryProperty.TriggerFrom]: TelemetryTiggerFrom.CommandPalette };
  }

  switch (args.toString()) {
    case TelemetryTiggerFrom.TreeView:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTiggerFrom.TreeView };
    case TelemetryTiggerFrom.Webview:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTiggerFrom.Webview };
    case TelemetryTiggerFrom.Other:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTiggerFrom.Other };
    default:
      return { [TelemetryProperty.TriggerFrom]: TelemetryTiggerFrom.Unknow };
  }
}

async function openMarkdownHandler() {
  const afterScaffold = globalStateGet("openReadme", false);
  if (afterScaffold && workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    await globalStateUpdate("openReadme", false);
    showLocalDebugMessage();
    const workspaceFolder = workspace.workspaceFolders[0];
    const workspacePath: string = workspaceFolder.uri.fsPath;
    let targetFolder: string | undefined;
    if (await isMigrateFromV1Project(workspacePath)) {
      targetFolder = workspacePath;
    } else if (await isSPFxProject(workspacePath)) {
      targetFolder = `${workspacePath}/SPFx`;
    } else {
      const tabFolder = await commonUtils.getProjectRoot(
        workspacePath,
        constants.frontendFolderName
      );
      const botFolder = await commonUtils.getProjectRoot(workspacePath, constants.botFolderName);
      if (tabFolder && botFolder) {
        targetFolder = workspacePath;
      } else if (tabFolder) {
        targetFolder = tabFolder;
      } else {
        targetFolder = botFolder;
      }
    }
    const uri = Uri.file(`${targetFolder}/README.md`);
    workspace.openTextDocument(uri).then(() => {
      const PreviewMarkdownCommand = "markdown.showPreview";
      commands.executeCommand(PreviewMarkdownCommand, uri);
    });
  }
}

async function openSampleReadmeHandler() {
  const afterScaffold = globalStateGet("openSampleReadme", false);
  if (afterScaffold && workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    globalStateUpdate("openSampleReadme", false);
    showLocalDebugMessage();
    const workspaceFolder = workspace.workspaceFolders[0];
    const workspacePath: string = workspaceFolder.uri.fsPath;
    const uri = Uri.file(`${workspacePath}/README.md`);
    workspace.openTextDocument(uri).then(() => {
      const PreviewMarkdownCommand = "markdown.showPreview";
      commands.executeCommand(PreviewMarkdownCommand, uri);
    });
  }
}

async function showLocalDebugMessage() {
  if (
    await exp
      .getExpService()
      .getTreatmentVariableAsync(
        TreatmentVariables.VSCodeConfig,
        TreatmentVariables.ShowLocalDebug,
        true
      )
  ) {
    const localDebug = {
      title: StringResources.vsc.handlers.localDebugTitle,
      run: async (): Promise<void> => {
        selectAndDebug();
      },
    };

    ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ShowLocalDebugNotification);
    vscode.window
      .showInformationMessage(
        util.format(StringResources.vsc.handlers.localDebugDescription),
        localDebug
      )
      .then((selection) => {
        if (selection?.title === StringResources.vsc.handlers.localDebugTitle) {
          ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ClickLocalDebug);
          selection.run();
        }
      });
  }
}

export async function openSamplesHandler(args?: any[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.Samples, getTriggerFromProperty(args));
  WebviewPanel.createOrShow(PanelType.SampleGallery);
}

export async function openAppManagement(args?: any[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ManageTeamsApp, getTriggerFromProperty(args));
  return env.openExternal(Uri.parse("https://dev.teams.microsoft.com/home"));
}

export async function openBotManagement(args?: any[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ManageTeamsBot, getTriggerFromProperty(args));
  return env.openExternal(Uri.parse("https://dev.teams.microsoft.com/bots"));
}

export async function openReportIssues(args?: any[]) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ReportIssues, getTriggerFromProperty(args));
  return env.openExternal(Uri.parse("https://github.com/OfficeDev/TeamsFx/issues"));
}

export async function openManifestHandler(args?: any[]): Promise<Result<null, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.OpenManifestEditorStart,
    getTriggerFromProperty(args)
  );
  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    const workspaceFolder = workspace.workspaceFolders[0];
    const projectRoot = await commonUtils.getProjectRoot(workspaceFolder.uri.fsPath, "");
    const appDirectory = await getAppDirectory(projectRoot!);
    if (!(await fs.pathExists(appDirectory))) {
      const invalidProjectError: FxError = InvalidProjectError();
      showError(invalidProjectError);
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.OpenManifestEditor, invalidProjectError);
      return err(invalidProjectError);
    }
    const func: Func = {
      namespace: "fx-solution-azure/fx-resource-appstudio",
      method: "getManifestTemplatePath",
    };
    const res = await runUserTask(func, TelemetryEvent.ValidateManifest, true);
    if (res.isOk()) {
      const manifestFile = res.value as string;
      if (fs.existsSync(manifestFile)) {
        workspace.openTextDocument(manifestFile).then((document) => {
          window.showTextDocument(document);
        });
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenManifestEditor, {
          [TelemetryProperty.Success]: TelemetrySuccess.Yes,
        });
        return ok(null);
      } else {
        const FxError = new SystemError(
          "FileNotFound",
          util.format(StringResources.vsc.handlers.fileNotFound, manifestFile),
          ExtensionSource
        );
        showError(FxError);
        ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.OpenManifestEditor, FxError);
        return err(FxError);
      }
    } else {
      showError(res.error);
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.OpenManifestEditor, res.error);
      return err(res.error);
    }
  } else {
    const noOpenWorkspaceError = new UserError(
      ExtensionErrors.NoWorkspaceError,
      StringResources.vsc.handlers.noOpenWorkspace,
      ExtensionSource
    );
    showError(noOpenWorkspaceError);
    ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.OpenManifestEditor, noOpenWorkspaceError);
    return err(noOpenWorkspaceError);
  }
}

export async function createNewEnvironment(args?: any[]): Promise<Result<Void, FxError>> {
  ExtTelemetry.sendTelemetryEvent(
    TelemetryEvent.CreateNewEnvironmentStart,
    getTriggerFromProperty(args)
  );
  const result = await runCommand(Stage.createEnv);
  if (!result.isErr()) {
    await registerEnvTreeHandler(false);
    await updateNewEnvCollaborators(result.value);
  }
  return result;
}

export async function refreshEnvironment(args?: any[]): Promise<Result<Void, FxError>> {
  return await registerEnvTreeHandler();
}

export async function viewEnvironment(env: string): Promise<Result<Void, FxError>> {
  const telemetryProperties: { [p: string]: string } = {};
  if (env === LocalEnvironmentName) {
    telemetryProperties[TelemetryProperty.Env] = LocalEnvironmentName;
  } else {
    telemetryProperties[TelemetryProperty.Env] = getHashedEnv(env);
  }

  if (workspace.workspaceFolders && workspace.workspaceFolders.length > 0) {
    const projectRoot = workspace.workspaceFolders![0].uri.fsPath;
    const localSettingsProvider = new LocalSettingsProvider(projectRoot);

    const envFilePath =
      env === LocalEnvironmentName
        ? localSettingsProvider.localSettingsFilePath
        : environmentManager.getEnvConfigPath(env, projectRoot);

    const envPath: vscode.Uri = vscode.Uri.file(envFilePath);
    if (await fs.pathExists(envFilePath)) {
      vscode.workspace.openTextDocument(envPath).then(
        (a: vscode.TextDocument) => {
          ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ViewEnvironment, telemetryProperties);
          vscode.window.showTextDocument(a, 1, false);
        },
        (error: any) => {
          const openEnvError = new SystemError(
            ExtensionErrors.OpenEnvProfileError,
            util.format(StringResources.vsc.handlers.openEnvFailed, env),
            ExtensionSource,
            undefined,
            undefined,
            error
          );
          showError(openEnvError);
          ExtTelemetry.sendTelemetryErrorEvent(
            TelemetryEvent.ViewEnvironment,
            openEnvError,
            telemetryProperties
          );
          return err(openEnvError);
        }
      );
    } else {
      const noEnvError = new UserError(
        ExtensionErrors.EnvProfileNotFoundError,
        util.format(StringResources.vsc.handlers.findEnvFailed, env),
        ExtensionSource
      );
      showError(noEnvError);
      ExtTelemetry.sendTelemetryErrorEvent(
        TelemetryEvent.ViewEnvironment,
        noEnvError,
        telemetryProperties
      );
      return err(noEnvError);
    }
  } else {
    const FxError: FxError = {
      name: "NoWorkspace",
      source: ExtensionSource,
      message: StringResources.vsc.handlers.noOpenWorkspace,
      timestamp: new Date(),
    };
    showError(FxError);
    ExtTelemetry.sendTelemetryErrorEvent(
      TelemetryEvent.ViewEnvironment,
      FxError,
      telemetryProperties
    );
    return err(FxError);
  }
  return ok(Void);
}

export async function grantPermission(env: string): Promise<Result<Void, FxError>> {
  let result: Result<any, FxError> = ok(Void);
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.GrantPermission);

  const eventName = ExtTelemetry.stageToEvent(Stage.grantPermission);
  let inputs: Inputs | undefined;
  try {
    const checkCoreRes = checkCoreNotEmpty();
    if (checkCoreRes.isErr()) {
      throw checkCoreRes.error;
    }

    inputs = getSystemInputs();
    inputs.env = env;

    result = await core.grantPermission(inputs);
    if (result.isErr()) {
      throw result.error;
    }
    if (result.value.state === CollaborationState.OK) {
      window.showInformationMessage(
        `Added account: '${inputs.email}' to the environment '${env}' as a collaborator`
      );

      await addCollaboratorToEnv(env, result.value.userInfo.aadId, inputs.email);
    } else {
      window.showWarningMessage(result.value.message);
    }
  } catch (e) {
    result = wrapError(e);
  }

  await processResult(eventName, result, inputs);
  return result;
}

export async function listAllCollaborators(envs: string[]): Promise<Record<string, TreeItem[]>> {
  const result: Record<string, TreeItem[]> = {};
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ListCollaboratorStart);

  const checkCoreRes = checkCoreNotEmpty();
  if (checkCoreRes.isErr()) {
    throw checkCoreRes.error;
  }

  const inputs: Inputs = getSystemInputs();
  const userListRecordResult = await core.listAllCollaborators(inputs);

  for (const env of envs) {
    try {
      if (userListRecordResult.isErr()) {
        throw userListRecordResult.error;
      }

      const userList = userListRecordResult.value[env];

      if (userList.state === CollaborationState.OK) {
        result[env] = userList.collaborators.map((user: any) => {
          return generateCollaboratorNode(
            env,
            user.userObjectId,
            user.userPrincipalName,
            user.isAadOwner
          );
        });
        if (!result[env] || result[env].length === 0) {
          result[env] = [
            generateCollaboratorWarningNode(
              env,
              StringResources.vsc.commandsTreeViewProvider.noPermissionToListCollaborators
            ),
          ];
        }
      } else if (userList.state !== CollaborationState.ERROR) {
        let label = userList.message;
        const toolTip = userList.message;
        if (userList.state === CollaborationState.NotProvisioned) {
          label = StringResources.vsc.commandsTreeViewProvider.unableToFindTeamsAppRegistration;
        }

        result[env] = [generateCollaboratorWarningNode(env, label, toolTip)];
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.ListCollaborator, {
          [TelemetryProperty.Success]: TelemetrySuccess.Yes,
        });
      } else {
        throw userList.error.error;
      }
    } catch (e) {
      ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.ListCollaborator, e);
      VsCodeLogInstance.warning(
        `code:${e.source}.${e.name}, message: Failed to list collaborator for environment '${env}':  ${e.message}`
      );
      result[env] = [generateCollaboratorWarningNode(env, e.message)];
    }
  }

  return result;
}

export async function checkPermission(env: string): Promise<boolean> {
  let result = false;
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.CheckPermissionStart);

  try {
    const checkCoreRes = checkCoreNotEmpty();
    if (checkCoreRes.isErr()) {
      throw checkCoreRes.error;
    }

    const inputs: Inputs = getSystemInputs();
    inputs.env = env;
    const permissions = await core.checkPermission(inputs);
    if (permissions.isErr()) {
      throw permissions.error;
    }
    if (permissions.value.state === CollaborationState.OK) {
      const teamsAppPermission = permissions.value.permissions.find(
        (permission: any) => permission.name === "Teams App"
      );
      const aadPermission = permissions.value.permissions.find(
        (permission: any) => permission.name === "Azure AD App"
      );
      result =
        (teamsAppPermission.roles?.includes("Administrator") ?? false) &&
        (aadPermission.roles?.includes("Owner") ?? false);
      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.CheckPermission, {
        [TelemetryProperty.Success]: TelemetrySuccess.Yes,
        [TelemetryProperty.CollaborationState]: permissions.value.state.toString(),
      });
    } else {
      result = false;
      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.CheckPermission, {
        [TelemetryProperty.Success]: TelemetrySuccess.Yes,
        [TelemetryProperty.CollaborationState]: permissions.value.state.toString(),
      });
    }
  } catch (e) {
    ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.CheckPermission, e);
    result = false;
  }

  return result;
}

export async function openM365AccountHandler() {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenM365Portal);
  return env.openExternal(Uri.parse("https://admin.microsoft.com/Adminportal/"));
}

export async function openAzureAccountHandler() {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.OpenAzurePortal);
  return env.openExternal(Uri.parse("https://portal.azure.com/"));
}

export function saveTextDocumentHandler(document: vscode.TextDocumentWillSaveEvent) {
  if (!isValidProject(getWorkspacePath())) {
    return;
  }

  let reason: TelemetryUpdateAppReason | undefined = undefined;
  switch (document.reason) {
    case vscode.TextDocumentSaveReason.Manual:
      reason = TelemetryUpdateAppReason.Manual;
      break;
    case vscode.TextDocumentSaveReason.AfterDelay:
      reason = TelemetryUpdateAppReason.AfterDelay;
      break;
    case vscode.TextDocumentSaveReason.FocusOut:
      reason = TelemetryUpdateAppReason.FocusOut;
      break;
  }

  let curDirectory = path.dirname(document.document.fileName);
  while (curDirectory) {
    if (isValidProject(curDirectory)) {
      ExtTelemetry.sendTelemetryEvent(TelemetryEvent.UpdateTeamsApp, {
        [TelemetryProperty.UpdateTeamsAppReason]: reason,
      });
      return;
    }

    if (curDirectory === path.join(curDirectory, "..")) {
      break;
    }
    curDirectory = path.join(curDirectory, "..");
  }
}

export async function cmdHdlLoadTreeView(context: ExtensionContext) {
  if (
    await exp
      .getExpService()
      .getTreatmentVariableAsync(
        TreatmentVariables.VSCodeConfig,
        TreatmentVariables.CustomizeTreeview,
        true
      )
  ) {
    vscode.commands.executeCommand("setContext", "fx-extension.customizedTreeview", true);
  } else {
    vscode.commands.executeCommand("setContext", "fx-extension.customizedTreeview", false);
  }
  if (!isValidProject(getWorkspacePath())) {
    const disposables = await TreeViewManagerInstance.registerEmptyProjectTreeViews();
    context.subscriptions.push(...disposables);
  } else {
    const disposables = await TreeViewManagerInstance.registerTreeViews();
    context.subscriptions.push(...disposables);
  }

  // Register SignOut tree view command
  commands.registerCommand("fx-extension.signOut", async (node: TreeViewCommand) => {
    try {
      switch (node.contextValue) {
        case "signedinM365": {
          Correlator.run(() => {
            signOutM365(true);
          });
          break;
        }
        case "signedinAzure": {
          Correlator.run(() => {
            signOutAzure(true);
          });
          break;
        }
      }
    } catch (e) {
      showError(e);
    }
  });

  commands.registerCommand("fx-extension.signInGuideline", async (node: TreeViewCommand) => {
    // TODO: update the link when documentation is ready
    switch (node.contextValue) {
      case "signinM365": {
        await env.openExternal(Uri.parse("https://www.office.com/"));
        break;
      }
      case "signinAzure": {
        await env.openExternal(Uri.parse("https://portal.azure.com/"));
        break;
      }
    }
  });
}

export function cmdHdlDisposeTreeView() {
  TreeViewManagerInstance.dispose();
}

export async function showError(e: UserError | SystemError) {
  if (e.stack) {
    VsCodeLogInstance.error(`code:${e.source}.${e.name}, message: ${e.message}, stack: ${e.stack}`);
  } else {
    VsCodeLogInstance.error(`code:${e.source}.${e.name}, message: ${e.message}`);
  }

  const errorCode = `${e.source}.${e.name}`;
  if (isUserCancelError(e)) {
    return;
  } else if ("helpLink" in e && e.helpLink && typeof e.helpLink != "undefined") {
    const help = {
      title: StringResources.vsc.handlers.getHelp,
      run: async (): Promise<void> => {
        commands.executeCommand("vscode.open", Uri.parse(`${e.helpLink}#${e.source}${e.name}`));
      },
    };

    const button = await window.showErrorMessage(`[${errorCode}]: ${e.message}`, help);
    if (button) await button.run();
  } else if (e instanceof SystemError) {
    const sysError = e as SystemError;
    const path = "https://github.com/OfficeDev/TeamsFx/issues/new?";
    const param = `title=bug+report: ${errorCode}&body=${anonymizeFilePaths(
      e.message
    )}\n\nstack:\n${anonymizeFilePaths(e.stack)}\n\n${
      sysError.userData ? anonymizeFilePaths(sysError.userData) : ""
    }`;
    const issue = {
      title: StringResources.vsc.handlers.reportIssue,
      run: async (): Promise<void> => {
        commands.executeCommand("vscode.open", Uri.parse(`${path}${param}`));
      },
    };

    const button = await window.showErrorMessage(`[${errorCode}]: ${e.message}`, issue);
    if (button) await button.run();
  } else {
    await window.showErrorMessage(`[${errorCode}]: ${e.message}`);
  }
}

export async function cmpAccountsHandler() {
  const signInAzureOption: VscQuickPickItem = {
    id: "signInAzure",
    label: StringResources.vsc.handlers.signInAzure,
    function: () => signInAzure(),
  };

  const signOutAzureOption: VscQuickPickItem = {
    id: "signOutAzure",
    label: StringResources.vsc.handlers.signOutOfAzure,
    function: async () =>
      Correlator.run(() => {
        signOutAzure(false);
      }),
  };

  const signInM365Option: VscQuickPickItem = {
    id: "signinM365",
    label: StringResources.vsc.handlers.signIn365,
    function: () => signInM365(),
  };

  const signOutM365Option: VscQuickPickItem = {
    id: "signOutM365",
    label: StringResources.vsc.handlers.signOutOfM365,
    function: async () =>
      Correlator.run(() => {
        signOutM365(false);
      }),
  };

  //TODO: hide subscription list until core or api expose the get subscription list API
  // let selectSubscriptionOption: VscQuickPickItem = {
  //   id: "selectSubscription",
  //   label: "Specify an Azure Subscription",
  //   function: () => selectSubscription(),
  //   detail: "4 subscriptions discovered"
  // };

  const quickPick = window.createQuickPick();

  const quickItemOptionArray: VscQuickPickItem[] = [];

  const m365Account = await AppStudioTokenInstance.getStatus();
  if (m365Account.status === "SignedIn") {
    const accountInfo = m365Account.accountInfo;
    const email = (accountInfo as any).upn ? (accountInfo as any).upn : undefined;
    if (email !== undefined) {
      signOutM365Option.label = signOutM365Option.label.concat(email);
    }
    quickItemOptionArray.push(signOutM365Option);
  } else {
    quickItemOptionArray.push(signInM365Option);
  }

  const solutionSettings = await getAzureSolutionSettings();
  // if non-teamsfx project or Azure project then show Azure account info
  if (!solutionSettings || (solutionSettings && "Azure" === solutionSettings.hostType)) {
    const azureAccount = await AzureAccountManager.getStatus();
    if (azureAccount.status === "SignedIn") {
      const accountInfo = azureAccount.accountInfo;
      const email = (accountInfo as any).upn ? (accountInfo as any).upn : undefined;
      if (email !== undefined) {
        signOutAzureOption.label = signOutAzureOption.label.concat(email);
      }
      quickItemOptionArray.push(signOutAzureOption);
      //quickItemOptionArray.push(selectSubscriptionOption);
    } else {
      quickItemOptionArray.push(signInAzureOption);
    }
  }

  quickPick.items = quickItemOptionArray;
  quickPick.onDidChangeSelection((selection) => {
    if (selection[0]) {
      (selection[0] as VscQuickPickItem).function().catch(console.error);
    }
  });
  quickPick.onDidHide(() => quickPick.dispose());
  quickPick.show();
}

export async function decryptSecret(cipher: string, selection: vscode.Range): Promise<void> {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.EditSecretStart, {
    [TelemetryProperty.TriggerFrom]: TelemetryTiggerFrom.Other,
  });
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }
  const inputs = getSystemInputs();
  const result = await core.decrypt(cipher, inputs);
  if (result.isOk()) {
    const editedSecret = await VS_CODE_UI.inputText({
      name: "Secret Editor",
      title: StringResources.vsc.handlers.editSecretTitle,
      default: result.value,
    });
    if (editedSecret.isOk() && editedSecret.value.result) {
      const newCiphertext = await core.encrypt(editedSecret.value.result, inputs);
      if (newCiphertext.isOk()) {
        editor.edit((editBuilder) => {
          editBuilder.replace(selection, newCiphertext.value);
        });
        ExtTelemetry.sendTelemetryEvent(TelemetryEvent.EditSecret, {
          [TelemetryProperty.Success]: TelemetrySuccess.Yes,
        });
      } else {
        ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.EditSecret, newCiphertext.error);
      }
    }
  } else {
    ExtTelemetry.sendTelemetryErrorEvent(TelemetryEvent.EditSecret, result.error);
    window.showErrorMessage(StringResources.vsc.handlers.decryptFailed);
  }
}

export async function signOutAzure(isFromTreeView: boolean) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.SignOutStart, {
    [TelemetryProperty.TriggerFrom]: isFromTreeView
      ? TelemetryTiggerFrom.TreeView
      : TelemetryTiggerFrom.CommandPalette,
    [TelemetryProperty.AccountType]: AccountType.Azure,
  });
  const result = await AzureAccountManager.signout();
  if (result) {
    await TreeViewManagerInstance.getTreeView("teamsfx-accounts")!.refresh([
      {
        commandId: "fx-extension.signinAzure",
        label: StringContext.getSignInAzureContext(),
        contextValue: "signinAzure",
      },
    ]);
    await TreeViewManagerInstance.getTreeView("teamsfx-accounts")!.remove([
      {
        commandId: "fx-extension.selectSubscription",
        label: "",
        parent: "fx-extension.signinAzure",
      },
    ]);
  }
}

export async function signOutM365(isFromTreeView: boolean) {
  ExtTelemetry.sendTelemetryEvent(TelemetryEvent.SignOutStart, {
    [TelemetryProperty.TriggerFrom]: isFromTreeView
      ? TelemetryTiggerFrom.TreeView
      : TelemetryTiggerFrom.CommandPalette,
    [TelemetryProperty.AccountType]: AccountType.M365,
  });
  let appstudioLogin: AppStudioTokenProvider = AppStudioTokenInstance;
  const vscodeEnv = detectVsCodeEnv();
  if (vscodeEnv === VsCodeEnv.codespaceBrowser || vscodeEnv === VsCodeEnv.codespaceVsCode) {
    appstudioLogin = AppStudioCodeSpaceTokenInstance;
  }
  const result = await appstudioLogin.signout();
  if (result) {
    await TreeViewManagerInstance.getTreeView("teamsfx-accounts")!.refresh([
      {
        commandId: "fx-extension.signinM365",
        label: StringResources.vsc.handlers.signIn365,
        contextValue: "signinM365",
      },
    ]);
    await TreeViewManagerInstance.getTreeView("teamsfx-accounts")!.remove([
      {
        commandId: "fx-extension.checkSideloading",
        label: "",
        parent: "fx-extension.signinM365",
      },
    ]);
  }

  await registerEnvTreeHandler();
}

export async function signInAzure() {
  vscode.commands.executeCommand("fx-extension.signinAzure");
}

export async function signInM365() {
  vscode.commands.executeCommand("fx-extension.signinM365");
}

export async function selectSubscription() {
  vscode.commands.executeCommand("fx-extension.specifySubscription");
}

export interface VscQuickPickItem extends QuickPickItem {
  /**
   * Current id of the option item.
   */
  id: string;

  function: () => Promise<void>;
}

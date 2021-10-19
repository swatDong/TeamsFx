// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { AssertConfigNotEmpty, BuildError, NoValidOpenApiDocument } from "../error";
import {
  LogProvider,
  OptionItem,
  SingleSelectQuestion,
  PluginContext,
  FuncQuestion,
  TextInputQuestion,
  TelemetryReporter,
  Inputs,
  ValidationSchema,
} from "@microsoft/teamsfx-api";
import {
  ApimDefaultValues,
  ApimPluginConfigKeys,
  QuestionConstants,
  TeamsToolkitComponent,
} from "../constants";
import { ApimPluginConfig, SolutionConfig } from "../config";
import { ApimService } from "../services/apimService";
import { OpenApiProcessor } from "../utils/openApiProcessor";
import { buildAnswer } from "../answer";
import { NamingRules } from "../utils/namingRules";
import { BaseQuestionService, IQuestionService } from "./question";
import { getApimServiceNameFromResourceId, Lazy } from "../utils/commonUtils";
import { getResourceGroupNameFromResourceId, isArmSupportEnabled } from "../../../..";

export class ApimServiceQuestion extends BaseQuestionService implements IQuestionService {
  private readonly lazyApimService: Lazy<ApimService>;

  constructor(
    lazyApimService: Lazy<ApimService>,
    telemetryReporter?: TelemetryReporter,
    logger?: LogProvider
  ) {
    super(telemetryReporter, logger);
    this.lazyApimService = lazyApimService;
  }

  public getQuestion(): SingleSelectQuestion {
    return {
      type: "singleSelect",
      name: QuestionConstants.VSCode.Apim.questionName,
      title: QuestionConstants.VSCode.Apim.description,
      staticOptions: [
        {
          id: QuestionConstants.VSCode.Apim.createNewApimOption,
          label: QuestionConstants.VSCode.Apim.createNewApimOption,
        },
      ],
      dynamicOptions: async (inputs: Inputs): Promise<OptionItem[]> => {
        return this.getDynamicOptions();
      },
      returnObject: true,
      skipSingleOption: false,
    };
  }

  private async getDynamicOptions(): Promise<OptionItem[]> {
    const apimService: ApimService = await this.lazyApimService.getValue();
    const apimServiceList = await apimService.listService();
    const existingOptions = apimServiceList.map((apimService) => {
      return {
        id: apimService.serviceName,
        label: apimService.serviceName,
        description: apimService.resourceGroupName,
        data: apimService,
      };
    });
    const newOption = {
      id: QuestionConstants.VSCode.Apim.createNewApimOption,
      label: QuestionConstants.VSCode.Apim.createNewApimOption,
    };
    return [newOption, ...existingOptions];
  }
}

export class OpenApiDocumentQuestion extends BaseQuestionService implements IQuestionService {
  private readonly openApiProcessor: OpenApiProcessor;

  constructor(
    openApiProcessor: OpenApiProcessor,
    telemetryReporter?: TelemetryReporter,
    logger?: LogProvider
  ) {
    super(telemetryReporter, logger);
    this.openApiProcessor = openApiProcessor;
  }

  public getQuestion(ctx: PluginContext): SingleSelectQuestion {
    return {
      type: "singleSelect",
      name: QuestionConstants.VSCode.OpenApiDocument.questionName,
      title: QuestionConstants.VSCode.OpenApiDocument.description,
      staticOptions: [],
      dynamicOptions: async (inputs: Inputs): Promise<OptionItem[]> => {
        return this.getDynamicOptions(ctx.root);
      },
      returnObject: true,
      skipSingleOption: false,
    };
  }

  private async getDynamicOptions(root: string): Promise<OptionItem[]> {
    const filePath2OpenApiMap = await this.openApiProcessor.listOpenApiDocument(
      root,
      QuestionConstants.VSCode.OpenApiDocument.excludeFolders,
      QuestionConstants.VSCode.OpenApiDocument.openApiDocumentFileExtensions
    );

    if (filePath2OpenApiMap.size === 0) {
      throw BuildError(NoValidOpenApiDocument);
    }

    const result: OptionItem[] = [];
    filePath2OpenApiMap.forEach((value, key) => result.push({ id: key, label: key, data: value }));
    return result;
  }
}

export class ExistingOpenApiDocumentFunc extends BaseQuestionService implements IQuestionService {
  private readonly openApiProcessor: OpenApiProcessor;

  constructor(
    openApiProcessor: OpenApiProcessor,
    telemetryReporter?: TelemetryReporter,
    logger?: LogProvider
  ) {
    super(telemetryReporter, logger);
    this.openApiProcessor = openApiProcessor;
  }

  public getQuestion(ctx: PluginContext): FuncQuestion {
    return {
      type: "func",
      name: QuestionConstants.VSCode.ExistingOpenApiDocument.questionName,
      func: async (inputs: Inputs): Promise<OptionItem> => {
        const apimConfig = new ApimPluginConfig(ctx.config);
        const openApiDocumentPath = AssertConfigNotEmpty(
          TeamsToolkitComponent.ApimPlugin,
          ApimPluginConfigKeys.apiDocumentPath,
          apimConfig.apiDocumentPath
        );
        const openApiDocument = await this.openApiProcessor.loadOpenApiDocument(
          openApiDocumentPath,
          ctx.root
        );
        return { id: openApiDocumentPath, label: openApiDocumentPath, data: openApiDocument };
      },
    };
  }
}

export class ApiPrefixQuestion extends BaseQuestionService implements IQuestionService {
  constructor(telemetryReporter?: TelemetryReporter, logger?: LogProvider) {
    super(telemetryReporter, logger);
  }

  public getQuestion(): TextInputQuestion {
    return {
      type: "text",
      name: QuestionConstants.VSCode.ApiPrefix.questionName,
      title: QuestionConstants.VSCode.ApiPrefix.description,
      prompt: QuestionConstants.VSCode.ApiPrefix.prompt,
      default: async (inputs: Inputs): Promise<string> => {
        const apiTitle = buildAnswer(inputs)?.openApiDocumentSpec?.info.title;
        let apiPrefix: string | undefined;
        if (apiTitle) {
          apiPrefix = NamingRules.apiPrefix.sanitize(apiTitle);
        }

        return apiPrefix ? apiPrefix : ApimDefaultValues.apiPrefix;
      },
      validation: {
        validFunc: (input: string, previousInputs?: Inputs): string | undefined =>
          NamingRules.validate(input as string, NamingRules.apiPrefix),
      },
    };
  }
}

export class ApiVersionQuestion extends BaseQuestionService implements IQuestionService {
  private readonly lazyApimService: Lazy<ApimService>;

  constructor(
    lazyApimService: Lazy<ApimService>,
    telemetryReporter?: TelemetryReporter,
    logger?: LogProvider
  ) {
    super(telemetryReporter, logger);
    this.lazyApimService = lazyApimService;
  }

  public getQuestion(ctx: PluginContext): SingleSelectQuestion {
    return {
      type: "singleSelect",
      name: QuestionConstants.VSCode.ApiVersion.questionName,
      title: QuestionConstants.VSCode.ApiVersion.description,
      staticOptions: [],
      dynamicOptions: async (inputs: Inputs): Promise<OptionItem[]> => {
        return this.getDynamicOptions(inputs, ctx);
      },
      returnObject: true,
      skipSingleOption: false,
    };
  }

  private async getDynamicOptions(inputs: Inputs, ctx: PluginContext): Promise<OptionItem[]> {
    const apimService = await this.lazyApimService.getValue();
    const apimConfig = new ApimPluginConfig(ctx.config);
    const solutionConfig = new SolutionConfig(ctx.envInfo.profile);
    const answer = buildAnswer(inputs);
    let resourceGroupName, serviceName;
    if (isArmSupportEnabled()) {
      const apimServiceResourceId = AssertConfigNotEmpty(
        TeamsToolkitComponent.ApimPlugin,
        ApimPluginConfigKeys.serviceResourceId,
        apimConfig.serviceResourceId
      );
      resourceGroupName = getResourceGroupNameFromResourceId(apimServiceResourceId);
      serviceName = getApimServiceNameFromResourceId(apimServiceResourceId);
    } else {
      resourceGroupName = apimConfig.resourceGroupName ?? solutionConfig.resourceGroupName;
      serviceName = AssertConfigNotEmpty(
        TeamsToolkitComponent.ApimPlugin,
        ApimPluginConfigKeys.serviceName,
        apimConfig.serviceName
      );
    }
    const apiPrefix =
      answer.apiPrefix ??
      AssertConfigNotEmpty(
        TeamsToolkitComponent.ApimPlugin,
        ApimPluginConfigKeys.apiPrefix,
        apimConfig.apiPrefix
      );
    const versionSetId =
      apimConfig.versionSetId ??
      NamingRules.versionSetId.sanitize(apiPrefix, solutionConfig.resourceNameSuffix);

    const apiContracts = await apimService.listApi(resourceGroupName, serviceName, versionSetId);

    const existingApiVersionOptions: OptionItem[] = apiContracts.map((api) => {
      const result: OptionItem = {
        id: api.name ?? "",
        label: api.apiVersion ?? "",
        description: api.name ?? "",
        data: api,
      };
      return result;
    });
    const createNewApiVersionOption: OptionItem = {
      id: QuestionConstants.VSCode.ApiVersion.createNewApiVersionOption,
      label: QuestionConstants.VSCode.ApiVersion.createNewApiVersionOption,
    };
    return [createNewApiVersionOption, ...existingApiVersionOptions];
  }
}

export class NewApiVersionQuestion extends BaseQuestionService implements IQuestionService {
  constructor(telemetryReporter?: TelemetryReporter, logger?: LogProvider) {
    super(telemetryReporter, logger);
  }

  public condition(): { target?: string } & ValidationSchema {
    return {
      equals: QuestionConstants.VSCode.ApiVersion.createNewApiVersionOption,
    };
  }

  public getQuestion(): TextInputQuestion {
    return {
      type: "text",
      name: QuestionConstants.VSCode.NewApiVersion.questionName,
      title: QuestionConstants.VSCode.NewApiVersion.description,
      default: async (inputs: Inputs): Promise<string> => {
        const apiVersion = buildAnswer(inputs)?.openApiDocumentSpec?.info.version;
        let versionIdentity: string | undefined;
        if (apiVersion) {
          versionIdentity = NamingRules.versionIdentity.sanitize(apiVersion);
        }

        return versionIdentity ? versionIdentity : ApimDefaultValues.apiVersion;
      },
      validation: {
        validFunc: (input: string, previousInputs?: Inputs): string | undefined =>
          NamingRules.validate(input as string, NamingRules.versionIdentity),
      },
    };
  }
}

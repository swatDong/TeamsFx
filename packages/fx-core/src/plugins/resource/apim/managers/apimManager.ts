// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import {
  ApimArmOutput,
  ApimDefaultValues,
  ApimPathInfo,
  ApimPluginConfigKeys,
  TeamsToolkitComponent,
} from "../constants";
import { AssertConfigNotEmpty, AssertNotEmpty } from "../error";
import {
  IAadPluginConfig,
  IApimPluginConfig,
  IFunctionPluginConfig,
  ISolutionConfig,
  SolutionConfig,
} from "../config";
import { ApimService } from "../services/apimService";
import { OpenApiProcessor } from "../utils/openApiProcessor";
import { IAnswer } from "../answer";
import {
  AzureSolutionSettings,
  LogProvider,
  PluginContext,
  TelemetryReporter,
} from "@microsoft/teamsfx-api";
import {
  getApimServiceNameFromResourceId,
  getAuthServiceNameFromResourceId,
  getproductNameFromResourceId,
  Lazy,
} from "../utils/commonUtils";
import { NamingRules } from "../utils/namingRules";
import {
  generateBicepFiles,
  getResourceGroupNameFromResourceId,
  getTemplatesFolder,
  isArmSupportEnabled,
} from "../../../..";
import path from "path";
import { Bicep, ConstantString } from "../../../../common/constants";
import { ScaffoldArmTemplateResult } from "../../../../common/armInterface";
import * as fs from "fs-extra";
import { getArmOutput } from "../../utils4v2";

export class ApimManager {
  private readonly logger: LogProvider | undefined;
  private readonly telemetryReporter: TelemetryReporter | undefined;
  private readonly lazyApimService: Lazy<ApimService>;
  private readonly openApiProcessor: OpenApiProcessor;

  constructor(
    lazyApimService: Lazy<ApimService>,
    openApiProcessor: OpenApiProcessor,
    telemetryReporter?: TelemetryReporter,
    logger?: LogProvider
  ) {
    this.lazyApimService = lazyApimService;
    this.openApiProcessor = openApiProcessor;
    this.logger = logger;
    this.telemetryReporter = telemetryReporter;
  }

  public async provision(
    apimConfig: IApimPluginConfig,
    solutionConfig: ISolutionConfig,
    appName: string
  ): Promise<void> {
    const apimService: ApimService = await this.lazyApimService.getValue();
    const currentUserId = await apimService.getUserId();

    if (isArmSupportEnabled()) {
      if (!apimConfig.publisherEmail) {
        apimConfig.publisherEmail = currentUserId;
      }
      if (!apimConfig.publisherName) {
        apimConfig.publisherName = currentUserId;
      }
    } else {
      await apimService.ensureResourceProvider();

      const resourceGroupName = apimConfig.resourceGroupName ?? solutionConfig.resourceGroupName;
      const apimServiceName =
        apimConfig.serviceName ??
        NamingRules.apimServiceName.sanitize(appName, solutionConfig.resourceNameSuffix);

      await apimService.createService(
        resourceGroupName,
        apimServiceName,
        solutionConfig.location,
        currentUserId
      );
      apimConfig.serviceName = apimServiceName;

      const productId =
        apimConfig.productId ??
        NamingRules.productId.sanitize(appName, solutionConfig.resourceNameSuffix);
      await apimService.createProduct(resourceGroupName, apimServiceName, productId);
      apimConfig.productId = productId;
    }
  }

  public async postProvision(
    apimConfig: IApimPluginConfig,
    ctx: PluginContext,
    aadConfig: IAadPluginConfig,
    appName: string
  ): Promise<void> {
    if (isArmSupportEnabled()) {
      apimConfig.serviceResourceId = getArmOutput(ctx, ApimArmOutput.ServiceResourceId);
      apimConfig.productResourceId = getArmOutput(ctx, ApimArmOutput.ProductResourceId);
      apimConfig.authServerResourceId = getArmOutput(ctx, ApimArmOutput.AuthServerResourceId);
      apimConfig.publisherEmail = getArmOutput(ctx, ApimArmOutput.PublisherEmail);
      apimConfig.publisherName = getArmOutput(ctx, ApimArmOutput.PublisherName);
    } else {
      const solutionConfig = new SolutionConfig(ctx.envInfo.state);
      const apimService: ApimService = await this.lazyApimService.getValue();
      const resourceGroupName = apimConfig.resourceGroupName ?? solutionConfig.resourceGroupName;
      const apimServiceName = AssertConfigNotEmpty(
        TeamsToolkitComponent.ApimPlugin,
        ApimPluginConfigKeys.serviceName,
        apimConfig.serviceName
      );
      const clientId = AssertConfigNotEmpty(
        TeamsToolkitComponent.ApimPlugin,
        ApimPluginConfigKeys.apimClientAADClientId,
        apimConfig.apimClientAADClientId
      );
      const clientSecret = AssertConfigNotEmpty(
        TeamsToolkitComponent.ApimPlugin,
        ApimPluginConfigKeys.apimClientAADClientSecret,
        apimConfig.apimClientAADClientSecret
      );

      const oAuthServerId =
        apimConfig.oAuthServerId ??
        NamingRules.oAuthServerId.sanitize(appName, solutionConfig.resourceNameSuffix);
      const scopeName = `${aadConfig.applicationIdUris}/${ApimDefaultValues.enableScopeName}`;
      await apimService.createOrUpdateOAuthService(
        resourceGroupName,
        apimServiceName,
        oAuthServerId,
        solutionConfig.teamsAppTenantId,
        clientId,
        clientSecret,
        scopeName
      );
      apimConfig.oAuthServerId = oAuthServerId;
    }
  }

  public async deploy(
    apimConfig: IApimPluginConfig,
    solutionConfig: ISolutionConfig,
    functionConfig: IFunctionPluginConfig,
    answer: IAnswer,
    projectRootPath: string
  ): Promise<void> {
    const apimService: ApimService = await this.lazyApimService.getValue();

    let resourceGroupName, apimServiceName, authServerId, productId;

    if (isArmSupportEnabled()) {
      const apimServiceResourceId = AssertConfigNotEmpty(
        TeamsToolkitComponent.ApimPlugin,
        ApimPluginConfigKeys.serviceResourceId,
        apimConfig.serviceResourceId
      );
      const apimProductResourceId = AssertConfigNotEmpty(
        TeamsToolkitComponent.ApimPlugin,
        ApimPluginConfigKeys.productResourceId,
        apimConfig.productResourceId
      );
      const authServerResourceId = AssertConfigNotEmpty(
        TeamsToolkitComponent.ApimPlugin,
        ApimPluginConfigKeys.authServerResourceId,
        apimConfig.authServerResourceId
      );
      resourceGroupName = getResourceGroupNameFromResourceId(apimServiceResourceId);
      apimServiceName = getApimServiceNameFromResourceId(apimServiceResourceId);
      authServerId = getAuthServiceNameFromResourceId(authServerResourceId);
      productId = getproductNameFromResourceId(apimProductResourceId);
    } else {
      resourceGroupName = apimConfig.resourceGroupName ?? solutionConfig.resourceGroupName;
      apimServiceName = AssertConfigNotEmpty(
        TeamsToolkitComponent.ApimPlugin,
        ApimPluginConfigKeys.serviceName,
        apimConfig.serviceName
      );
      authServerId = AssertConfigNotEmpty(
        TeamsToolkitComponent.ApimPlugin,
        ApimPluginConfigKeys.oAuthServerId,
        apimConfig.oAuthServerId
      );
      productId = AssertConfigNotEmpty(
        TeamsToolkitComponent.ApimPlugin,
        ApimPluginConfigKeys.productId,
        apimConfig.productId
      );
    }

    const apiPrefix = AssertConfigNotEmpty(
      TeamsToolkitComponent.ApimPlugin,
      ApimPluginConfigKeys.apiPrefix,
      apimConfig.apiPrefix
    );
    const apiDocumentPath = AssertConfigNotEmpty(
      TeamsToolkitComponent.ApimPlugin,
      ApimPluginConfigKeys.apiDocumentPath,
      apimConfig.apiDocumentPath
    );
    const versionIdentity = AssertNotEmpty("versionAnswer.versionIdentity", answer.versionIdentity);

    const apiId =
      answer.apiId ??
      NamingRules.apiId.sanitize(apiPrefix, versionIdentity, solutionConfig.resourceNameSuffix);
    const versionSetId =
      apimConfig.versionSetId ??
      NamingRules.versionSetId.sanitize(apiPrefix, solutionConfig.resourceNameSuffix);
    const apiPath =
      apimConfig.apiPath ??
      NamingRules.apiPath.sanitize(apiPrefix, solutionConfig.resourceNameSuffix);

    const openApiDocument = await this.openApiProcessor.loadOpenApiDocument(
      apiDocumentPath,
      projectRootPath
    );
    const spec = this.openApiProcessor.patchOpenApiDocument(
      openApiDocument.spec,
      openApiDocument.schemaVersion,
      functionConfig.functionEndpoint,
      ApimDefaultValues.functionBasePath
    );

    const versionSetDisplayName = NamingRules.versionSetDisplayName.sanitize(
      openApiDocument.spec.info.title
    );

    await apimService.createVersionSet(
      resourceGroupName,
      apimServiceName,
      versionSetId,
      versionSetDisplayName
    );
    apimConfig.versionSetId = versionSetId;

    await apimService.importApi(
      resourceGroupName,
      apimServiceName,
      apiId,
      apiPath,
      versionIdentity,
      versionSetId,
      authServerId,
      openApiDocument.schemaVersion,
      spec
    );
    apimConfig.apiPath = apiPath;

    await apimService.addApiToProduct(resourceGroupName, apimServiceName, productId, apiId);
  }

  public async generateArmTemplates(
    solutionConfig: AzureSolutionSettings
  ): Promise<ScaffoldArmTemplateResult> {
    const bicepTemplateDir = path.join(getTemplatesFolder(), ApimPathInfo.BicepTemplateRelativeDir);

    const handleBarsContext = {
      Plugins: solutionConfig.activeResourcePlugins,
    };
    const moduleOrchestrationContentResult = await generateBicepFiles(
      path.join(bicepTemplateDir, Bicep.ModuleOrchestrationFileName),
      handleBarsContext
    );
    if (moduleOrchestrationContentResult.isErr()) {
      throw moduleOrchestrationContentResult.error;
    }

    const result: ScaffoldArmTemplateResult = {
      Modules: {
        apimProvision: {
          Content: await fs.readFile(
            path.join(bicepTemplateDir, ApimPathInfo.ProvisionModuleTemplateFileName),
            ConstantString.UTF8Encoding
          ),
        },
      },
      Orchestration: {
        ParameterTemplate: {
          Content: await fs.readFile(
            path.join(bicepTemplateDir, Bicep.ParameterOrchestrationFileName),
            ConstantString.UTF8Encoding
          ),
          ParameterJson: JSON.parse(
            await fs.readFile(
              path.join(bicepTemplateDir, Bicep.ParameterFileName),
              ConstantString.UTF8Encoding
            )
          ),
        },
        ModuleTemplate: {
          Content: moduleOrchestrationContentResult.value,
        },
        OutputTemplate: {
          Content: await fs.readFile(
            path.join(bicepTemplateDir, Bicep.OutputOrchestrationFileName),
            ConstantString.UTF8Encoding
          ),
        },
      },
    };

    return result;
  }
}

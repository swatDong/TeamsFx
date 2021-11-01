// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
import { WebSiteManagementClient } from "@azure/arm-appservice";
import { TokenCredentialsBase } from "@azure/ms-rest-nodeauth";
import axios from "axios";
import * as fs from "fs-extra";
import { PluginContext } from "@microsoft/teamsfx-api";
import { Constants, Messages } from "./constants";
import {
  CreateAppServicePlanError,
  CreateWebAppError,
  UpdateApplicationSettingsError,
  ZipDeployError,
  FreeServerFarmsQuotaError,
  MissingSubscriptionRegistrationError,
} from "./errors";
import { ResultFactory } from "./result";
import { DialogUtils } from "./utils/dialog";
import { Providers, ResourceManagementClientContext } from "@azure/arm-resources";
import { Utils } from "./utils/common";

export class WebAppClient {
  private credentials: TokenCredentialsBase;
  private subscriptionId: string;
  private resourceGroupName: string;
  private appServicePlanName: string;
  private webAppName: string;
  private location: string;
  private webSiteManagementClient: WebSiteManagementClient;
  private resourceManagementClient: Providers;
  private ctx: PluginContext;

  constructor(
    credentials: TokenCredentialsBase,
    subscriptionId: string,
    resourceGroupName: string,
    appServicePlanName: string,
    webAppName: string,
    location: string,
    ctx: PluginContext
  ) {
    this.credentials = credentials;
    this.subscriptionId = subscriptionId;
    this.resourceGroupName = resourceGroupName;
    this.appServicePlanName = appServicePlanName;
    this.webAppName = webAppName;
    this.location = location;
    this.webSiteManagementClient = new WebSiteManagementClient(
      this.credentials,
      this.subscriptionId
    );
    this.resourceManagementClient = new Providers(
      new ResourceManagementClientContext(this.credentials, this.subscriptionId)
    );
    this.ctx = ctx;
  }

  public async createWebApp(): Promise<{ endpoint: string; skuName: string }> {
    let skuName: string;

    try {
      // Check and register resource provider
      try {
        DialogUtils.progressBar?.next(Constants.ProgressBar.provision.registerResourceProvider);
        await Promise.all(
          Constants.RequiredResourceProviders.map(
            async (namespace) => await this.resourceManagementClient.register(namespace)
          )
        );
      } catch (error) {
        this.ctx.logProvider?.info(
          Messages.getLog(Constants.RegisterRersourceProviderFailed(error?.message))
        );
      }

      DialogUtils.progressBar?.next(Constants.ProgressBar.provision.createAppServicePlan);
      skuName = this.getSkuName();
      const appServicePlan = await this.webSiteManagementClient.appServicePlans.createOrUpdate(
        this.resourceGroupName,
        this.appServicePlanName,
        {
          location: this.location,
          sku: {
            name: skuName,
          },
        }
      );
      this.ctx.logProvider?.info(
        Messages.getLog("appServicePlan is created: " + appServicePlan.name)
      );
    } catch (error) {
      if (error?.message?.includes(Constants.FreeServerFarmsQuotaErrorFromAzure)) {
        throw ResultFactory.UserError(
          FreeServerFarmsQuotaError.name,
          FreeServerFarmsQuotaError.message(Constants.FreeServerFarmsQuotaErrorToUser),
          error,
          undefined,
          Constants.HelpLink
        );
      }
      if (error?.message?.includes(Constants.MissingSubscriptionRegistrationErrorFromAzure)) {
        throw ResultFactory.UserError(
          MissingSubscriptionRegistrationError.name,
          MissingSubscriptionRegistrationError.message(error?.message),
          error,
          undefined,
          Constants.HelpLink
        );
      }
      if (Utils.isUserError(error)) {
        throw ResultFactory.UserError(
          CreateAppServicePlanError.name,
          CreateAppServicePlanError.message(error?.message),
          error
        );
      } else {
        throw ResultFactory.SystemError(
          CreateAppServicePlanError.name,
          CreateAppServicePlanError.message(error?.message),
          error
        );
      }
    }

    try {
      DialogUtils.progressBar?.next(Constants.ProgressBar.provision.createWebApp);
      const webApp = await this.webSiteManagementClient.webApps.createOrUpdate(
        this.resourceGroupName,
        this.webAppName,
        { location: this.location, serverFarmId: this.appServicePlanName }
      );
      this.ctx.logProvider?.info(Messages.getLog("webApp is created: " + webApp.name));

      return {
        endpoint: `https://${webApp.defaultHostName}`,
        skuName,
      };
    } catch (error) {
      if (Utils.isUserError(error)) {
        throw ResultFactory.UserError(
          CreateWebAppError.name,
          CreateWebAppError.message(error?.message),
          error
        );
      } else {
        throw ResultFactory.SystemError(
          CreateWebAppError.name,
          CreateWebAppError.message(error?.message),
          error
        );
      }
    }
  }

  public async zipDeploy(filePath: string) {
    const token = await this.credentials.getToken();

    try {
      const zipdeployResult = await axios({
        method: "POST",
        url: `https://${this.webAppName}.scm.azurewebsites.net/api/zipdeploy`,
        headers: {
          Authorization: `Bearer ${token.accessToken}`,
        },
        data: await fs.readFile(filePath),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });
      this.ctx.logProvider?.info(Messages.getLog("zipdeploy is done: " + zipdeployResult.status));
    } catch (error) {
      if (Utils.isUserError(error)) {
        throw ResultFactory.UserError(
          ZipDeployError.name,
          ZipDeployError.message(error?.message),
          error
        );
      } else {
        throw ResultFactory.SystemError(
          ZipDeployError.name,
          ZipDeployError.message(error?.message),
          error
        );
      }
    }
  }

  public async configWebApp(properties: { [propertyName: string]: string }) {
    try {
      await this.webSiteManagementClient.webApps.updateApplicationSettings(
        this.resourceGroupName,
        this.webAppName,
        {
          properties,
        }
      );
    } catch (error) {
      if (Utils.isUserError(error)) {
        throw ResultFactory.UserError(
          UpdateApplicationSettingsError.name,
          UpdateApplicationSettingsError.message(error?.message),
          error
        );
      } else {
        throw ResultFactory.SystemError(
          UpdateApplicationSettingsError.name,
          UpdateApplicationSettingsError.message(error?.message),
          error
        );
      }
    }
  }

  /**
   * Allow users to set SKU name for App Service Plan as only 10 free App Service Plan is allowed in a Subscription.
   * The order is:
   * 1. 'skuName' config of 'fx-resource-simple-auth' in env.default.json file
   * 2. 'SIMPLE_AUTH_SKU_NAME' environment variable
   * 3. 'F1' Free Tier
   */
  private getSkuName(): string {
    const skuName = this.ctx.config.get(Constants.SimpleAuthPlugin.configKeys.skuName) as string;

    return skuName ?? process.env.SIMPLE_AUTH_SKU_NAME ?? "F1";
  }
}

// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.

import {
  DependentPluginInfo,
  FrontendPluginInfo,
  TelemetryEvent,
  TelemetryKey,
  TelemetryValue,
} from "../constants";
import { PluginContext, SystemError, UserError } from "@microsoft/teamsfx-api";
import { FrontendPluginError } from "../resources/errors";

export class TelemetryHelper {
  private static ctx?: PluginContext;

  static setContext(ctx: PluginContext): void {
    this.ctx = ctx;
  }

  private static fillCommonProperty(properties: { [key: string]: string }): void {
    properties[TelemetryKey.Component] = FrontendPluginInfo.PluginName;
    properties[TelemetryKey.AppId] =
      (this.ctx?.envInfo.state
        .get(DependentPluginInfo.SolutionPluginName)
        ?.get(DependentPluginInfo.RemoteTeamsAppId) as string) || "";
  }

  static sendStartEvent(
    eventName: string,
    properties: { [key: string]: string } = {},
    measurements: { [key: string]: number } = {}
  ): void {
    TelemetryHelper.fillCommonProperty(properties);

    this.ctx?.telemetryReporter?.sendTelemetryEvent(
      eventName + TelemetryEvent.StartSuffix,
      properties,
      measurements
    );
  }

  static sendSuccessEvent(
    eventName: string,
    properties: { [key: string]: string } = {},
    measurements: { [key: string]: number } = {}
  ): void {
    TelemetryHelper.fillCommonProperty(properties);
    properties[TelemetryKey.Success] = TelemetryValue.Success;

    this.ctx?.telemetryReporter?.sendTelemetryEvent(eventName, properties, measurements);
  }

  static sendErrorEvent(
    eventName: string,
    e: SystemError | UserError,
    properties: { [key: string]: string } = {},
    measurements: { [key: string]: number } = {}
  ): void {
    TelemetryHelper.fillCommonProperty(properties);
    properties[TelemetryKey.Success] = TelemetryValue.Fail;

    if (e instanceof SystemError) {
      properties[TelemetryKey.ErrorType] = TelemetryValue.SystemError;
    } else if (e instanceof UserError) {
      properties[TelemetryKey.ErrorType] = TelemetryValue.UserError;
    }
    properties[TelemetryKey.ErrorMessage] = e.message;
    properties[TelemetryKey.ErrorCode] = e.name;

    this.ctx?.telemetryReporter?.sendTelemetryEvent(eventName, properties, measurements);
  }

  static sendScaffoldFallbackEvent(
    e: FrontendPluginError,
    properties: { [key: string]: string } = {},
    measurements: { [key: string]: number } = {}
  ): void {
    TelemetryHelper.fillCommonProperty(properties);
    properties[TelemetryKey.ErrorMessage] = e.message;
    properties[TelemetryKey.ErrorCode] = e.code;

    this.ctx?.telemetryReporter?.sendTelemetryEvent(
      TelemetryEvent.ScaffoldFallback,
      properties,
      measurements
    );
  }

  static sendGeneralEvent(
    eventName: string,
    properties: { [key: string]: string } = {},
    measurements: { [key: string]: number } = {}
  ): void {
    TelemetryHelper.fillCommonProperty(properties);
    this.ctx?.telemetryReporter?.sendTelemetryEvent(eventName, properties, measurements);
  }
}

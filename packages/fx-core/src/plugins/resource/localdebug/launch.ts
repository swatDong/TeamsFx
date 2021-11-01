// Copyright (c) Microsoft Corporation.
// Licensed under the MIT license.
"use strict";

import * as os from "os";
import { LaunchBrowser } from "./constants";

export function generateConfigurations(
  includeFrontend: boolean,
  includeBackend: boolean,
  includeBot: boolean,
  isMigrateFromV1: boolean
): Record<string, unknown>[] {
  let edgeOrder = 2,
    chromeOrder = 1;
  if (os.type() === "Windows_NT") {
    edgeOrder = 1;
    chromeOrder = 2;
  }

  const launchConfigurations: Record<string, unknown>[] = isMigrateFromV1
    ? []
    : [
        {
          name: "Launch Remote (Edge)",
          type: LaunchBrowser.edge,
          request: "launch",
          url: "https://teams.microsoft.com/l/app/${teamsAppId}?installAppPackage=true&webjoin=true&${account-hint}",
          presentation: {
            group: "remote",
            order: edgeOrder,
          },
        },
        {
          name: "Launch Remote (Chrome)",
          type: LaunchBrowser.chrome,
          request: "launch",
          url: "https://teams.microsoft.com/l/app/${teamsAppId}?installAppPackage=true&webjoin=true&${account-hint}",
          presentation: {
            group: "remote",
            order: chromeOrder,
          },
        },
      ];

  // Tab only
  if (includeFrontend && !includeBot) {
    // hidden configurations
    if (includeBackend) {
      launchConfigurations.push(
        {
          name: "Start and Attach to Frontend (Edge)",
          type: LaunchBrowser.edge,
          request: "launch",
          url: "https://teams.microsoft.com/l/app/${localTeamsAppId}?installAppPackage=true&webjoin=true&${account-hint}",
          preLaunchTask: "Start Frontend",
          cascadeTerminateToConfigurations: ["Start and Attach to Backend"],
          presentation: {
            group: "all",
            hidden: true,
          },
        },
        {
          name: "Start and Attach to Frontend (Chrome)",
          type: LaunchBrowser.chrome,
          request: "launch",
          url: "https://teams.microsoft.com/l/app/${localTeamsAppId}?installAppPackage=true&webjoin=true&${account-hint}",
          preLaunchTask: "Start Frontend",
          cascadeTerminateToConfigurations: ["Start and Attach to Backend"],
          presentation: {
            group: "all",
            hidden: true,
          },
        },
        {
          name: "Start and Attach to Backend",
          type: "pwa-node",
          request: "attach",
          port: 9229,
          restart: true,
          preLaunchTask: "Start Backend",
          presentation: {
            group: "all",
            hidden: true,
          },
          internalConsoleOptions: "neverOpen",
        }
      );
    } else {
      launchConfigurations.push(
        {
          name: "Start and Attach to Frontend (Edge)",
          type: LaunchBrowser.edge,
          request: "launch",
          url: "https://teams.microsoft.com/l/app/${localTeamsAppId}?installAppPackage=true&webjoin=true&${account-hint}",
          preLaunchTask: "Start Frontend",
          presentation: {
            group: "all",
            hidden: true,
          },
        },
        {
          name: "Start and Attach to Frontend (Chrome)",
          type: LaunchBrowser.chrome,
          request: "launch",
          url: "https://teams.microsoft.com/l/app/${localTeamsAppId}?installAppPackage=true&webjoin=true&${account-hint}",
          preLaunchTask: "Start Frontend",
          presentation: {
            group: "all",
            hidden: true,
          },
        }
      );
    }
  }

  // Bot only
  if (!includeFrontend && includeBot) {
    launchConfigurations.push(
      {
        name: "Launch Bot (Edge)",
        type: LaunchBrowser.edge,
        request: "launch",
        url: "https://teams.microsoft.com/l/app/${localTeamsAppId}?installAppPackage=true&webjoin=true&${account-hint}",
        cascadeTerminateToConfigurations: ["Start and Attach to Bot"],
        presentation: {
          group: "all",
          hidden: true,
        },
      },
      {
        name: "Launch Bot (Chrome)",
        type: LaunchBrowser.chrome,
        request: "launch",
        url: "https://teams.microsoft.com/l/app/${localTeamsAppId}?installAppPackage=true&webjoin=true&${account-hint}",
        cascadeTerminateToConfigurations: ["Start and Attach to Bot"],
        presentation: {
          group: "all",
          hidden: true,
        },
      },
      {
        name: "Start and Attach to Bot",
        type: "pwa-node",
        request: "attach",
        port: 9239,
        restart: true,
        preLaunchTask: "Start Bot",
        presentation: {
          group: "all",
          hidden: true,
        },
      }
    );
  }

  // Tab and bot
  if (includeFrontend && includeBot) {
    launchConfigurations.push(
      {
        name: "Start and Attach to Frontend (Edge)",
        type: LaunchBrowser.edge,
        request: "launch",
        url: "https://teams.microsoft.com/l/app/${localTeamsAppId}?installAppPackage=true&webjoin=true&${account-hint}",
        preLaunchTask: "Start Frontend",
        cascadeTerminateToConfigurations: includeBackend
          ? ["Start and Attach to Bot", "Start and Attach to Backend"]
          : ["Start and Attach to Bot"],
        presentation: {
          group: "all",
          hidden: true,
        },
      },
      {
        name: "Start and Attach to Frontend (Chrome)",
        type: LaunchBrowser.chrome,
        request: "launch",
        url: "https://teams.microsoft.com/l/app/${localTeamsAppId}?installAppPackage=true&webjoin=true&${account-hint}",
        preLaunchTask: "Start Frontend",
        cascadeTerminateToConfigurations: includeBackend
          ? ["Start and Attach to Bot", "Start and Attach to Backend"]
          : ["Start and Attach to Bot"],
        presentation: {
          group: "all",
          hidden: true,
        },
      },
      {
        name: "Start and Attach to Bot",
        type: "pwa-node",
        request: "attach",
        port: 9239,
        restart: true,
        preLaunchTask: "Start Bot",
        presentation: {
          group: "all",
          hidden: true,
        },
        internalConsoleOptions: "neverOpen",
      }
    );
    if (includeBackend) {
      launchConfigurations.push({
        name: "Start and Attach to Backend",
        type: "pwa-node",
        request: "attach",
        port: 9229,
        restart: true,
        preLaunchTask: "Start Backend",
        presentation: {
          group: "all",
          hidden: true,
        },
        internalConsoleOptions: "neverOpen",
      });
    }
  }

  return launchConfigurations;
}

export function generateCompounds(
  includeFrontend: boolean,
  includeBackend: boolean,
  includeBot: boolean
): Record<string, unknown>[] {
  const launchCompounds: Record<string, unknown>[] = [];
  let edgeOrder = 2,
    chromeOrder = 1;
  if (os.type() === "Windows_NT") {
    edgeOrder = 1;
    chromeOrder = 2;
  }

  // Tab only
  if (includeFrontend && !includeBot) {
    launchCompounds.push(
      {
        name: "Debug (Edge)",
        configurations: includeBackend
          ? ["Start and Attach to Frontend (Edge)", "Start and Attach to Backend"]
          : ["Start and Attach to Frontend (Edge)"],
        preLaunchTask: "Pre Debug Check",
        presentation: {
          group: "all",
          order: edgeOrder,
        },
        stopAll: true,
      },
      {
        name: "Debug (Chrome)",
        configurations: includeBackend
          ? ["Start and Attach to Frontend (Chrome)", "Start and Attach to Backend"]
          : ["Start and Attach to Frontend (Chrome)"],
        preLaunchTask: "Pre Debug Check",
        presentation: {
          group: "all",
          order: chromeOrder,
        },
        stopAll: true,
      }
    );
  }

  // Bot only
  if (!includeFrontend && includeBot) {
    launchCompounds.push(
      {
        name: "Debug (Edge)",
        configurations: ["Launch Bot (Edge)", "Start and Attach to Bot"],
        preLaunchTask: "Pre Debug Check",
        presentation: {
          group: "all",
          order: edgeOrder,
        },
        stopAll: true,
      },
      {
        name: "Debug (Chrome)",
        configurations: ["Launch Bot (Chrome)", "Start and Attach to Bot"],
        preLaunchTask: "Pre Debug Check",
        presentation: {
          group: "all",
          order: chromeOrder,
        },
        stopAll: true,
      }
    );
  }

  // Tab and bot
  if (includeFrontend && includeBot) {
    launchCompounds.push(
      {
        name: "Debug (Edge)",
        configurations: includeBackend
          ? [
              "Start and Attach to Frontend (Edge)",
              "Start and Attach to Bot",
              "Start and Attach to Backend",
            ]
          : ["Start and Attach to Frontend (Edge)", "Start and Attach to Bot"],
        preLaunchTask: "Pre Debug Check",
        presentation: {
          group: "all",
          order: edgeOrder,
        },
        stopAll: true,
      },
      {
        name: "Debug (Chrome)",
        configurations: includeBackend
          ? [
              "Start and Attach to Frontend (Chrome)",
              "Start and Attach to Bot",
              "Start and Attach to Backend",
            ]
          : ["Start and Attach to Frontend (Chrome)", "Start and Attach to Bot"],
        preLaunchTask: "Pre Debug Check",
        presentation: {
          group: "all",
          order: chromeOrder,
        },
        stopAll: true,
      }
    );
  }

  /* No attach until CLI ready
    if (includeBackend) {
        launchCompounds.push(
            {
                name: "Attach to Frontend and Backend (Chrome)",
                configurations: [
                    "Attach to Frontend (Chrome)",
                    "Attach to Backend"
                ],
                presentation: {
                    group: "partial",
                    order: 1
                },
                stopAll: true
            },
            {
                name: "Attach to Frontend and Backend (Edge)",
                configurations: [
                    "Attach to Frontend (Edge)",
                    "Attach to Backend"
                ],
                presentation: {
                    group: "partial",
                    order: 3
                },
                stopAll: true
            }
        );
    }
    */

  return launchCompounds;
}

export function generateSpfxConfigurations(): Record<string, unknown>[] {
  let edgeOrder = 2,
    chromeOrder = 1;
  if (os.type() === "Windows_NT") {
    edgeOrder = 1;
    chromeOrder = 2;
  }

  return [
    {
      name: "Local workbench (Edge)",
      type: LaunchBrowser.edge,
      request: "launch",
      url: "https://localhost:5432/workbench",
      webRoot: "${workspaceRoot}/SPFx",
      sourceMaps: true,
      sourceMapPathOverrides: {
        "webpack:///.././src/*": "${webRoot}/src/*",
        "webpack:///../../../src/*": "${webRoot}/src/*",
        "webpack:///../../../../src/*": "${webRoot}/src/*",
        "webpack:///../../../../../src/*": "${webRoot}/src/*",
      },
      runtimeArgs: ["--remote-debugging-port=9222"],
      preLaunchTask: "gulp serve",
      postDebugTask: "Terminate All Tasks",
      presentation: {
        group: "local",
        order: edgeOrder,
      },
    },
    {
      name: "Local workbench (Chrome)",
      type: LaunchBrowser.chrome,
      request: "launch",
      url: "https://localhost:5432/workbench",
      webRoot: "${workspaceRoot}/SPFx",
      sourceMaps: true,
      sourceMapPathOverrides: {
        "webpack:///.././src/*": "${webRoot}/src/*",
        "webpack:///../../../src/*": "${webRoot}/src/*",
        "webpack:///../../../../src/*": "${webRoot}/src/*",
        "webpack:///../../../../../src/*": "${webRoot}/src/*",
      },
      runtimeArgs: ["--remote-debugging-port=9222"],
      preLaunchTask: "gulp serve",
      postDebugTask: "Terminate All Tasks",
      presentation: {
        group: "local",
        order: chromeOrder,
      },
    },
    {
      name: "Hosted workbench (Edge)",
      type: LaunchBrowser.edge,
      request: "launch",
      url: "https://enter-your-SharePoint-site/_layouts/workbench.aspx",
      webRoot: "${workspaceRoot}/SPFx",
      sourceMaps: true,
      sourceMapPathOverrides: {
        "webpack:///.././src/*": "${webRoot}/src/*",
        "webpack:///../../../src/*": "${webRoot}/src/*",
        "webpack:///../../../../src/*": "${webRoot}/src/*",
        "webpack:///../../../../../src/*": "${webRoot}/src/*",
      },
      runtimeArgs: ["--remote-debugging-port=9222", "-incognito"],
      preLaunchTask: "gulp serve",
      postDebugTask: "Terminate All Tasks",
      presentation: {
        group: "remote",
        order: edgeOrder,
      },
    },
    {
      name: "Hosted workbench (Chrome)",
      type: LaunchBrowser.chrome,
      request: "launch",
      url: "https://enter-your-SharePoint-site/_layouts/workbench.aspx",
      webRoot: "${workspaceRoot}/SPFx",
      sourceMaps: true,
      sourceMapPathOverrides: {
        "webpack:///.././src/*": "${webRoot}/src/*",
        "webpack:///../../../src/*": "${webRoot}/src/*",
        "webpack:///../../../../src/*": "${webRoot}/src/*",
        "webpack:///../../../../../src/*": "${webRoot}/src/*",
      },
      runtimeArgs: ["--remote-debugging-port=9222", "-incognito"],
      preLaunchTask: "gulp serve",
      postDebugTask: "Terminate All Tasks",
      presentation: {
        group: "remote",
        order: chromeOrder,
      },
    },
    {
      name: "Start Teams workbench (Edge)",
      type: "pwa-msedge",
      request: "launch",
      url: "https://teams.microsoft.com/l/app/${localTeamsAppId}?installAppPackage=true&webjoin=true&${account-hint}",
      webRoot: "${workspaceRoot}/SPFx",
      sourceMaps: true,
      sourceMapPathOverrides: {
        "webpack:///.././src/*": "${webRoot}/src/*",
        "webpack:///../../../src/*": "${webRoot}/src/*",
        "webpack:///../../../../src/*": "${webRoot}/src/*",
        "webpack:///../../../../../src/*": "${webRoot}/src/*",
      },
      postDebugTask: "Terminate All Tasks",
      presentation: {
        hidden: true,
      },
    },
    {
      name: "Start Teams workbench (Chrome)",
      type: "pwa-chrome",
      request: "launch",
      url: "https://teams.microsoft.com/l/app/${localTeamsAppId}?installAppPackage=true&webjoin=true&${account-hint}",
      webRoot: "${workspaceRoot}/SPFx",
      sourceMaps: true,
      sourceMapPathOverrides: {
        "webpack:///.././src/*": "${webRoot}/src/*",
        "webpack:///../../../src/*": "${webRoot}/src/*",
        "webpack:///../../../../src/*": "${webRoot}/src/*",
        "webpack:///../../../../../src/*": "${webRoot}/src/*",
      },
      postDebugTask: "Terminate All Tasks",
      presentation: {
        hidden: true,
      },
    },
  ];
}

export function generateSpfxCompounds(): Record<string, unknown>[] {
  const launchCompounds: Record<string, unknown>[] = [];
  let edgeOrder = 2,
    chromeOrder = 1;
  if (os.type() === "Windows_NT") {
    edgeOrder = 1;
    chromeOrder = 2;
  }
  launchCompounds.push(
    {
      name: "Teams workbench (Edge)",
      configurations: ["Start Teams workbench (Edge)"],
      preLaunchTask: "prepare dev env",
      presentation: {
        group: "forteams",
        order: edgeOrder,
      },
      stopAll: true,
    },
    {
      name: "Teams workbench (Chrome)",
      configurations: ["Start Teams workbench (Chrome)"],
      preLaunchTask: "prepare dev env",
      presentation: {
        group: "forteams",
        order: chromeOrder,
      },
      stopAll: true,
    }
  );
  return launchCompounds;
}

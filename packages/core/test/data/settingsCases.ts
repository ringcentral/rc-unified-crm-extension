const scalarSettingsMergeCases = [
  {
    label: 'admin customizable:false overrides the user value and preserves admin metadata',
    adminSettings: {
      recordingMode: {
        value: 'admin-required',
        customizable: false,
        defaultValue: 'admin-default',
        options: ['admin-required', 'admin-disabled'],
      },
    },
    userSettings: {
      recordingMode: {
        value: 'user-choice',
        defaultValue: 'user-default',
        options: ['user-choice'],
      },
    },
    expectedSettings: {
      recordingMode: {
        value: 'admin-required',
        customizable: false,
        defaultValue: 'admin-default',
        options: ['admin-required', 'admin-disabled'],
      },
    },
  },
  {
    label: 'admin customizable:true permits the user value and preserves user metadata',
    adminSettings: {
      locale: {
        value: 'en-US',
        customizable: true,
        defaultValue: 'en-US',
        options: ['en-US', 'fr-FR'],
      },
    },
    userSettings: {
      locale: {
        value: 'fr-FR',
        defaultValue: 'system',
        options: ['fr-FR', 'de-DE'],
      },
    },
    expectedSettings: {
      locale: {
        customizable: true,
        value: 'fr-FR',
        defaultValue: 'system',
        options: ['fr-FR', 'de-DE'],
      },
    },
  },
  {
    label: 'admin-only settings remain available to the user',
    adminSettings: {
      adminOnly: {
        value: 'admin-value',
        customizable: false,
        defaultValue: 'admin-default',
      },
    },
    userSettings: {},
    expectedSettings: {
      adminOnly: {
        value: 'admin-value',
        customizable: false,
        defaultValue: 'admin-default',
      },
    },
  },
  {
    label: 'user-only settings remain available with their metadata',
    adminSettings: {},
    userSettings: {
      userOnly: {
        value: 'user-value',
        defaultValue: 'user-default',
        options: ['user-value', 'another-value'],
      },
    },
    expectedSettings: {
      userOnly: {
        customizable: true,
        value: 'user-value',
        defaultValue: 'user-default',
        options: ['user-value', 'another-value'],
      },
    },
  },
  {
    label: 'admin isRemoved suppresses the setting even when the user has a value',
    adminSettings: {
      legacySetting: {
        value: 'hidden-admin-value',
        isRemoved: true,
      },
    },
    userSettings: {
      legacySetting: {
        value: 'legacy-user-value',
      },
    },
    expectedSettings: {},
  },
];

const pluginSettingsMergeCases = [
  {
    label: 'a non-customizable nested field uses the admin entry',
    adminSettings: {
      plugin_service: {
        customizable: true,
        value: {
          config: {
            endpoint: {
              value: 'https://admin.example.com',
              customizable: false,
              options: ['https://admin.example.com'],
            },
          },
        },
      },
    },
    userSettings: {
      plugin_service: {
        value: {
          config: {
            endpoint: {
              value: 'https://user.example.com',
              customizable: true,
            },
          },
        },
      },
    },
    expectedConfig: {
      endpoint: {
        value: 'https://admin.example.com',
        customizable: false,
        options: ['https://admin.example.com'],
      },
    },
  },
  {
    label: 'an empty nested user value is filled by the admin value',
    adminSettings: {
      plugin_service: {
        customizable: true,
        value: {
          config: {
            queueId: {
              value: 'admin-queue',
              customizable: true,
            },
          },
        },
      },
    },
    userSettings: {
      plugin_service: {
        value: {
          config: {
            queueId: {
              value: '',
              customizable: true,
            },
          },
        },
      },
    },
    expectedConfig: {
      queueId: {
        value: 'admin-queue',
        customizable: true,
      },
    },
  },
  {
    label: 'a customizable nested field keeps the user entry and admin customizability',
    adminSettings: {
      plugin_service: {
        customizable: true,
        value: {
          config: {
            queueId: {
              value: 'admin-queue',
              customizable: true,
              options: ['admin-queue'],
            },
          },
        },
      },
    },
    userSettings: {
      plugin_service: {
        value: {
          config: {
            queueId: {
              value: 'user-queue',
              customizable: false,
              options: ['user-queue'],
            },
          },
        },
      },
    },
    expectedConfig: {
      queueId: {
        value: 'user-queue',
        customizable: true,
        options: ['user-queue'],
      },
    },
  },
  {
    label: 'an empty user config uses the complete admin config',
    adminSettings: {
      plugin_service: {
        customizable: true,
        value: {
          config: {
            queueId: {
              value: 'admin-queue',
              customizable: true,
            },
            region: {
              value: 'us',
              customizable: false,
            },
          },
        },
      },
    },
    userSettings: {
      plugin_service: {
        value: {
          config: {},
        },
      },
    },
    expectedConfig: {
      queueId: {
        value: 'admin-queue',
        customizable: true,
      },
      region: {
        value: 'us',
        customizable: false,
      },
    },
  },
  {
    label: 'a plugin with no user or admin config is omitted',
    adminSettings: {
      plugin_service: {
        customizable: true,
        value: {
          config: null,
        },
      },
    },
    userSettings: {
      plugin_service: {
        value: {
          config: {},
        },
      },
    },
    expectedConfig: null,
  },
];

const adminSettingsFallbackCases = [
  {
    label: 'a failed admin lookup falls back to the stored user settings',
    lookupResult: 'reject',
    userSettings: {
      localOnly: {
        value: 'local-after-error',
        defaultValue: 'local-default',
      },
    },
  },
  {
    label: 'a missing admin record falls back to the stored user settings',
    lookupResult: 'missing',
    userSettings: {
      localOnly: {
        value: 'local-without-admin-record',
        options: ['local-without-admin-record'],
      },
    },
  },
];

module.exports = {
  scalarSettingsMergeCases,
  pluginSettingsMergeCases,
  adminSettingsFallbackCases,
};

export {};

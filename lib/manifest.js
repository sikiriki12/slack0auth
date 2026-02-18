const SCOPES = [
  'app_mentions:read',
  'bookmarks:read',
  'bookmarks:write',
  'canvases:read',
  'canvases:write',
  'channels:history',
  'channels:join',
  'channels:manage',
  'channels:read',
  'chat:write',
  'chat:write.public',
  'commands',
  'dnd:read',
  'emoji:read',
  'files:read',
  'files:write',
  'groups:history',
  'groups:read',
  'groups:write',
  'groups:write.topic',
  'im:history',
  'im:read',
  'im:write',
  'links.embed:write',
  'links:read',
  'links:write',
  'lists:read',
  'lists:write',
  'metadata.message:read',
  'mpim:history',
  'mpim:read',
  'mpim:write',
  'mpim:write.topic',
  'reactions:read',
  'reactions:write',
  'reminders:read',
  'reminders:write',
  'team:read',
  'users.profile:read',
  'users:read',
  'users:read.email',
];

export { SCOPES };

export function createManifest(name, description, redirectUrl) {
  return {
    _metadata: { major_version: 1, minor_version: 1 },
    display_information: {
      name,
      description: description || '',
      background_color: '#2c2d30',
    },
    features: {
      app_home: {
        home_tab_enabled: false,
        messages_tab_enabled: true,
        messages_tab_read_only_enabled: false,
      },
      bot_user: {
        display_name: name,
        always_online: true,
      },
    },
    oauth_config: {
      redirect_urls: [redirectUrl],
      scopes: { bot: SCOPES },
    },
    settings: {
      event_subscriptions: {
        bot_events: [
          'app_mention',
          'message.channels',
          'message.groups',
          'message.im',
          'message.mpim',
        ],
      },
      interactivity: { is_enabled: false },
      org_deploy_enabled: false,
      socket_mode_enabled: true,
      token_rotation_enabled: false,
    },
  };
}

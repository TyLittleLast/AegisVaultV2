/**
 * Curated brand list for `ServiceAvatar`.
 *
 * `slug` must exist in `node_modules/simple-icons/icons/`. simple-icons removes
 * brands over time, so `npm run gen:brands` fails loudly on a missing slug
 * instead of silently shipping a gap.
 *
 * `aliases` are the lowercase names users actually type into the "service"
 * field. Matching is token-based, so "github.com" and "GitHub (perso)" both
 * resolve through the plain `github` alias.
 */
export const BRAND_MANIFEST = [
  // --- Developer platforms ---
  { slug: 'github', aliases: ['github', 'gh', 'github.io'] },
  { slug: 'gitlab', aliases: ['gitlab', 'glab'] },
  { slug: 'bitbucket', aliases: ['bitbucket', 'bitbucket repos'] },
  { slug: 'npm', aliases: ['npm', 'npmjs', 'npm registry'] },
  { slug: 'docker', aliases: ['docker', 'docker hub', 'dockerhub'] },
  { slug: 'vercel', aliases: ['vercel'] },
  { slug: 'netlify', aliases: ['netlify'] },
  { slug: 'circleci', aliases: ['circleci', 'circle ci'] },
  { slug: 'travisci', aliases: ['travis', 'travis ci'] },
  { slug: 'vscodium', aliases: ['vscodium', 'vs code', 'vscode', 'visual studio code'] },
  { slug: 'jetbrains', aliases: ['jetbrains', 'intellij', 'webstorm', 'pycharm', 'goland'] },

  // --- Infrastructure ---
  { slug: 'cloudflare', aliases: ['cloudflare'] },
  { slug: 'digitalocean', aliases: ['digitalocean', 'digital ocean', 'do'] },
  { slug: 'hetzner', aliases: ['hetzner'] },
  { slug: 'scaleway', aliases: ['scaleway', 'online net'] },
  { slug: 'ovh', aliases: ['ovh', 'ovhcloud'] },
  { slug: 'supabase', aliases: ['supabase'] },
  { slug: 'firebase', aliases: ['firebase', 'firestore', 'firebase auth'] },
  { slug: 'mongodb', aliases: ['mongodb', 'mongo'] },
  { slug: 'postgresql', aliases: ['postgresql', 'postgres', 'psql'] },
  { slug: 'mysql', aliases: ['mysql', 'mariadb'] },
  { slug: 'redis', aliases: ['redis', 'valkey'] },
  { slug: 'elastic', aliases: ['elastic', 'elasticsearch', 'elastic cloud'] },

  // --- Operating systems / hardware ---
  { slug: 'linux', aliases: ['linux', 'ubuntu', 'debian', 'fedora', 'arch linux'] },
  { slug: 'android', aliases: ['android'] },
  { slug: 'apple', aliases: ['apple', 'icloud', 'apple id', 'itunes'] },

  // --- Mail & marketing ---
  { slug: 'gmail', aliases: ['gmail', 'google mail', 'googlemail', 'mail google'] },
  { slug: 'protonmail', aliases: ['protonmail', 'proton mail', 'proton email'] },
  { slug: 'proton', aliases: ['proton', 'protonvpn account', 'proton ag'] },
  { slug: 'zoho', aliases: ['zoho', 'zoho mail', 'zohomail'] },
  { slug: 'maildotcom', aliases: ['mail dot com', 'maildotcom'] },
  { slug: 'mailchimp', aliases: ['mailchimp', 'mail chimp'] },
  { slug: 'mailgun', aliases: ['mailgun'] },

  // --- Productivity ---
  { slug: 'notion', aliases: ['notion'] },
  { slug: 'trello', aliases: ['trello'] },
  { slug: 'asana', aliases: ['asana'] },
  { slug: 'jira', aliases: ['jira', 'atlassian jira'] },
  { slug: 'confluence', aliases: ['confluence', 'atlassian confluence'] },
  { slug: 'dropbox', aliases: ['dropbox'] },
  { slug: 'mega', aliases: ['mega', 'mega nz', 'mega io'] },
  { slug: 'discord', aliases: ['discord'] },

  // --- Social ---
  { slug: 'facebook', aliases: ['facebook', 'fb', 'meta', 'meta platforms'] },
  { slug: 'x', aliases: ['x', 'twitter', 'x com'] },
  { slug: 'instagram', aliases: ['instagram', 'insta'] },
  { slug: 'reddit', aliases: ['reddit'] },
  { slug: 'tiktok', aliases: ['tiktok', 'tik tok'] },
  { slug: 'mastodon', aliases: ['mastodon'] },
  { slug: 'twitch', aliases: ['twitch'] },
  { slug: 'pinterest', aliases: ['pinterest', 'pinterest fr'] },
  { slug: 'snapchat', aliases: ['snapchat', 'snap'] },

  // --- Media & entertainment ---
  { slug: 'spotify', aliases: ['spotify'] },
  { slug: 'netflix', aliases: ['netflix'] },
  { slug: 'steam', aliases: ['steam', 'steam games'] },
  { slug: 'dribbble', aliases: ['dribbble'] },
  { slug: 'behance', aliases: ['behance'] },
  { slug: 'figma', aliases: ['figma'] },
  { slug: 'anthropic', aliases: ['anthropic', 'claude'] },

  // --- Commerce & finance ---
  { slug: 'paypal', aliases: ['paypal'] },
  { slug: 'stripe', aliases: ['stripe'] },
  { slug: 'etsy', aliases: ['etsy'] },
  { slug: 'shopify', aliases: ['shopify'] },
  { slug: 'revolut', aliases: ['revolut'] },
  { slug: 'n26', aliases: ['n26'] },
  { slug: 'coinbase', aliases: ['coinbase'] },
  { slug: 'binance', aliases: ['binance'] },
  { slug: 'wise', aliases: ['wise', 'wise com'] },

  // --- Password managers, identity, VPN ---
  { slug: '1password', aliases: ['1password', 'one password', 'onepassword'] },
  { slug: 'bitwarden', aliases: ['bitwarden'] },
  { slug: 'vaultwarden', aliases: ['vaultwarden'] },
  { slug: 'keycloak', aliases: ['keycloak'] },
  { slug: 'auth0', aliases: ['auth0'] },
  { slug: 'mullvad', aliases: ['mullvad', 'mullvad vpn'] },
  { slug: 'nordvpn', aliases: ['nordvpn', 'nord vpn'] },
  { slug: 'tailscale', aliases: ['tailscale'] },

  // --- France / telecom / transport ---
  { slug: 'orange', aliases: ['orange', 'orange france', 'livebox'] },
  { slug: 'sncf', aliases: ['sncf', 'sncf connect', 'oui sncf'] },
]

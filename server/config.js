export const MODELS = [
  'glm-5.3-flash',
  'glm-5.3',
  'deepseek-flash',
  'deepseek-v4-pro',
  'gpt-5.1-codex',
  'gpt-5.1-codex-mini',
  'gpt-5',
  'codex-mini-latest',
];

export const EFFORTS = ['low', 'medium', 'high', 'xhigh'];

export const DEFAULT_MODEL = 'glm-5.3-flash';
export const DEFAULT_EFFORT = 'medium';
export const PORT = Number(process.env.PORT || 9100);
export const HOST = process.env.HOST || '0.0.0.0';
export const NODE_BIN = '/root/.nvm/versions/node/v24.5.0/bin';

export const TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Istanbul',
  'Asia/Dubai',
  'Asia/Kolkata',
  'Asia/Shanghai',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
];

export const CRON_PRESETS = {
  '*/10 * * * *': 'Every 10 minutes',
  '0 * * * *': 'Every hour',
  '0 9 * * *': 'Every day at 9:00',
  '0 9 * * 1': 'Every Monday at 9:00',
};

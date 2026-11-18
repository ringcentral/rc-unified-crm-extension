// @ts-check

const { sign, verify } = require('jsonwebtoken');

const WIDGET_SESSION_TOKEN_TYPE = 'mcp-widget-session';
const WIDGET_SESSION_TOKEN_TTL = '15m';

function getSecret(): string {
  const secret = process.env.APP_SERVER_SECRET_KEY;
  if (!secret) {
    throw new Error('APP_SERVER_SECRET_KEY is not defined');
  }
  return secret;
}

function createWidgetSessionToken({
  rcExtensionId,
  rcAccountId,
  openaiSessionId = null,
}: {
  rcExtensionId?: string | null;
  rcAccountId?: string | null;
  openaiSessionId?: string | null;
} = {}): string | null {
  if (!rcExtensionId) {
    return null;
  }

  return sign(
    {
      type: WIDGET_SESSION_TOKEN_TYPE,
      rcExtensionId,
      rcAccountId,
      openaiSessionId,
    },
    getSecret(),
    { expiresIn: WIDGET_SESSION_TOKEN_TTL },
  );
}

function verifyWidgetSessionToken(token: unknown): { rcExtensionId: string; rcAccountId?: string; openaiSessionId: string | null } | null {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const payload: any = verify(token, getSecret());
    if (
      !payload ||
      payload.type !== WIDGET_SESSION_TOKEN_TYPE ||
      typeof payload.rcExtensionId !== 'string' ||
      !payload.rcExtensionId
    ) {
      return null;
    }

    return {
      rcExtensionId: payload.rcExtensionId,
      ...(typeof payload.rcAccountId === 'string' && payload.rcAccountId ? { rcAccountId: payload.rcAccountId } : {}),
      openaiSessionId: typeof payload.openaiSessionId === 'string' ? payload.openaiSessionId : null,
    };
  } catch {
    return null;
  }
}

exports.createWidgetSessionToken = createWidgetSessionToken;
exports.verifyWidgetSessionToken = verifyWidgetSessionToken;

export {};

import http from 'http';
import type { AddressInfo } from 'net';

// Deliberately does NOT mock 'client-oauth2': this test exercises the real library
// end-to-end so it catches bugs in how getOAuthApp's headers/body overrides are
// actually merged into the outgoing HTTP request, which a mocked ClientOAuth2 cannot.
const { getOAuthApp } = require('../../lib/oauth');

describe('oauth token exchange request (real client-oauth2)', () => {
  let server: http.Server;
  let receivedHeaders: http.IncomingHttpHeaders;
  let receivedBody: string;
  let baseUrl: string;

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', chunk => chunks.push(chunk));
      req.on('end', () => {
        receivedHeaders = req.headers;
        receivedBody = Buffer.concat(chunks).toString();
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600 }));
      });
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterEach(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
  });

  test('client_secret_post token exchange omits the Authorization header and sends credentials in the form body', async () => {
    const clientId = 'service-now-client-id';
    const clientSecret = 'service-now-client-secret';
    const oauthApp = getOAuthApp({
      clientId,
      clientSecret,
      accessTokenUri: `${baseUrl}/oauth_token.do`,
      authorizationUri: `${baseUrl}/oauth_auth.do`,
      redirectUri: 'https://ringcentral.github.io/ringcentral-embeddable/redirect.html',
      tokenEndpointAuthMethod: 'client_secret_post'
    });

    const overridingOAuthOption = {
      body: { client_id: clientId, client_secret: clientSecret },
      headers: { Authorization: undefined }
    };
    const callbackUri = 'https://ringcentral.github.io/ringcentral-embeddable/redirect.html?code=abc123';

    await oauthApp.code.getToken(callbackUri, overridingOAuthOption);

    // A present-but-empty Authorization header (from `Authorization: ''`) is what caused
    // ServiceNow to reject the token exchange with a 403 even though tokenEndpointAuthMethod
    // was correctly wired through. The header must be absent entirely.
    expect(receivedHeaders.authorization).toBeUndefined();
    expect(receivedHeaders['content-type']).toBe('application/x-www-form-urlencoded');
    const body = new URLSearchParams(receivedBody);
    expect(body.get('client_id')).toBe(clientId);
    expect(body.get('client_secret')).toBe(clientSecret);
    expect(body.get('grant_type')).toBe('authorization_code');
  });
});

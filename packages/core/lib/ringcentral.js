
const fetch = require('node-fetch');

const DEFAULT_RENEW_HANDICAP_MS = 60 * 1000; // 1 minute

function stringifyQuery(query) {
  const queryParams = new URLSearchParams(query);
  return queryParams.toString();
}

const REFRESH_RENEW_HANDICAP_MS = 10 * 1000; // 10s
function isRefreshTokenValid(token, handicap = REFRESH_RENEW_HANDICAP_MS) {
  const expireTime = token.refresh_token_expire_time;
  return expireTime - handicap > Date.now();
}

function isAccessTokenValid(token, handicap = DEFAULT_RENEW_HANDICAP_MS) {
  const expireTime = token.expire_time;
  return expireTime - handicap > Date.now();
}

class RingCentral {
  constructor(options) {
    this._options = options;
  }

  loginUrl({
    state,
  }) {
    const query = {
      response_type: 'code',
      redirect_uri: this._options.redirectUri,
      client_id: this._options.clientId,
      response_hint: 'brand_id contracted_country_code',
    };
    if (state) {
      query.state = state;
    }
    return `${this._options.server}/restapi/oauth/authorize?${stringifyQuery(query)}`;
  }

  async generateToken({ code }) {
    const body = {
      code,
      grant_type: 'authorization_code',
      redirect_uri: this._options.redirectUri,
    };
    const response = await this._tokenRequest('/restapi/oauth/token', body);
    if (Number.parseInt(response.status, 10) >= 400) {
      throw new Error('Generate Token error', response.status);
    }
    const {
      expires_in,
      refresh_token_expires_in,
      scope,
      endpoint_id, // do no save this field into db to reduce db size
      ...token
    } = await response.json();
    return {
      ...token,
      expire_time: Date.now() + parseInt(expires_in, 10) * 1000,
      refresh_token_expire_time: Date.now() + parseInt(refresh_token_expires_in, 10) * 1000,
    };
  }

  async refreshToken(token) {
    const body = {
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token,
      access_token_ttl: token.expires_in,
      refresh_token_ttl: token.refresh_token_expires_in,
    };
    const response = await this._tokenRequest('/restapi/oauth/token', body);
    if (Number.parseInt(response.status, 10) >= 400) {
      const error = new Error('Refresh Token error', response.status);
      error.response = response;
      throw error;
    }
    const {
      expires_in,
      refresh_token_expires_in,
      scope,
      endpoint_id, // do no save this field into db to reduce db size
      ...newToken
    } = await response.json();
    return {
      ...newToken,
      expire_time: Date.now() + parseInt(expires_in, 10) * 1000,
      refresh_token_expire_time: Date.now() + parseInt(refresh_token_expires_in, 10) * 1000,
    }
  }

  async revokeToken(token) {
    const body = {
      token: token.access_token,
    };
    const response = await this._tokenRequest('/restapi/oauth/revoke', body);
    if (Number.parseInt(response.status, 10) >= 400) {
      throw new Error('Revoke Token error', response.status);
    }
  }

  async _tokenRequest(path, body) {
    const authorization = `${this._options.clientId}:${this._options.clientSecret}`;
    const response = await fetch(
      `${this._options.server}${path}`, {
      method: 'POST',
      body: stringifyQuery(body),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(authorization).toString('base64')}`
      },
    }
    );
    return response;
  }

  async request({
    server = this._options.server,
    path,
    query,
    body,
    method,
    accept = 'application/json',
  }, token) {
    let uri = `${server}${path}`;
    if (query) {
      uri = uri + (uri.includes('?') ? '&' : '?') + stringifyQuery(query);
    }
    const response = await fetch(uri, {
      method,
      body: body ? JSON.stringify(body) : body,
      headers: {
        'Accept': accept,
        'Content-Type': 'application/json',
        'Authorization': `${token.token_type} ${token.access_token}`,
      },
    });
    if (Number.parseInt(response.status, 10) >= 400) {
      const error = new Error(`request data error ${response.status}`);
      const errorText = await response.text();
      error.message = errorText;
      error.response = response;
      throw error;
    }
    return response;
  }

  async createSubscription({
    eventFilters,
    webhookUri,
  }, token) {
    const response = await this.request({
      method: 'POST',
      path: '/restapi/v1.0/subscription',
      body: {
        eventFilters,
        deliveryMode: {
          transportType: 'WebHook',
          address: webhookUri,
        },
        expiresIn: 7 * 24 * 3600, // 7 days
      },
    }, token);
    const {
      uri,
      creationTime,
      deliveryMode,
      status, // do no save those field into db to reduce db size
      ...subscription
    } = await response.json();
    return subscription;
  }

  async getExtensionInfo(extensionId, token) {
    const response = await this.request({
      method: 'GET',
      path: `/restapi/v1.0/account/~/extension/${extensionId}`,
    }, token);
    return response.json();
  }

  async getAccountInfo(token) {
    const response = await this.request({
      method: 'GET',
      path: `/restapi/v1.0/account/~`,
    }, token);
    return response.json();
  }

  async getCallsAggregationData({ token, timezone, timeFrom, timeTo, groupBy }) {
    const body = {
      grouping: {
        groupBy
      },
      timeSettings: {
        timeZone: timezone,
        timeRange: {
          timeFrom: timeFrom,
          timeTo: timeTo
        }
      },
      responseOptions: {
        counters: {
          callsByDirection: {
            aggregationType: "Sum"
          },
          callsByResponse: {
            aggregationType: "Sum"
          }
        },
        timers: {
          allCallsDuration: {
            aggregationType: "Sum"
          }
        }
      }
    }
    const response = await this.request({
      method: 'POST',
      path: `/analytics/calls/v1/accounts/~/aggregation/fetch`,
      body,
      accept: 'application/json'
    }, token);
    return response.json();
  }

  async getCallLogData({ extensionId = '~', token, timezone, timeFrom, timeTo }) {
    let pageStart = 1;
    let isFinalPage = false;
    let callLogResponse = null;
    let result = { records: [] };
    while (!isFinalPage) {
      callLogResponse = await this.request({
        method: 'GET',
        path: `/restapi/v1.0/account/~/extension/${extensionId}/call-log?dateFrom=${timeFrom}&dateTo=${timeTo}&page=${pageStart}&view=Simple&perPage=1000`,
      }, token);
      const resultJson = await callLogResponse.json();
      result.records.push(...resultJson.records);
      if (resultJson.navigation?.nextPage) {
        pageStart++;
      }
      else {
        isFinalPage = true;
      }
    }
    return result;
  }
  async getSMSData({ extensionId = '~', token, timezone, timeFrom, timeTo }) {
    let pageStart = 1;
    let isFinalPage = false;
    let smsLogResponse = null;
    let result = { records: [] };
    while (!isFinalPage) {
      smsLogResponse = await this.request({
        method: 'GET',
        path: `/restapi/v1.0/account/~/extension/${extensionId}/message-store?dateFrom=${timeFrom}&dateTo=${timeTo}&page=${pageStart}&perPage=100`,
      }, token);
      const resultJson = await smsLogResponse.json();
      result.records.push(...resultJson.records);
      if (resultJson.navigation?.nextPage) {
        pageStart++;
      }
      else {
        isFinalPage = true;
      }
    }
    return result;
  }
}

exports.RingCentral = RingCentral;
exports.isRefreshTokenValid = isRefreshTokenValid;
exports.isAccessTokenValid = isAccessTokenValid;
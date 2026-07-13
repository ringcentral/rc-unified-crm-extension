import type {
    RingCentralCallsAggregationParams,
    RingCentralFetchResponse,
    RingCentralGenerateTokenParams,
    RingCentralLoginUrlParams,
    RingCentralOptions,
    RingCentralPaginatedDataParams,
    RingCentralRequestOptions,
    RingCentralSubscriptionParams,
    RingCentralToken
} from '../types';

const fetch = require('node-fetch');

const DEFAULT_RENEW_HANDICAP_MS = 60 * 1000;
const REFRESH_RENEW_HANDICAP_MS = 10 * 1000;

function stringifyQuery(query: Record<string, any>): string {
    const queryParams = new URLSearchParams(query as Record<string, string>);
    return queryParams.toString();
}

function isRefreshTokenValid(token: RingCentralToken, handicap = REFRESH_RENEW_HANDICAP_MS): boolean {
    const expireTime = token.refresh_token_expire_time || 0;
    return expireTime - handicap > Date.now();
}

function isAccessTokenValid(token: RingCentralToken, handicap = DEFAULT_RENEW_HANDICAP_MS): boolean {
    const expireTime = token.expire_time || 0;
    return expireTime - handicap > Date.now();
}

class RingCentral {
    _options: RingCentralOptions;

    constructor(options: RingCentralOptions) {
        this._options = options;
    }

    loginUrl({ state }: RingCentralLoginUrlParams): string {
        const query: Record<string, string> = {
            response_type: 'code',
            redirect_uri: this._options.redirectUri,
            client_id: this._options.clientId,
            response_hint: 'brand_id contracted_country_code'
        };

        if (state) {
            query.state = state;
        }

        return `${this._options.server}/restapi/oauth/authorize?${stringifyQuery(query)}`;
    }

    async generateToken({ code }: RingCentralGenerateTokenParams): Promise<RingCentralToken> {
        const body = {
            code,
            grant_type: 'authorization_code',
            redirect_uri: this._options.redirectUri
        };
        const response = await this._tokenRequest('/restapi/oauth/token', body);
        if (Number.parseInt(response.status as any, 10) >= 400) {
            throw new (Error as any)('Generate Token error', response.status);
        }

        const {
            expires_in,
            refresh_token_expires_in,
            ...token
        } = await response.json();

        return {
            ...token,
            expire_time: Date.now() + parseInt(expires_in as any, 10) * 1000,
            refresh_token_expire_time: Date.now() + parseInt(refresh_token_expires_in as any, 10) * 1000
        };
    }

    async refreshToken(token: RingCentralToken): Promise<RingCentralToken> {
        const body = {
            grant_type: 'refresh_token',
            refresh_token: token.refresh_token,
            access_token_ttl: token.expires_in,
            refresh_token_ttl: token.refresh_token_expires_in
        };
        const response = await this._tokenRequest('/restapi/oauth/token', body);
        if (Number.parseInt(response.status as any, 10) >= 400) {
            const error = new (Error as any)('Refresh Token error', response.status);
            error.response = response;
            throw error;
        }

        const {
            expires_in,
            refresh_token_expires_in,
            ...newToken
        } = await response.json();

        return {
            ...newToken,
            expire_time: Date.now() + parseInt(expires_in as any, 10) * 1000,
            refresh_token_expire_time: Date.now() + parseInt(refresh_token_expires_in as any, 10) * 1000
        };
    }

    async revokeToken(token: RingCentralToken): Promise<void> {
        const body = {
            token: token.access_token
        };
        const response = await this._tokenRequest('/restapi/oauth/revoke', body);
        if (Number.parseInt(response.status as any, 10) >= 400) {
            throw new (Error as any)('Revoke Token error', response.status);
        }
    }

    async _tokenRequest(path: string, body: Record<string, any>): Promise<RingCentralFetchResponse> {
        const authorization = `${this._options.clientId}:${this._options.clientSecret}`;
        const response = await fetch(
            `${this._options.server}${path}`,
            {
                method: 'POST',
                body: stringifyQuery(body),
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${Buffer.from(authorization).toString('base64')}`
                }
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
        accept = 'application/json'
    }: RingCentralRequestOptions, token: RingCentralToken): Promise<RingCentralFetchResponse> {
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
                'Authorization': `${token.token_type} ${token.access_token}`
            }
        });

        if (Number.parseInt(response.status as any, 10) >= 400) {
            const error = new Error(`request data error ${response.status}`);
            const errorText = await response.text();
            error.message = errorText;
            (error as any).response = response;
            throw error;
        }

        return response;
    }

    async createSubscription({
        eventFilters,
        webhookUri
    }: RingCentralSubscriptionParams, token: RingCentralToken): Promise<any> {
        const response = await this.request({
            method: 'POST',
            path: '/restapi/v1.0/subscription',
            body: {
                eventFilters,
                deliveryMode: {
                    transportType: 'WebHook',
                    address: webhookUri
                },
                expiresIn: 7 * 24 * 3600
            }
        }, token);
        const {
            ...subscription
        } = await response.json();
        return subscription;
    }

    async getExtensionInfo(extensionId: string | number, token: RingCentralToken): Promise<any> {
        const response = await this.request({
            method: 'GET',
            path: `/restapi/v1.0/account/~/extension/${extensionId}`
        }, token);
        return response.json();
    }

    async getAccountInfo(token: RingCentralToken): Promise<any> {
        const response = await this.request({
            method: 'GET',
            path: `/restapi/v1.0/account/~`
        }, token);
        return response.json();
    }

    async getCallsAggregationData({ token, timezone, timeFrom, timeTo, groupBy }: RingCentralCallsAggregationParams): Promise<any> {
        const body = {
            grouping: {
                groupBy
            },
            timeSettings: {
                timeZone: timezone,
                timeRange: {
                    timeFrom,
                    timeTo
                }
            },
            responseOptions: {
                counters: {
                    callsByDirection: {
                        aggregationType: 'Sum'
                    },
                    callsByResponse: {
                        aggregationType: 'Sum'
                    }
                },
                timers: {
                    allCallsDuration: {
                        aggregationType: 'Sum'
                    }
                }
            }
        };
        const response = await this.request({
            method: 'POST',
            path: `/analytics/calls/v1/accounts/~/aggregation/fetch`,
            body,
            accept: 'application/json'
        }, token);
        return response.json();
    }

    async getCallLogData({ extensionId = '~', token, timeFrom, timeTo }: RingCentralPaginatedDataParams): Promise<{ records: any[] }> {
        let pageStart = 1;
        let isFinalPage = false;
        let result = { records: [] as any[] };
        while (!isFinalPage) {
            const callLogResponse = await this.request({
                method: 'GET',
                path: `/restapi/v1.0/account/~/extension/${extensionId}/call-log?dateFrom=${timeFrom}&dateTo=${timeTo}&page=${pageStart}&view=Simple&perPage=1000`
            }, token);
            const resultJson = await callLogResponse.json();
            result.records.push(...resultJson.records);
            if (resultJson.navigation?.nextPage) {
                pageStart++;
            } else {
                isFinalPage = true;
            }
        }
        return result;
    }

    async getSMSData({ extensionId = '~', token, timeFrom, timeTo }: RingCentralPaginatedDataParams): Promise<{ records: any[] }> {
        let pageStart = 1;
        let isFinalPage = false;
        let result = { records: [] as any[] };
        while (!isFinalPage) {
            const smsLogResponse = await this.request({
                method: 'GET',
                path: `/restapi/v1.0/account/~/extension/${extensionId}/message-store?dateFrom=${timeFrom}&dateTo=${timeTo}&page=${pageStart}&perPage=100`
            }, token);
            const resultJson = await smsLogResponse.json();
            result.records.push(...resultJson.records);
            if (resultJson.navigation?.nextPage) {
                pageStart++;
            } else {
                isFinalPage = true;
            }
        }
        return result;
    }
}

export {
    RingCentral,
    isRefreshTokenValid,
    isAccessTokenValid
};

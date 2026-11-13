const axios = require('axios');
const dns = require('dns');
const https = require('https');
const http = require('http');
const net = require('net');
const ipaddr = require('ipaddr.js');

const GLOBAL_IPV6 = ipaddr.parseCIDR('2000::/3');
const RETURNED_6BONE = ipaddr.parseCIDR('3ffe::/16');

function policyError(requirePublicHttps = true) {
    const error = new Error(requirePublicHttps
        ? 'Plugin endpoints must use public HTTPS addresses'
        : 'Plugin endpoints must use valid HTTP(S) URLs without credentials');
    (error as any).code = 'ERR_PLUGIN_NETWORK_POLICY';
    return error;
}

function publicAddress(address: string): boolean {
    if (!net.isIP(address)) return false;
    try {
        let parsed = ipaddr.parse(address);
        if (parsed.kind() === 'ipv6' && parsed.isIPv4MappedAddress()) {
            parsed = parsed.toIPv4Address();
        }
        if (parsed.range() !== 'unicast') return false;
        if (parsed.kind() === 'ipv4') {
            // Azure's virtual platform address is not an Internet plugin destination.
            return parsed.toString() !== '168.63.129.16';
        }
        return parsed.match(GLOBAL_IPV6) && !parsed.match(RETURNED_6BONE);
    } catch { return false; }
}

function hostnameValue(hostname: string): string {
    return hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
}

function validateHostname(hostname: unknown, requirePublicHttps: boolean): void {
    if (typeof hostname !== 'string' || !hostname) throw policyError(requirePublicHttps);
    const host = hostnameValue(hostname);
    if (!host) throw policyError(requirePublicHttps);
    if (requirePublicHttps && (host === 'localhost' || host.endsWith('.localhost')
        || (net.isIP(host) && !publicAddress(host)))) throw policyError();
}

function validateUrlForPolicy(value: unknown, requirePublicHttps: boolean): URL {
    if (typeof value !== 'string') throw policyError(requirePublicHttps);
    let url: URL;
    try { url = new URL(value); } catch { throw policyError(requirePublicHttps); }
    if ((url.protocol !== 'https:' && (requirePublicHttps || url.protocol !== 'http:'))
        || url.username || url.password) throw policyError(requirePublicHttps);
    validateHostname(url.hostname, requirePublicHttps);
    return url;
}

export function validateUrl(value: unknown): URL {
    return validateUrlForPolicy(value, process.env.NODE_ENV === 'production');
}

function lookupAddress(requirePublicHttps: boolean, hostname: string, options: any, callback?: any): void {
    if (typeof options === 'function') { callback = options; options = {}; }
    const lookupOptions = typeof options === 'number' ? { family: options } : (options || {});
    try {
        validateHostname(hostname, requirePublicHttps);
        dns.lookup(hostname, { ...lookupOptions, all: true }, (error, addresses) => {
            if (error) { callback(error); return; }
            let selected;
            try {
                if (!Array.isArray(addresses) || addresses.length === 0) throw policyError(requirePublicHttps);
                const records = addresses.map(record => ({ address: record?.address, family: record?.family }));
                if (records.some(record => typeof record.address !== 'string'
                        || net.isIP(record.address) !== record.family
                        || (requirePublicHttps && !publicAddress(record.address)))) {
                    throw policyError(requirePublicHttps);
                }
                const family = lookupOptions.family === 'IPv4' ? 4
                    : lookupOptions.family === 'IPv6' ? 6 : Number(lookupOptions.family) || 0;
                selected = records.filter(record => !family || record.family === family)
                    .map(record => ({ address: record.address, family: record.family }));
                if (!selected.length) throw policyError(requirePublicHttps);
            } catch (failure) { callback(failure); return; }
            // These exact checked addresses go to the socket; there is no second lookup.
            if (lookupOptions.all) callback(null, selected);
            else callback(null, selected[0].address, selected[0].family);
        });
    } catch (error) { queueMicrotask(() => callback(error)); }
}

function beforeRedirect(requirePublicHttps: boolean, options: any): void {
    const url = validateUrlForPolicy(options.href, requirePublicHttps);
    const defaultPort = url.protocol === 'http:' ? 80 : 443;
    if (options.protocol !== url.protocol || options.auth || options.socketPath
        || typeof options.hostname !== 'string'
        || hostnameValue(options.hostname) !== hostnameValue(url.hostname)
        || Number(options.port || defaultPort) !== Number(url.port || defaultPort)) {
        throw policyError(requirePublicHttps);
    }
}

function createTransport(requirePublicHttps: boolean) {
    const lookup = lookupAddress.bind(null, requirePublicHttps);
    return {
        lookup,
        httpAgent: new http.Agent({ lookup, keepAlive: true, timeout: 5000 }),
        httpsAgent: new https.Agent({ lookup, rejectUnauthorized: true, keepAlive: true, timeout: 5000 }),
        beforeRedirect: beforeRedirect.bind(null, requirePublicHttps),
    };
}

// Keep pools separate so production cannot reuse a development connection to a private address.
const productionTransport = createTransport(true);
const nonProductionTransport = createTransport(false);

interface PluginRequestOptions {
    headers?: Record<string, string>;
}

function requestOptions(options: PluginRequestOptions, requirePublicHttps: boolean) {
    return {
        headers: options.headers,
        adapter: 'http', httpVersion: 1,
        baseURL: '', allowAbsoluteUrls: true, auth: null,
        proxy: false, socketPath: null, transport: null,
        ...(requirePublicHttps ? productionTransport : nonProductionTransport),
    };
}

// Preserve Axios' Promise and redirect semantics, including background dispatch failures.
export async function get(url: unknown, options: PluginRequestOptions = {}): Promise<any> {
    const requirePublicHttps = process.env.NODE_ENV === 'production';
    return axios.get(validateUrlForPolicy(url, requirePublicHttps).href, requestOptions(options, requirePublicHttps));
}

export async function post(url: unknown, data: unknown, options: PluginRequestOptions = {}): Promise<any> {
    const requirePublicHttps = process.env.NODE_ENV === 'production';
    return axios.post(validateUrlForPolicy(url, requirePublicHttps).href, data, requestOptions(options, requirePublicHttps));
}

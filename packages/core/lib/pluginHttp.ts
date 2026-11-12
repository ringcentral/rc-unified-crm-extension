const axios = require('axios');
const dns = require('dns');
const https = require('https');
const net = require('net');
const ipaddr = require('ipaddr.js');

const GLOBAL_IPV6 = ipaddr.parseCIDR('2000::/3');
const RETURNED_6BONE = ipaddr.parseCIDR('3ffe::/16');

function policyError() {
    const error = new Error('Plugin endpoints must use public HTTPS addresses');
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

function validateHostname(hostname: unknown): void {
    if (typeof hostname !== 'string' || !hostname) throw policyError();
    const host = hostnameValue(hostname);
    if (!host || host === 'localhost' || host.endsWith('.localhost')) throw policyError();
    if (net.isIP(host) && !publicAddress(host)) throw policyError();
}

export function validateUrl(value: unknown): URL {
    if (typeof value !== 'string') throw policyError();
    let url: URL;
    try { url = new URL(value); } catch { throw policyError(); }
    if (url.protocol !== 'https:' || url.username || url.password) throw policyError();
    validateHostname(url.hostname);
    return url;
}

function publicLookup(hostname: string, options: any, callback?: any): void {
    if (typeof options === 'function') { callback = options; options = {}; }
    const lookupOptions = typeof options === 'number' ? { family: options } : (options || {});
    try {
        validateHostname(hostname);
        dns.lookup(hostname, { ...lookupOptions, all: true }, (error, addresses) => {
            if (error) { callback(error); return; }
            let selected;
            try {
                if (!Array.isArray(addresses) || addresses.length === 0) throw policyError();
                const records = addresses.map(record => ({ address: record?.address, family: record?.family }));
                if (records.some(record => typeof record.address !== 'string'
                        || net.isIP(record.address) !== record.family || !publicAddress(record.address))) {
                    throw policyError();
                }
                const family = lookupOptions.family === 'IPv4' ? 4
                    : lookupOptions.family === 'IPv6' ? 6 : Number(lookupOptions.family) || 0;
                selected = records.filter(record => !family || record.family === family)
                    .map(record => ({ address: record.address, family: record.family }));
                if (!selected.length) throw policyError();
            } catch (failure) { callback(failure); return; }
            // These exact checked addresses go to the socket; there is no second lookup.
            if (lookupOptions.all) callback(null, selected);
            else callback(null, selected[0].address, selected[0].family);
        });
    } catch (error) { queueMicrotask(() => callback(error)); }
}

const agent = new https.Agent({ lookup: publicLookup, rejectUnauthorized: true, keepAlive: true, timeout: 5000 });

function beforeRedirect(options: any): void {
    const url = validateUrl(options.href);
    if (options.protocol !== url.protocol || options.auth || options.socketPath
        || typeof options.hostname !== 'string'
        || hostnameValue(options.hostname) !== hostnameValue(url.hostname)
        || Number(options.port || 443) !== Number(url.port || 443)) {
        throw policyError();
    }
}

interface PluginRequestOptions {
    headers?: Record<string, string>;
}

function requestOptions(options: PluginRequestOptions) {
    return {
        headers: options.headers,
        adapter: 'http', httpVersion: 1,
        baseURL: '', allowAbsoluteUrls: true, auth: null,
        proxy: false, socketPath: null, transport: null,
        httpsAgent: agent, lookup: publicLookup, beforeRedirect,
    };
}

// Preserve Axios' Promise and redirect semantics, including background dispatch failures.
export async function get(url: unknown, options: PluginRequestOptions = {}): Promise<any> {
    return axios.get(validateUrl(url).href, requestOptions(options));
}

export async function post(url: unknown, data: unknown, options: PluginRequestOptions = {}): Promise<any> {
    return axios.post(validateUrl(url).href, data, requestOptions(options));
}

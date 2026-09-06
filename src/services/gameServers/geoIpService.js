import dns from 'node:dns/promises';
import net from 'node:net';

const IPINFO_TOKEN = process.env.IPINFO_TOKEN || '';

function countryCodeToFlag(countryCode) {
    if (!countryCode || countryCode.length !== 2) {
        return null;
    }

    const code = countryCode.toUpperCase();

    return String.fromCodePoint(
        ...[...code].map(
            char => 127397 + char.charCodeAt(0)
        )
    );
}

/**
 * Remove a game-server port from a host value.
 *
 * Examples:
 * 162.19.126.110      -> 162.19.126.110
 * 57.129.61.75:27015  -> 57.129.61.75
 * example.com:27015   -> example.com
 */
function normalizeHost(host) {
    const value = String(host || '').trim();

    if (!value) {
        return null;
    }

    /*
     * IPv6 in [address]:port format
     */
    if (value.startsWith('[')) {
        const closingBracket = value.indexOf(']');

        if (closingBracket !== -1) {
            return value.slice(1, closingBracket);
        }
    }

    /*
     * Plain IPv4 + port
     */
    const ipv4PortMatch =
        value.match(
            /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/
        );

    if (ipv4PortMatch) {
        return ipv4PortMatch[1];
    }

    /*
     * Hostname + port
     */
    const hostnamePortMatch =
        value.match(
            /^(.+):\d+$/
        );

    if (hostnamePortMatch) {
        return hostnamePortMatch[1];
    }

    return value;
}

async function resolveHostToIp(host) {
    const value = normalizeHost(host);

    if (!value) {
        return null;
    }

    if (net.isIP(value)) {
        return value;
    }

    try {
        const result = await dns.lookup(value, {
            family: 0
        });

        return result.address || null;
    } catch {
        return null;
    }
}

export async function getIpLocation(host) {
    if (!IPINFO_TOKEN) {
        console.warn(
            '[GeoIP] IPINFO_TOKEN is not configured.'
        );

        return null;
    }

    const normalizedHost = normalizeHost(host);

    if (!normalizedHost) {
        console.warn(
            `[GeoIP] Invalid host: ${host}`
        );

        return null;
    }

    const ip = await resolveHostToIp(normalizedHost);

    if (!ip) {
        console.warn(
            `[GeoIP] Could not resolve host: ${host}`
        );

        return null;
    }

    try {
        const response = await fetch(
            `https://api.ipinfo.io/lite/${encodeURIComponent(ip)}?token=${encodeURIComponent(IPINFO_TOKEN)}`,
            {
                signal: AbortSignal.timeout(10000)
            }
        );

        if (!response.ok) {
            let details = '';

            try {
                details = await response.text();
            } catch {
                // Ignore response body read errors.
            }

            throw new Error(
                details
                    ? `HTTP ${response.status}: ${details}`
                    : `HTTP ${response.status}`
            );
        }

        const data = await response.json();

        const countryCode =
            String(
                data.country_code || ''
            )
                .trim()
                .toUpperCase() || null;

        const country =
            String(
                data.country || ''
            )
                .trim() || null;

        return {
            ip,
            country,
            countryCode,
            countryFlag:
                countryCodeToFlag(countryCode)
        };

    } catch (error) {
        console.error(
            `[GeoIP] Failed to lookup ${ip}:`,
            error.message
        );

        return null;
    }
}
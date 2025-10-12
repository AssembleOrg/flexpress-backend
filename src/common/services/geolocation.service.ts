import { Injectable, Logger } from '@nestjs/common';
import * as geoip from 'geoip-lite';

export interface LocationInfo {
  ip: string;
  country?: string;
  region?: string;
  city?: string;
  timezone?: string;
  coordinates?: {
    latitude: number;
    longitude: number;
  };
  formatted: string;
}

@Injectable()
export class GeolocationService {
  private readonly logger = new Logger(GeolocationService.name);

  /**
   * Extract the real IP address from the request
   * Handles various proxy headers and forwarded IPs
   */
  extractIpAddress(request: any): string {
    // Try to get the real IP from various headers (in order of preference)
    const xForwardedFor = request.headers['x-forwarded-for'];
    const xRealIp = request.headers['x-real-ip'];
    const cfConnectingIp = request.headers['cf-connecting-ip']; // Cloudflare
    const xClientIp = request.headers['x-client-ip'];
    
    // X-Forwarded-For can contain multiple IPs (client, proxy1, proxy2, ...)
    // The first one is the original client IP
    if (xForwardedFor) {
      const ips = xForwardedFor.split(',').map((ip: string) => ip.trim());
      return this.normalizeIp(ips[0]);
    }

    if (cfConnectingIp) {
      return this.normalizeIp(cfConnectingIp);
    }

    if (xRealIp) {
      return this.normalizeIp(xRealIp);
    }

    if (xClientIp) {
      return this.normalizeIp(xClientIp);
    }

    // Fallback to connection/socket remote address
    const remoteAddress = 
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.ip;

    return this.normalizeIp(remoteAddress || 'unknown');
  }

  /**
   * Normalize IP address (remove ::ffff: prefix for IPv4-mapped IPv6)
   */
  private normalizeIp(ip: string): string {
    if (!ip) return 'unknown';
    
    // Remove IPv6 prefix for IPv4-mapped addresses
    if (ip.startsWith('::ffff:')) {
      return ip.substring(7);
    }
    
    return ip;
  }

  /**
   * Get location information from IP address
   */
  getLocationFromIp(ip: string): LocationInfo {
    const normalizedIp = this.normalizeIp(ip);

    // Handle localhost and private IPs
    if (this.isLocalOrPrivateIp(normalizedIp)) {
      return {
        ip: normalizedIp,
        formatted: 'Local/Private Network',
      };
    }

    try {
      const geo = geoip.lookup(normalizedIp);

      if (!geo) {
        this.logger.warn(`No geolocation data found for IP: ${normalizedIp}`);
        return {
          ip: normalizedIp,
          formatted: `Unknown location (${normalizedIp})`,
        };
      }

      const formatted = this.formatLocation(geo);

      return {
        ip: normalizedIp,
        country: geo.country,
        region: geo.region,
        city: geo.city,
        timezone: geo.timezone,
        coordinates: {
          latitude: geo.ll[0],
          longitude: geo.ll[1],
        },
        formatted,
      };
    } catch (error) {
      this.logger.error(`Error getting location for IP ${normalizedIp}:`, error);
      return {
        ip: normalizedIp,
        formatted: `Error retrieving location (${normalizedIp})`,
      };
    }
  }

  /**
   * Format location data into a human-readable string
   */
  private formatLocation(geo: any): string {
    const parts: string[] = [];

    if (geo.city) {
      parts.push(geo.city);
    }

    if (geo.region) {
      parts.push(geo.region);
    }

    if (geo.country) {
      parts.push(geo.country);
    }

    return parts.length > 0 
      ? parts.join(', ') 
      : 'Unknown location';
  }

  /**
   * Check if IP is localhost or private network
   */
  private isLocalOrPrivateIp(ip: string): boolean {
    if (ip === 'unknown' || !ip) return true;

    // Localhost patterns
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
      return true;
    }

    // Private network patterns (IPv4)
    const privateRanges = [
      /^10\./,                    // 10.0.0.0 - 10.255.255.255
      /^172\.(1[6-9]|2\d|3[01])\./, // 172.16.0.0 - 172.31.255.255
      /^192\.168\./,              // 192.168.0.0 - 192.168.255.255
      /^169\.254\./,              // 169.254.0.0 - 169.254.255.255 (Link-local)
    ];

    return privateRanges.some(range => range.test(ip));
  }

  /**
   * Get full location info from request
   */
  getLocationFromRequest(request: any): LocationInfo {
    const ip = this.extractIpAddress(request);
    return this.getLocationFromIp(ip);
  }
}


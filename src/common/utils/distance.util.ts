/**
 * Distance calculation utilities using the Haversine formula
 * for calculating distances between geographic coordinates
 */

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Calculate the distance between two points on Earth using the Haversine formula
 * 
 * @param point1 - First coordinate point
 * @param point2 - Second coordinate point
 * @returns Distance in kilometers
 */
export function calculateDistance(
  point1: Coordinates,
  point2: Coordinates
): number {
  const R = 6371; // Earth's radius in kilometers

  const lat1Rad = toRadians(point1.latitude);
  const lat2Rad = toRadians(point2.latitude);
  const deltaLat = toRadians(point2.latitude - point1.latitude);
  const deltaLon = toRadians(point2.longitude - point1.longitude);

  // Haversine formula
  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLon / 2) *
      Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = R * c;

  return Math.round(distance * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate total travel distance (charter origin -> pickup -> destination)
 * 
 * @param charterOrigin - Charter's starting location
 * @param pickupLocation - User's pickup location
 * @param destination - Final destination
 * @returns Object with individual distances and total
 */
export function calculateTravelDistances(
  charterOrigin: Coordinates,
  pickupLocation: Coordinates,
  destination: Coordinates
): {
  charterToPickup: number;
  pickupToDestination: number;
  total: number;
} {
  const charterToPickup = calculateDistance(charterOrigin, pickupLocation);
  const pickupToDestination = calculateDistance(pickupLocation, destination);
  const total = charterToPickup + pickupToDestination;

  return {
    charterToPickup: Math.round(charterToPickup * 100) / 100,
    pickupToDestination: Math.round(pickupToDestination * 100) / 100,
    total: Math.round(total * 100) / 100,
  };
}

/**
 * Check if a point is within a certain radius of another point
 * 
 * @param center - Center point
 * @param point - Point to check
 * @param radiusKm - Radius in kilometers
 * @returns true if point is within radius
 */
export function isWithinRadius(
  center: Coordinates,
  point: Coordinates,
  radiusKm: number
): boolean {
  const distance = calculateDistance(center, point);
  return distance <= radiusKm;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Parse coordinate string to number
 * 
 * @param coord - Coordinate as string
 * @returns Coordinate as number
 */
export function parseCoordinate(coord: string): number {
  const parsed = parseFloat(coord);
  if (isNaN(parsed)) {
    throw new Error(`Invalid coordinate: ${coord}`);
  }
  return parsed;
}

/**
 * Parse coordinate pair from strings
 * 
 * @param latitude - Latitude as string
 * @param longitude - Longitude as string
 * @returns Coordinates object
 */
export function parseCoordinates(
  latitude: string,
  longitude: string
): Coordinates {
  return {
    latitude: parseCoordinate(latitude),
    longitude: parseCoordinate(longitude),
  };
}

/**
 * Format distance for display
 * 
 * @param distanceKm - Distance in kilometers
 * @returns Formatted string
 */
export function formatDistance(distanceKm: number): string {
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toFixed(2)} km`;
}


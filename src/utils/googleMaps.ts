export function googleMapsPinUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.href.length > 2048) return null;
    const host = url.hostname;
    if (host === 'maps.app.goo.gl' && /^\/[\w-]+\/?$/.test(url.pathname)) return url.href;
    if (host === 'goo.gl' && /^\/maps\/[\w-]+\/?$/.test(url.pathname)) return url.href;
    if (['google.com', 'www.google.com', 'maps.google.com', 'google.co.th', 'www.google.co.th', 'maps.google.co.th'].includes(host) &&
      (/^\/maps(?:\/|$)/.test(url.pathname) || (host.startsWith('maps.') && url.searchParams.has('q')))) return url.href;
  } catch {
    return null;
  }
  return null;
}

export function googleMapsSearchUrl(query: string): string {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
}

export function googleMapsDirectionsUrl(destination: string, placeId?: string): string {
  const params = new URLSearchParams({ api: '1', destination, travelmode: 'driving', dir_action: 'navigate' });
  if (placeId) params.set('destination_place_id', placeId);
  // Omitting origin lets Google Maps use the device's current location.
  return 'https://www.google.com/maps/dir/?' + params;
}

export function directionsFromGoogleMapsPin(value: string): string | null {
  const validated = googleMapsPinUrl(value);
  if (!validated) return null;
  const url = new URL(validated);
  if (url.hostname.endsWith('goo.gl')) return null;
  const placeId = url.searchParams.get('destination_place_id') ?? url.searchParams.get('query_place_id');
  const query = url.searchParams.get('destination') ?? url.searchParams.get('query') ?? url.searchParams.get('q');
  if (query?.trim()) return googleMapsDirectionsUrl(query.trim(), placeId ?? undefined);

  const coordinates = [...url.pathname.matchAll(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/g)];
  if (coordinates.length === 1) {
    const [, latitude, longitude] = coordinates[0];
    if (Math.abs(Number(latitude)) <= 90 && Math.abs(Number(longitude)) <= 180) {
      return googleMapsDirectionsUrl(`${latitude},${longitude}`, placeId ?? undefined);
    }
  }
  const place = url.pathname.match(/^\/maps\/place\/([^/]+)/)?.[1];
  if (place && coordinates.length === 0) {
    try {
      return googleMapsDirectionsUrl(decodeURIComponent(place.replace(/\+/g, ' ')), placeId ?? undefined);
    } catch {
      return null;
    }
  }
  return null;
}

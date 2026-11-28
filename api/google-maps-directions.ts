import { directionsFromGoogleMapsPin, googleMapsPinUrl } from '../src/utils/googleMaps.js';

export async function POST(request: Request): Promise<Response> {
  if (request.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const headers = { 'Cache-Control': 'no-store' };
  try {
    const pin = await request.text();
    let url = pin.length <= 2048 ? googleMapsPinUrl(pin) : null;
    if (!url) return Response.json({ error: 'Invalid Google Maps link' }, { status: 400, headers });
    const signal = AbortSignal.timeout(5000);
    for (let hop = 0; hop <= 4 && url; hop++) {
      const directions = directionsFromGoogleMapsPin(url);
      if (directions) return Response.json({ directions }, { headers });
      const host = new URL(url).hostname;
      if (host !== 'maps.app.goo.gl' && host !== 'goo.gl') break;
      const upstream = await fetch(url, { redirect: 'manual', signal });
      const location = upstream.headers.get('location');
      await upstream.body?.cancel();
      if (upstream.status < 300 || upstream.status >= 400 || !location) break;
      url = googleMapsPinUrl(new URL(location, url).href);
    }
  } catch {
    return Response.json({ error: 'Google Maps link could not be resolved' }, { status: 502, headers });
  }
  return Response.json({ error: 'Destination unavailable' }, { status: 422, headers });
}

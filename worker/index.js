const REALM = 'Supply Radar';

function unauthorized() {
  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': `Basic realm="${REALM}", charset="UTF-8"`,
      'Cache-Control': 'no-store',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

function readBasicCredentials(header) {
  if (!header || !header.startsWith('Basic ')) return null;
  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(':');
    if (separator < 0) return null;
    return {
      username: decoded.slice(0, separator),
      password: decoded.slice(separator + 1),
    };
  } catch {
    return null;
  }
}

export default {
  async fetch(request, env) {
    const expectedPassword = env.SITE_PASSWORD;
    if (!expectedPassword) {
      return new Response('SITE_PASSWORD is not configured', {
        status: 503,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/plain; charset=utf-8',
        },
      });
    }

    const expectedUsername = env.SITE_USERNAME || 'supply';
    const credentials = readBasicCredentials(request.headers.get('Authorization'));
    if (!credentials || credentials.username !== expectedUsername || credentials.password !== expectedPassword) {
      return unauthorized();
    }

    const response = await env.ASSETS.fetch(request);
    const headers = new Headers(response.headers);
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  },
};
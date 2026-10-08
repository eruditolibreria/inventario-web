// Solo contenido público: las cookies de infraestructura del origen no llegan al CDN.
const ORIGIN = 'https://nhysxuqxlkmvrpxdoate.supabase.co/functions/v1/club-content';

module.exports = function createClubContentProxy(resource) {
  if (!['reglas', 'noticias', 'catalogo'].includes(resource)) throw new Error('RECURSO_INVALIDO');
  return async function clubContentProxy(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const error = (status, code) => {
    res.statusCode = status;
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ok:false, error:code}));
  };
  const url = new URL(req.url, 'https://club.invalid');
  const version=url.searchParams.get('v');
  if (url.search && (!version || !/^[0-9]{1,18}$/.test(version) || [...url.searchParams.keys()].length!==1)) return error(404, 'RECURSO_INVALIDO');
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    res.statusCode = 204;
    return res.end();
  }
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.setHeader('Allow', 'GET, HEAD, OPTIONS');
    return error(405, 'METODO_INVALIDO');
  }
  try {
    // No reenviar Authorization, Cookie, parámetros ni cabeceras del visitante.
    const upstream = await fetch(`${ORIGIN}/${resource}${version ? '?v='+version : ''}`, {
      method:'GET', redirect:'error', signal:AbortSignal.timeout(8000),
      // El catálogo se lee junto a PostgreSQL; la cabecera es interna, nunca del visitante.
      headers:resource === 'catalogo' ? {Accept:'application/json', 'x-region':'us-west-2'} : {Accept:'application/json'},
    });
    if (upstream.status !== 200 || !upstream.headers.get('content-type')?.includes('application/json')) {
      return error(503, 'CONTENIDO_NO_DISPONIBLE');
    }
    const body = await upstream.text();
    if (JSON.parse(body).ok !== true) return error(503, 'CONTENIDO_NO_DISPONIBLE');
    const etag = upstream.headers.get('etag');
    // Lista explícita: nunca copiar Set-Cookie ni cabeceras de Cloudflare/Supabase.
    res.setHeader('Cache-Control', upstream.headers.get('cache-control') || 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', upstream.headers.get('vercel-cdn-cache-control') || 'no-store');
    res.setHeader('Vercel-Cache-Tag', `club-${resource}`);
    if (etag) res.setHeader('ETag', etag);
    const normalize = value => value.trim().replace(/^W\//, '');
    const conditional = req.headers['if-none-match'];
    const matches = etag && typeof conditional === 'string' && conditional.split(',').some(value =>
      normalize(value) === normalize(etag) || value.trim() === '*');
    res.statusCode = matches ? 304 : 200;
    res.end(matches || req.method === 'HEAD' ? undefined : body);
  } catch (_) {
    return error(503, 'CONTENIDO_NO_DISPONIBLE');
  }
  };
};

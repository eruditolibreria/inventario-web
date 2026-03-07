// api/proxy.js
export default async function handler(req, res) {
  const params = new URLSearchParams(req.query).toString();
  const url = `https://script.google.com/macros/s/AKfycbwBzXpYT75DhpCh3V7oz7fad6C5i4V0fhq3ukSvXJNyHKwLnVX8x5cP7dDGd8KoZ0sLFQ/exec?${params}`;

  const response = await fetch(url, { redirect: 'follow' });
  const text = await response.text();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', response.headers.get('content-type') || 'text/plain');
  res.status(200).send(text);
}

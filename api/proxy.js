// api/proxy.js
export default async function handler(req, res) {
  const params = new URLSearchParams(req.query).toString();
  const url = `https://script.google.com/macros/s/AKfycbzndtKe1sIRzCpgFjT6BVQJmCqkoX3dwOck_wloDpHDn7wJOx02QS_nGVdENCevB2uzbA/exec?${params}`;

  const response = await fetch(url, { redirect: 'follow' });
  const text = await response.text();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', response.headers.get('content-type') || 'text/plain');
  res.status(200).send(text);
}

// api/proxy.js
export default async function handler(req, res) {
  const params = new URLSearchParams(req.query).toString();
  const url = `https://script.google.com/macros/s/AKfycbw-xlx6sIXnofHmjIdw9Y0Y74DKD1UC_kkByBWRrth1F2nAZGJKIlmLjwz9AMB9tjhwjg/exec?${params}`;

  const response = await fetch(url, { redirect: 'follow' });
  const text = await response.text();

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', response.headers.get('content-type') || 'text/plain');
  res.status(200).send(text);
}

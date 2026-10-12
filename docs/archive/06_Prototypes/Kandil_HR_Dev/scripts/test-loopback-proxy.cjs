// Local test only: PDF assets reference the browser URL localhost:8101.
// Docker maps that port on the Mac; this supplies the same route inside the container.
const http = require('node:http');
http.createServer((req, res) => {
  const upstream = http.request({hostname: '127.0.0.1', port: 8000,
    path: req.url, method: req.method, headers: req.headers}, response => {
    res.writeHead(response.statusCode, response.headers);
    response.pipe(res);
  });
  upstream.on('error', () => {res.writeHead(502); res.end('Local test server unavailable');});
  req.pipe(upstream);
}).listen(8101, '127.0.0.1');

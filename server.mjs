import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = Number(process.env.PORT) || 5178;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function apiUrl(baseUrl, kind) {
  const raw = String(baseUrl || '').trim();
  if (!raw) throw new Error('未填写 API 地址');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('API 地址格式不正确，需要包含 http:// 或 https://');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('API 地址必须是 http 或 https');
  }
  let p = url.pathname.replace(/\/+$/, '');
  if (kind === 'chat') {
    if (!/\/chat\/completions$/i.test(p)) {
      if (/\/(v\d+)$/i.test(p)) p += '/chat/completions';
      else p += '/v1/chat/completions';
    }
  } else {
    if (/\/chat\/completions$/i.test(p)) p = p.replace(/\/chat\/completions$/i, '/models');
    else if (!/\/models$/i.test(p)) {
      if (/\/(v\d+)$/i.test(p)) p += '/models';
      else p += '/v1/models';
    }
  }
  url.pathname = p;
  url.search = '';
  url.hash = '';
  return url.toString();
}

function readBody(req, limit = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function normalizeError(text, status) {
  let message = String(text || '').slice(0, 600);
  try {
    const data = JSON.parse(text);
    message = data?.error?.message || data?.error || data?.message || message;
    if (typeof message !== 'string') message = JSON.stringify(message);
  } catch {}
  return `上游返回 ${status}：${message || '未知错误'}`;
}

async function handleChat(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    sendJson(res, 400, { error: err.message === '请求体过大' ? err.message : '请求格式不是有效的 JSON' });
    return;
  }

  const apiKey = String(body.apiKey || '').trim();
  const model = String(body.model || '').trim();
  const messages = body.messages;
  const temperature = Number.isFinite(+body.temperature) ? +body.temperature : 1;
  const maxTokens = Number.isFinite(+body.maxTokens)
    ? Math.max(1, Math.min(32000, Math.round(+body.maxTokens)))
    : 4096;
  const stream = body.stream !== false;

  if (!apiKey) return sendJson(res, 400, { error: '未配置 API Key' });
  if (!model) return sendJson(res, 400, { error: '未填写模型名称' });
  if (!Array.isArray(messages) || messages.length === 0) {
    return sendJson(res, 400, { error: '没有可发送的消息' });
  }

  let endpoint;
  try {
    endpoint = apiUrl(body.baseUrl, 'chat');
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  const controller = new AbortController();
  const onClose = () => {
    if (!res.writableEnded) controller.abort();
  };
  res.on('close', onClose);

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        Accept: stream ? 'text/event-stream' : 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream,
      }),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      sendJson(res, upstream.status >= 400 && upstream.status < 600 ? upstream.status : 502, {
        error: normalizeError(text, upstream.status),
      });
      return;
    }

    const contentType = upstream.headers.get('content-type') || '';

    if (!stream) {
      let content = '';
      try {
        const data = await upstream.json();
        content = data?.choices?.[0]?.message?.content || '';
      } catch {
        content = await upstream.text().catch(() => '');
      }
      sendJson(res, 200, { content });
      return;
    }

    if (!contentType.includes('text/event-stream')) {
      // 兼容：请求流式但上游直接返回 JSON
      const data = await upstream.json().catch(() => null);
      const content = data?.choices?.[0]?.message?.content || '';
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    if (!upstream.body) {
      res.end();
      return;
    }

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (res.destroyed || res.writableEnded) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    if (err.name === 'AbortError') {
      if (!res.writableEnded && !res.destroyed) res.end();
      return;
    }
    if (!res.headersSent) {
      sendJson(res, 502, { error: `无法连接上游：${err.message}` });
    } else if (!res.writableEnded) {
      res.end();
    }
  } finally {
    res.off('close', onClose);
  }
}

async function handleModels(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return sendJson(res, 400, { error: '请求格式不是有效的 JSON' });
  }

  const apiKey = String(body.apiKey || '').trim();
  if (!apiKey) return sendJson(res, 400, { error: '未配置 API Key' });

  let endpoint;
  try {
    endpoint = apiUrl(body.baseUrl, 'models');
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }

  try {
    const upstream = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
    });
    if (!upstream.ok) {
      const text = await upstream.text();
      return sendJson(res, upstream.status, { error: normalizeError(text, upstream.status) });
    }
    const data = await upstream.json();
    const models = Array.isArray(data?.data)
      ? data.data.map((item) => item?.id).filter(Boolean)
      : [];
    sendJson(res, 200, { models });
  } catch (err) {
    sendJson(res, 502, { error: `无法连接上游：${err.message}` });
  }
}

async function serveStatic(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(PUBLIC_DIR, '.' + pathname);
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const info = await stat(filePath);
    if (info.isDirectory()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const data = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') res.end();
    else res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('页面不存在');
  }
}

const server = createServer(async (req, res) => {
  let pathname = '/';
  try {
    pathname = new URL(req.url, 'http://localhost').pathname;
  } catch {}

  if (pathname === '/api/chat') return handleChat(req, res);
  if (pathname === '/api/models') return handleModels(req, res);
  if (pathname.startsWith('/api/')) return sendJson(res, 404, { error: '接口不存在' });
  return serveStatic(req, res);
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n端口 ${PORT} 已被占用。请关闭占用该端口的程序，或设置环境变量 PORT 换一个端口后重试。\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, '127.0.0.1', () => {
  console.log('');
  console.log('  墨迹 · 小说工作台已启动');
  console.log(`  打开浏览器访问：http://127.0.0.1:${PORT}`);
  console.log('  按 Ctrl+C 停止服务');
  console.log('');
});

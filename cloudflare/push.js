/**
 * Twin City Cannabis — Web Push delivery
 *
 * Implements the Web Push protocol (RFC 8030 + RFC 8291) using only the
 * Workers Web Crypto API — no npm dependencies. Three pieces:
 *
 *   1. VAPID JWT signing (ES256) so push services trust our origin
 *   2. ECDH + HKDF to derive a shared secret with each subscription
 *   3. AES-128-GCM encryption of the JSON payload via the aes128gcm
 *      content-encoding scheme
 *
 * Endpoints exposed (wired in worker.js):
 *
 *   GET  /push/vapid-public-key   — returns the public VAPID key
 *   POST /push/subscribe          — stores a subscription + the user's
 *                                   watchlist + thresholds in KV
 *   POST /push/unsubscribe        — removes a subscription
 *   POST /push/trigger            — Pi cron POSTs price-diff manifest,
 *                                   worker fires pushes to matching subs.
 *                                   Bearer-token authenticated.
 *
 * Subscription record shape stored in KV (key = "push:<endpointHash>"):
 *   {
 *     endpoint,
 *     keys: { p256dh, auth },
 *     watchlist: [productId, ...],
 *     thresholds: { productId: targetPrice },
 *     createdAt: ISO,
 *     lastPushedAt: ISO | null
 *   }
 */

// ─── Base64URL helpers ───────────────────────────────────────────────
function b64uToBytes(s) {
  const pad = '='.repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function bytesToB64u(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function concatBytes(...arrs) {
  let total = 0; for (const a of arrs) total += a.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

// ─── HKDF (RFC 5869) using Web Crypto ────────────────────────────────
async function hkdfExtract(salt, ikm) {
  const key = await crypto.subtle.importKey('raw', salt, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, ikm);
  return new Uint8Array(sig);
}
async function hkdfExpand(prk, info, length) {
  const key = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const out = new Uint8Array(length);
  let t = new Uint8Array(0);
  let off = 0;
  let counter = 1;
  while (off < length) {
    const data = concatBytes(t, info, new Uint8Array([counter]));
    const sig = await crypto.subtle.sign('HMAC', key, data);
    t = new Uint8Array(sig);
    out.set(t.slice(0, Math.min(t.length, length - off)), off);
    off += t.length;
    counter++;
  }
  return out;
}

// ─── VAPID JWT (ES256) ───────────────────────────────────────────────
async function importVapidPrivateKey(b64uPriv) {
  // RFC 8037 JWK for P-256 — only need the private d. The public x/y can
  // be derived but Web Crypto requires them too. We re-derive from priv:
  // for ECDSA, we can import a PKCS8 instead.
  const d = b64uToBytes(b64uPriv);
  // Build a JWK with x and y omitted by re-deriving from d? Web Crypto
  // refuses jwk without x/y. So we synthesize the public point at import
  // time by recomputing it. Workers don't expose ECDH point ops directly,
  // so the most reliable path: take the raw 32-byte private and pair it
  // with the public key b64u parsed below.
  return d;
}

async function makeVapidJWT(audience, subject, vapidPrivateB64u, vapidPublicB64u, expSecondsFromNow = 12 * 60 * 60) {
  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + expSecondsFromNow,
    sub: subject,
  };
  const enc = new TextEncoder();
  const headerB64 = bytesToB64u(enc.encode(JSON.stringify(header)));
  const payloadB64 = bytesToB64u(enc.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Import the private key as a JWK with the matching public point
  const pubBytes = b64uToBytes(vapidPublicB64u);
  // Uncompressed P-256: 0x04 || X(32) || Y(32)
  if (pubBytes.length !== 65 || pubBytes[0] !== 0x04) {
    throw new Error('Invalid VAPID public key (must be uncompressed 65 bytes)');
  }
  const x = bytesToB64u(pubBytes.slice(1, 33));
  const y = bytesToB64u(pubBytes.slice(33, 65));

  const privBytes = b64uToBytes(vapidPrivateB64u);
  if (privBytes.length !== 32) {
    throw new Error('Invalid VAPID private key (must be 32 bytes)');
  }
  const d = bytesToB64u(privBytes);

  const cryptoKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', d, x, y, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, cryptoKey, enc.encode(signingInput));
  return `${signingInput}.${bytesToB64u(new Uint8Array(sig))}`;
}

// ─── Payload encryption (aes128gcm, RFC 8188 + RFC 8291) ─────────────
async function encryptPushPayload(plaintext, subKeys) {
  // Subscriber's p256dh public key + auth secret come from the subscription
  const userPubBytes = b64uToBytes(subKeys.p256dh);   // 65 bytes uncompressed
  const authSecret = b64uToBytes(subKeys.auth);        // 16 bytes

  // Generate an ephemeral P-256 keypair for this push
  const ephKey = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const ephPubRaw = new Uint8Array(await crypto.subtle.exportKey('raw', ephKey.publicKey));  // 65 bytes uncompressed

  // Import subscriber's public key
  const userPubKey = await crypto.subtle.importKey(
    'raw', userPubBytes,
    { name: 'ECDH', namedCurve: 'P-256' },
    false, []
  );

  // ECDH shared secret
  const ecdhSecret = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'ECDH', public: userPubKey },
    ephKey.privateKey,
    256
  ));

  // PRK_key per RFC 8291: HKDF(salt=auth_secret, ikm=ecdhSecret, info="WebPush: info\0" || userPub || ephPub)
  const enc = new TextEncoder();
  const keyInfo = concatBytes(
    enc.encode('WebPush: info\0'),
    userPubBytes,
    ephPubRaw
  );
  const prkKey = await hkdfExtract(authSecret, ecdhSecret);
  const ikm = await hkdfExpand(prkKey, concatBytes(keyInfo, new Uint8Array([0x01])), 32);

  // 16-byte random salt for the content encryption
  const salt = crypto.getRandomValues(new Uint8Array(16));

  // Derive CEK and nonce
  const prk = await hkdfExtract(salt, ikm);
  const cekInfo = concatBytes(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([0x01]));
  const cek = (await hkdfExpand(prk, cekInfo, 16));
  const nonceInfo = concatBytes(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([0x01]));
  const nonce = (await hkdfExpand(prk, nonceInfo, 12));

  // Plaintext gets padded: 0x02 delimiter (last record) per RFC 8188
  const plaintextBytes = typeof plaintext === 'string' ? enc.encode(plaintext) : new Uint8Array(plaintext);
  const padded = concatBytes(plaintextBytes, new Uint8Array([0x02]));

  // Encrypt
  const aesKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  // Build the aes128gcm body: 16-byte salt || rs(4) || idlen(1) || keyid(idlen) || ciphertext
  const rs = new Uint8Array(4);
  // record size: 4096 (must be > ciphertext.length + 17 for single record; we send one record)
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const idlen = new Uint8Array([ephPubRaw.length]);  // 65 for uncompressed P-256
  const body = concatBytes(salt, rs, idlen, ephPubRaw, ciphertext);
  return body;
}

// ─── Single push send ────────────────────────────────────────────────
async function sendPush(env, subscription, payloadObj) {
  const endpoint = subscription.endpoint;
  const url = new URL(endpoint);
  const audience = url.origin;

  const jwt = await makeVapidJWT(audience, 'mailto:hello@twincitycannabis.com', env.VAPID_PRIVATE_KEY, env.VAPID_PUBLIC_KEY);

  const body = payloadObj
    ? await encryptPushPayload(JSON.stringify(payloadObj), subscription.keys)
    : null;

  const headers = {
    'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
    'TTL': '86400',
  };
  if (body) {
    headers['Content-Encoding'] = 'aes128gcm';
    headers['Content-Type'] = 'application/octet-stream';
    headers['Content-Length'] = String(body.length);
  } else {
    headers['Content-Length'] = '0';
  }

  const res = await fetch(endpoint, { method: 'POST', headers, body: body || undefined });
  return { status: res.status, ok: res.ok };
}

// ─── Subscription storage (KV) ────────────────────────────────────────
async function endpointKey(endpoint) {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(endpoint));
  return 'push:' + bytesToB64u(new Uint8Array(hash)).slice(0, 24);
}

// ─── Public handlers wired from worker.js ────────────────────────────
export async function handlePushVapidKey(env, cors) {
  if (!env.VAPID_PUBLIC_KEY) {
    return new Response(JSON.stringify({ error: 'VAPID_PUBLIC_KEY not set' }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...cors },
    });
  }
  return new Response(JSON.stringify({ publicKey: env.VAPID_PUBLIC_KEY }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', ...cors },
  });
}

export async function handlePushSubscribe(request, env, cors) {
  try {
    const body = await request.json();
    const { subscription, watchlist, thresholds } = body || {};
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return new Response('Missing subscription', { status: 400, headers: cors });
    }
    const key = await endpointKey(subscription.endpoint);
    const record = {
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      watchlist: Array.isArray(watchlist) ? watchlist : [],
      thresholds: thresholds && typeof thresholds === 'object' ? thresholds : {},
      createdAt: new Date().toISOString(),
      lastPushedAt: null,
    };
    await env.TCC_OVERRIDES.put(key, JSON.stringify(record));
    return new Response(JSON.stringify({ ok: true, key }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...cors },
    });
  } catch (e) {
    return new Response('Bad request: ' + (e.message || e), { status: 400, headers: cors });
  }
}

export async function handlePushUnsubscribe(request, env, cors) {
  try {
    const { endpoint } = await request.json();
    if (!endpoint) return new Response('Missing endpoint', { status: 400, headers: cors });
    const key = await endpointKey(endpoint);
    await env.TCC_OVERRIDES.delete(key);
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...cors },
    });
  } catch (e) {
    return new Response('Bad request', { status: 400, headers: cors });
  }
}

/**
 * /push/trigger — called by Pi cron with a manifest of "price moves":
 *   { token: "<PUSH_TRIGGER_TOKEN>", moves: [{ productId, from, to, productName }] }
 * For each subscription, find matching moves (in watchlist + below threshold)
 * and fire one push per subscription with the combined headline.
 */
export async function handlePushTrigger(request, env, cors) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.replace(/^Bearer\s+/, '');
  if (!env.PUSH_TRIGGER_TOKEN || token !== env.PUSH_TRIGGER_TOKEN) {
    return new Response('Unauthorized', { status: 401, headers: cors });
  }
  let manifest;
  try { manifest = await request.json(); } catch (e) { return new Response('Bad JSON', { status: 400, headers: cors }); }
  const moves = Array.isArray(manifest.moves) ? manifest.moves : [];
  if (!moves.length) return new Response(JSON.stringify({ ok: true, pushed: 0 }), { status: 200, headers: { 'Content-Type': 'application/json', ...cors } });

  // List all subscriptions. KV list is paginated; iterate until done.
  let cursor;
  let pushed = 0, failed = 0, removed = 0;
  do {
    const list = await env.TCC_OVERRIDES.list({ prefix: 'push:', cursor, limit: 1000 });
    cursor = list.cursor;
    for (const k of list.keys) {
      const rec = await env.TCC_OVERRIDES.get(k.name, { type: 'json' });
      if (!rec) continue;
      const wl = new Set(rec.watchlist || []);
      const th = rec.thresholds || {};
      const hits = moves.filter(m => {
        if (wl.has(m.productId)) return true;
        const tgt = th[m.productId];
        if (typeof tgt === 'number' && typeof m.to === 'number' && m.to <= tgt) return true;
        return false;
      });
      if (!hits.length) continue;
      const totalSaved = hits.reduce((s, m) => s + Math.max(0, (m.from || 0) - (m.to || 0)), 0);
      const payload = {
        title: 'Twin City Cannabis — prices moved',
        body: `${hits.length} of your watched products dropped. Saving up to $${Math.round(totalSaved)}.`,
        tag: 'tcc-watchlist-drop',
        url: '/#watchlist',
      };
      try {
        const res = await sendPush(env, rec, payload);
        if (res.ok) {
          pushed++;
          rec.lastPushedAt = new Date().toISOString();
          await env.TCC_OVERRIDES.put(k.name, JSON.stringify(rec));
        } else if (res.status === 404 || res.status === 410) {
          // Gone — push service says subscription is no longer valid
          await env.TCC_OVERRIDES.delete(k.name);
          removed++;
        } else {
          failed++;
        }
      } catch (e) {
        failed++;
      }
    }
  } while (cursor && cursor.length);

  return new Response(JSON.stringify({ ok: true, pushed, failed, removed }), {
    status: 200, headers: { 'Content-Type': 'application/json', ...cors },
  });
}

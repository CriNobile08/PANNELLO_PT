import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creaClient, ErroreSync } from '../src/sync/googleHealth/client.js';

const env = { GH_CLIENT_ID: 'id-cliente', GH_CLIENT_SECRET: 'segreto-cliente', GH_REFRESH_TOKEN: 'refresh-segreto' };
const accessToken = 'access-segreto-123';

const json = (corpo, status = 200) => new Response(JSON.stringify(corpo), { status, headers: { 'content-type': 'application/json' } });
const rispostaToken = () => json({ access_token: accessToken, expires_in: 3599, scope: 'x', token_type: 'Bearer' });

// fetch finto: `risposte` è una funzione (url, opzioni, n) oppure una lista consumata in ordine.
function creaFinto(risposte) {
  const chiamate = [];
  const fetch = async (url, opzioni = {}) => {
    chiamate.push({ url: String(url), opzioni });
    const n = chiamate.length - 1;
    const r = typeof risposte === 'function' ? risposte(String(url), opzioni, n) : risposte[n];
    if (r instanceof Error) throw r;
    return r;
  };
  return { fetch, chiamate };
}
const conAttese = () => { const attese = []; return { attese, attendi: async (ms) => { attese.push(ms); } }; };
const URL_TOKEN = 'https://oauth2.googleapis.com/token';

test('scambio del token una sola volta', async () => {
  const { fetch, chiamate } = creaFinto((url) => url === URL_TOKEN ? rispostaToken() : json({ dataPoints: [{ a: 1 }] }));
  const c = creaClient({ env, fetch, attendi: async () => {} });
  await c.elenca('heart-rate', 'f1');
  await c.elenca('heart-rate', 'f2');
  const token = chiamate.filter((x) => x.url === URL_TOKEN);
  assert.equal(token.length, 1);
  assert.equal(chiamate.length, 3);
  assert.equal(token[0].opzioni.method, 'POST');
  assert.equal(token[0].opzioni.headers['Content-Type'], 'application/x-www-form-urlencoded');
  const p = new URLSearchParams(token[0].opzioni.body);
  assert.equal(p.get('grant_type'), 'refresh_token');
  assert.equal(p.get('client_id'), env.GH_CLIENT_ID);
  assert.equal(p.get('client_secret'), env.GH_CLIENT_SECRET);
  assert.equal(p.get('refresh_token'), env.GH_REFRESH_TOKEN);
  assert.equal(chiamate[1].opzioni.headers.Authorization, `Bearer ${accessToken}`);
  assert.match(chiamate[1].url, /^https:\/\/health\.googleapis\.com\/v4\/users\/me\/dataTypes\/heart-rate\/dataPoints\?/);
  assert.equal(new URL(chiamate[1].url).searchParams.get('filter'), 'f1');
});

test('pagine successive', async () => {
  const { fetch, chiamate } = creaFinto((url) => {
    if (url === URL_TOKEN) return rispostaToken();
    return url.includes('pageToken=P2') ? json({ dataPoints: [{ n: 2 }] }) : json({ dataPoints: [{ n: 1 }], nextPageToken: 'P2' });
  });
  const c = creaClient({ env, fetch, attendi: async () => {} });
  const punti = await c.elenca('sleep', 'filtro');
  assert.deepEqual(punti, [{ n: 1 }, { n: 2 }]);
  const u1 = new URL(chiamate[1].url);
  const u2 = new URL(chiamate[2].url);
  assert.equal(u1.searchParams.get('pageSize'), '25');
  assert.equal(u1.searchParams.get('pageToken'), null);
  assert.equal(u2.searchParams.get('pageToken'), 'P2');
});

test('pageSize omesso per i tipi diversi da sleep ed exercise; assenza di dataPoints = []', async () => {
  const { fetch, chiamate } = creaFinto((url) => url === URL_TOKEN ? rispostaToken() : json({}));
  const c = creaClient({ env, fetch, attendi: async () => {} });
  assert.deepEqual(await c.elenca('daily-heart-rate-variability', 'f'), []);
  assert.equal(new URL(chiamate[1].url).searchParams.has('pageSize'), false);
  await c.elenca('exercise', 'f');
  assert.equal(new URL(chiamate[2].url).searchParams.get('pageSize'), '25');
});

test('ritenta su 503 poi riesce', async () => {
  const { fetch } = creaFinto((url, _o, n) => url === URL_TOKEN ? rispostaToken() : (n === 1 ? json({ error: { code: 503, message: 'x', status: 'UNAVAILABLE' } }, 503) : json({ dataPoints: [{ ok: 1 }] })));
  const { attese, attendi } = conAttese();
  const c = creaClient({ env, fetch, attendi });
  assert.deepEqual(await c.elenca('steps', 'f'), [{ ok: 1 }]);
  assert.deepEqual(attese, [2000]);
});

test('ritenta su 429', async () => {
  const { fetch } = creaFinto((url, _o, n) => url === URL_TOKEN ? rispostaToken() : (n === 1 ? json({}, 429) : json({ dataPoints: [] })));
  const { attese, attendi } = conAttese();
  await creaClient({ env, fetch, attendi }).elenca('steps', 'f');
  assert.deepEqual(attese, [2000]);
});

test('rete assente tre volte', async () => {
  const { fetch } = creaFinto(() => new Error(`fetch failed ${accessToken}`));
  const { attese, attendi } = conAttese();
  const c = creaClient({ env, fetch, attendi });
  await assert.rejects(() => c.elenca('steps', 'f'), (e) => e instanceof ErroreSync && e.codice === 'rete');
  assert.deepEqual(attese, [2000, 4000, 8000]);
});

test('invalid_grant senza tentativi', async () => {
  const { fetch, chiamate } = creaFinto(() => json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400));
  const { attese, attendi } = conAttese();
  const c = creaClient({ env, fetch, attendi });
  await assert.rejects(() => c.elenca('steps', 'f'), (e) => e instanceof ErroreSync && e.codice === 'autorizzazione');
  assert.deepEqual(attese, []);
  assert.equal(chiamate.length, 1);
});

test('401 dall\'API = autorizzazione', async () => {
  const { fetch } = creaFinto((url) => url === URL_TOKEN ? rispostaToken() : json({ error: { code: 401, message: 'no', status: 'UNAUTHENTICATED' } }, 401));
  const { attese, attendi } = conAttese();
  await assert.rejects(() => creaClient({ env, fetch, attendi }).elenca('steps', 'f'), (e) => e.codice === 'autorizzazione');
  assert.deepEqual(attese, []);
});

test('altri 4xx: Error normale con status', async () => {
  const { fetch } = creaFinto((url) => url === URL_TOKEN ? rispostaToken() : json({ error: { code: 400, message: 'filtro non valido', status: 'INVALID_ARGUMENT' } }, 400));
  await assert.rejects(() => creaClient({ env, fetch, attendi: async () => {} }).elenca('steps', 'f'), (e) => {
    assert.ok(!(e instanceof ErroreSync));
    assert.equal(e.status, 400);
    assert.match(e.message, /400/);
    assert.match(e.message, /filtro non valido/);
    return true;
  });
});

test('variabili mancanti', async () => {
  const { fetch, chiamate } = creaFinto(() => rispostaToken());
  for (const chiave of Object.keys(env)) {
    const parziale = { ...env, [chiave]: '' };
    const c = creaClient({ env: parziale, fetch, attendi: async () => {} });
    await assert.rejects(() => c.elenca('steps', 'f'), (e) => e instanceof ErroreSync && e.codice === 'configurazione');
  }
  await assert.rejects(() => creaClient({ env: {}, fetch }).rollupGiornaliero('steps', '2026-11-02', '2026-11-05'), (e) => e.codice === 'configurazione');
  assert.equal(chiamate.length, 0);
});

test("il messaggio d'errore non contiene i segreti", async () => {
  const scenari = [
    () => new Error(`boom ${accessToken} ${env.GH_CLIENT_SECRET} ${env.GH_REFRESH_TOKEN}`),
    (url) => url === URL_TOKEN ? json({ error: 'invalid_grant', error_description: `revoked ${env.GH_REFRESH_TOKEN}` }, 400) : null,
    (url) => url === URL_TOKEN ? rispostaToken() : json({ error: { code: 401, message: `bad ${accessToken}`, status: 'UNAUTHENTICATED' } }, 401),
    (url) => url === URL_TOKEN ? rispostaToken() : json({ error: { code: 400, message: `bad ${accessToken} ${env.GH_CLIENT_SECRET}`, status: 'X' } }, 400),
    (url) => url === URL_TOKEN ? rispostaToken() : json({ error: { code: 503, message: `bad ${accessToken}`, status: 'X' } }, 503),
  ];
  for (const s of scenari) {
    const { fetch } = creaFinto(s);
    const c = creaClient({ env, fetch, attendi: async () => {} });
    await assert.rejects(() => c.elenca('steps', 'f'), (e) => {
      const msg = String(e.message);
      assert.ok(!msg.includes(env.GH_CLIENT_SECRET) && !msg.includes(env.GH_REFRESH_TOKEN) && !msg.includes(accessToken), msg);
      return true;
    });
  }
});

test('dailyRollUp invia range civile', async () => {
  const { fetch, chiamate } = creaFinto((url) => url === URL_TOKEN ? rispostaToken() : json({ rollupDataPoints: [{ r: 1 }] }));
  const c = creaClient({ env, fetch, attendi: async () => {} });
  const r = await c.rollupGiornaliero('steps', '2026-11-02', '2026-11-05');
  assert.deepEqual(r, [{ r: 1 }]);
  const ch = chiamate[1];
  assert.equal(ch.url, 'https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp');
  assert.equal(ch.opzioni.method, 'POST');
  assert.equal(ch.opzioni.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(ch.opzioni.body), { range: { start: { date: { year: 2026, month: 11, day: 2 } }, end: { date: { year: 2026, month: 11, day: 5 } } } });
});

test('dailyRollUp segue nextPageToken', async () => {
  const { fetch, chiamate } = creaFinto((url, o) => {
    if (url === URL_TOKEN) return rispostaToken();
    return JSON.parse(o.body).pageToken === 'P2' ? json({ rollupDataPoints: [{ n: 2 }] }) : json({ rollupDataPoints: [{ n: 1 }], nextPageToken: 'P2' });
  });
  const r = await creaClient({ env, fetch, attendi: async () => {} }).rollupGiornaliero('steps', '2026-11-02', '2026-11-05');
  assert.deepEqual(r, [{ n: 1 }, { n: 2 }]);
  assert.equal(JSON.parse(chiamate[2].opzioni.body).range.start.date.day, 2);
});

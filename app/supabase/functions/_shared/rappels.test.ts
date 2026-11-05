// Lancé par `npm run test:functions` (Node, sans Deno).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hoteAutorise } from './rappels.ts';

test('les services de notification des navigateurs sont acceptés, en https seulement', () => {
  assert.equal(hoteAutorise('https://fcm.googleapis.com/fcm/send/abc'), true);
  assert.equal(hoteAutorise('https://updates.push.services.mozilla.com/wpush/v2/abc'), true);
  assert.equal(hoteAutorise('https://wns2-par02p.notify.windows.com/w/?token=abc'), true);
  assert.equal(hoteAutorise('https://web.push.apple.com/abc'), true);
  assert.equal(hoteAutorise('http://fcm.googleapis.com/fcm/send/abc'), false);
});

test('toute autre adresse est refusée, même déguisée', () => {
  assert.equal(hoteAutorise('https://kong:8000/rest/v1/'), false);
  assert.equal(hoteAutorise('https://fcm.googleapis.com.exemple.fr/x'), false);
  assert.equal(hoteAutorise('https://exemple.fr/fcm.googleapis.com'), false);
  assert.equal(hoteAutorise('pas une adresse'), false);
});

test('l’hôte de test local n’est accepté que s’il est réglé', () => {
  const local = 'host.docker.internal:54798';
  assert.equal(hoteAutorise('http://host.docker.internal:54798/push/1', local), true);
  assert.equal(hoteAutorise('http://host.docker.internal:54798/push/1'), false);
  assert.equal(hoteAutorise('http://host.docker.internal:9999/push/1', local), false);
});

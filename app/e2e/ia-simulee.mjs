// IA simulée pour les tests : répond comme l'API Claude, sans réseau ni dépense. Le texte d'un cours
// contenant REFUS déclenche un refus de sécurité. Port 54799, joint depuis la fonction par ANTHROPIC_BASE_URL.
import { createServer } from 'node:http';

const TRANSCRIPTION = Array.from(
  { length: 12 },
  (_, i) => `La phrase numéro ${i + 1} du cours explique une notion importante de biologie.`,
).join(' ');

function generation(texte) {
  const phrases = texte.split(/(?<=\.)\s+/).filter((p) => p.length >= 15);
  const notions = [0, 1, 2].map((n) => ({ titre: `Notion ${n + 1}`, carte: { recto: 'Recto', verso: 'Verso' }, questions: [] }));
  phrases.forEach((extrait, i) => {
    const commun = { enonce: `Question ${i + 1} ?`, explication: 'Le cours le dit.', extrait, difficulte: 'facile', options: [], paires: [], etapes: [] };
    const formes = [
      { type: 'unique', options: [{ texte: 'Bonne', correcte: true }, { texte: 'Fausse', correcte: false }] },
      { type: 'vrai_faux', options: [{ texte: 'Vrai', correcte: true }, { texte: 'Faux', correcte: false }] },
      { type: 'multiple', options: [{ texte: 'Oui', correcte: true }, { texte: 'Aussi', correcte: true }, { texte: 'Non', correcte: false }] },
      { type: 'association', paires: [{ gauche: 'A', droite: '1' }, { gauche: 'B', droite: '2' }] },
      { type: 'classement', etapes: ['Un', 'Deux', 'Trois'] },
    ];
    notions[i % 3].questions.push({ ...commun, ...formes[i % 5] });
  });
  return JSON.stringify({ notions });
}

function flux(res, modele, texte, stop) {
  const envoyer = (type, corps) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...corps })}\n\n`);
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  envoyer('message_start', {
    message: { id: 'msg_simule', type: 'message', role: 'assistant', model: modele, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 0 } },
  });
  if (texte) {
    envoyer('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
    envoyer('content_block_delta', { index: 0, delta: { type: 'text_delta', text: texte } });
    envoyer('content_block_stop', { index: 0 });
  }
  envoyer('message_delta', {
    delta: { stop_reason: stop, stop_sequence: null, ...(stop === 'refusal' ? { stop_details: { type: 'refusal', category: 'bio', explanation: null } } : {}) },
    usage: { output_tokens: 500 },
  });
  envoyer('message_stop', {});
  res.end();
}

createServer((req, res) => {
  let corps = '';
  req.on('data', (morceau) => (corps += morceau));
  req.on('end', () => {
    if (req.method === 'GET') return res.end('ok');
    if (req.url.includes('count_tokens')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ input_tokens: 1000 }));
    }
    const demande = JSON.parse(corps);
    const contenu = demande.messages?.[0]?.content;
    if (!demande.system) return flux(res, demande.model, TRANSCRIPTION, 'end_turn');
    const cours = String(contenu).replace(/<\/?cours>/g, '').trim();
    if (cours.includes('REFUS')) return flux(res, demande.model, '', 'refusal');
    return flux(res, demande.model, generation(cours), 'end_turn');
  });
}).listen(54799, '0.0.0.0');

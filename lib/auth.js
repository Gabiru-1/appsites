'use strict';

const crypto = require('crypto');

const SESSION_DAYS = 30;
const COOKIE = 'sid';

class AuthError extends Error {}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + hash.toString('hex');
}

function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = String(stored || '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(String(password), Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt };
}

function register(store, input) {
  const name = String(input.name || '').trim().slice(0, 80);
  const email = normalizeEmail(input.email);
  const password = String(input.password || '');
  if (!name) throw new AuthError('Informe seu nome');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AuthError('E-mail inválido');
  if (password.length < 8) throw new AuthError('A senha precisa ter pelo menos 8 caracteres');
  if (store.find('users', (u) => u.email === email)) throw new AuthError('Já existe uma conta com este e-mail');

  const isFirst = store.all('users').length === 0;
  const user = {
    id: crypto.randomUUID(),
    name,
    email,
    password: hashPassword(password),
    role: isFirst ? 'admin' : 'user',
    settings: {},
    createdAt: new Date().toISOString(),
  };
  store.insert('users', user);

  // Páginas criadas antes do sistema de login passam a pertencer ao primeiro usuário
  if (isFirst) {
    let changed = false;
    for (const p of store.all('pages')) {
      if (!p.userId) {
        p.userId = user.id;
        changed = true;
      }
    }
    if (changed) store.save();
  }
  return user;
}

function login(store, email, password) {
  const user = store.find('users', (u) => u.email === normalizeEmail(email));
  // Verifica a senha mesmo sem usuário, para não revelar quais e-mails existem pelo tempo de resposta
  const ok = verifyPassword(password, user ? user.password : 'scrypt$00$00');
  if (!user || !ok) throw new AuthError('E-mail ou senha incorretos');
  return user;
}

function createSession(store, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = Date.now();
  store.insert('sessions', {
    id: sha256(token),
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_DAYS * 86400000).toISOString(),
  });
  // Limpa sessões expiradas
  const nowIso = new Date().toISOString();
  store.remove('sessions', (s) => s.expiresAt < nowIso);
  return token;
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function userFromRequest(store, req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const session = store.get('sessions', sha256(token));
  if (!session || session.expiresAt < new Date().toISOString()) return null;
  return store.get('users', session.userId);
}

function destroySession(store, req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) store.remove('sessions', (s) => s.id === sha256(token));
}

function sessionCookie(token, secure) {
  return COOKIE + '=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + SESSION_DAYS * 86400 + (secure ? '; Secure' : '');
}

function clearCookie() {
  return COOKIE + '=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0';
}

function changePassword(store, user, current, next) {
  if (!verifyPassword(current, user.password)) throw new AuthError('Senha atual incorreta');
  if (String(next || '').length < 8) throw new AuthError('A nova senha precisa ter pelo menos 8 caracteres');
  user.password = hashPassword(next);
  store.update('users', user.id, user);
}

module.exports = {
  AuthError, register, login, createSession, userFromRequest, destroySession,
  sessionCookie, clearCookie, publicUser, changePassword, hashPassword, verifyPassword,
};

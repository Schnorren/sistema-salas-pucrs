// Política de senha (backend_core/utils/senha.js): usada pelo Painel Admin
// (backend) e pelas telas Definir senha / Meu perfil (front).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SENHA_MIN, SENHA_MAX, validarSenha, traduzirErroSenha } from '../backend_core/utils/senha.js';

test('aceita senha a partir do mínimo e recusa abaixo dele', () => {
  assert.equal(SENHA_MIN, 8);
  assert.equal(validarSenha('a'.repeat(SENHA_MIN)), null);
  assert.match(validarSenha('a'.repeat(SENHA_MIN - 1)), /pelo menos 8/);
  assert.match(validarSenha(''), /pelo menos/);
});

test('recusa entrada que não é texto, só espaços ou maior que o limite do bcrypt', () => {
  assert.match(validarSenha(undefined), /pelo menos/);
  assert.match(validarSenha(12345678), /pelo menos/);
  assert.match(validarSenha(' '.repeat(10)), /espaços/);
  assert.match(validarSenha('a'.repeat(SENHA_MAX + 1)), /no máximo/);
  assert.equal(validarSenha('a'.repeat(SENHA_MAX)), null);
});

test('traduz os erros do Supabase Auth para português', () => {
  assert.match(traduzirErroSenha({ message: 'New password should be different from the old password.' }), /diferente da atual/);
  assert.match(traduzirErroSenha({ message: 'Password should be at least 6 characters.' }), /pelo menos 8/);
  assert.match(traduzirErroSenha({ status: 429, message: 'x' }), /Muitas tentativas/);
  assert.match(traduzirErroSenha({ message: 'Password is known to be weak and easy to guess' }), /fraca/);
  assert.match(traduzirErroSenha(null), /Tente de novo/);
});

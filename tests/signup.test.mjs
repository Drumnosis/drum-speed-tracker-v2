import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSignup, signupErrorMessage, signupOutcome, alreadyRegisteredMessage } from '../src/utils/signup.ts';

test('signup distinguishes immediate login, confirmation, masked duplicate and missing user', () => {
  assert.equal(signupOutcome({ session: { access_token: 'token' }, user: { identities: [] } }), 'signed-in');
  assert.equal(signupOutcome({ session: null, user: { identities: [{ provider: 'email' }] } }), 'confirm-email');
  assert.equal(signupOutcome({ session: null, user: {} }), 'confirm-email');
  assert.equal(signupOutcome({ session: null, user: { identities: [] } }), 'already-registered');
  assert.equal(signupOutcome({ session: null, user: null }), 'failed');
});

test('signup requires valid email, a minimum password and matching confirmation', () => {
  for (const email of ['', ' ', 'student', 'student@', 'student@school', 'a b@school.com']) {
    assert.ok(validateSignup(email, 'abcdef', 'abcdef'));
  }
  assert.match(validateSignup('a@school.com', 'short', 'short'), /at least 6/);
  assert.match(validateSignup('a@school.com', 'abcdef', 'abcdeg'), /do not match/);
  assert.equal(validateSignup(' student+test@school.com ', ' abcdef ', ' abcdef '), null);
});

test('Supabase failures give actionable messages without leaking raw server errors', () => {
  for (const code of ['user_already_exists', 'email_exists']) assert.equal(signupErrorMessage({code}), alreadyRegisteredMessage);
  assert.match(signupErrorMessage({code: 'email_address_invalid'}), /email address/);
  assert.match(signupErrorMessage({code: 'weak_password', reasons: ['length', 'characters', 'pwned']}), /longer.*uppercase.*data breach/);
  assert.match(signupErrorMessage({code: 'signup_disabled'}), /administrator/);
  assert.match(signupErrorMessage({status: 429}), /wait a few minutes/);
  assert.match(signupErrorMessage(new TypeError('Failed to fetch')), /internet connection/);
  assert.match(signupErrorMessage({name: 'AuthRetryableFetchError'}), /internet connection/);
  assert.match(signupErrorMessage({message: 'internal database secret'}), /could not create/);
  assert.doesNotMatch(signupErrorMessage({message: 'internal database secret'}), /secret/);
});

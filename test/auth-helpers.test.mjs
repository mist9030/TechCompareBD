import test from "node:test";
import assert from "node:assert/strict";
import { safeNext, passwordStrength, isPasswordAcceptable, authErrorMessage, isValidEmail } from "../lib/authHelpers.js";

test("safeNext only allows same-site paths", () => {
  assert.equal(safeNext("/products?q=ssd"), "/products?q=ssd");
  assert.equal(safeNext("https://evil.example"), "/");
  assert.equal(safeNext("//evil.example"), "/");
  assert.equal(safeNext("/\\evil"), "/");
  assert.equal(safeNext(null), "/");
});

test("password strength", () => {
  assert.equal(passwordStrength("").score, 0);
  assert.equal(passwordStrength("abc").score <= 1, true);
  assert.equal(passwordStrength("abcdefgh").score, 1);
  assert.equal(passwordStrength("abcdefg1").score, 2);
  assert.equal(passwordStrength("Abcdefg1").score, 3);
  assert.equal(passwordStrength("Abcdefg1!").score, 4);
});

test("which passwords are accepted on sign-up", () => {
  assert.equal(isPasswordAcceptable("abc123"), false); // too short
  assert.equal(isPasswordAcceptable("abcdefgh"), false); // only one kind of character
  assert.equal(isPasswordAcceptable("abcdefg1"), true);
});

test("auth error messages are readable; closed popup is silent", () => {
  assert.match(authErrorMessage({ code: "auth/invalid-credential" }), /Incorrect email or password/);
  assert.match(authErrorMessage({ code: "auth/email-already-in-use" }), /already exists/);
  assert.equal(authErrorMessage({ code: "auth/popup-closed-by-user" }), "");
  assert.match(authErrorMessage({ message: "Firebase: boom" }), /^boom/);
});

test("email check", () => {
  assert.equal(isValidEmail("a@b.co"), true);
  assert.equal(isValidEmail("a@b"), false);
});

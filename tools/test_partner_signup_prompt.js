const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');
const onboarding = read('public/js/partner-onboarding.js');
const categories = read('public/categories-shared.js');
const authCheck = read('public/js/auth-check.js');
const home = read('public/index.html');

assert.match(home, /هل تريد عمل شراكة مع LOVARA/);
assert.match(home, /id="partnerAccept" type="button">نعم، أريد الشراكة/);
assert.doesNotMatch(home, /id="partnerAccept"[^>]*onclick=/, 'accept must wait for the answer to be saved before redirecting');
assert.match(home, /<body data-auth-controller="main">/);
assert.match(home, /LovaraPartnerOnboarding\?\.offer\(result\.user\)/, 'new email and Google accounts on home offer the partnership prompt');
assert.match(onboarding, /ensureOfferModal\(\)/);
assert.match(onboarding, /window\.location\.href = '\/partnership'/);
assert.match(onboarding, /partnerPromptAnswered/);
assert.match(onboarding, /if \(!\$\('partnerOfferModal'\)\) return/);

assert.match(categories, /window\.LovaraOfferPartnerAfterSignup/);
assert.match(categories, /setTimeout\(\(\) => window\.LovaraOfferPartnerAfterSignup\?\.\(result\.user\), 350\)/, 'category email signup offers partnership');
assert.match(categories, /if \(isNewAccount\) setTimeout\(\(\) => window\.LovaraOfferPartnerAfterSignup\?\.\(result\.user\), 350\)/, 'Google existing users do not see the signup prompt');
assert.match(categories, /const externalAuthOwnsForms = \['main', 'legacy'\]\.includes\(document\.body\?\.dataset\.authController\)/);
assert.match(categories, /if \(signupForm && !externalAuthOwnsForms\)/, 'CategoryApp does not submit forms already owned by another auth controller');
assert.match(categories, /link\.href = '\/partnership'/);
assert.match(categories, /lovara-partnership-fab/);

assert.match(authCheck, /window\.LovaraOfferPartnerAfterSignup\?\.\(cred\.user\)/, 'Hijab legacy auth shows the prompt after email signup');
assert.match(authCheck, /if \(result\.additionalUserInfo\?\.isNewUser\) setTimeout\(\(\) => window\.LovaraOfferPartnerAfterSignup\?\.\(result\.user\), 350\)/);

const categoryPages = ['index.html', 'dresses.html', 'pants.html', 'pajamas.html', 'winter.html', 'tops.html', 'accessories.html', 'suits.html', 'sets.html', 'lingerie.html', 'hijab.html'];
for (const page of categoryPages) {
  assert.match(read(`public/${page}`), /categories-shared\.js\?v=partner-signup-1/, `${page} loads updated signup and CTA code`);
}
const hijab = read('public/hijab.html');
assert.match(hijab, /data-auth-controller="legacy"/);
assert.match(hijab, /auth-check\.js\?v=partner-prompt-2/);
for (const page of ['public/index.html', 'public/partnership.html', 'public/lvr-6c4e91b7a2d8f305c6b18a2f.html']) {
  assert.match(read(page), /partner-onboarding\.js\?v=partner-prompt-2/);
}

console.log('partner signup prompt and floating CTA tests passed');

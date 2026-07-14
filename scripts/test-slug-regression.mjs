import { isValidSlug, generateSlugFromName } from '../utils/slugUtils.js';

console.log('🏁 Running slug validation and normalization regression tests...');

let failures = 0;

function assertEqual(label, actual, expected) {
  if (actual !== expected) {
    console.error('❌ Case ' + label + ' FAILED: Expected ' + expected + ', got ' + actual);
    failures++;
  } else {
    console.log('✅ Case ' + label + ' PASSED: got ' + actual);
  }
}

assertEqual('lari reserved', isValidSlug('lari'), false);
assertEqual('randevulari reserved', isValidSlug('randevulari'), false);
assertEqual('randapp reserved', isValidSlug('randapp'), false);
assertEqual('radapp reserved', isValidSlug('radapp'), false);
assertEqual('admin reserved', isValidSlug('admin'), false);
assertEqual('super-admin reserved', isValidSlug('super-admin'), false);
assertEqual('book reserved', isValidSlug('book'), false);
assertEqual('booking reserved', isValidSlug('booking'), false);
assertEqual('login reserved', isValidSlug('login'), false);
assertEqual('checkout reserved', isValidSlug('checkout'), false);

assertEqual('melis-guzellik valid', isValidSlug('melis-guzellik'), true);
assertEqual('valid business slug', isValidSlug('valid-normal-business-slug'), true);
assertEqual('uppercase normalizer', generateSlugFromName('MELIS-GUZELLIK'), 'melis-guzellik');
assertEqual('Turkish character conversion', generateSlugFromName('şahin-güzellik-ve-saç'), 'sahin-guzellik-ve-sac');
assertEqual('empty slug rejection', isValidSlug(''), false);
assertEqual('too short slug', isValidSlug('ab'), false);
assertEqual('consecutive hyphens', isValidSlug('abc--def'), false);

// HashRouter / path slug parser regression assertions
const parseUrlSlug = (hash, path) => {
  let urlSlug = '';
  if (hash) {
    const parts = hash.split('/');
    if (parts.length >= 3 && parts[1] === 'booking') {
      urlSlug = parts[2].split('?')[0];
    } else if (parts.length >= 2 && parts[1] && parts[1] !== 'book' && parts[1] !== 'admin' && parts[1] !== 'super-admin' && parts[1] !== 'login' && parts[1] !== 'features' && parts[1] !== 'pricing' && parts[1] !== 'mobile-app' && parts[1] !== 'register' && parts[1] !== 'contact' && parts[1] !== 'pilot' && parts[1] !== 'privacy' && parts[1] !== 'terms' && parts[1] !== 'support' && parts[1] !== 'demo' && parts[1] !== 'customer') {
      urlSlug = parts[1].split('?')[0];
    }
  }
  if (!urlSlug && path && path !== '/') {
    const parts = path.split('/');
    if (parts.length >= 3 && parts[1] === 'booking') {
      urlSlug = parts[2];
    } else if (parts.length >= 2 && parts[1] && parts[1] !== 'book' && parts[1] !== 'admin' && parts[1] !== 'super-admin' && parts[1] !== 'login' && parts[1] !== 'features' && parts[1] !== 'pricing' && parts[1] !== 'mobile-app' && parts[1] !== 'register' && parts[1] !== 'contact' && parts[1] !== 'pilot' && parts[1] !== 'privacy' && parts[1] !== 'terms' && ObligatoryExclusion(parts[1])) {
      urlSlug = parts[1];
    }
  }
  return urlSlug;
};

function ObligatoryExclusion(val) {
  return val !== 'support' && val !== 'demo' && val !== 'customer';
}

assertEqual('hash booking/slug', parseUrlSlug('#/booking/melis-guzellik', ''), 'melis-guzellik');
assertEqual('hash slug directly', parseUrlSlug('#/melis-guzellik', ''), 'melis-guzellik');
assertEqual('path booking/slug', parseUrlSlug('', '/booking/melis-guzellik'), 'melis-guzellik');
assertEqual('path slug directly', parseUrlSlug('', '/melis-guzellik'), 'melis-guzellik');
assertEqual('malformed hash', parseUrlSlug('#/login', ''), '');
assertEqual('empty slug', parseUrlSlug('', ''), '');

if (failures > 0) {
  console.error('❌ Slug regression test suite failed with ' + failures + ' errors.');
  process.exit(1);
} else {
  console.log('🎉 All slug regression test cases passed successfully!');
  process.exit(0);
}

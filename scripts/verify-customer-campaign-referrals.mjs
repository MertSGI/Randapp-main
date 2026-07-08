import fs from 'fs';
import path from 'path';

const SRC_DIR = process.cwd();

function checkFileContains(filePath, stringsToFind) {
  if (!fs.existsSync(filePath)) {
    console.error(`❌ QA FAILED: File not found: ${filePath}`);
    return false;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  for (const str of stringsToFind) {
    if (!content.includes(str)) {
      console.error(`❌ QA FAILED: Missing logic or signature in ${filePath}`);
      console.error(`   Could not find: "${str}"`);
      return false;
    }
  }
  return true;
}

console.log('=== RadApp / LARİ CUSTOMER CAMPAIGN REFERRALS INTEGRITY CHECK ===');

const checks = [
  {
    file: path.join(SRC_DIR, 'types.ts'),
    strings: [
      'export interface BusinessCustomerCampaign',
      'export interface BusinessCustomerReferral'
    ]
  },
  {
    file: path.join(SRC_DIR, 'services', 'repositories', 'localCampaignRepository.ts'),
    strings: [
      'listCampaigns',
      'saveCampaign',
      'listCustomerReferrals',
      'saveCustomerReferral'
    ]
  },
  {
    file: path.join(SRC_DIR, 'services', 'repositories', 'supabaseCampaignRepository.ts'),
    strings: [
      'listCampaigns',
      'saveCampaign',
      'listCustomerReferrals',
      'saveCustomerReferral'
    ]
  },
  {
    file: path.join(SRC_DIR, 'services', 'customerCampaignService.ts'),
    strings: [
      'listCampaigns',
      'createCampaign',
      'updateCampaign',
      'createCustomerReferral',
      'markReferralCompleted',
      'markReferralRewarded',
      'verifyEntitlement'
    ]
  },
  {
    file: path.join(SRC_DIR, 'components', 'ReferralTab.tsx'),
    strings: [
      'customerCampaignService.listCampaigns',
      'customerCampaignService.createCustomerReferral',
      'customerCampaignService.updateCampaign',
      'customerCampaignService.markReferralCompleted',
      'customerCampaignService.markReferralRewarded'
    ]
  },
  {
    file: path.join(SRC_DIR, 'pages', 'BookingPage.tsx'),
    strings: [
      'customerCampaignService.listCampaigns',
      'customerCampaignService.createCustomerReferral'
    ]
  },
  {
    file: path.join(SRC_DIR, 'components', 'CustomerMemoryTab.tsx'),
    strings: [
      'customerCampaignService.listCustomerReferrals',
      'invitedOthers',
      'wasInvitedBy'
    ]
  },
  {
    file: path.join(SRC_DIR, 'services', 'notificationService.ts'),
    strings: [
      'notifyReferralBooked',
      'notifyReferralCompleted',
      'notifyReferralRewarded'
    ]
  }
];

let allPassed = true;
for (const check of checks) {
  const relativePath = path.relative(SRC_DIR, check.file);
  console.log(`Checking ${relativePath}...`);
  if (checkFileContains(check.file, check.strings)) {
    console.log(`✅ ${relativePath} PASSED!`);
  } else {
    allPassed = false;
  }
}

if (allPassed) {
  console.log('\n⭐⭐⭐⭐⭐ ALL CUSTOMER CAMPAIGN REFERRALS INTEGRITY CHECKS PASSED SUCCESSFULLY ⭐⭐⭐⭐⭐\n');
  process.exit(0);
} else {
  console.error('\n❌ SOME INTEGRITY BOUNDARY CHECKS FAILED. PLEASE AUDIT SOURCE FILES. ❌\n');
  process.exit(1);
}

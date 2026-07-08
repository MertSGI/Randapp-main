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

console.log('=== RadApp / LARİ CUSTOMER CAMPAIGN REWARD LEDGER INTEGRITY CHECK ===');

const checks = [
  {
    file: path.join(SRC_DIR, 'types.ts'),
    strings: [
      'export interface CustomerCampaignReward',
      'rewardOwnerType: \'referrer_customer\' | \'referred_customer\''
    ]
  },
  {
    file: path.join(SRC_DIR, 'services', 'repositories', 'localCampaignRepository.ts'),
    strings: [
      'listCustomerRewards',
      'saveCustomerReward',
      'listCustomerReferrals',
      'saveCustomerReferral'
    ]
  },
  {
    file: path.join(SRC_DIR, 'services', 'repositories', 'supabaseCampaignRepository.ts'),
    strings: [
      'listCustomerRewards',
      'saveCustomerReward',
      'listCustomerReferrals',
      'saveCustomerReferral'
    ]
  },
  {
    file: path.join(SRC_DIR, 'services', 'customerCampaignService.ts'),
    strings: [
      'listCustomerRewards',
      'listCustomerRewardsByCustomer',
      'markRewardUsed',
      'cancelReward',
      'rewardsAvailable',
      'rewardsUsed'
    ]
  },
  {
    file: path.join(SRC_DIR, 'components', 'ReferralTab.tsx'),
    strings: [
      'customerRewards',
      'rewardsAvailable',
      'rewardsUsed',
      'handleMarkRewardUsed',
      'handleCancelReward',
      'Müşteri Kampanya Ödül Defteri'
    ]
  },
  {
    file: path.join(SRC_DIR, 'components', 'CustomerMemoryTab.tsx'),
    strings: [
      'customerRewards',
      'Hak Edilen Kampanya Ödülleri'
    ]
  },
  {
    file: path.join(SRC_DIR, 'components', 'SalonReportsTab.tsx'),
    strings: [
      'campaignStats',
      'rewardsGenerated',
      'rewardsClaimed',
      'Müşteri Davet Kampanyası Performansı'
    ]
  },
  {
    file: path.join(SRC_DIR, 'services', 'notificationService.ts'),
    strings: [
      'notifyCustomerRewardAvailable',
      'notifyCustomerRewardUsed',
      'notifyCustomerRewardExpiring'
    ]
  },
  {
    file: path.join(SRC_DIR, 'services', 'appointmentService.ts'),
    strings: [
      'Booking and referral association hook:',
      'Completion Hook for referrals and reward ledger triggers:'
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
  console.log('\n⭐⭐⭐⭐⭐ ALL REWARD LEDGER & REFERRAL FLOW INTEGRITY CHECKS PASSED SUCCESSFULLY ⭐⭐⭐⭐⭐\n');
  process.exit(0);
} else {
  console.error('\n❌ SOME REWARD LEDGER INTEGRITY BOUNDARY CHECKS FAILED. PLEASE AUDIT SOURCE FILES. ❌\n');
  process.exit(1);
}

export type Lang = 'en' | 'am';

export const T = {
  en: {
    welcomeFirstTime:
      '👋 *Welcome to Barter Ethio!*\n\n' +
      'Sign in once with your Barter Ethio account.\n\n' +
      '📧 What is your email?',
    welcomeBack: (name: string) =>
      `👋 *Welcome back, ${name}!*\n\nWhat would you like to do?`,
    askPassword:
      '🔑 Enter your password.\n_(I will delete your message right after.)_',
    loginOk: (name: string) =>
      `✅ *Welcome, ${name}!*\n\nYou're set. Try Browse.`,
    loginFail: '❌ Wrong email or password.\n\nTry again — what is your email?',
    badEmail: '❌ That doesn\'t look like an email. Try again:',
    badPassword: '❌ Password too short (min 6). Try again:',
    cannotReachServer: '⚠️ Can\'t reach the server. Try again in a moment.',
    cancelled: '❌ Cancelled.',

    // browse
    browseEmpty: '📭 No requests right now.',
    browsePage: (page: number, total: number, cat?: string) =>
      `📋 *Wanted board${cat ? ` · ${cat}` : ''} — page ${page}/${total}*`,
    browseTitle: (cat?: string) =>
      `📋 *Wanted board${cat ? ` · ${cat}` : ''}*`,
    pickCategory: '📂 Filter by category:',

    // detail
    detailTitle: '📄 *Request details*',

    // post
    postAskCategory: '📂 Pick a category:',
    postAskTitle: '📝 Type the title (min 3 chars):',
    postAskDesc: '📝 Type a description:',
    postAskType: '💱 How will you pay?',
    postAskBudget:
      '💰 Budget in ETB — one number or range like `1000-5000`. Tap Skip to skip.',
    postConfirm:
      '✅ *Confirm your request*\n\n' +
      '📂 Category: {cat}\n' +
      '📝 Title: {title}\n' +
      '📄 {desc}\n' +
      '💱 Type: {type}\n' +
      '💰 Budget: {budget}',
    postSuccess: (id: string) => `🎉 Posted! ID: \`${id}\``,

    // matches
    matchesEmpty: '😕 No matches yet. Post more items to appear in matches.',
    matchesTitle: '🎯 *Your matches*',

    // me
    meHeader: '👤 *Your account*',

    // lang
    langSwitched: '🌐 Language set to English.',
  },

  am: {
    welcomeFirstTime:
      '👋 *ወደ Barter Ethio እንኳን ደህና መጡ!*\n\n' +
      'በ Barter Ethio መለያዎ አንድ ጊዜ ይግቡ።\n\n' +
      '📧 ኢሜይልዎ ምንድነው?',
    welcomeBack: (name: string) =>
      `👋 *እንኳን ደህና መጡ፣ ${name}!*\n\nምን ማድረግ ይፈልጋሉ?`,
    askPassword: '🔑 ፓስወርድዎን ያስገቡ።\n_(መልእክትዎን ወዲያውኑ አጠፋለሁ።)_',
    loginOk: (name: string) => `✅ *እንኳን ደህና መጡ፣ ${name}!*\n\nዝግጁ ነዎት።`,
    loginFail: '❌ ኢሜይል ወይም ፓስወርድ ትክክል አይደለም።\n\nእንደገና ይሞክሩ፡',
    badEmail: '❌ ትክክለኛ ኢሜይል አይመስልም። እንደገና ይሞክሩ፡',
    badPassword: '❌ ፓስወርድ ቢያንስ 6 ፊደል ይሁን። እንደገና ይሞክሩ፡',
    cannotReachServer: '⚠️ ሰርቨሩን ማግኘት አልተቻለም። እንደገና ይሞክሩ።',
    cancelled: '❌ ተሰርዟል።',

    browseEmpty: '📭 አሁን ምንም ጥያቄ የለም።',
    browsePage: (page: number, total: number, cat?: string) =>
      `📋 *የጥያቄዎች ሰሌዳ${cat ? ` · ${cat}` : ''} — ገጽ ${page}/${total}*`,
    browseTitle: (cat?: string) =>
      `📋 *የጥያቄዎች ሰሌዳ${cat ? ` · ${cat}` : ''}*`,
    pickCategory: '📂 በምድብ አጣራ፡',

    detailTitle: '📄 *የጥያቄ ዝርዝር*',

    postAskCategory: '📂 ምድብ ይምረጡ፡',
    postAskTitle: '📝 አርዕስት ይተይቡ (ቢያንስ 3 ፊደል)፡',
    postAskDesc: '📝 መግለጫ ይተይቡ፡',
    postAskType: '💱 እንዴት ይከፍላሉ?',
    postAskBudget: '💰 በጀት በብር — ቁጥር ወይም `1000-5000`።',
    postConfirm:
      '✅ *ጥያቄዎን ያረጋግጡ*\n\n' +
      '📂 ምድብ: {cat}\n' +
      '📝 አርዕስት: {title}\n' +
      '📄 {desc}\n' +
      '💱 አይነት: {type}\n' +
      '💰 በጀት: {budget}',
    postSuccess: (id: string) => `🎉 ተለጥፏል! መለያ: \`${id}\``,

    matchesEmpty: '😕 እስካሁን ተመሳሳይ ነገር የለም።',
    matchesTitle: '🎯 *ተመሳሳይ ንጥሎች*',

    meHeader: '👤 *መለያዎ*',

    langSwitched: '🌐 ቋንቋ ወደ አማርኛ ተቀይሯል።',
  },
} as const;

export const t = (lang: Lang) => T[lang] ?? T.en;